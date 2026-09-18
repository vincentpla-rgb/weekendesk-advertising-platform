import { describe, expect, it } from 'vitest';

import { DEFAULT_CATALOG } from '../catalog.js';
import { DEFAULT_PRICING_PARAMETERS } from '../parameters.js';
import {
  PricingError,
  mediaManagementFee,
  priceOption,
  unitCost,
  volumeDiscountRate,
  type PricingContext,
} from '../engine.js';
import { MARKETS, type Market, type PricedLine } from '../types.js';

const ctx: PricingContext = {
  parameters: DEFAULT_PRICING_PARAMETERS,
  catalog: DEFAULT_CATALOG,
};

/** Céntimos → euros, para leer los asserts en la unidad de la especificación. */
const eur = (cents: number) => cents / 100;

function line(option: ReturnType<typeof priceOption>, supportId: string, market: Market): PricedLine {
  const found = option.lines.find((l) => l.supportId === supportId && l.market === market);
  if (!found) throw new Error(`Línea no encontrada: ${supportId} / ${market}`);
  return found;
}

// =============================================================================
// Casos límite exigidos por la especificación
// =============================================================================

describe('casos límite de CLAUDE.md', () => {
  it('SOC-02 Story activa el suelo de margen incluso en Francia: mínimo 305 €', () => {
    const option = priceOption({ lines: [{ supportId: 'SOC-02', market: 'FR' }] }, ctx);
    const soc02 = line(option, 'SOC-02', 'FR');

    // Coste: (0,5 + 1,0) h × 35 € + 100 € de boost = 152,50 €
    expect(eur(soc02.costCents)).toBe(152.5);
    // Tarifa bruta: 300 € × 1,00 — por debajo del suelo
    expect(eur(soc02.grossPriceCents)).toBe(300);
    // Suelo: 152,50 € / 0,50 = 305 €
    expect(eur(soc02.marginFloorCents)).toBe(305);
    expect(soc02.floorApplied).toBe(true);
    expect(eur(soc02.listPriceCents)).toBe(305);
    expect(eur(soc02.netPriceCents)).toBe(305);
    // El suelo deja el margen exactamente en el 50 %, ni un céntimo por debajo.
    expect(soc02.marginRate).toBe(0.5);
    expect(option.meetsMarginFloor).toBe(true);
    expect(soc02.warnings.map((w) => w.code)).toContain('MARGIN_FLOOR_APPLIED');
  });

  it('ON-01 cuesta 140 € en Francia y 70 € en un segundo mercado', () => {
    const option = priceOption(
      { lines: [{ supportId: 'ON-01', market: 'FR' }, { supportId: 'ON-01', market: 'ES' }] },
      ctx,
    );

    const fr = line(option, 'ON-01', 'FR');
    const es = line(option, 'ON-01', 'ES');

    // FR es el mercado de coeficiente más alto: paga el diseño.
    expect(fr.isLeadMarket).toBe(true);
    expect(eur(fr.costCents)).toBe(140); // (2 + 2) h × 35 €

    // ES reutiliza el diseño: solo horas de negocio.
    expect(es.isLeadMarket).toBe(false);
    expect(eur(es.costCents)).toBe(70); // 2 h × 35 €
  });

  it('SOC-01 pasa de 310 € a 170 € en un segundo mercado: se ahorra el diseño, el boost se paga igual', () => {
    const option = priceOption(
      { lines: [{ supportId: 'SOC-01', market: 'FR' }, { supportId: 'SOC-01', market: 'ES' }] },
      ctx,
    );

    // FR: (2 + 4) h × 35 € + 100 € = 310 €
    expect(eur(line(option, 'SOC-01', 'FR').costCents)).toBe(310);
    // ES: 2 h × 35 € + 100 € = 170 €. El boost externo no se reutiliza.
    expect(eur(line(option, 'SOC-01', 'ES').costCents)).toBe(170);
  });

  it('Pmax con 3.000 € de medios a 3 meses da 4.500 € de fee: manda el mínimo mensual', () => {
    const fee = mediaManagementFee(DEFAULT_PRICING_PARAMETERS, 300_000, 3, 150_000);

    // 3.000 € × 40 % = 1.200 €, pero 1.500 €/mes × 3 meses = 4.500 €.
    expect(eur(fee.feeCents)).toBe(4500);
    expect(fee.minimumApplied).toBe(true);

    const option = priceOption(
      { lines: [{ supportId: 'ADS-02', market: 'FR', mediaBudgetCents: 300_000, mediaMonths: 3 }] },
      ctx,
    );
    const pmax = line(option, 'ADS-02', 'FR');

    expect(eur(pmax.listPriceCents)).toBe(4500);
    // El mínimo mensual también resiste al descuento por volumen que dispara.
    expect(option.nominalDiscountRate).toBe(0.05);
    expect(eur(pmax.netPriceCents)).toBe(4500);
    expect(eur(option.effectiveDiscountCents)).toBe(0);

    // Los medios se facturan aparte, a coste y sin margen.
    expect(eur(option.mediaBudgetCents)).toBe(3000);
    expect(eur(option.netRevenueCents)).toBe(4500);
    expect(eur(option.billedTotalCents)).toBe(7500);
  });
});

// =============================================================================
// §4.1 y §4.2 — coste interno y regla multimercado
// =============================================================================

describe('coste interno', () => {
  it('escala con la cantidad: 3 stories son 3 boosts', () => {
    const option = priceOption({ lines: [{ supportId: 'SOC-02', market: 'FR', quantity: 3 }] }, ctx);
    const soc02 = line(option, 'SOC-02', 'FR');

    expect(eur(soc02.unitCostCents)).toBe(152.5);
    expect(eur(soc02.costCents)).toBe(457.5);
    // Y el suelo escala con él: 457,50 € / 0,50
    expect(eur(soc02.marginFloorCents)).toBe(915);
    // Tarifa bruta 3 × 300 € = 900 €, por debajo del suelo.
    expect(eur(soc02.grossPriceCents)).toBe(900);
    expect(eur(soc02.netPriceCents)).toBe(915);
  });

  it('el mercado líder se decide por soporte, no por opción', () => {
    // Opción FR + ES en la que CRM-01 solo se contrata en ES.
    const option = priceOption(
      {
        lines: [
          { supportId: 'ON-01', market: 'FR' },
          { supportId: 'ON-01', market: 'ES' },
          { supportId: 'CRM-01', market: 'ES' },
        ],
      },
      ctx,
    );

    // No hay diseño previo de CRM-01 que reutilizar: ES lo paga entero.
    const crm = line(option, 'CRM-01', 'ES');
    expect(crm.isLeadMarket).toBe(true);
    expect(eur(crm.costCents)).toBe(210); // (3 + 3) h × 35 €

    // ON-01 sí tiene FR delante.
    expect(line(option, 'ON-01', 'FR').isLeadMarket).toBe(true);
    expect(line(option, 'ON-01', 'ES').isLeadMarket).toBe(false);
  });

  it('el orden de las líneas no cambia quién paga el diseño', () => {
    const esPrimero = priceOption(
      { lines: [{ supportId: 'ON-01', market: 'ES' }, { supportId: 'ON-01', market: 'FR' }] },
      ctx,
    );
    expect(line(esPrimero, 'ON-01', 'FR').isLeadMarket).toBe(true);
    expect(eur(line(esPrimero, 'ON-01', 'ES').costCents)).toBe(70);
  });

  it('con tres mercados solo el líder paga el diseño', () => {
    const option = priceOption(
      {
        lines: (['ES', 'IT', 'FR'] as const).map((market) => ({ supportId: 'SOC-01', market })),
      },
      ctx,
    );
    expect(option.lines.filter((l) => l.isLeadMarket)).toHaveLength(1);
    expect(eur(line(option, 'SOC-01', 'FR').costCents)).toBe(310);
    expect(eur(line(option, 'SOC-01', 'ES').costCents)).toBe(170);
    expect(eur(line(option, 'SOC-01', 'IT').costCents)).toBe(170);
  });

  it('unitCost expone la misma regla sin pasar por una opción', () => {
    const on01 = DEFAULT_CATALOG.get('ON-01')!;
    expect(eur(unitCost(on01, 'FR', DEFAULT_PRICING_PARAMETERS, true))).toBe(140);
    expect(eur(unitCost(on01, 'ES', DEFAULT_PRICING_PARAMETERS, false))).toBe(70);
  });
});

// =============================================================================
// §4.3 — precio de venta y suelo de margen
// =============================================================================

describe('precio de venta', () => {
  it('aplica el coeficiente de mercado', () => {
    const option = priceOption(
      {
        lines: [
          { supportId: 'CRM-01', market: 'FR' },
          { supportId: 'CRM-01', market: 'ES' },
          { supportId: 'CRM-01', market: 'BE_FR' },
          { supportId: 'CRM-01', market: 'BE_NL' },
          { supportId: 'CRM-01', market: 'IT' },
        ],
      },
      ctx,
    );

    expect(eur(line(option, 'CRM-01', 'FR').grossPriceCents)).toBe(2000);
    expect(eur(line(option, 'CRM-01', 'ES').grossPriceCents)).toBe(1760);
    expect(eur(line(option, 'CRM-01', 'BE_FR').grossPriceCents)).toBe(1580);
    expect(eur(line(option, 'CRM-01', 'BE_NL').grossPriceCents)).toBe(1500);
    expect(eur(line(option, 'CRM-01', 'IT').grossPriceCents)).toBe(1480);
  });

  it('multiplica por la cantidad', () => {
    const option = priceOption({ lines: [{ supportId: 'ON-01', market: 'FR', quantity: 4 }] }, ctx);
    expect(eur(line(option, 'ON-01', 'FR').grossPriceCents)).toBe(1720); // 4 semanas × 430 €
  });

  it('los soportes que activan el suelo en algún mercado son exactamente ON-02, SOC-01, SOC-02, SOC-03 y SOC-04', () => {
    const activan = new Set<string>();

    for (const [id, support] of DEFAULT_CATALOG) {
      if (support.isMediaBuy) continue; // fuera de la fórmula general
      for (const market of MARKETS) {
        const option = priceOption({ lines: [{ supportId: id, market }] }, ctx);
        if (line(option, id, market).floorApplied) activan.add(id);
      }
    }

    expect([...activan].sort()).toEqual(['ON-02', 'SOC-01', 'SOC-02', 'SOC-03', 'SOC-04']);
  });

  it('los sociales lo activan por el boost; ON-02 lo activa por precio base bajo', () => {
    for (const id of ['SOC-01', 'SOC-02', 'SOC-03', 'SOC-04']) {
      expect(DEFAULT_CATALOG.get(id)!.externalCostCents).toBeGreaterThan(0);
    }
    expect(DEFAULT_CATALOG.get('ON-02')!.externalCostCents).toBe(0);
  });

  it('no existe coeficiente de duración: más semanas es más cantidad, no otra tarifa', () => {
    const una = priceOption({ lines: [{ supportId: 'ON-03', market: 'FR' }] }, ctx);
    const cuatro = priceOption({ lines: [{ supportId: 'ON-03', market: 'FR', quantity: 4 }] }, ctx);

    expect(cuatro.lines[0]!.grossPriceCents).toBe(una.lines[0]!.grossPriceCents * 4);
  });
});

// =============================================================================
// §4.4 — media buy
// =============================================================================

describe('media buy', () => {
  it('cobra el fee porcentual cuando supera el mínimo mensual', () => {
    // Meta, 10.000 € de medios en 1 mes: 4.000 € > 1.200 €
    const option = priceOption(
      { lines: [{ supportId: 'ADS-01', market: 'FR', mediaBudgetCents: 1_000_000, mediaMonths: 1 }] },
      ctx,
    );
    const ads = line(option, 'ADS-01', 'FR');

    expect(eur(ads.listPriceCents)).toBe(4000);
    expect(eur(ads.mediaBudgetCents)).toBe(10_000);
    // El fee de 4.000 € dispara el tramo del 5 % y queda en 3.800 €; los medios
    // salen intactos: 3.800 € + 10.000 €.
    expect(eur(ads.netPriceCents)).toBe(3800);
    expect(eur(ads.billedTotalCents)).toBe(13_800);
    expect(eur(option.billedTotalCents)).toBe(13_800);
  });

  it('los medios no entran en la base del margen: el margen se mide neto de medios', () => {
    const option = priceOption(
      { lines: [{ supportId: 'ADS-01', market: 'FR', mediaBudgetCents: 1_000_000, mediaMonths: 1 }] },
      ctx,
    );

    // Coste interno: (7 + 3) h × 35 € = 350 €
    expect(eur(option.costCents)).toBe(350);
    // netRevenue es el fee tras descuento; el margen se calcula sobre él, no
    // sobre los 10.000 € de medios.
    expect(option.netRevenueCents).toBe(option.lines[0]!.netPriceCents);
    expect(option.marginRate).toBeCloseTo(
      (option.netRevenueCents - 35_000) / option.netRevenueCents,
      10,
    );
    expect(option.meetsMarginFloor).toBe(true);
  });

  it('ADS-03 e INF-01 no tienen fee mínimo confirmado: se avisa y no se inventa', () => {
    for (const supportId of ['ADS-03', 'INF-01']) {
      expect(DEFAULT_CATALOG.get(supportId)!.minMonthlyFeeCents).toBeNull();

      const option = priceOption(
        { lines: [{ supportId, market: 'FR', mediaBudgetCents: 100_000, mediaMonths: 1 }] },
        ctx,
      );
      const l = line(option, supportId, 'FR');

      // Sin suelo: solo el 40 % de 1.000 €.
      expect(eur(l.listPriceCents)).toBe(400);
      expect(l.warnings.map((w) => w.code)).toContain('MISSING_MIN_MONTHLY_FEE');
    }
  });

  it('una línea de media buy con fee bajo no lleva suelo propio, pero tumba el margen de la opción', () => {
    const option = priceOption(
      { lines: [{ supportId: 'ADS-03', market: 'FR', mediaBudgetCents: 100_000, mediaMonths: 1 }] },
      ctx,
    );
    const ads = line(option, 'ADS-03', 'FR');

    // Fee 400 € contra un coste interno de 350 €.
    expect(eur(ads.costCents)).toBe(350);
    expect(ads.marginRate).toBeCloseTo(0.125, 10);
    expect(ads.floorApplied).toBe(false); // fuera de la fórmula general
    expect(ads.warnings.map((w) => w.code)).toContain('MEDIA_BUY_LINE_BELOW_MARGIN_FLOOR');

    // El control de opción es el que bloquea.
    expect(option.meetsMarginFloor).toBe(false);
    expect(option.warnings.map((w) => w.code)).toContain('OPTION_BELOW_MARGIN_FLOOR');
  });

  it('el fee mínimo se multiplica por los meses', () => {
    const unMes = mediaManagementFee(DEFAULT_PRICING_PARAMETERS, 0, 1, 120_000);
    const seisMeses = mediaManagementFee(DEFAULT_PRICING_PARAMETERS, 0, 6, 120_000);
    expect(eur(unMes.feeCents)).toBe(1200);
    expect(eur(seisMeses.feeCents)).toBe(7200);
  });

  it('sin mínimo confirmado no hay suelo, ni siquiera con presupuesto cero', () => {
    const sinMinimo = mediaManagementFee(DEFAULT_PRICING_PARAMETERS, 0, 12, null);
    expect(sinMinimo.feeCents).toBe(0);
    expect(sinMinimo.minimumApplied).toBe(false);
  });

  it('rechaza una línea de media buy sin presupuesto o sin meses', () => {
    expect(() => priceOption({ lines: [{ supportId: 'ADS-01', market: 'FR' }] }, ctx)).toThrow(
      PricingError,
    );
    expect(() =>
      priceOption({ lines: [{ supportId: 'ADS-01', market: 'FR', mediaBudgetCents: 100_000 }] }, ctx),
    ).toThrow(/mediaMonths/);
  });

  it('rechaza presupuesto de medios en un soporte que no es media buy', () => {
    expect(() =>
      priceOption({ lines: [{ supportId: 'ON-01', market: 'FR', mediaBudgetCents: 100_000 }] }, ctx),
    ).toThrow(/no es un soporte de media buy/);
  });
});

// =============================================================================
// §4.5 — descuentos
// =============================================================================

describe('descuentos', () => {
  it('la escala por volumen usa umbrales inclusivos', () => {
    const p = DEFAULT_PRICING_PARAMETERS;
    expect(volumeDiscountRate(p, 299_999)).toBe(0);
    expect(volumeDiscountRate(p, 300_000)).toBe(0.05);
    expect(volumeDiscountRate(p, 599_999)).toBe(0.05);
    expect(volumeDiscountRate(p, 600_000)).toBe(0.1);
    expect(volumeDiscountRate(p, 1_000_000)).toBe(0.15);
    expect(volumeDiscountRate(p, 1_499_999)).toBe(0.15);
    expect(volumeDiscountRate(p, 1_500_000)).toBe(0.2);
    expect(volumeDiscountRate(p, 99_999_999)).toBe(0.2);
  });

  it('el presupuesto de medios ni sube el tramo ni se descuenta', () => {
    const option = priceOption(
      {
        lines: [
          { supportId: 'ADS-02', market: 'FR', mediaBudgetCents: 1_000_000, mediaMonths: 1 },
          { supportId: 'ON-01', market: 'FR' },
        ],
      },
      ctx,
    );

    // Base = fee (4.000 €) + ON-01 (430 €) = 4.430 €. Con los 10.000 € de medios
    // dentro serían 14.430 € y el tramo saltaría al 15 %.
    expect(eur(option.grossNetOfMediaCents)).toBe(4430);
    expect(option.nominalDiscountRate).toBe(0.05);

    // Los medios salen intactos.
    expect(eur(option.mediaBudgetCents)).toBe(10_000);
    expect(eur(option.netRevenueCents)).toBe(4208.5);
    expect(eur(option.billedTotalCents)).toBe(14_208.5);
  });

  it('reaplica el suelo tras el descuento y no redistribuye el exceso', () => {
    const option = priceOption(
      {
        lines: [
          { supportId: 'CRM-01', market: 'FR', quantity: 2 }, // 4.000 €
          { supportId: 'SOC-02', market: 'FR' }, // 305 €, justo en su suelo
        ],
      },
      ctx,
    );

    expect(eur(option.grossNetOfMediaCents)).toBe(4305);
    expect(option.nominalDiscountRate).toBe(0.05);
    expect(eur(option.nominalDiscountCents)).toBe(215.25);

    // SOC-02 ya está en el suelo: no admite ni un céntimo de descuento.
    const soc02 = line(option, 'SOC-02', 'FR');
    expect(soc02.discountCents).toBe(0);
    expect(eur(soc02.netPriceCents)).toBe(305);
    expect(soc02.warnings.map((w) => w.code)).toContain('DISCOUNT_ABSORBED_BY_FLOOR');

    // El exceso NO se pasa a la otra línea.
    expect(eur(line(option, 'CRM-01', 'FR').discountCents)).toBe(200);
    expect(eur(option.effectiveDiscountCents)).toBe(200);
    expect(option.effectiveDiscountRate).toBeLessThan(option.nominalDiscountRate);
  });

  it('suma el descuento manual al de volumen y exige motivo', () => {
    const option = priceOption(
      {
        lines: [{ supportId: 'CRM-01', market: 'FR', quantity: 2 }],
        manualDiscounts: [
          { rate: 0.1, reason: 'Multimercado, 2 mercados — acordado con dirección', author: 'vincent' },
        ],
      },
      ctx,
    );

    expect(option.nominalDiscountRate).toBeCloseTo(0.15, 10);
    expect(option.discounts.map((d) => d.kind)).toEqual(['VOLUME', 'MANUAL']);
    expect(option.discounts[1]!.reason).toMatch(/Multimercado/);
  });

  it('rechaza un descuento manual sin motivo', () => {
    expect(() =>
      priceOption(
        { lines: [{ supportId: 'ON-01', market: 'FR' }], manualDiscounts: [{ rate: 0.1, reason: '  ' }] },
        ctx,
      ),
    ).toThrow(/motivo/);
  });

  it('el reparto a prorrata cuadra al céntimo', () => {
    const option = priceOption(
      {
        lines: [
          { supportId: 'CRM-01', market: 'FR', quantity: 3 },
          { supportId: 'CRM-02', market: 'ES' },
          { supportId: 'CON-01', market: 'IT' },
          { supportId: 'ON-03', market: 'BE_FR', quantity: 2 },
        ],
      },
      ctx,
    );

    const sumaLineas = option.lines.reduce((s, l) => s + l.netPriceCents, 0);
    expect(sumaLineas).toBe(option.netRevenueCents);
    expect(option.grossNetOfMediaCents - option.effectiveDiscountCents).toBe(option.netRevenueCents);
    expect(option.lines.every((l) => Number.isInteger(l.netPriceCents))).toBe(true);
  });
});

// =============================================================================
// Validación y totales
// =============================================================================

describe('validación', () => {
  it('rechaza un soporte desconocido', () => {
    expect(() => priceOption({ lines: [{ supportId: 'XX-99', market: 'FR' }] }, ctx)).toThrow(
      /Soporte desconocido/,
    );
  });

  it('rechaza el mismo soporte dos veces en el mismo mercado', () => {
    expect(() =>
      priceOption(
        { lines: [{ supportId: 'ON-01', market: 'FR' }, { supportId: 'ON-01', market: 'FR' }] },
        ctx,
      ),
    ).toThrow(/dos veces/);
  });

  it('rechaza cantidades no positivas', () => {
    expect(() =>
      priceOption({ lines: [{ supportId: 'ON-01', market: 'FR', quantity: 0 }] }, ctx),
    ).toThrow(/cantidad/);
  });

  it('marca SOC-05 como no vendible fuera de Francia, sin dejar de calcularlo', () => {
    const fr = priceOption({ lines: [{ supportId: 'SOC-05', market: 'FR' }] }, ctx);
    expect(line(fr, 'SOC-05', 'FR').sellable).toBe(true);

    const es = priceOption({ lines: [{ supportId: 'SOC-05', market: 'ES' }] }, ctx);
    const l = line(es, 'SOC-05', 'ES');
    expect(l.sellable).toBe(false);
    expect(l.warnings.map((w) => w.code)).toContain('NOT_SELLABLE_IN_MARKET');
  });
});

describe('totales de opción', () => {
  it('separa importe facturado e importe neto de medios', () => {
    const option = priceOption(
      {
        lines: [
          { supportId: 'ON-01', market: 'FR', quantity: 4 },
          { supportId: 'ADS-01', market: 'FR', mediaBudgetCents: 500_000, mediaMonths: 2 },
        ],
      },
      ctx,
    );

    // ON-01: 4 × 430 € = 1.720 €. ADS-01: max(5.000 € × 40 % ; 1.200 € × 2) = 2.400 €.
    expect(eur(option.grossNetOfMediaCents)).toBe(4120);
    expect(eur(option.mediaBudgetCents)).toBe(5000);
    expect(option.billedTotalCents).toBe(option.netRevenueCents + option.mediaBudgetCents);
    // El objetivo anual se mide sobre el neto, no sobre el facturado.
    expect(option.netRevenueCents).toBeLessThan(option.billedTotalCents);
  });

  it('la antelación de la opción es la del soporte más lento', () => {
    const option = priceOption(
      {
        lines: [
          { supportId: 'CRM-03', market: 'FR' }, // 10 días
          { supportId: 'INF-01', market: 'FR', mediaBudgetCents: 500_000, mediaMonths: 1 }, // 30 días
        ],
      },
      ctx,
    );
    expect(option.maxLeadTimeBusinessDays).toBe(30);
  });

  it('recoge los mercados presentes en la opción', () => {
    const option = priceOption(
      {
        lines: [
          { supportId: 'ON-01', market: 'FR' },
          { supportId: 'ON-01', market: 'ES' },
          { supportId: 'CRM-01', market: 'ES' },
        ],
      },
      ctx,
    );
    expect([...option.markets].sort()).toEqual(['ES', 'FR']);
  });

  it('una opción normal sin descuento cumple el suelo por construcción', () => {
    const option = priceOption(
      {
        lines: MARKETS.map((market) => ({ supportId: 'SOC-03', market })),
      },
      ctx,
    );
    expect(option.meetsMarginFloor).toBe(true);
    expect(option.marginRate!).toBeGreaterThanOrEqual(0.5);
  });
});
