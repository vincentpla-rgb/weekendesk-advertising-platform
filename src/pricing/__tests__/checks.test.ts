import { describe, expect, it } from 'vitest';

import { DEFAULT_CATALOG } from '../catalog.js';
import { DEFAULT_PRICING_PARAMETERS } from '../parameters.js';
import { priceOption, type PricingContext } from '../engine.js';
import {
  businessDaysBetween,
  runPreSendChecks,
  type PreSendContext,
  type PreSendOptionContext,
} from '../checks.js';
import { fiscalPeriodOf, fiscalYearLabel } from '../fiscal.js';
import { DEFAULT_HOLIDAYS, type PublicHoliday } from '../holidays.js';
import type { PricedOption } from '../types.js';

const ctx: PricingContext = { parameters: DEFAULT_PRICING_PARAMETERS, catalog: DEFAULT_CATALOG };
const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

function baseContext(overrides: Partial<PreSendContext> = {}): PreSendContext {
  return {
    today: d('2026-09-18'),
    brief: 'Campaña de otoño para la Costa Brava.',
    parameters: DEFAULT_PRICING_PARAMETERS,
    holidays: DEFAULT_HOLIDAYS,
    ...overrides,
  };
}

/** Envuelve una opción ya calculada con una fecha de inicio concreta (§5.3). */
function withStart(
  option: PricedOption,
  campaignStart: Date | null = d('2026-11-02'),
  campaignEnd: Date | null = null,
): PreSendOptionContext {
  return { option, campaignStart, campaignEnd, durationOnly: false };
}

/** Opción cotizada solo por duración, sin fecha de inicio concreta (§5.3 bis). */
function withDurationOnly(option: PricedOption): PreSendOptionContext {
  return { option, campaignStart: null, campaignEnd: null, durationOnly: true };
}

describe('businessDaysBetween', () => {
  it('cuenta solo de lunes a viernes cuando no hay festivos en el rango', () => {
    // viernes 18/09/2026 → viernes 09/10/2026: ningún festivo FR en medio.
    expect(businessDaysBetween(d('2026-09-18'), d('2026-10-09'), 'FR', DEFAULT_HOLIDAYS)).toBe(15);
    expect(businessDaysBetween(d('2026-09-18'), d('2026-10-12'), 'FR', DEFAULT_HOLIDAYS)).toBe(16);
    expect(businessDaysBetween(d('2026-09-18'), d('2026-09-30'), 'FR', DEFAULT_HOLIDAYS)).toBe(8);
  });

  it('un fin de semana no aporta nada', () => {
    expect(businessDaysBetween(d('2026-09-18'), d('2026-09-20'), 'FR', DEFAULT_HOLIDAYS)).toBe(0);
  });

  it('devuelve cero si la fecha de destino no es posterior', () => {
    expect(businessDaysBetween(d('2026-09-18'), d('2026-09-18'), 'FR', DEFAULT_HOLIDAYS)).toBe(0);
    expect(businessDaysBetween(d('2026-09-18'), d('2026-09-01'), 'FR', DEFAULT_HOLIDAYS)).toBe(0);
  });

  it('excluye los festivos del mercado, no solo el fin de semana', () => {
    // 11/12/2026 (viernes) → 01/01/2027: sin festivos serían 15 días laborables;
    // con el calendario FR (25/12 y 01/01) son 13. Es el caso de Navidad que
    // motiva la tabla de festivos: sin ella la calculadora habría dicho que
    // se llegaba a tiempo a un ON-01 (15 días de antelación) cuando no era así.
    const from = d('2026-12-11');
    const to = d('2027-01-01');
    expect(businessDaysBetween(from, to, 'FR', [])).toBe(15);
    expect(businessDaysBetween(from, to, 'FR', DEFAULT_HOLIDAYS)).toBe(13);
  });

  it('el calendario es por mercado: FR e IT no excluyen los mismos días', () => {
    // 20/12/2026 → 08/01/2027: IT excluye además la Epifanía (6 de enero),
    // que no es festivo en Francia.
    const from = d('2026-12-20');
    const to = d('2027-01-08');
    expect(businessDaysBetween(from, to, 'FR', DEFAULT_HOLIDAYS)).toBe(13);
    expect(businessDaysBetween(from, to, 'IT', DEFAULT_HOLIDAYS)).toBe(12);
  });

  it('BE-FR y BE-NL comparten el mismo calendario: son festivos federales', () => {
    const from = d('2026-12-11');
    const to = d('2027-01-01');
    expect(businessDaysBetween(from, to, 'BE_FR', DEFAULT_HOLIDAYS)).toBe(
      businessDaysBetween(from, to, 'BE_NL', DEFAULT_HOLIDAYS),
    );
  });

  it('sin festivos cargados para un mercado, se comporta como antes: solo fin de semana', () => {
    const from = d('2026-12-11');
    const to = d('2027-01-01');
    expect(businessDaysBetween(from, to, 'FR', [])).toBe(15);
  });
});

describe('controles previos al envío', () => {
  it('ya no exige check de disponibilidad con Marketing: se hace fuera del sistema (§5.3)', () => {
    const option = priceOption({ id: 'A', markets: ['FR'], lines: [{ supportId: 'ON-01' }] }, ctx);
    const informe = runPreSendChecks([withStart(option)], baseContext());

    expect(informe.canSend).toBe(true);
    expect(informe.blockers.map((b) => b.code)).not.toContain('AVAILABILITY_NOT_CONFIRMED');
  });

  it('bloquea por antelación insuficiente frente al soporte más lento', () => {
    // INF-01 exige 30 días laborables; del 18/09 al 02/11 hay 31 (sin festivos FR en medio).
    // El reparto de INF-01 se fuerza a mano (alwaysManualMediaSplit, ronda 10)
    // para no mezclar el bloqueo MEDIA_SPLIT_REQUIRED con el que se prueba aquí.
    const option = priceOption(
      {
        id: 'A',
        markets: ['FR'],
        lines: [
          {
            supportId: 'INF-01',
            mediaBudgetCents: 500_000,
            mediaMonths: 1,
            manualFeeCents: 200_000,
            manualFeeReason: 'Negociado con el cliente.',
          },
        ],
      },
      ctx,
    );
    expect(runPreSendChecks([withStart(option)], baseContext()).canSend).toBe(true);

    const apurado = runPreSendChecks([withStart(option, d('2026-10-09'))], baseContext());
    expect(apurado.canSend).toBe(false);
    expect(apurado.blockers.map((b) => b.code)).toContain('LEAD_TIME_INSUFFICIENT');
  });

  it('sin fecha de inicio concreta (solo duración) avisa en vez de bloquear (§5.3 bis)', () => {
    const option = priceOption(
      {
        id: 'A',
        markets: ['FR'],
        lines: [
          {
            supportId: 'INF-01',
            mediaBudgetCents: 500_000,
            mediaMonths: 1,
            manualFeeCents: 200_000,
            manualFeeReason: 'Negociado con el cliente.',
          },
        ],
      },
      ctx,
    );
    const informe = runPreSendChecks([withDurationOnly(option)], baseContext());

    expect(informe.canSend).toBe(true);
    expect(informe.blockers.map((b) => b.code)).not.toContain('LEAD_TIME_INSUFFICIENT');
    expect(informe.warnings.map((w) => w.code)).toContain('LEAD_TIME_NOT_VERIFIABLE');
  });

  it('el caso de Navidad: sin festivos pasa, con festivos bloquea', () => {
    // ON-01 exige 15 días laborables. Del 11/12/2026 al 01/01/2027 hay 15 sin
    // festivos, pero 13 con el calendario FR (25/12 y 01/01 caen en medio).
    const option = priceOption({ id: 'A', markets: ['FR'], lines: [{ supportId: 'ON-01' }] }, ctx);
    const sinFestivos = runPreSendChecks(
      [withStart(option, d('2027-01-01'))],
      baseContext({ today: d('2026-12-11'), holidays: [] }),
    );
    expect(sinFestivos.canSend).toBe(true);

    const conFestivos = runPreSendChecks(
      [withStart(option, d('2027-01-01'))],
      baseContext({ today: d('2026-12-11') }),
    );
    expect(conFestivos.canSend).toBe(false);
    expect(conFestivos.blockers.map((b) => b.code)).toContain('LEAD_TIME_INSUFFICIENT');
    expect(conFestivos.blockers[0]!.market).toBe('FR');
  });

  it('la antelación se evalúa por línea: un mercado puede bloquear y otro no', () => {
    // Mismo soporte en dos mercados de la misma opción; IT pierde un día
    // laborable más (Epifanía, 6 de enero) que FR en el mismo rango.
    const option = priceOption(
      { id: 'A', markets: ['FR', 'IT'], lines: [{ supportId: 'CRM-03' }] }, // 10 días
      ctx,
    );
    const informe = runPreSendChecks(
      [withStart(option, d('2027-01-08'))], // FR: 13 días disponibles, IT: 12
      baseContext({ today: d('2026-12-20') }),
    );
    // 10 días exigidos, ambos mercados sobran: no debería bloquear ninguno.
    expect(informe.blockers.filter((b) => b.code === 'LEAD_TIME_INSUFFICIENT')).toHaveLength(0);
  });

  it('bloquea una opción por debajo del suelo de margen', () => {
    const option = priceOption(
      { id: 'A', markets: ['FR'], lines: [{ supportId: 'ADS-03', mediaBudgetCents: 100_000, mediaMonths: 1 }] },
      ctx,
    );
    const informe = runPreSendChecks([withStart(option)], baseContext());

    expect(informe.blockers.map((b) => b.code)).toContain('MARGIN_BELOW_FLOOR');
  });

  it('no compensa una opción floja con otra buena', () => {
    const buena = priceOption({ id: 'A', markets: ['FR'], lines: [{ supportId: 'CON-01' }] }, ctx);
    const floja = priceOption(
      { id: 'B', markets: ['FR'], lines: [{ supportId: 'ADS-03', mediaBudgetCents: 100_000, mediaMonths: 1 }] },
      ctx,
    );

    const informe = runPreSendChecks([withStart(buena), withStart(floja)], baseContext());
    expect(informe.canSend).toBe(false);
    expect(informe.blockers.filter((b) => b.code === 'MARGIN_BELOW_FLOOR')).toHaveLength(1);
    expect(informe.blockers[0]!.optionId).toBe('B');
  });

  it('bloquea un soporte no vendible en ese mercado', () => {
    const option = priceOption({ id: 'A', markets: ['IT'], lines: [{ supportId: 'SOC-05' }] }, ctx);
    const informe = runPreSendChecks([withStart(option)], baseContext());
    expect(informe.blockers.map((b) => b.code)).toContain('SUPPORT_NOT_SELLABLE');
  });

  it('el brief vacío avisa pero no bloquea', () => {
    const option = priceOption({ id: 'A', markets: ['FR'], lines: [{ supportId: 'CON-01' }] }, ctx);
    const informe = runPreSendChecks([withStart(option)], baseContext({ brief: '   ' }));

    expect(informe.canSend).toBe(true);
    expect(informe.warnings.map((w) => w.code)).toContain('EMPTY_BRIEF');
  });

  it('bloquea una opción cuya fecha de fin es anterior a la de inicio (ronda 9)', () => {
    const option = priceOption({ id: 'A', markets: ['FR'], lines: [{ supportId: 'CON-01' }] }, ctx);
    const informe = runPreSendChecks(
      [withStart(option, d('2026-11-02'), d('2026-10-30'))],
      baseContext(),
    );

    expect(informe.canSend).toBe(false);
    expect(informe.blockers.map((b) => b.code)).toContain('CAMPAIGN_DATES_INVALID');
  });

  it('no bloquea cuando la fecha de fin es igual o posterior a la de inicio', () => {
    const mismoDia = priceOption({ id: 'A', markets: ['FR'], lines: [{ supportId: 'CON-01' }] }, ctx);
    const iguales = runPreSendChecks(
      [withStart(mismoDia, d('2026-11-02'), d('2026-11-02'))],
      baseContext(),
    );
    expect(iguales.blockers.map((b) => b.code)).not.toContain('CAMPAIGN_DATES_INVALID');

    const posterior = priceOption({ id: 'A', markets: ['FR'], lines: [{ supportId: 'CON-01' }] }, ctx);
    const bienOrdenadas = runPreSendChecks(
      [withStart(posterior, d('2026-11-02'), d('2026-11-09'))],
      baseContext(),
    );
    expect(bienOrdenadas.blockers.map((b) => b.code)).not.toContain('CAMPAIGN_DATES_INVALID');
  });

  it('no evalúa fechas inválidas en modo "solo duración", sin fecha de fin', () => {
    const option = priceOption({ id: 'A', markets: ['FR'], lines: [{ supportId: 'CON-01' }] }, ctx);
    const informe = runPreSendChecks([withDurationOnly(option)], baseContext());
    expect(informe.blockers.map((b) => b.code)).not.toContain('CAMPAIGN_DATES_INVALID');
  });

  it('bloquea una línea de media buy sin presupuesto de medios (ronda 9)', () => {
    const option = priceOption(
      { id: 'A', markets: ['FR'], lines: [{ supportId: 'ADS-01', mediaBudgetCents: 0, mediaMonths: 1 }] },
      ctx,
    );
    const informe = runPreSendChecks([withStart(option)], baseContext());

    expect(informe.canSend).toBe(false);
    expect(informe.blockers.map((b) => b.code)).toContain('MEDIA_BUDGET_MISSING');
    expect(informe.blockers.find((b) => b.code === 'MEDIA_BUDGET_MISSING')?.supportId).toBe('ADS-01');
  });

  it('no bloquea una línea de media buy con presupuesto de medios relleno', () => {
    const option = priceOption(
      { id: 'A', markets: ['FR'], lines: [{ supportId: 'ADS-01', mediaBudgetCents: 300_000, mediaMonths: 1 }] },
      ctx,
    );
    const informe = runPreSendChecks([withStart(option)], baseContext());
    expect(informe.blockers.map((b) => b.code)).not.toContain('MEDIA_BUDGET_MISSING');
  });

  it('no bloquea una línea normal (no media buy) por falta de presupuesto de medios', () => {
    const option = priceOption({ id: 'A', markets: ['FR'], lines: [{ supportId: 'CON-01' }] }, ctx);
    const informe = runPreSendChecks([withStart(option)], baseContext());
    expect(informe.blockers.map((b) => b.code)).not.toContain('MEDIA_BUDGET_MISSING');
  });

  it('avisa una sola vez por soporte de media buy sin presupuesto, aunque se venda en varios mercados', () => {
    const option = priceOption(
      { id: 'A', markets: ['FR', 'ES'], lines: [{ supportId: 'ADS-01', mediaBudgetCents: 0, mediaMonths: 1 }] },
      ctx,
    );
    const informe = runPreSendChecks([withStart(option)], baseContext());
    expect(informe.blockers.filter((b) => b.code === 'MEDIA_BUDGET_MISSING')).toHaveLength(1);
  });

  // ---------------------------------------------------------------------------
  // Ronda 10 (CLAUDE.md §4.4): el fee se resta del presupuesto de medios.
  // ---------------------------------------------------------------------------

  it('bloquea cuando el presupuesto del cliente no cubre el fee mínimo de gestión', () => {
    // 800 € de medios, mínimo mensual de ADS-01 es 1.200 €.
    const option = priceOption(
      { id: 'A', markets: ['FR'], lines: [{ supportId: 'ADS-01', mediaBudgetCents: 80_000, mediaMonths: 1 }] },
      ctx,
    );
    const informe = runPreSendChecks([withStart(option)], baseContext());

    expect(informe.canSend).toBe(false);
    expect(informe.blockers.map((b) => b.code)).toContain('MEDIA_FEE_EXCEEDS_BUDGET');
    expect(informe.blockers.find((b) => b.code === 'MEDIA_FEE_EXCEEDS_BUDGET')?.supportId).toBe('ADS-01');
  });

  it('no bloquea por presupuesto insuficiente cuando el fee sí cabe', () => {
    const option = priceOption(
      { id: 'A', markets: ['FR'], lines: [{ supportId: 'ADS-01', mediaBudgetCents: 300_000, mediaMonths: 1 }] },
      ctx,
    );
    const informe = runPreSendChecks([withStart(option)], baseContext());
    expect(informe.blockers.map((b) => b.code)).not.toContain('MEDIA_FEE_EXCEEDS_BUDGET');
  });

  it('forzar el reparto a mano resuelve el bloqueo de presupuesto insuficiente', () => {
    const option = priceOption(
      {
        id: 'A',
        markets: ['FR'],
        lines: [
          {
            supportId: 'ADS-01',
            mediaBudgetCents: 80_000,
            mediaMonths: 1,
            manualFeeCents: 50_000,
            manualFeeReason: 'Fee reducido, negociado con el cliente.',
          },
        ],
      },
      ctx,
    );
    const informe = runPreSendChecks([withStart(option)], baseContext());
    expect(informe.blockers.map((b) => b.code)).not.toContain('MEDIA_FEE_EXCEEDS_BUDGET');
  });

  it('INF-01 bloquea el envío mientras el reparto no se fuerce a mano', () => {
    const option = priceOption(
      { id: 'A', markets: ['FR'], lines: [{ supportId: 'INF-01', mediaBudgetCents: 500_000, mediaMonths: 1 }] },
      ctx,
    );
    const informe = runPreSendChecks([withStart(option)], baseContext());

    expect(informe.canSend).toBe(false);
    expect(informe.blockers.map((b) => b.code)).toContain('MEDIA_SPLIT_REQUIRED');
    expect(informe.blockers.find((b) => b.code === 'MEDIA_SPLIT_REQUIRED')?.supportId).toBe('INF-01');
  });

  it('INF-01 con el reparto forzado a mano ya no bloquea por MEDIA_SPLIT_REQUIRED', () => {
    const option = priceOption(
      {
        id: 'A',
        markets: ['FR'],
        lines: [
          {
            supportId: 'INF-01',
            mediaBudgetCents: 500_000,
            mediaMonths: 1,
            manualFeeCents: 200_000,
            manualFeeReason: 'Negociado con el influencer.',
          },
        ],
      },
      ctx,
    );
    const informe = runPreSendChecks([withStart(option)], baseContext());
    expect(informe.blockers.map((b) => b.code)).not.toContain('MEDIA_SPLIT_REQUIRED');
  });

  it('un soporte con reparto automático (ADS-*) nunca dispara MEDIA_SPLIT_REQUIRED', () => {
    const option = priceOption(
      { id: 'A', markets: ['FR'], lines: [{ supportId: 'ADS-01', mediaBudgetCents: 300_000, mediaMonths: 1 }] },
      ctx,
    );
    const informe = runPreSendChecks([withStart(option)], baseContext());
    expect(informe.blockers.map((b) => b.code)).not.toContain('MEDIA_SPLIT_REQUIRED');
  });
});

describe('DEFAULT_HOLIDAYS', () => {
  it('cubre los cinco mercados en 2026 y 2027', () => {
    const years = new Set(DEFAULT_HOLIDAYS.map((h) => h.date.slice(0, 4)));
    const markets = new Set(DEFAULT_HOLIDAYS.map((h) => h.market));
    expect([...years].sort()).toEqual(['2026', '2027']);
    expect([...markets].sort()).toEqual(['BE_FR', 'BE_NL', 'ES', 'FR', 'IT']);
  });

  it('BE-FR y BE-NL tienen exactamente las mismas fechas', () => {
    const dates = (m: PublicHoliday['market']) =>
      DEFAULT_HOLIDAYS.filter((h) => h.market === m).map((h) => h.date).sort();
    expect(dates('BE_FR')).toEqual(dates('BE_NL'));
  });

  it('no tiene fechas duplicadas dentro de un mismo mercado', () => {
    const seen = new Set<string>();
    for (const h of DEFAULT_HOLIDAYS) {
      const key = `${h.market}|${h.date}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });
});

describe('año fiscal', () => {
  it('empieza el 1 de mayo', () => {
    expect(fiscalPeriodOf(d('2026-05-01'))).toEqual({ year: 2026, quarter: 1 });
    expect(fiscalPeriodOf(d('2026-04-30'))).toEqual({ year: 2025, quarter: 4 });
  });

  it('reparte los quarters de mayo a abril', () => {
    expect(fiscalPeriodOf(d('2026-07-31')).quarter).toBe(1); // mayo-julio
    expect(fiscalPeriodOf(d('2026-08-01')).quarter).toBe(2); // agosto-octubre
    expect(fiscalPeriodOf(d('2026-10-31')).quarter).toBe(2);
    expect(fiscalPeriodOf(d('2026-11-01')).quarter).toBe(3); // noviembre-enero
    expect(fiscalPeriodOf(d('2027-01-31'))).toEqual({ year: 2026, quarter: 3 });
    expect(fiscalPeriodOf(d('2027-02-01'))).toEqual({ year: 2026, quarter: 4 }); // febrero-abril
  });

  it('etiqueta el periodo de forma legible', () => {
    expect(fiscalYearLabel(fiscalPeriodOf(d('2026-09-18')))).toBe('FY2026/27 Q2');
  });
});
