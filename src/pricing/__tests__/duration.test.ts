import { describe, expect, it } from 'vitest';

import { computeDurationUnits, suggestedQuantity } from '../duration.js';

describe('computeDurationUnits', () => {
  it('1 al 28 de octubre son 4 semanas exactas', () => {
    const d = computeDurationUnits(new Date('2026-10-01T00:00:00Z'), new Date('2026-10-28T00:00:00Z'));
    expect(d.days).toBe(28);
    expect(d.weeks).toBe(4);
  });

  it('un único día cuenta como 1 día y 1 semana empezada', () => {
    const d = computeDurationUnits(new Date('2026-10-01T00:00:00Z'), new Date('2026-10-01T00:00:00Z'));
    expect(d.days).toBe(1);
    expect(d.weeks).toBe(1);
    expect(d.months).toBe(1);
  });

  it('redondea semanas y meses empezados hacia arriba', () => {
    // 15 días: 3 semanas completas + 1 día suelto.
    const d = computeDurationUnits(new Date('2026-10-01T00:00:00Z'), new Date('2026-10-15T00:00:00Z'));
    expect(d.days).toBe(15);
    expect(d.weeks).toBe(3);
  });

  it('rechaza un fin anterior al inicio', () => {
    expect(() =>
      computeDurationUnits(new Date('2026-10-28T00:00:00Z'), new Date('2026-10-01T00:00:00Z')),
    ).toThrow(RangeError);
  });

  it('ignora la hora del día: solo cuenta el día UTC', () => {
    const d = computeDurationUnits(
      new Date('2026-10-01T23:59:00Z'),
      new Date('2026-10-28T00:01:00Z'),
    );
    expect(d.days).toBe(28);
  });
});

describe('suggestedQuantity', () => {
  it('es exactamente la conversión que alimenta la cantidad: WEEK usa semanas, MONTH usa meses', () => {
    const d = computeDurationUnits(new Date('2026-10-01T00:00:00Z'), new Date('2026-10-28T00:00:00Z'));
    expect(suggestedQuantity(d, 'WEEK')).toBe(d.weeks);
    expect(suggestedQuantity(d, 'MONTH')).toBe(d.months);
  });
});
