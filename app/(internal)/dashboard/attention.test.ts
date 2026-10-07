import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { loadAttentionItems } from './attention.js';
import type { AttentionItem } from './DashboardClient.js';

/**
 * `loadAttentionItems` (CLAUDE.md §10.3, ronda 25): el bloque "Requieren tu
 * atención" nunca debe tumbar el panel. Cada una de las cuatro categorías se
 * aísla con su propio try/catch; si una falla, las otras tres siguen
 * contribuyendo y `failed` se pone a `true` — nunca se relanza el error.
 *
 * El cliente Supabase simulado aquí es "thenable" (implementa `.then`) para
 * imitar el comportamiento real de `@supabase/postgrest-js`: cada llamada a
 * `.from(tabla)` encadena `.select()/.eq()/.in()/.not()/.gte()/.lte()` y solo
 * se resuelve al awaitearse. Las respuestas se configuran por tabla, como
 * una cola consumida en el mismo orden en que `attention.ts` las consulta
 * (las cuatro categorías corren en secuencia, nunca en paralelo, así que el
 * orden de consumo es determinista).
 */

type FakeRow = { data: unknown; error: unknown } | { data: unknown; error: unknown; throwDirectly?: true };

function createFakeSupabase(responsesByTable: Record<string, FakeRow[]>) {
  const queues: Record<string, FakeRow[]> = {};
  for (const [table, rows] of Object.entries(responsesByTable)) {
    queues[table] = [...rows];
  }

  const from = vi.fn((table: string) => {
    const queue = queues[table];
    if (!queue || queue.length === 0) {
      throw new Error(`[test] sin respuesta configurada para la tabla "${table}"`);
    }
    const response = queue.shift()!;

    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      in: vi.fn(() => builder),
      not: vi.fn(() => builder),
      gte: vi.fn(() => builder),
      lte: vi.fn(() => builder),
      then: (resolve: (value: { data: unknown; error: unknown }) => unknown, reject?: (reason: unknown) => unknown) => {
        if ('throwDirectly' in response && response.throwDirectly) {
          return Promise.reject(response.error).catch(reject ?? (() => {}));
        }
        return Promise.resolve({ data: response.data, error: response.error }).then(resolve, reject);
      },
    };
    return builder;
  });

  return { from } as unknown as Parameters<typeof loadAttentionItems>[0];
}

const NOW = new Date('2026-10-07T12:00:00Z');

describe('loadAttentionItems', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('combina las cuatro categorías a partir de consultas planas, sin ningún join embebido', async () => {
    const supabase = createFakeSupabase({
      counter_proposals: [{ data: [{ proposal_id: 'p1', submitted_at: '2026-10-01T00:00:00Z' }], error: null }],
      overrides: [{ data: [{ proposal_id: 'p3', reason: 'Cliente estratégico', created_at: '2026-10-02T00:00:00Z' }], error: null }],
      proposals: [
        // 1. fetchProposalsByIds de la contrapropuesta pendiente
        { data: [{ id: 'p1', proposal_number: '2026-001', status: 'COUNTERED', account_id: 'a1' }], error: null },
        // 2. consulta principal de "caducan pronto"
        {
          data: [
            {
              id: 'p2',
              proposal_number: '2026-002',
              account_id: 'a2',
              expires_at: new Date(NOW.getTime() + 2 * 86_400_000).toISOString(),
            },
          ],
          error: null,
        },
        // 3. fetchProposalsByIds del margen forzado
        { data: [{ id: 'p3', proposal_number: '2026-003', status: 'ACCEPTED', account_id: 'a3' }], error: null },
        // 4. consulta principal de "borradores antiguos"
        {
          data: [
            {
              id: 'p4',
              proposal_number: '2026-004',
              account_id: 'a4',
              created_at: new Date(NOW.getTime() - 10 * 86_400_000).toISOString(),
            },
          ],
          error: null,
        },
      ],
      accounts: [
        { data: [{ id: 'a1', legal_name: 'Cuenta Uno' }], error: null },
        { data: [{ id: 'a2', legal_name: 'Cuenta Dos' }], error: null },
        { data: [{ id: 'a3', legal_name: 'Cuenta Tres' }], error: null },
        { data: [{ id: 'a4', legal_name: 'Cuenta Cuatro' }], error: null },
      ],
      proposal_options: [
        { data: [{ proposal_id: 'p2', billed_total_cents: 150_000 }], error: null },
        { data: [{ proposal_id: 'p4', billed_total_cents: 50_000 }], error: null },
      ],
    });

    const result = await loadAttentionItems(supabase, NOW);

    expect(result.failed).toBe(false);
    expect(consoleErrorSpy).not.toHaveBeenCalled();

    const byKind = new Map<string, AttentionItem>(result.items.map((i) => [i.kind, i]));
    expect(byKind.get('counterProposal')).toMatchObject({
      proposalId: 'p1',
      proposalNumber: '2026-001',
      accountLegalName: 'Cuenta Uno',
    });
    expect(byKind.get('expiringSoon')).toMatchObject({
      proposalId: 'p2',
      proposalNumber: '2026-002',
      accountLegalName: 'Cuenta Dos',
      days: 2,
      amountCents: 150_000,
    });
    expect(byKind.get('marginBelowFloor')).toMatchObject({
      proposalId: 'p3',
      proposalNumber: '2026-003',
      accountLegalName: 'Cuenta Tres',
      reason: 'Cliente estratégico',
    });
    expect(byKind.get('staleDraft')).toMatchObject({
      proposalId: 'p4',
      proposalNumber: '2026-004',
      accountLegalName: 'Cuenta Cuatro',
      days: 10,
      amountCents: 50_000,
    });
  });

  it('si una categoría falla, las otras tres siguen mostrándose y failed queda en true (nunca lanza)', async () => {
    const pgError = {
      message: 'permission denied for table overrides',
      code: '42501',
      details: 'detalle del motor',
      hint: 'revisa los grants',
    };

    const supabase = createFakeSupabase({
      counter_proposals: [{ data: [{ proposal_id: 'p1', submitted_at: '2026-10-01T00:00:00Z' }], error: null }],
      overrides: [{ data: null, error: pgError }],
      proposals: [
        { data: [{ id: 'p1', proposal_number: '2026-001', status: 'COUNTERED', account_id: 'a1' }], error: null },
        {
          data: [
            {
              id: 'p2',
              proposal_number: '2026-002',
              account_id: 'a2',
              expires_at: new Date(NOW.getTime() + 2 * 86_400_000).toISOString(),
            },
          ],
          error: null,
        },
        // la categoría de margen falla antes de llegar a su propia consulta de `proposals`,
        // así que solo hacen falta las entradas de contrapropuesta/caducidad/borrador aquí.
        {
          data: [
            {
              id: 'p4',
              proposal_number: '2026-004',
              account_id: 'a4',
              created_at: new Date(NOW.getTime() - 10 * 86_400_000).toISOString(),
            },
          ],
          error: null,
        },
      ],
      accounts: [
        { data: [{ id: 'a1', legal_name: 'Cuenta Uno' }], error: null },
        { data: [{ id: 'a2', legal_name: 'Cuenta Dos' }], error: null },
        { data: [{ id: 'a4', legal_name: 'Cuenta Cuatro' }], error: null },
      ],
      proposal_options: [
        { data: [{ proposal_id: 'p2', billed_total_cents: 150_000 }], error: null },
        { data: [{ proposal_id: 'p4', billed_total_cents: 50_000 }], error: null },
      ],
    });

    const result = await loadAttentionItems(supabase, NOW);

    expect(result.failed).toBe(true);
    const kinds = result.items.map((i) => i.kind);
    expect(kinds).toEqual(['counterProposal', 'expiringSoon', 'staleDraft']);
    expect(kinds).not.toContain('marginBelowFloor');

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    const [logMessage, logPayload] = consoleErrorSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(logMessage).toContain('marginBelowFloor');
    expect(logPayload).toMatchObject({
      message: 'permission denied for table overrides',
      code: '42501',
      details: 'detalle del motor',
      hint: 'revisa los grants',
    });
  });

  it('un rechazo (excepción de red, no un {data,error}) también se absorbe y se registra', async () => {
    const supabase = createFakeSupabase({
      counter_proposals: [{ data: null, error: new Error('fetch failed'), throwDirectly: true }],
      overrides: [{ data: [], error: null }],
      proposals: [
        {
          data: [
            {
              id: 'p2',
              proposal_number: '2026-002',
              account_id: 'a2',
              expires_at: new Date(NOW.getTime() + 2 * 86_400_000).toISOString(),
            },
          ],
          error: null,
        },
        { data: [], error: null },
      ],
      accounts: [{ data: [{ id: 'a2', legal_name: 'Cuenta Dos' }], error: null }],
      proposal_options: [{ data: [{ proposal_id: 'p2', billed_total_cents: 150_000 }], error: null }],
    });

    const result = await loadAttentionItems(supabase, NOW);

    expect(result.failed).toBe(true);
    expect(result.items.map((i) => i.kind)).toEqual(['expiringSoon']);
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    const [logMessage, logPayload] = consoleErrorSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(logMessage).toContain('counterProposal');
    expect(logPayload).toMatchObject({ message: 'fetch failed', code: null, details: null, hint: null });
  });

  it('el margen forzado se dedupe por presupuesto (se queda con el más reciente) y excluye rechazados/caducados', async () => {
    const supabase = createFakeSupabase({
      counter_proposals: [{ data: [], error: null }],
      overrides: [
        {
          data: [
            { proposal_id: 'p1', reason: 'motivo viejo', created_at: '2026-10-01T00:00:00Z' },
            { proposal_id: 'p1', reason: 'motivo nuevo', created_at: '2026-10-05T00:00:00Z' },
            { proposal_id: 'p2', reason: 'motivo de un rechazado', created_at: '2026-10-03T00:00:00Z' },
          ],
          error: null,
        },
      ],
      proposals: [
        { data: [], error: null },
        {
          data: [
            { id: 'p1', proposal_number: '2026-010', status: 'ACCEPTED', account_id: 'a1' },
            { id: 'p2', proposal_number: '2026-011', status: 'REJECTED', account_id: 'a2' },
          ],
          error: null,
        },
        { data: [], error: null },
      ],
      accounts: [
        { data: [{ id: 'a1', legal_name: 'Cuenta Uno' }, { id: 'a2', legal_name: 'Cuenta Dos' }], error: null },
      ],
    });

    const result = await loadAttentionItems(supabase, NOW);

    expect(result.failed).toBe(false);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      kind: 'marginBelowFloor',
      proposalId: 'p1',
      reason: 'motivo nuevo',
      accountLegalName: 'Cuenta Uno',
    });
  });

  it('sin ninguna fila en las cuatro categorías, devuelve una lista vacía sin fallar', async () => {
    const supabase = createFakeSupabase({
      counter_proposals: [{ data: [], error: null }],
      overrides: [{ data: [], error: null }],
      proposals: [{ data: [], error: null }, { data: [], error: null }],
    });

    const result = await loadAttentionItems(supabase, NOW);

    expect(result).toEqual({ items: [], failed: false });
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });
});
