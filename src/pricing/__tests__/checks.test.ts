import { describe, expect, it } from 'vitest';

import { DEFAULT_CATALOG } from '../catalog.js';
import { DEFAULT_PRICING_PARAMETERS } from '../parameters.js';
import { priceOption, type PricingContext } from '../engine.js';
import { availabilityKey, businessDaysBetween, runPreSendChecks, type PreSendContext } from '../checks.js';
import { fiscalPeriodOf, fiscalYearLabel } from '../fiscal.js';

const ctx: PricingContext = { parameters: DEFAULT_PRICING_PARAMETERS, catalog: DEFAULT_CATALOG };
const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

function baseContext(overrides: Partial<PreSendContext> = {}): PreSendContext {
  return {
    today: d('2026-09-18'),
    campaignStart: d('2026-11-02'),
    brief: 'Campaña de otoño para la Costa Brava.',
    confirmedAvailability: new Set<string>(),
    parameters: DEFAULT_PRICING_PARAMETERS,
    ...overrides,
  };
}

describe('businessDaysBetween', () => {
  it('cuenta solo de lunes a viernes', () => {
    // viernes 18/09/2026 → viernes 09/10/2026
    expect(businessDaysBetween(d('2026-09-18'), d('2026-10-09'))).toBe(15);
    expect(businessDaysBetween(d('2026-09-18'), d('2026-10-12'))).toBe(16);
    expect(businessDaysBetween(d('2026-09-18'), d('2026-09-30'))).toBe(8);
  });

  it('un fin de semana no aporta nada', () => {
    // viernes → domingo
    expect(businessDaysBetween(d('2026-09-18'), d('2026-09-20'))).toBe(0);
  });

  it('devuelve cero si la fecha de destino no es posterior', () => {
    expect(businessDaysBetween(d('2026-09-18'), d('2026-09-18'))).toBe(0);
    expect(businessDaysBetween(d('2026-09-18'), d('2026-09-01'))).toBe(0);
  });
});

describe('controles previos al envío', () => {
  it('bloquea si falta el check de disponibilidad de un soporte que lo exige', () => {
    const option = priceOption({ id: 'A', lines: [{ supportId: 'ON-01', market: 'FR' }] }, ctx);
    const informe = runPreSendChecks([option], baseContext());

    expect(informe.canSend).toBe(false);
    expect(informe.blockers.map((b) => b.code)).toContain('AVAILABILITY_NOT_CONFIRMED');
  });

  it('deja pasar cuando la disponibilidad está confirmada', () => {
    const option = priceOption({ id: 'A', lines: [{ supportId: 'ON-01', market: 'FR' }] }, ctx);
    const informe = runPreSendChecks([option], baseContext({
      confirmedAvailability: new Set([availabilityKey('ON-01', 'FR')]),
    }));

    expect(informe.canSend).toBe(true);
    expect(informe.blockers).toHaveLength(0);
  });

  it('no exige check de disponibilidad a los soportes que no lo requieren', () => {
    const option = priceOption({ id: 'A', lines: [{ supportId: 'CON-01', market: 'FR' }] }, ctx);
    expect(runPreSendChecks([option], baseContext()).canSend).toBe(true);
  });

  it('bloquea por antelación insuficiente frente al soporte más lento', () => {
    // INF-01 exige 30 días laborables; del 18/09 al 02/11 hay 31.
    const option = priceOption(
      { id: 'A', lines: [{ supportId: 'INF-01', market: 'FR', mediaBudgetCents: 500_000, mediaMonths: 1 }] },
      ctx,
    );
    expect(runPreSendChecks([option], baseContext()).canSend).toBe(true);

    const apurado = runPreSendChecks([option], baseContext({ campaignStart: d('2026-10-09') }));
    expect(apurado.canSend).toBe(false);
    expect(apurado.blockers.map((b) => b.code)).toContain('LEAD_TIME_INSUFFICIENT');
  });

  it('bloquea una opción por debajo del suelo de margen', () => {
    const option = priceOption(
      { id: 'A', lines: [{ supportId: 'ADS-03', market: 'FR', mediaBudgetCents: 100_000, mediaMonths: 1 }] },
      ctx,
    );
    const informe = runPreSendChecks([option], baseContext());

    expect(informe.blockers.map((b) => b.code)).toContain('MARGIN_BELOW_FLOOR');
  });

  it('no compensa una opción floja con otra buena', () => {
    const buena = priceOption({ id: 'A', lines: [{ supportId: 'CON-01', market: 'FR' }] }, ctx);
    const floja = priceOption(
      { id: 'B', lines: [{ supportId: 'ADS-03', market: 'FR', mediaBudgetCents: 100_000, mediaMonths: 1 }] },
      ctx,
    );

    const informe = runPreSendChecks([buena, floja], baseContext());
    expect(informe.canSend).toBe(false);
    expect(informe.blockers.filter((b) => b.code === 'MARGIN_BELOW_FLOOR')).toHaveLength(1);
    expect(informe.blockers[0]!.optionId).toBe('B');
  });

  it('bloquea un soporte no vendible en ese mercado', () => {
    const option = priceOption({ id: 'A', lines: [{ supportId: 'SOC-05', market: 'IT' }] }, ctx);
    const informe = runPreSendChecks([option], baseContext());
    expect(informe.blockers.map((b) => b.code)).toContain('SUPPORT_NOT_SELLABLE');
  });

  it('el brief vacío avisa pero no bloquea', () => {
    const option = priceOption({ id: 'A', lines: [{ supportId: 'CON-01', market: 'FR' }] }, ctx);
    const informe = runPreSendChecks([option], baseContext({ brief: '   ' }));

    expect(informe.canSend).toBe(true);
    expect(informe.warnings.map((w) => w.code)).toContain('EMPTY_BRIEF');
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
