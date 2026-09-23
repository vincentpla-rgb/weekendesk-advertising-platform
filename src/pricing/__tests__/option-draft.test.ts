import { describe, expect, it } from 'vitest';

import { DEFAULT_CATALOG } from '../catalog.js';
import { DEFAULT_PRICING_PARAMETERS } from '../parameters.js';
import { priceOption, volumeDiscountRate } from '../engine.js';
import {
  addLineDraft,
  addOptionDiscount,
  createLineDraft,
  createOptionDraft,
  removeLineDraft,
  resyncLineQuantity,
  setLineQuantityManually,
  setLineSupport,
  toOptionInput,
  toggleOptionMarket,
  updateOptionDraft,
  type OptionDraft,
} from '../option-draft.js';

const ctx = { parameters: DEFAULT_PRICING_PARAMETERS, catalog: DEFAULT_CATALOG };

/** Opción recién creada, con una sola línea (ON-01, semanal) — igual que "+ Añadir opción" en la interfaz. */
function freshOption(): OptionDraft {
  return createOptionDraft(DEFAULT_CATALOG, 'A', 'optA', 'l1', [...DEFAULT_CATALOG.values()]);
}

// =============================================================================
// 1. Bug arreglado (CLAUDE.md §4, ronda 6): fijar el periodo rellena la
//    cantidad SOLA, sin pulsar "usar duración" — el caso exacto reportado:
//    4 semanas de campaña + ON-01 (semanal) sin pulsar nada.
// =============================================================================

describe('la cantidad se rellena sola al fijar el periodo (ronda 6)', () => {
  it('4 semanas de campaña + ON-01 (semanal): la cantidad pasa a 4 sin ninguna acción manual', () => {
    let option = freshOption();
    expect(option.lines[0]!.quantity).toBe(1); // arranque, sin periodo todavía

    // El comercial fija el periodo: 1 al 28 de octubre = 28 días = 4 semanas.
    option = updateOptionDraft(DEFAULT_CATALOG, option, {
      campaignStart: '2027-10-01',
      campaignEnd: '2027-10-28',
    });

    expect(option.lines[0]!.quantity).toBe(4);
    expect(option.lines[0]!.quantityAutoSynced).toBe(true);

    // Y el motor, con esa cantidad, calcula 4 semanas de verdad — no 1.
    const priced = priceOption(toOptionInput(DEFAULT_CATALOG, option), ctx);
    const on01 = priced.lines.find((l) => l.supportId === 'ON-01' && l.market === 'FR')!;
    expect(on01.quantity).toBe(4);
    // Coste: (2+2)h × 35€ × 4 semanas = 560€. Con cantidad 1 (el bug) habría sido 140€.
    expect(on01.costCents).toBe(56_000);
  });

  it('cambiar el periodo a un rango distinto recalcula la cantidad otra vez, en cascada', () => {
    let option = freshOption();
    option = updateOptionDraft(DEFAULT_CATALOG, option, {
      campaignStart: '2027-10-01',
      campaignEnd: '2027-10-28',
    });
    expect(option.lines[0]!.quantity).toBe(4);

    // El comercial alarga la campaña a 6 semanas sin tocar la línea.
    option = updateOptionDraft(DEFAULT_CATALOG, option, { campaignEnd: '2027-11-11' });
    expect(option.lines[0]!.quantity).toBe(6);
  });

  it('añadir una línea nueva DESPUÉS de fijar el periodo la crea ya con la cantidad sugerida', () => {
    let option = freshOption();
    option = updateOptionDraft(DEFAULT_CATALOG, option, {
      campaignStart: '2027-10-01',
      campaignEnd: '2027-10-28',
    });
    option = addLineDraft(DEFAULT_CATALOG, option, 'ON-02', 'l2');
    const l2 = option.lines.find((l) => l.key === 'l2')!;
    expect(l2.quantity).toBe(4);
    expect(l2.quantityAutoSynced).toBe(true);
  });

  it('modo "solo duración": el conteo elegido se aplica solo a soportes de la MISMA unidad, sin pulsar nada', () => {
    let option = freshOption();
    option = updateOptionDraft(DEFAULT_CATALOG, option, {
      scheduleMode: 'DURATION_ONLY',
      durationCount: 4,
      durationUnit: 'WEEK',
    });
    expect(option.lines[0]!.quantity).toBe(4); // ON-01 es semanal, coincide

    option = addLineDraft(DEFAULT_CATALOG, option, 'ADS-02', 'l2'); // Pmax es mensual
    const pmax = option.lines.find((l) => l.key === 'l2')!;
    // La unidad no coincide (semanas elegidas, soporte mensual): sigue en 1,
    // sin inventar una conversión semanas→meses que nadie pidió.
    expect(pmax.quantity).toBe(1);
  });
});

// =============================================================================
// Soportes cuya unidad NO coincide con el periodo: cantidad 1 por defecto,
// sin sugerencia automática — comportamiento explícitamente preservado.
// =============================================================================

describe('soportes sin unidad semana/mes: cantidad 1, nunca una sugerencia inventada', () => {
  it('ON-04 (unidad "Campaña") se queda en 1 pase lo que pase con el periodo', () => {
    let option = freshOption();
    option = updateOptionDraft(DEFAULT_CATALOG, option, {
      campaignStart: '2027-10-01',
      campaignEnd: '2027-12-01',
    });
    option = addLineDraft(DEFAULT_CATALOG, option, 'ON-04', 'l2');
    const landing = option.lines.find((l) => l.key === 'l2')!;
    expect(landing.quantity).toBe(1);
  });

  it('INF-01 (unidad "Colaboración") se queda en 1 igualmente', () => {
    let option = freshOption();
    option = updateOptionDraft(DEFAULT_CATALOG, option, {
      campaignStart: '2027-10-01',
      campaignEnd: '2027-12-01',
    });
    option = addLineDraft(DEFAULT_CATALOG, option, 'INF-01', 'l2');
    expect(option.lines.find((l) => l.key === 'l2')!.quantity).toBe(1);
  });
});

// =============================================================================
// Edición manual: se respeta, y no se sobrescribe sola después.
// =============================================================================

describe('una cantidad editada a mano se respeta y no se sobrescribe sola', () => {
  it('tras editar a mano, cambiar el periodo NO toca la línea', () => {
    let option = freshOption();
    option = updateOptionDraft(DEFAULT_CATALOG, option, {
      campaignStart: '2027-10-01',
      campaignEnd: '2027-10-28',
    });
    expect(option.lines[0]!.quantity).toBe(4);

    option = setLineQuantityManually(option, option.lines[0]!.key, 10);
    expect(option.lines[0]!.quantity).toBe(10);
    expect(option.lines[0]!.quantityAutoSynced).toBe(false);

    // El comercial alarga la campaña — la línea editada a mano no se mueve.
    option = updateOptionDraft(DEFAULT_CATALOG, option, { campaignEnd: '2027-12-01' });
    expect(option.lines[0]!.quantity).toBe(10);
  });

  it('"usar duración" (resincronizar) vuelve a alinear una línea editada a mano con el periodo vigente', () => {
    let option = freshOption();
    option = updateOptionDraft(DEFAULT_CATALOG, option, {
      campaignStart: '2027-10-01',
      campaignEnd: '2027-10-28',
    });
    option = setLineQuantityManually(option, option.lines[0]!.key, 10);
    option = updateOptionDraft(DEFAULT_CATALOG, option, { campaignEnd: '2027-11-11' }); // 6 semanas, no toca (manual)
    expect(option.lines[0]!.quantity).toBe(10);

    option = resyncLineQuantity(DEFAULT_CATALOG, option, option.lines[0]!.key);
    expect(option.lines[0]!.quantity).toBe(6);
    expect(option.lines[0]!.quantityAutoSynced).toBe(true);

    // Y vuelve a quedar auto-sincronizada: el siguiente cambio de fecha ya la mueve sola.
    option = updateOptionDraft(DEFAULT_CATALOG, option, { campaignEnd: '2027-10-28' });
    expect(option.lines[0]!.quantity).toBe(4);
  });

  it('cambiar el soporte de una línea auto-sincronizada recalcula para el soporte nuevo', () => {
    let option = freshOption();
    option = updateOptionDraft(DEFAULT_CATALOG, option, {
      campaignStart: '2027-10-01',
      campaignEnd: '2027-11-11', // 6 semanas
    });
    expect(option.lines[0]!.quantity).toBe(6);

    option = setLineSupport(DEFAULT_CATALOG, option, option.lines[0]!.key, 'ADS-02'); // pasa a mensual
    // 6 semanas ≈ 2 meses (Math.ceil(42/30)).
    expect(option.lines[0]!.quantity).toBe(2);
  });

  it('cambiar el soporte de una línea editada a mano NO recalcula su cantidad', () => {
    let option = freshOption();
    option = updateOptionDraft(DEFAULT_CATALOG, option, {
      campaignStart: '2027-10-01',
      campaignEnd: '2027-10-28',
    });
    option = setLineQuantityManually(option, option.lines[0]!.key, 10);
    option = setLineSupport(DEFAULT_CATALOG, option, option.lines[0]!.key, 'ON-02');
    expect(option.lines[0]!.quantity).toBe(10);
  });
});

// =============================================================================
// El resto del cascada (2-6): ya se recalculaba en cada render a través del
// motor puro — aquí se prueba de extremo a extremo, con la MISMA conversión
// (toOptionInput) que usa la interfaz, para que quede garantizado y no solo
// asumido.
// =============================================================================

describe('cascada completa: ningún valor derivado necesita una acción manual aparte de cambiar el origen', () => {
  it('2. cambiar los mercados de la opción recalcula coste y precio de cada línea (mercado líder vs. el resto)', () => {
    let option = freshOption(); // FR, ON-01, cantidad 1
    const onlyFr = priceOption(toOptionInput(DEFAULT_CATALOG, option), ctx);
    const frLine = onlyFr.lines.find((l) => l.market === 'FR')!;
    // FR es el único mercado: paga coste completo, es mercado líder.
    expect(frLine.isLeadMarket).toBe(true);
    expect(frLine.costCents).toBe(14_000); // (2+2)h × 35€

    option = toggleOptionMarket(option, 'ES');
    const frAndEs = priceOption(toOptionInput(DEFAULT_CATALOG, option), ctx);
    const es = frAndEs.lines.find((l) => l.market === 'ES')!;
    const fr = frAndEs.lines.find((l) => l.market === 'FR')!;
    // FR (coeficiente 1,00) sigue siendo el líder: coste completo.
    expect(fr.isLeadMarket).toBe(true);
    expect(fr.costCents).toBe(14_000);
    // ES ya no paga diseño: solo horas de negocio (2h × 35€ = 70€).
    expect(es.isLeadMarket).toBe(false);
    expect(es.costCents).toBe(7_000);
    expect(es.grossPriceCents).toBe(Math.round(43_000 * 0.88));
  });

  it('3. cambiar la cantidad de una línea recalcula coste, precio, tramo de descuento y margen de la opción', () => {
    let option = freshOption();
    option = setLineQuantityManually(option, option.lines[0]!.key, 1);
    const smallQty = priceOption(toOptionInput(DEFAULT_CATALOG, option), ctx);
    // 1 semana de ON-01: muy por debajo de cualquier tramo de descuento.
    expect(volumeDiscountRate(DEFAULT_PRICING_PARAMETERS, smallQty.grossNetOfMediaCents)).toBe(0);
    expect(smallQty.nominalDiscountRate).toBe(0);

    // Cantidad grande: cruza el tramo de 3.000 € (5 %) sin tocar nada más.
    option = setLineQuantityManually(option, option.lines[0]!.key, 10); // 10 × 430€ = 4.300€
    const bigQty = priceOption(toOptionInput(DEFAULT_CATALOG, option), ctx);
    expect(bigQty.grossNetOfMediaCents).toBe(430_000);
    expect(bigQty.nominalDiscountRate).toBe(0.05);
    expect(bigQty.costCents).toBe(140_000); // coste escala con la cantidad (CLAUDE.md §4.1)
    expect(bigQty.marginRate).not.toBeNull();
    expect(bigQty.marginRate!).toBeGreaterThan(0);
  });

  it('4. el suelo de margen se reaplica tras un descuento manual, sin dejarlo pasar en silencio', () => {
    let option = freshOption();
    option = setLineQuantityManually(option, option.lines[0]!.key, 10); // 4.300€, entra en el tramo del 5 %
    option = addOptionDiscount(option, 'd1');
    option = { ...option, discounts: option.discounts.map((d) => ({ ...d, ratePercent: 40, reason: 'Descuento comercial de prueba' })) };

    const priced = priceOption(toOptionInput(DEFAULT_CATALOG, option), ctx);
    const on01 = priced.lines.find((l) => l.supportId === 'ON-01')!;
    // Un 40 % manual + 5 % de volumen (45 % nominal) empuja la línea contra
    // el suelo de margen del 50 %: el motor lo reaplica línea a línea
    // (CLAUDE.md §4.3, §4.5) — el descuento efectivo queda por debajo del
    // nominal, no se deja pasar en silencio. `floorApplied` en sí refleja
    // el suelo PRE-descuento (no salta aquí, la tarifa bruta ya iba sobrada);
    // la señal de que el suelo mordió DESPUÉS del descuento es el aviso
    // DISCOUNT_ABSORBED_BY_FLOOR (CLAUDE.md §4.5).
    expect(on01.warnings.map((w) => w.code)).toContain('DISCOUNT_ABSORBED_BY_FLOOR');
    expect(priced.nominalDiscountRate).toBeCloseTo(0.45);
    expect(priced.effectiveDiscountRate).toBeLessThan(priced.nominalDiscountRate);
    expect(on01.marginRate).toBeCloseTo(0.5, 5);
  });

  it('5. añadir o quitar una línea recalcula el total de la opción, sin ninguna acción aparte', () => {
    let option = freshOption();
    const before = priceOption(toOptionInput(DEFAULT_CATALOG, option), ctx);

    option = addLineDraft(DEFAULT_CATALOG, option, 'CRM-03', 'l2');
    const afterAdd = priceOption(toOptionInput(DEFAULT_CATALOG, option), ctx);
    expect(afterAdd.billedTotalCents).toBeGreaterThan(before.billedTotalCents);

    option = removeLineDraft(option, 'l2');
    const afterRemove = priceOption(toOptionInput(DEFAULT_CATALOG, option), ctx);
    expect(afterRemove.billedTotalCents).toBe(before.billedTotalCents);
  });

  it('6. no hace falta "refrescar": la misma función pura (toOptionInput + priceOption) que alimenta la vista previa da el resultado final en cada paso', () => {
    let option = freshOption();
    option = updateOptionDraft(DEFAULT_CATALOG, option, {
      campaignStart: '2027-10-01',
      campaignEnd: '2027-10-28', // 4 semanas
    });
    option = addLineDraft(DEFAULT_CATALOG, option, 'ADS-02', 'l2'); // Pmax, mensual — no coincide con semanas, se queda en 1
    option = toggleOptionMarket(option, 'IT');

    const priced = priceOption(toOptionInput(DEFAULT_CATALOG, option), ctx);
    const on01Fr = priced.lines.find((l) => l.supportId === 'ON-01' && l.market === 'FR')!;
    const on01It = priced.lines.find((l) => l.supportId === 'ON-01' && l.market === 'IT')!;
    const pmaxFr = priced.lines.find((l) => l.supportId === 'ADS-02' && l.market === 'FR')!;

    expect(on01Fr.quantity).toBe(4);
    expect(on01It.quantity).toBe(4); // la misma línea se aplica igual en todos los mercados de la opción (§4.2)
    expect(pmaxFr.quantity).toBe(1); // unidad mensual, no coincide con "4 semanas": sin sugerencia

    // Límite de diseño, documentado (CLAUDE.md §4.2, ronda 2): los mercados
    // son de la OPCIÓN, no de la línea, así que una sola línea NUNCA puede
    // tener una cantidad distinta según el mercado dentro de la misma
    // opción — "2 mercados con distinta cantidad cada uno" no es expresable
    // por diseño. Lo más cercano son dos LÍNEAS de unidades distintas dentro
    // del mismo periodo, cada una con su propia cantidad sugerida — es
    // justo lo que este caso demuestra (ON-01 semanal vs. ADS-02 mensual).
    expect(on01Fr.quantity).toBe(on01It.quantity);
  });
});

// =============================================================================
// Utilidades de creación de línea/opción, probadas por separado.
// =============================================================================

describe('createLineDraft / createOptionDraft', () => {
  it('una opción recién creada, sin periodo, arranca en cantidad 1 y auto-sincronizada', () => {
    const option = freshOption();
    expect(option.lines).toHaveLength(1);
    expect(option.lines[0]!.quantity).toBe(1);
    expect(option.lines[0]!.quantityAutoSynced).toBe(true);
  });

  it('createLineDraft ya sugiere la cantidad si se le pasa un periodo vigente', () => {
    const schedule = { scheduleMode: 'DATES' as const, campaignStart: '2027-10-01', campaignEnd: '2027-10-28', durationCount: '' as const, durationUnit: 'WEEK' as const };
    const line = createLineDraft(DEFAULT_CATALOG, schedule, 'ON-01', 'l1');
    expect(line.quantity).toBe(4);
  });
});
