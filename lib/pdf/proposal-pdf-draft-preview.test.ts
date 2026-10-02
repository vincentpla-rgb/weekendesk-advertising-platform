import { describe, expect, it, vi } from 'vitest';

import { buildDraftProposalPdfData, DRAFT_PDF_PREVIEW_PROPOSAL_NUMBER } from './proposal-pdf-draft-preview.js';

/**
 * Vista previa del PDF de un presupuesto sin guardar (CLAUDE.md §10.3, ronda
 * 22) — mismo patrón de Supabase simulado que `proposal-pdf-loader.test.ts`,
 * solo que aquí no hay ningún `proposals`/`proposal_options` que consultar:
 * únicamente `reach_measurements`, igual que el PDF real.
 */
function makeSupabase(opts: {
  reach?: ReadonlyArray<{
    support_id: string;
    market: string;
    value: number | null;
    metric: string | null;
    period_unit: string | null;
    source: string | null;
    measured_at: string | null;
  }>;
}) {
  const from = vi.fn((table: string) => {
    if (table === 'reach_measurements') {
      return {
        select: () => ({
          not: async () => ({ data: opts.reach ?? [], error: null }),
        }),
      };
    }
    throw new Error(`tabla no simulada en este test: ${table}`);
  });
  return { from } as unknown as Parameters<typeof buildDraftProposalPdfData>[0];
}

describe('buildDraftProposalPdfData', () => {
  it('construye un ProposalPdfData completo, sin número de presupuesto real (marcador de posición honesto)', async () => {
    const supabase = makeSupabase({ reach: [] });
    const data = await buildDraftProposalPdfData(supabase, {
      advertiserName: 'Office de tourisme de Amiens',
      contactFullName: 'Camille Dupont',
      brief: 'Campaña de Navidad',
      salesName: 'Rémi Challal',
      language: 'FR',
      options: [
        {
          code: 'A',
          name: 'Pack Premium',
          pitch: null,
          markets: ['FR'],
          campaignStart: '2026-12-01',
          campaignEnd: '2026-12-28',
          campaignDurationCount: null,
          campaignDurationUnit: null,
          billedTotalCents: 172_000,
          costCents: 70_000,
          marginCents: 102_000,
          marginRate: 0.593,
          lines: [
            { supportId: 'ON-01', supportName: 'Marketing Block', market: 'FR', quantity: 4, billedTotalCents: 172_000 },
          ],
        },
      ],
    });

    expect(data.proposalNumber).toBe(DRAFT_PDF_PREVIEW_PROPOSAL_NUMBER);
    expect(data.proposalNumber).not.toMatch(/^\d{4}-\d{3}$/);
    expect(data.status).toBe('DRAFT');
    expect(data.sentAt).toBeNull();
    expect(data.acceptance).toBeNull();
    expect(data.advertiserLegalName).toBe('Office de tourisme de Amiens');
    expect(data.contactFullName).toBe('Camille Dupont');
    expect(data.ownerFullName).toBe('Rémi Challal');
    expect(data.options).toHaveLength(1);
    expect(data.options[0]!.lines[0]!.reach).toBeNull();
  });

  it('consulta el reach de verdad (no depende de que el presupuesto exista) y lo omite sin fuente', async () => {
    const supabase = makeSupabase({
      reach: [
        {
          support_id: 'ON-01',
          market: 'BE_FR',
          value: 15_841,
          metric: 'PAGE_VIEWS',
          period_unit: 'WEEK',
          source: 'GA4',
          measured_at: '2026-09-01',
        },
        // Sin fuente → se descarta, CLAUDE.md §3 ("nunca se inventa, nunca aparece sin fuente").
        {
          support_id: 'ON-02',
          market: 'BE_FR',
          value: 999,
          metric: 'PAGE_VIEWS',
          period_unit: 'WEEK',
          source: null,
          measured_at: null,
        },
      ],
    });

    const data = await buildDraftProposalPdfData(supabase, {
      advertiserName: 'Visit Wallonia',
      contactFullName: null,
      brief: null,
      salesName: 'Vincent Pla',
      language: 'FR',
      options: [
        {
          code: 'A',
          name: 'Entrada',
          pitch: null,
          markets: ['BE_FR'],
          campaignStart: null,
          campaignEnd: null,
          campaignDurationCount: 4,
          campaignDurationUnit: 'WEEK',
          billedTotalCents: 100_000,
          costCents: 40_000,
          marginCents: 60_000,
          marginRate: 0.6,
          lines: [
            { supportId: 'ON-01', supportName: 'Marketing Block', market: 'BE_FR', quantity: 4, billedTotalCents: 60_000 },
            { supportId: 'ON-02', supportName: 'Targeted Banner', market: 'BE_FR', quantity: 4, billedTotalCents: 40_000 },
          ],
        },
      ],
    });

    const lines = data.options[0]!.lines;
    expect(lines.find((l) => l.supportId === 'ON-01')!.reach).toEqual({
      value: 15_841,
      metric: 'PAGE_VIEWS',
      periodUnit: 'WEEK',
      source: 'GA4',
      measuredAt: '2026-09-01',
    });
    expect(lines.find((l) => l.supportId === 'ON-02')!.reach).toBeNull();
  });

  it('cae a "—" cuando la razón social todavía está vacía (nuevo en construcción)', async () => {
    const supabase = makeSupabase({ reach: [] });
    const data = await buildDraftProposalPdfData(supabase, {
      advertiserName: '',
      contactFullName: null,
      brief: null,
      salesName: '',
      language: 'ES',
      options: [],
    });

    expect(data.advertiserLegalName).toBe('—');
    expect(data.ownerFullName).toBeNull();
    expect(data.options).toEqual([]);
  });

  it('margen nulo (opción nacida de una contrapropuesta, ronda 16) no revienta el render', async () => {
    const supabase = makeSupabase({ reach: [] });
    const data = await buildDraftProposalPdfData(supabase, {
      advertiserName: 'Ciudad Ejemplo',
      contactFullName: 'Contacto',
      brief: null,
      salesName: 'Mario Martínez',
      language: 'ES',
      options: [
        {
          code: 'A',
          name: 'Opción media buy',
          pitch: null,
          markets: ['ES'],
          campaignStart: '2026-11-01',
          campaignEnd: '2026-11-30',
          campaignDurationCount: null,
          campaignDurationUnit: null,
          billedTotalCents: 200_000,
          costCents: null,
          marginCents: null,
          marginRate: null,
          lines: [
            { supportId: 'ADS-01', supportName: 'Campaña Meta patrocinada', market: 'ES', quantity: 1, billedTotalCents: 200_000 },
          ],
        },
      ],
    });

    expect(data.options[0]!.costCents).toBeNull();
    expect(data.options[0]!.marginRate).toBeNull();
  });
});
