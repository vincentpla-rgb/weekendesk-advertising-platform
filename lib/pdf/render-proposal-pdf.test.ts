import { describe, expect, it } from 'vitest';

import { renderProposalPdf, proposalPdfFileName } from './render-proposal-pdf.js';
import type { ProposalPdfData } from './proposal-pdf-data.js';

/**
 * Smoke test real, sin mockear @react-pdf/renderer ni las fuentes: confirma
 * que `ProposalPdfDocument` compone y `renderToBuffer` produce bytes de PDF
 * de verdad (cabecera `%PDF`), en las dos variantes (CLAUDE.md §4.4/§6) y
 * con los casos límite que más fácilmente rompen un documento (reach
 * presente/ausente, brief con saltos de línea, margen `null`, aceptación
 * con/sin IVA, sin aceptación todavía).
 */
function baseData(overrides: Partial<ProposalPdfData> = {}): ProposalPdfData {
  return {
    proposalId: 'p-1',
    proposalNumber: '2026-014',
    language: 'ES',
    status: 'SENT',
    advertiserLegalName: 'Office de Tourisme "Exemple" & Co',
    contactFullName: 'Camille Dupont',
    brief: 'Campaña de Navidad.\n\nSegunda línea del brief.',
    sentAt: '2026-10-01T00:00:00.000Z',
    ownerFullName: 'Rémi Challal',
    options: [
      {
        code: 'A',
        name: 'Pack Premium',
        pitch: 'La opción más completa.',
        markets: ['FR', 'ES'],
        campaignStart: '2026-12-01',
        campaignEnd: '2026-12-28',
        campaignDurationCount: null,
        campaignDurationUnit: null,
        billedTotalCents: 600_000,
        costCents: 252_000,
        marginCents: 348_000,
        marginRate: 0.58,
        lines: [
          {
            supportId: 'ON-01',
            supportName: 'Marketing Block',
            market: 'FR',
            quantity: 4,
            billedTotalCents: 172_000,
            reach: { value: 15_841, metric: 'page_views', periodUnit: 'WEEK', source: 'GA4', measuredAt: '2026-09-01' },
          },
          {
            supportId: 'ADS-01',
            supportName: 'Campaña Meta patrocinada',
            market: 'ES',
            quantity: 1,
            billedTotalCents: 200_000,
            reach: null,
          },
        ],
      },
    ],
    acceptance: null,
    ...overrides,
  };
}

describe('renderProposalPdf', () => {
  it('produce un PDF real (variante client), con brief multilínea y una línea sin reach', async () => {
    const buffer = await renderProposalPdf(baseData(), 'client');
    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(buffer.length).toBeGreaterThan(500);
  });

  it('produce un PDF real (variante internal), con coste/margen', async () => {
    const buffer = await renderProposalPdf(baseData(), 'internal');
    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('opción sin margen calculado (null, nacida de una contrapropuesta, ronda 16) no revienta', async () => {
    const data = baseData({
      options: [{ ...baseData().options[0]!, costCents: null, marginCents: null, marginRate: null }],
    });
    const buffer = await renderProposalPdf(data, 'internal');
    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('con aceptación y régimen REVERSE_CHARGE en español, incluye la mención de IVA (variante client)', async () => {
    const data = baseData({
      acceptance: {
        optionCode: 'A',
        legalName: 'Office de Tourisme Exemple',
        billingAddress: '1 rue Exemple, 75000 Paris',
        vatNumber: 'FR12345678901',
        purchaseOrderReference: 'REF-2026-001',
        vatRegime: 'REVERSE_CHARGE',
        acceptedAt: '2026-10-05T00:00:00.000Z',
      },
    });
    const buffer = await renderProposalPdf(data, 'client');
    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('en francés, sin mención de IVA inventada (CLAUDE.md §7: solo hay texto aprobado en español)', async () => {
    const data = baseData({
      language: 'FR',
      acceptance: {
        optionCode: 'A',
        legalName: 'Office de Tourisme Exemple',
        billingAddress: '1 rue Exemple, 75000 Paris',
        vatNumber: null,
        purchaseOrderReference: null,
        vatRegime: 'FR_VAT_20',
        acceptedAt: '2026-10-05T00:00:00.000Z',
      },
    });
    const buffer = await renderProposalPdf(data, 'client');
    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('sin brief (null), no deja ningún bloque vacío que reviente el render', async () => {
    const buffer = await renderProposalPdf(baseData({ brief: null }), 'client');
    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });
});

describe('proposalPdfFileName', () => {
  it('construye un nombre de fichero seguro a partir del número y la razón social', () => {
    const name = proposalPdfFileName(baseData());
    expect(name).toBe('weekendesk-2026-014-Office-de-Tourisme-Exemple-Co.pdf');
  });

  it('nunca deja caracteres fuera de [a-zA-Z0-9-] en el nombre', () => {
    const name = proposalPdfFileName(baseData({ advertiserLegalName: 'Ñandú & Çà/Là!!' }));
    expect(name).toMatch(/^weekendesk-2026-014(-[a-zA-Z0-9-]+)?\.pdf$/);
  });
});
