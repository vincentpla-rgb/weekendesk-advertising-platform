import { describe, expect, it } from 'vitest';

import {
  EMPTY_DASHBOARD_FILTERS,
  filterDashboardProposals,
  isExpiringSoon,
  type DashboardProposalInput,
} from '../dashboard.js';

function proposal(overrides: Partial<DashboardProposalInput> = {}): DashboardProposalInput {
  return {
    id: 'p1',
    proposalNumber: '2026-001',
    status: 'SENT',
    ownerId: 'owner-1',
    accountId: 'account-1',
    accountLegalName: 'Office de tourisme de Amiens',
    createdAt: '2027-01-10T00:00:00Z',
    expiresAt: null,
    options: [{ billedTotalCents: 500000, markets: ['FR'], supportIds: ['ON-01'] }],
    hasPendingCounterProposal: false,
    ...overrides,
  };
}

describe('filterDashboardProposals', () => {
  it('sin filtros, devuelve todo', () => {
    const list = [proposal(), proposal({ id: 'p2' })];
    expect(filterDashboardProposals(list, EMPTY_DASHBOARD_FILTERS)).toHaveLength(2);
  });

  it('filtra por mercado: al menos una opción debe incluirlo', () => {
    const list = [
      proposal({ id: 'fr', options: [{ billedTotalCents: 100, markets: ['FR'], supportIds: [] }] }),
      proposal({ id: 'es', options: [{ billedTotalCents: 100, markets: ['ES'], supportIds: [] }] }),
      proposal({
        id: 'multi',
        options: [
          { billedTotalCents: 100, markets: ['FR'], supportIds: [] },
          { billedTotalCents: 100, markets: ['NL'], supportIds: [] },
        ],
      }),
    ];
    const result = filterDashboardProposals(list, { ...EMPTY_DASHBOARD_FILTERS, market: 'NL' });
    expect(result.map((p) => p.id)).toEqual(['multi']);
  });

  it('filtra por AM (owner)', () => {
    const list = [proposal({ id: 'a', ownerId: 'vincent' }), proposal({ id: 'b', ownerId: 'remi' })];
    const result = filterDashboardProposals(list, { ...EMPTY_DASHBOARD_FILTERS, ownerId: 'remi' });
    expect(result.map((p) => p.id)).toEqual(['b']);
  });

  it('filtra por estado', () => {
    const list = [proposal({ id: 'sent', status: 'SENT' }), proposal({ id: 'acc', status: 'ACCEPTED' })];
    const result = filterDashboardProposals(list, { ...EMPTY_DASHBOARD_FILTERS, status: 'ACCEPTED' });
    expect(result.map((p) => p.id)).toEqual(['acc']);
  });

  it('busca por cuenta, sin distinguir mayúsculas ni acentos exactos', () => {
    const list = [proposal({ id: 'a', accountLegalName: 'Office de tourisme de Amiens' }), proposal({ id: 'b', accountLegalName: 'Comité Régional' })];
    const result = filterDashboardProposals(list, { ...EMPTY_DASHBOARD_FILTERS, searchQuery: 'amiens' });
    expect(result.map((p) => p.id)).toEqual(['a']);
  });

  it('busca por número de presupuesto, subcadena sin distinguir mayúsculas (ronda 20)', () => {
    const list = [
      proposal({ id: 'a', proposalNumber: '2026-014' }),
      proposal({ id: 'b', proposalNumber: '2026-099' }),
    ];
    const result = filterDashboardProposals(list, { ...EMPTY_DASHBOARD_FILTERS, searchQuery: '2026-01' });
    expect(result.map((p) => p.id)).toEqual(['a']);
  });

  it('búsqueda por número de presupuesto no revienta si el presupuesto no tiene número todavía', () => {
    const list = [proposal({ id: 'sin-numero', proposalNumber: null })];
    const result = filterDashboardProposals(list, { ...EMPTY_DASHBOARD_FILTERS, searchQuery: '2026' });
    expect(result).toHaveLength(0);
  });

  it('búsqueda única (ronda 24): coincide por número O por cuenta, no hace falta que coincidan ambos', () => {
    const list = [
      proposal({ id: 'by-number', proposalNumber: '2026-014', accountLegalName: 'Comité Régional' }),
      proposal({ id: 'by-account', proposalNumber: '2026-099', accountLegalName: 'Office de tourisme de Amiens' }),
      proposal({ id: 'neither', proposalNumber: '2026-050', accountLegalName: 'Visit Flanders' }),
    ];
    const byNumber = filterDashboardProposals(list, { ...EMPTY_DASHBOARD_FILTERS, searchQuery: '2026-014' });
    expect(byNumber.map((p) => p.id)).toEqual(['by-number']);
    const byAccount = filterDashboardProposals(list, { ...EMPTY_DASHBOARD_FILTERS, searchQuery: 'amiens' });
    expect(byAccount.map((p) => p.id)).toEqual(['by-account']);
  });

  it('filtra por soporte, en cualquier opción', () => {
    const list = [
      proposal({ id: 'a', options: [{ billedTotalCents: 100, markets: ['FR'], supportIds: ['ON-01'] }] }),
      proposal({ id: 'b', options: [{ billedTotalCents: 100, markets: ['FR'], supportIds: ['CRM-01'] }] }),
    ];
    const result = filterDashboardProposals(list, { ...EMPTY_DASHBOARD_FILTERS, supportId: 'CRM-01' });
    expect(result.map((p) => p.id)).toEqual(['b']);
  });

  it('rango de importe: usa el mayor billed_total_cents entre las opciones del presupuesto', () => {
    const list = [
      proposal({
        id: 'small',
        options: [{ billedTotalCents: 100000, markets: ['FR'], supportIds: [] }],
      }),
      proposal({
        id: 'big',
        options: [
          { billedTotalCents: 200000, markets: ['FR'], supportIds: [] },
          { billedTotalCents: 900000, markets: ['FR'], supportIds: [] },
        ],
      }),
    ];
    const result = filterDashboardProposals(list, {
      ...EMPTY_DASHBOARD_FILTERS,
      amountMinCents: 500000,
      amountMaxCents: null,
    });
    expect(result.map((p) => p.id)).toEqual(['big']);
  });

  it('rango de importe excluye un presupuesto sin ninguna opción calculada (billed_total_cents null)', () => {
    const list = [proposal({ id: 'uncalculated', options: [{ billedTotalCents: null, markets: ['FR'], supportIds: [] }] })];
    const result = filterDashboardProposals(list, { ...EMPTY_DASHBOARD_FILTERS, amountMinCents: 0, amountMaxCents: null });
    expect(result).toHaveLength(0);
  });

  it('toggle contrapropuesta pendiente', () => {
    const list = [proposal({ id: 'a', hasPendingCounterProposal: true }), proposal({ id: 'b', hasPendingCounterProposal: false })];
    const result = filterDashboardProposals(list, { ...EMPTY_DASHBOARD_FILTERS, onlyPendingCounterProposal: true });
    expect(result.map((p) => p.id)).toEqual(['a']);
  });

  it('toggle vence pronto, usando isExpiringSoon', () => {
    const now = new Date('2027-01-01T00:00:00Z');
    const list = [
      proposal({ id: 'soon', status: 'SENT', expiresAt: '2027-01-03T00:00:00Z' }),
      proposal({ id: 'far', status: 'SENT', expiresAt: '2027-02-01T00:00:00Z' }),
      proposal({ id: 'draft-with-close-expiry', status: 'DRAFT', expiresAt: '2027-01-02T00:00:00Z' }),
    ];
    const result = filterDashboardProposals(list, { ...EMPTY_DASHBOARD_FILTERS, onlyExpiringSoon: true }, now);
    expect(result.map((p) => p.id)).toEqual(['soon']);
  });

  it('combina varios filtros a la vez (AND)', () => {
    const list = [
      proposal({ id: 'match', ownerId: 'remi', status: 'SENT' }),
      proposal({ id: 'wrong-status', ownerId: 'remi', status: 'ACCEPTED' }),
      proposal({ id: 'wrong-owner', ownerId: 'vincent', status: 'SENT' }),
    ];
    const result = filterDashboardProposals(list, { ...EMPTY_DASHBOARD_FILTERS, ownerId: 'remi', status: 'SENT' });
    expect(result.map((p) => p.id)).toEqual(['match']);
  });
});

describe('isExpiringSoon', () => {
  const now = new Date('2027-01-01T00:00:00Z');

  it('true para SENT que caduca dentro de 4 días', () => {
    expect(isExpiringSoon(proposal({ status: 'SENT', expiresAt: '2027-01-05T00:00:00Z' }), now)).toBe(true);
  });

  it('true para VIEWED igual que SENT', () => {
    expect(isExpiringSoon(proposal({ status: 'VIEWED', expiresAt: '2027-01-04T00:00:00Z' }), now)).toBe(true);
  });

  it('false si faltan más de 4 días', () => {
    expect(isExpiringSoon(proposal({ status: 'SENT', expiresAt: '2027-01-06T00:00:01Z' }), now)).toBe(false);
  });

  it('false si ya caducó', () => {
    expect(isExpiringSoon(proposal({ status: 'SENT', expiresAt: '2026-12-31T00:00:00Z' }), now)).toBe(false);
  });

  it('false para cualquier estado que no sea SENT/VIEWED, aunque expires_at esté cerca', () => {
    expect(isExpiringSoon(proposal({ status: 'ACCEPTED', expiresAt: '2027-01-02T00:00:00Z' }), now)).toBe(false);
    expect(isExpiringSoon(proposal({ status: 'DRAFT', expiresAt: '2027-01-02T00:00:00Z' }), now)).toBe(false);
  });

  it('false sin expires_at', () => {
    expect(isExpiringSoon(proposal({ status: 'SENT', expiresAt: null }), now)).toBe(false);
  });
});
