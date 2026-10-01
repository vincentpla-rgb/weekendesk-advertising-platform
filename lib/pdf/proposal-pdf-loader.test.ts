import { describe, expect, it, vi } from 'vitest';

import { loadProposalPdfData } from './proposal-pdf-loader.js';

/**
 * Carga compartida de datos del PDF (CLAUDE.md §1/§9) — un cliente de
 * Supabase simulado por tabla, igual de fiel al `select` real que el resto
 * de tests de rutas de este proyecto (sin montar Postgres aquí; eso ya lo
 * cubren los scripts/verify-*.sh contra las funciones SQL que sí tocan
 * estas mismas tablas).
 */

interface FakeProposalRow {
  id: string;
  proposal_number: string | null;
  status: string;
  language: string;
  brief: string | null;
  sent_at: string | null;
  accounts: { legal_name: string } | null;
  contacts: { full_name: string } | null;
  profiles: { full_name: string } | null;
  proposal_options: ReadonlyArray<{
    id: string;
    code: string;
    name: string;
    pitch: string | null;
    markets: readonly string[];
    campaign_start: string | null;
    campaign_end: string | null;
    campaign_duration_count: number | null;
    campaign_duration_unit: string | null;
    billed_total_cents: number | null;
    cost_cents: number | null;
    margin_cents: number | null;
    margin_rate: number | null;
    sort_order: number;
    proposal_option_lines: ReadonlyArray<{
      support_id: string;
      market: string;
      quantity: number;
      billed_total_cents: number | null;
      sort_order: number;
    }>;
  }>;
}

function makeSupabase(opts: {
  proposal: FakeProposalRow | null;
  supports?: ReadonlyArray<{ id: string; name: string }>;
  reach?: ReadonlyArray<{
    support_id: string;
    market: string;
    value: number | null;
    metric: string | null;
    period_unit: string | null;
    source: string | null;
    measured_at: string | null;
  }>;
  acceptance?: {
    option_id: string;
    legal_name: string;
    billing_address: string;
    vat_number: string | null;
    purchase_order_reference: string | null;
    vat_regime_applied: string;
    accepted_at: string;
  } | null;
}) {
  const from = vi.fn((table: string) => {
    if (table === 'proposals') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: opts.proposal, error: null }),
          }),
        }),
      };
    }
    if (table === 'supports') {
      return { select: async () => ({ data: opts.supports ?? [], error: null }) };
    }
    if (table === 'reach_measurements') {
      return {
        select: () => ({
          not: async () => ({ data: opts.reach ?? [], error: null }),
        }),
      };
    }
    if (table === 'acceptances') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: opts.acceptance ?? null, error: null }),
          }),
        }),
      };
    }
    throw new Error(`tabla no simulada en este test: ${table}`);
  });
  return { from } as unknown as Parameters<typeof loadProposalPdfData>[0];
}

const BASE_OPTION = {
  id: 'opt-1',
  code: 'A',
  name: 'Pack Premium',
  pitch: null,
  markets: ['FR'],
  campaign_start: '2026-12-01',
  campaign_end: '2026-12-28',
  campaign_duration_count: null,
  campaign_duration_unit: null,
  billed_total_cents: 172_000,
  cost_cents: 70_000,
  margin_cents: 102_000,
  margin_rate: 0.593,
  sort_order: 0,
  proposal_option_lines: [
    { support_id: 'ON-01', market: 'FR', quantity: 4, billed_total_cents: 172_000, sort_order: 0 },
  ],
};

describe('loadProposalPdfData', () => {
  it('devuelve null si el presupuesto no existe', async () => {
    const supabase = makeSupabase({ proposal: null });
    const result = await loadProposalPdfData(supabase, 'does-not-exist');
    expect(result).toBeNull();
  });

  it('arma la forma completa con nombre de soporte, reach solo donde hay dato medido, y sin aceptación', async () => {
    const supabase = makeSupabase({
      proposal: {
        id: 'p1',
        proposal_number: '2026-014',
        status: 'SENT',
        language: 'ES',
        brief: 'Brief de prueba',
        sent_at: '2026-10-01T00:00:00.000Z',
        accounts: { legal_name: 'Destination Exemple' },
        contacts: { full_name: 'Camille Dupont' },
        profiles: { full_name: 'Rémi Challal' },
        proposal_options: [BASE_OPTION],
      },
      supports: [{ id: 'ON-01', name: 'Marketing Block' }],
      reach: [
        {
          support_id: 'ON-01',
          market: 'FR',
          value: 15_841,
          metric: 'PAGE_VIEWS',
          period_unit: 'WEEK',
          source: 'GA4',
          measured_at: '2026-09-01',
        },
        // Sin fuente → se descarta, CLAUDE.md §3 ("nunca se inventa, nunca aparece sin fuente").
        {
          support_id: 'ON-01',
          market: 'ES',
          value: 999,
          metric: 'PAGE_VIEWS',
          period_unit: 'WEEK',
          source: null,
          measured_at: null,
        },
      ],
      acceptance: null,
    });

    const result = await loadProposalPdfData(supabase, 'p1');

    expect(result).not.toBeNull();
    expect(result!.proposalNumber).toBe('2026-014');
    expect(result!.advertiserLegalName).toBe('Destination Exemple');
    expect(result!.options).toHaveLength(1);
    expect(result!.options[0]!.lines[0]!.supportName).toBe('Marketing Block');
    expect(result!.options[0]!.lines[0]!.reach).toEqual({
      value: 15_841,
      metric: 'PAGE_VIEWS',
      periodUnit: 'WEEK',
      source: 'GA4',
      measuredAt: '2026-09-01',
    });
    expect(result!.acceptance).toBeNull();
  });

  it('con una fila de acceptances, la resuelve al código de la opción aceptada', async () => {
    const supabase = makeSupabase({
      proposal: {
        id: 'p1',
        proposal_number: '2026-014',
        status: 'ACCEPTED',
        language: 'ES',
        brief: null,
        sent_at: '2026-10-01T00:00:00.000Z',
        accounts: { legal_name: 'Destination Exemple' },
        contacts: { full_name: 'Camille Dupont' },
        profiles: { full_name: 'Rémi Challal' },
        proposal_options: [BASE_OPTION],
      },
      supports: [{ id: 'ON-01', name: 'Marketing Block' }],
      reach: [],
      acceptance: {
        option_id: 'opt-1',
        legal_name: 'Destination Exemple SAS',
        billing_address: '1 rue Exemple',
        vat_number: null,
        purchase_order_reference: 'REF-1',
        vat_regime_applied: 'FR_VAT_20',
        accepted_at: '2026-10-05T00:00:00.000Z',
      },
    });

    const result = await loadProposalPdfData(supabase, 'p1');

    expect(result!.acceptance).toEqual({
      optionCode: 'A',
      legalName: 'Destination Exemple SAS',
      billingAddress: '1 rue Exemple',
      vatNumber: null,
      purchaseOrderReference: 'REF-1',
      vatRegime: 'FR_VAT_20',
      acceptedAt: '2026-10-05T00:00:00.000Z',
    });
  });

  it('sin número de presupuesto todavía (improbable, pero no inventa uno): cae al id', async () => {
    const supabase = makeSupabase({
      proposal: {
        id: 'p1',
        proposal_number: null,
        status: 'DRAFT',
        language: 'ES',
        brief: null,
        sent_at: null,
        accounts: { legal_name: 'Destination Exemple' },
        contacts: null,
        profiles: null,
        proposal_options: [],
      },
    });

    const result = await loadProposalPdfData(supabase, 'p1');
    expect(result!.proposalNumber).toBe('p1');
    expect(result!.contactFullName).toBeNull();
    expect(result!.options).toEqual([]);
  });
});
