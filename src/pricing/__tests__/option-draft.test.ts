import { describe, expect, it } from 'vitest';

import { DEFAULT_CATALOG } from '../catalog.js';
import { DEFAULT_PRICING_PARAMETERS } from '../parameters.js';
import { priceOption, volumeDiscountRate } from '../engine.js';
import {
  addLineDraft,
  addOptionDiscount,
  clearLeadTimeOverride,
  createLineDraft,
  createOptionDraft,
  forceLeadTimeOverride,
  optionDraftFromSnapshot,
  removeLineDraft,
  resyncLineQuantity,
  setLineQuantityManually,
  setLineSupport,
  toOptionInput,
  toggleOptionMarket,
  updateLineDraft,
  updateOptionDraft,
  type OptionDraft,
  type SnapshotOptionInput,
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

// =============================================================================
// Media buy (CLAUDE.md §4.4, ronda 9): el presupuesto de medios es SIEMPRE
// manual (cifra de negociación, nunca se calcula sola), pero los meses del
// fee mínimo se derivan de la duración de la opción — nunca un campo suelto
// que el comercial tenga que rellenar dos veces (una en la cantidad, que ya
// se auto-sincroniza para ADS-*, y otra en los meses).
// =============================================================================

describe('media buy: presupuesto manual, meses derivados de la duración (ronda 9)', () => {
  it('ADS-01 (mensual): el motor recibe mediaMonths = duración en meses, sin que el comercial lo escriba', () => {
    let option = freshOption();
    option = setLineSupport(DEFAULT_CATALOG, option, option.lines[0]!.key, 'ADS-01');
    option = updateLineDraft(option, option.lines[0]!.key, { mediaBudgetEuros: 3000 });
    option = updateOptionDraft(DEFAULT_CATALOG, option, {
      campaignStart: '2027-10-01',
      campaignEnd: '2027-11-29', // 60 días = 2 meses
    });

    const input = toOptionInput(DEFAULT_CATALOG, option);
    expect(input.lines[0]!.mediaMonths).toBe(2);

    const priced = priceOption(input, ctx);
    const ads01 = priced.lines.find((l) => l.supportId === 'ADS-01' && l.market === 'FR')!;
    expect(ads01.mediaMonths).toBe(2);
  });

  it('INF-01 (unidad "Colaboración", no auto-sincroniza cantidad) SÍ deriva mediaMonths de la duración igualmente', () => {
    let option = freshOption();
    option = setLineSupport(DEFAULT_CATALOG, option, option.lines[0]!.key, 'INF-01');
    option = updateLineDraft(option, option.lines[0]!.key, { mediaBudgetEuros: 5000 });
    option = updateOptionDraft(DEFAULT_CATALOG, option, {
      campaignStart: '2027-10-01',
      campaignEnd: '2027-11-29', // 60 días = 2 meses
    });

    // La cantidad (colaboraciones) sigue en 1, sin inventar nada — eje
    // distinto de la duración en meses del fee mínimo.
    expect(option.lines[0]!.quantity).toBe(1);

    const input = toOptionInput(DEFAULT_CATALOG, option);
    expect(input.lines[0]!.mediaMonths).toBe(2);
  });

  it('cambiar el periodo después de fijar el presupuesto actualiza los meses solo, sin tocar el presupuesto', () => {
    let option = freshOption();
    option = setLineSupport(DEFAULT_CATALOG, option, option.lines[0]!.key, 'ADS-01');
    option = updateLineDraft(option, option.lines[0]!.key, { mediaBudgetEuros: 3000 });
    option = updateOptionDraft(DEFAULT_CATALOG, option, {
      campaignStart: '2027-10-01',
      campaignEnd: '2027-10-28', // 4 semanas = 1 mes
    });
    expect(toOptionInput(DEFAULT_CATALOG, option).lines[0]!.mediaMonths).toBe(1);

    option = updateOptionDraft(DEFAULT_CATALOG, option, { campaignEnd: '2027-12-27' }); // ~12 semanas = 3 meses
    const input = toOptionInput(DEFAULT_CATALOG, option);
    expect(input.lines[0]!.mediaMonths).toBe(3);
    // El presupuesto, manual, no se toca por cambiar el periodo.
    expect(option.lines[0]!.mediaBudgetEuros).toBe(3000);
  });

  it('modo "solo duración" en meses: mediaMonths es el conteo elegido, directo', () => {
    let option = freshOption();
    option = setLineSupport(DEFAULT_CATALOG, option, option.lines[0]!.key, 'ADS-02');
    option = updateLineDraft(option, option.lines[0]!.key, { mediaBudgetEuros: 4000 });
    option = updateOptionDraft(DEFAULT_CATALOG, option, {
      scheduleMode: 'DURATION_ONLY',
      durationCount: 5,
      durationUnit: 'MONTH',
    });
    expect(toOptionInput(DEFAULT_CATALOG, option).lines[0]!.mediaMonths).toBe(5);
  });

  it('modo "solo duración" en semanas: mediaMonths se aproxima con la misma equivalencia de días que el resto del motor', () => {
    let option = freshOption();
    option = setLineSupport(DEFAULT_CATALOG, option, option.lines[0]!.key, 'ADS-02');
    option = updateLineDraft(option, option.lines[0]!.key, { mediaBudgetEuros: 4000 });
    option = updateOptionDraft(DEFAULT_CATALOG, option, {
      scheduleMode: 'DURATION_ONLY',
      durationCount: 8,
      durationUnit: 'WEEK', // 8 semanas × 7 / 30 = 1.87 → 2 meses
    });
    expect(toOptionInput(DEFAULT_CATALOG, option).lines[0]!.mediaMonths).toBe(2);
  });

  it('sin periodo fijado todavía, mediaMonths cae al valor por defecto (1) — igual que antes de esta ronda', () => {
    let option = freshOption();
    option = setLineSupport(DEFAULT_CATALOG, option, option.lines[0]!.key, 'ADS-01');
    option = updateLineDraft(option, option.lines[0]!.key, { mediaBudgetEuros: 3000 });
    expect(toOptionInput(DEFAULT_CATALOG, option).lines[0]!.mediaMonths).toBe(1);
  });

  it('el presupuesto de medios vacío se manda como 0 al motor — el control previo al envío es quien lo bloquea, no el motor', () => {
    let option = freshOption();
    option = setLineSupport(DEFAULT_CATALOG, option, option.lines[0]!.key, 'ADS-01');
    expect(option.lines[0]!.mediaBudgetEuros).toBe(''); // vacío por defecto (CLAUDE.md §4.4)

    const input = toOptionInput(DEFAULT_CATALOG, option);
    expect(input.lines[0]!.mediaBudgetCents).toBe(0);
  });
});

// =============================================================================
// Reparto del fee forzado a mano (CLAUDE.md §4.4, ronda 10): vacío por
// defecto = automático; relleno = manualFeeCents/manualFeeReason.
// =============================================================================

describe('media buy: reparto forzado a mano (ronda 10)', () => {
  it('manualFeeEuros vacío por defecto: toOptionInput no manda manualFeeCents', () => {
    let option = freshOption();
    option = setLineSupport(DEFAULT_CATALOG, option, option.lines[0]!.key, 'ADS-01');
    option = updateLineDraft(option, option.lines[0]!.key, { mediaBudgetEuros: 3000 });
    expect(option.lines[0]!.manualFeeEuros).toBe('');

    const input = toOptionInput(DEFAULT_CATALOG, option);
    expect(input.lines[0]!.manualFeeCents).toBeUndefined();

    const priced = priceOption(input, ctx);
    const ads01 = priced.lines.find((l) => l.supportId === 'ADS-01' && l.market === 'FR')!;
    expect(ads01.feeForced).toBe(false);
  });

  it('manualFeeEuros relleno: toOptionInput manda manualFeeCents/manualFeeReason y el motor fija el fee', () => {
    let option = freshOption();
    option = setLineSupport(DEFAULT_CATALOG, option, option.lines[0]!.key, 'ADS-01');
    option = updateLineDraft(option, option.lines[0]!.key, {
      mediaBudgetEuros: 2000,
      manualFeeEuros: 900,
      manualFeeReason: 'Fee negociado con el cliente.',
    });

    const input = toOptionInput(DEFAULT_CATALOG, option);
    expect(input.lines[0]!.manualFeeCents).toBe(90_000);
    expect(input.lines[0]!.manualFeeReason).toBe('Fee negociado con el cliente.');

    const priced = priceOption(input, ctx);
    const ads01 = priced.lines.find((l) => l.supportId === 'ADS-01' && l.market === 'FR')!;
    expect(ads01.feeForced).toBe(true);
    expect(ads01.netPriceCents).toBe(90_000);
  });

  it('createLineDraft/createOptionDraft empiezan siempre con manualFeeEuros/manualFeeReason vacíos', () => {
    const option = freshOption();
    expect(option.lines[0]!.manualFeeEuros).toBe('');
    expect(option.lines[0]!.manualFeeReason).toBe('');
  });
});

// =============================================================================
// Interruptor "desactivar descuento por volumen" por opción (CLAUDE.md §4.5,
// ronda 9): distinto de los descuentos manuales, que ya existían.
// =============================================================================

describe('volumeDiscountDisabled: interruptor por opción (ronda 9)', () => {
  it('una opción recién creada empieza con el descuento por volumen activado (false)', () => {
    const option = freshOption();
    expect(option.volumeDiscountDisabled).toBe(false);
  });

  it('updateOptionDraft cambia el interruptor sin resincronizar cantidades (no es un campo de periodo)', () => {
    let option = freshOption();
    option = setLineQuantityManually(option, option.lines[0]!.key, 99); // deja de auto-sincronizar
    option = updateOptionDraft(DEFAULT_CATALOG, option, { volumeDiscountDisabled: true });

    expect(option.volumeDiscountDisabled).toBe(true);
    expect(option.lines[0]!.quantity).toBe(99); // sin tocar
  });

  it('toOptionInput lo traslada al motor y el descuento por volumen deja de aplicarse', () => {
    let option = freshOption();
    // CRM-01, cantidad suficiente para superar el umbral del 5 % (3.000€).
    option = setLineSupport(DEFAULT_CATALOG, option, option.lines[0]!.key, 'CRM-01');
    option = setLineQuantityManually(option, option.lines[0]!.key, 2); // 2 × 2.000€ = 4.000€

    const conDescuento = priceOption(toOptionInput(DEFAULT_CATALOG, option), ctx);
    expect(conDescuento.discounts.map((d) => d.kind)).toEqual(['VOLUME']);

    option = updateOptionDraft(DEFAULT_CATALOG, option, { volumeDiscountDisabled: true });
    const input = toOptionInput(DEFAULT_CATALOG, option);
    expect(input.volumeDiscountDisabled).toBe(true);

    const sinDescuento = priceOption(input, ctx);
    expect(sinDescuento.discounts).toEqual([]);
    expect(sinDescuento.netRevenueCents).toBe(sinDescuento.grossNetOfMediaCents);
  });
});

// =============================================================================
// Antelación insuficiente forzada a mano (CLAUDE.md §5.3, ronda 11): el
// único bloqueo duro forzable, por soporte+mercado.
// =============================================================================

describe('leadTimeOverrides: forzar antelación insuficiente (ronda 11)', () => {
  it('una opción recién creada empieza sin ningún forzado', () => {
    expect(freshOption().leadTimeOverrides).toEqual([]);
  });

  it('forceLeadTimeOverride añade un forzado con motivo', () => {
    let option = freshOption();
    option = forceLeadTimeOverride(option, 'ON-01', 'FR', 'Cliente grande, acepta el riesgo.');
    expect(option.leadTimeOverrides).toEqual([
      { supportId: 'ON-01', market: 'FR', reason: 'Cliente grande, acepta el riesgo.' },
    ]);
  });

  it('un motivo vacío o solo espacios no tiene ningún efecto', () => {
    let option = freshOption();
    option = forceLeadTimeOverride(option, 'ON-01', 'FR', '');
    expect(option.leadTimeOverrides).toEqual([]);

    option = forceLeadTimeOverride(option, 'ON-01', 'FR', '   ');
    expect(option.leadTimeOverrides).toEqual([]);
  });

  it('el motivo se recorta de espacios al guardarse', () => {
    let option = freshOption();
    option = forceLeadTimeOverride(option, 'ON-01', 'FR', '  motivo con espacios  ');
    expect(option.leadTimeOverrides[0]!.reason).toBe('motivo con espacios');
  });

  it('forzar de nuevo el mismo soporte+mercado sustituye el forzado anterior, no lo duplica', () => {
    let option = freshOption();
    option = forceLeadTimeOverride(option, 'ON-01', 'FR', 'primer motivo');
    option = forceLeadTimeOverride(option, 'ON-01', 'FR', 'motivo actualizado');
    expect(option.leadTimeOverrides).toHaveLength(1);
    expect(option.leadTimeOverrides[0]!.reason).toBe('motivo actualizado');
  });

  it('el mismo soporte en dos mercados distintos son dos forzados independientes', () => {
    let option = freshOption();
    option = forceLeadTimeOverride(option, 'ON-01', 'FR', 'motivo FR');
    option = forceLeadTimeOverride(option, 'ON-01', 'ES', 'motivo ES');
    expect(option.leadTimeOverrides).toHaveLength(2);
    expect(option.leadTimeOverrides.find((o) => o.market === 'FR')?.reason).toBe('motivo FR');
    expect(option.leadTimeOverrides.find((o) => o.market === 'ES')?.reason).toBe('motivo ES');
  });

  it('clearLeadTimeOverride retira solo el forzado indicado', () => {
    let option = freshOption();
    option = forceLeadTimeOverride(option, 'ON-01', 'FR', 'motivo FR');
    option = forceLeadTimeOverride(option, 'ON-01', 'ES', 'motivo ES');
    option = clearLeadTimeOverride(option, 'ON-01', 'FR');
    expect(option.leadTimeOverrides).toEqual([{ supportId: 'ON-01', market: 'ES', reason: 'motivo ES' }]);
  });

  it('clearLeadTimeOverride sobre un forzado inexistente no tiene efecto', () => {
    const option = freshOption();
    expect(clearLeadTimeOverride(option, 'ON-01', 'FR')).toEqual(option);
  });
});

// =============================================================================
// optionDraftFromSnapshot (CLAUDE.md §10.3 ter decies, ronda 13): reconstruye
// un OptionDraft editable a partir de una opción ya persistida —
// `proposals.frozen_snapshot`, el mismo jsonb que `duplicateProposal` ya lee
// (CLAUDE.md §10.3 octies) — para el flujo nuevo "Editar" sobre un DRAFT que
// nunca llegó a enviarse con éxito.
// =============================================================================

describe('optionDraftFromSnapshot (ronda 13)', () => {
  function baseSnapshot(overrides: Partial<SnapshotOptionInput> = {}): SnapshotOptionInput {
    return {
      code: 'A',
      name: 'Entrada',
      pitch: 'Pitch de la opción',
      markets: ['FR'],
      campaign_start: '2027-10-01',
      campaign_end: '2027-10-28',
      campaign_duration_count: null,
      campaign_duration_unit: null,
      lines: [
        {
          support_id: 'ON-01',
          quantity: 4,
          media_budget_cents: null,
          is_lead_market: true,
          manual_fee_cents: null,
          manual_fee_reason: null,
        },
      ],
      discounts: [],
      volume_discount_disabled: false,
      lead_time_overrides: [],
      ...overrides,
    };
  }

  it('con fechas concretas, reconstruye en modo DATES con las mismas fechas', () => {
    const draft = optionDraftFromSnapshot(baseSnapshot(), 'k1', () => 'l1');
    expect(draft.scheduleMode).toBe('DATES');
    expect(draft.campaignStart).toBe('2027-10-01');
    expect(draft.campaignEnd).toBe('2027-10-28');
    expect(draft.durationCount).toBe('');
  });

  it('sin fechas concretas, reconstruye en modo DURATION_ONLY con la duración guardada', () => {
    const snapshot = baseSnapshot({
      campaign_start: null,
      campaign_end: null,
      campaign_duration_count: 4,
      campaign_duration_unit: 'WEEK',
    });
    const draft = optionDraftFromSnapshot(snapshot, 'k1', () => 'l1');
    expect(draft.scheduleMode).toBe('DURATION_ONLY');
    expect(draft.campaignStart).toBe('');
    expect(draft.durationCount).toBe(4);
    expect(draft.durationUnit).toBe('WEEK');
  });

  it('se queda solo con la línea del mercado líder cuando la opción es multimercado', () => {
    const snapshot = baseSnapshot({
      markets: ['FR', 'ES'],
      lines: [
        {
          support_id: 'ON-01',
          quantity: 4,
          media_budget_cents: null,
          is_lead_market: true,
          manual_fee_cents: null,
          manual_fee_reason: null,
        },
        {
          support_id: 'ON-01',
          quantity: 4,
          media_budget_cents: null,
          is_lead_market: false,
          manual_fee_cents: null,
          manual_fee_reason: null,
        },
      ],
    });
    const draft = optionDraftFromSnapshot(snapshot, 'k1', () => 'l1');
    expect(draft.lines).toHaveLength(1);
    expect(draft.markets).toEqual(['FR', 'ES']);
  });

  it('quantityAutoSynced arranca en false: un cambio de periodo no pisa la cantidad ya confirmada', () => {
    const draft = optionDraftFromSnapshot(baseSnapshot(), 'k1', () => 'l1');
    expect(draft.lines[0]!.quantityAutoSynced).toBe(false);
  });

  it('presupuesto de medios: 0 cents equivale a vacío (misma convención que toOptionInput)', () => {
    const withBudget = optionDraftFromSnapshot(
      baseSnapshot({
        lines: [
          {
            support_id: 'ADS-01',
            quantity: 1,
            media_budget_cents: 200_000,
            is_lead_market: true,
            manual_fee_cents: null,
            manual_fee_reason: null,
          },
        ],
      }),
      'k1',
      () => 'l1',
    );
    expect(withBudget.lines[0]!.mediaBudgetEuros).toBe(2000);

    const withoutBudget = optionDraftFromSnapshot(baseSnapshot(), 'k1', () => 'l1');
    expect(withoutBudget.lines[0]!.mediaBudgetEuros).toBe('');
  });

  it('fee forzado a mano: 0 € es una entrada real (trueque), distinta de "sin forzar" (null)', () => {
    const forcedToZero = optionDraftFromSnapshot(
      baseSnapshot({
        lines: [
          {
            support_id: 'ADS-01',
            quantity: 1,
            media_budget_cents: 200_000,
            is_lead_market: true,
            manual_fee_cents: 0,
            manual_fee_reason: 'Trueque acordado',
          },
        ],
      }),
      'k1',
      () => 'l1',
    );
    expect(forcedToZero.lines[0]!.manualFeeEuros).toBe(0);
    expect(forcedToZero.lines[0]!.manualFeeReason).toBe('Trueque acordado');

    const notForced = optionDraftFromSnapshot(baseSnapshot(), 'k1', () => 'l1');
    expect(notForced.lines[0]!.manualFeeEuros).toBe('');
  });

  it('solo los descuentos MANUAL sobreviven; los VOLUME se descartan (se recalculan solos)', () => {
    const snapshot = baseSnapshot({
      discounts: [
        { kind: 'VOLUME', rate: 0.1, reason: null },
        { kind: 'MANUAL', rate: 0.05, reason: 'Cliente fiel' },
      ],
    });
    const draft = optionDraftFromSnapshot(snapshot, 'k1', () => 'l1');
    expect(draft.discounts).toHaveLength(1);
    expect(draft.discounts[0]!.ratePercent).toBe(5);
    expect(draft.discounts[0]!.reason).toBe('Cliente fiel');
  });

  it('traslada el interruptor de descuento por volumen y las antelaciones forzadas', () => {
    const snapshot = baseSnapshot({
      volume_discount_disabled: true,
      lead_time_overrides: [{ support_id: 'ON-01', market: 'FR', reason: 'Cliente grande, plazo ajustado' }],
    });
    const draft = optionDraftFromSnapshot(snapshot, 'k1', () => 'l1');
    expect(draft.volumeDiscountDisabled).toBe(true);
    expect(draft.leadTimeOverrides).toEqual([
      { supportId: 'ON-01', market: 'FR', reason: 'Cliente grande, plazo ajustado' },
    ]);
  });

  it('lead_time_overrides ausente (frozen_snapshot de antes de la ronda 11) no revienta: cae a un array vacío', () => {
    const snapshot = baseSnapshot({ lead_time_overrides: undefined });
    const draft = optionDraftFromSnapshot(snapshot, 'k1', () => 'l1');
    expect(draft.leadTimeOverrides).toEqual([]);
  });

  it('el resultado pasa por el motor real sin errores (toOptionInput + priceOption)', () => {
    const draft = optionDraftFromSnapshot(baseSnapshot(), 'k1', () => 'l1');
    const priced = priceOption(toOptionInput(DEFAULT_CATALOG, draft), ctx);
    expect(priced.lines).toHaveLength(1);
    expect(priced.billedTotalCents).toBeGreaterThan(0);
  });
});
