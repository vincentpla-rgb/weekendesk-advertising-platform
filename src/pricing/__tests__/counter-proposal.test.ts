import { describe, expect, it } from 'vitest';

import { DEFAULT_CATALOG } from '../catalog.js';
import { DEFAULT_PRICING_PARAMETERS } from '../parameters.js';
import { PricingError } from '../engine.js';
import { reviewCounterProposalLines, type CounterProposalLineInput } from '../counter-proposal.js';

const catalog = DEFAULT_CATALOG;
const parameters = DEFAULT_PRICING_PARAMETERS;

function line(overrides: Partial<CounterProposalLineInput> = {}): CounterProposalLineInput {
  return {
    supportId: 'ON-01',
    market: 'FR',
    deleted: false,
    clientPriceCents: 43000,
    clientQuantity: 1,
    isLeadMarket: true,
    ...overrides,
  };
}

describe('reviewCounterProposalLines', () => {
  it('calcula el margen contra el coste interno real, no un precio recalculado por el motor', () => {
    // ON-01: (2h negocio + 2h diseño) x 35 = 140 € de coste, mercado líder.
    const [reviewed] = reviewCounterProposalLines([line({ clientPriceCents: 43000 })], catalog, parameters);
    expect(reviewed!.margin).not.toBeNull();
    expect(reviewed!.margin!.costCents).toBe(14000);
    expect(reviewed!.margin!.marginCents).toBe(29000);
    expect(reviewed!.margin!.marginRate).toBeCloseTo(29000 / 43000, 6);
  });

  it('marca belowFloor cuando el precio tecleado por el cliente no cubre el suelo del 50%', () => {
    // Coste 14000, suelo = 14000 / 0.5 = 28000. El cliente bajó a 20000.
    const [reviewed] = reviewCounterProposalLines([line({ clientPriceCents: 20000 })], catalog, parameters);
    expect(reviewed!.margin!.floorCents).toBe(28000);
    expect(reviewed!.margin!.belowFloor).toBe(true);
  });

  it('no marca belowFloor cuando el precio tecleado cubre el suelo', () => {
    const [reviewed] = reviewCounterProposalLines([line({ clientPriceCents: 43000 })], catalog, parameters);
    expect(reviewed!.margin!.belowFloor).toBe(false);
  });

  it('el coste escala con la cantidad tecleada por el cliente (CLAUDE.md §4.1)', () => {
    const [reviewed] = reviewCounterProposalLines(
      [line({ clientQuantity: 3, clientPriceCents: 90000 })],
      catalog,
      parameters,
    );
    expect(reviewed!.margin!.costCents).toBe(42000);
  });

  it('sin mercado líder, el coste no cuenta las horas de diseño (CLAUDE.md §4.2)', () => {
    const [leader] = reviewCounterProposalLines([line({ isLeadMarket: true })], catalog, parameters);
    const [notLeader] = reviewCounterProposalLines([line({ isLeadMarket: false })], catalog, parameters);
    // ON-01: 2h negocio + 2h diseño (líder) vs. solo 2h negocio (no líder).
    expect(leader!.margin!.costCents).toBe(14000);
    expect(notLeader!.margin!.costCents).toBe(7000);
  });

  it('una línea eliminada por el cliente no lleva margen (no se compra)', () => {
    const [reviewed] = reviewCounterProposalLines([line({ deleted: true, clientPriceCents: 0, clientQuantity: 0 })], catalog, parameters);
    expect(reviewed!.margin).toBeNull();
    expect(reviewed!.deleted).toBe(true);
  });

  it('un soporte de media buy nunca lleva margen calculado — "sin margen aplicable" (confirmado por Vincent, ronda 16)', () => {
    const [ads] = reviewCounterProposalLines(
      [line({ supportId: 'ADS-01', clientPriceCents: 200000 })],
      catalog,
      parameters,
    );
    expect(ads!.margin).toBeNull();

    const [inf] = reviewCounterProposalLines(
      [line({ supportId: 'INF-01', clientPriceCents: 500000 })],
      catalog,
      parameters,
    );
    expect(inf!.margin).toBeNull();
  });

  it('lanza PricingError para un soporte desconocido', () => {
    expect(() => reviewCounterProposalLines([line({ supportId: 'NO-EXISTE' })], catalog, parameters)).toThrow(
      PricingError,
    );
  });

  it('preserva el orden y el resto de campos de entrada sin tocarlos', () => {
    const input = [
      line({ supportId: 'ON-01', market: 'FR' }),
      line({ supportId: 'CRM-01', market: 'FR', clientPriceCents: 97000, isLeadMarket: true }),
    ];
    const reviewed = reviewCounterProposalLines(input, catalog, parameters);
    expect(reviewed.map((r) => r.supportId)).toEqual(['ON-01', 'CRM-01']);
    expect(reviewed[1]!.clientPriceCents).toBe(97000);
  });
});
