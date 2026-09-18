import { describe, expect, it } from 'vitest';

import { ReachError, aggregateReach, cpmCents, publishableReach, type ReachMeasurement } from '../reach.js';

const medido: ReachMeasurement = {
  supportId: 'ON-01',
  market: 'BE_FR',
  value: 15_841,
  metric: 'PAGE_VIEWS',
  periodUnit: 'WEEK',
  source: 'Marketing Weekendesk',
  measuredAt: '2026-09-01',
};

describe('publishableReach', () => {
  it('deja pasar un dato con valor, métrica, fuente y fecha', () => {
    expect(publishableReach(medido)).toBe(medido);
  });

  it('descarta el dato sin valor: sin dato la fila no aparece', () => {
    expect(publishableReach({ ...medido, value: null })).toBeNull();
  });

  it('descarta el dato sin fuente, aunque tenga valor', () => {
    expect(publishableReach({ ...medido, source: null })).toBeNull();
    expect(publishableReach({ ...medido, source: '   ' })).toBeNull();
  });

  it('descarta el dato sin fecha de medición', () => {
    expect(publishableReach({ ...medido, measuredAt: null })).toBeNull();
  });

  it('descarta el dato sin métrica: un número suelto no es audiencia', () => {
    expect(publishableReach({ ...medido, metric: null })).toBeNull();
  });
});

describe('aggregateReach', () => {
  it('suma datos de la misma métrica', () => {
    const total = aggregateReach([
      medido,
      { ...medido, supportId: 'ON-02', value: 36_200 },
    ]);
    expect(total).toEqual({
      metric: 'PAGE_VIEWS',
      value: 52_041,
      linesWithData: 2,
      linesTotal: 2,
      complete: true,
    });
  });

  it('no inventa ceros: sin ningún dato medido devuelve null', () => {
    expect(aggregateReach([{ ...medido, value: null }])).toBeNull();
    expect(aggregateReach([])).toBeNull();
  });

  it('marca el total como incompleto cuando falta alguna línea', () => {
    const total = aggregateReach([medido, { ...medido, supportId: 'ON-03', value: null }]);
    expect(total?.value).toBe(15_841);
    expect(total?.complete).toBe(false);
    expect(total?.linesWithData).toBe(1);
    expect(total?.linesTotal).toBe(2);
  });

  it('se niega a sumar métricas distintas', () => {
    expect(() =>
      aggregateReach([medido, { ...medido, supportId: 'ON-02', metric: 'SESSIONS' }]),
    ).toThrow(ReachError);
  });
});

describe('cpmCents', () => {
  it('calcula el CPM cuando hay audiencia medida', () => {
    const total = aggregateReach([{ ...medido, value: 10_000 }])!;
    // 430 € / 10.000 × 1.000 = 43 €
    expect(cpmCents(43_000, total)).toBe(4300);
  });

  it('sin audiencia no hay CPM', () => {
    expect(cpmCents(43_000, null)).toBeNull();
    expect(cpmCents(43_000, aggregateReach([{ ...medido, value: 0 }]))).toBeNull();
  });
});
