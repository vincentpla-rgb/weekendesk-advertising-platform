import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Vista previa del PDF de un presupuesto TODAVÍA EN CONSTRUCCIÓN (CLAUDE.md
 * §10.3, ronda 22) — nunca persiste nada, siempre variante `internal`, exige
 * sesión igual que la descarga manual (`/api/proposals/[id]/pdf`). Mismo
 * patrón de mocks que `app/api/proposals/[id]/pdf/route.test.ts`.
 */

const getUser = vi.fn();
const buildDraftProposalPdfData = vi.fn();
const renderProposalPdf = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser } })),
}));
vi.mock('@/lib/pdf/proposal-pdf-draft-preview', () => ({ buildDraftProposalPdfData }));
vi.mock('@/lib/pdf/render-proposal-pdf', () => ({ renderProposalPdf }));

const { POST } = await import('./route.js');

const VALID_BODY = {
  advertiserName: 'Office de tourisme de Amiens',
  contactFullName: 'Camille Dupont',
  brief: 'Brief de prueba',
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
};

function makeRequest(body: unknown) {
  return new Request('https://weekendesk-advertising.vercel.app/api/proposals/preview-pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/proposals/preview-pdf', () => {
  beforeEach(() => {
    getUser.mockReset();
    buildDraftProposalPdfData.mockReset();
    renderProposalPdf.mockReset();
  });

  it('sin sesión: 401, sin tocar el motor de PDF', async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const response = await POST(makeRequest(VALID_BODY));

    expect(response.status).toBe(401);
    expect(buildDraftProposalPdfData).not.toHaveBeenCalled();
    expect(renderProposalPdf).not.toHaveBeenCalled();
  });

  it('cuerpo no es JSON válido: 400', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    const request = new Request('https://weekendesk-advertising.vercel.app/api/proposals/preview-pdf', {
      method: 'POST',
      body: 'no es json',
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(buildDraftProposalPdfData).not.toHaveBeenCalled();
  });

  it('cuerpo con forma inválida (idioma desconocido): 400, sin tocar el motor de PDF', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });

    const response = await POST(makeRequest({ ...VALID_BODY, language: 'DE' }));

    expect(response.status).toBe(400);
    expect(buildDraftProposalPdfData).not.toHaveBeenCalled();
  });

  it('cuerpo sin opciones: 400', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });

    const response = await POST(makeRequest({ ...VALID_BODY, options: [] }));

    expect(response.status).toBe(400);
    expect(buildDraftProposalPdfData).not.toHaveBeenCalled();
  });

  it('con sesión y datos válidos: devuelve el PDF, inline (no adjunto), variante internal, sin persistir nada', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    const pdfData = { proposalId: 'draft-preview', proposalNumber: '[pendiente de asignar]' };
    buildDraftProposalPdfData.mockResolvedValue(pdfData);
    renderProposalPdf.mockResolvedValue(Buffer.from('%PDF-fake-content'));

    const response = await POST(makeRequest(VALID_BODY));

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/pdf');
    expect(response.headers.get('Content-Disposition')).toContain('inline');
    expect(response.headers.get('Content-Disposition')).not.toContain('attachment');
    expect(renderProposalPdf).toHaveBeenCalledWith(pdfData, 'internal');
    const buffer = Buffer.from(await response.arrayBuffer());
    expect(buffer.toString()).toBe('%PDF-fake-content');
  });

  it('manda a buildDraftProposalPdfData exactamente los datos recibidos, sin transformarlos', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    buildDraftProposalPdfData.mockResolvedValue({ proposalId: 'draft-preview' });
    renderProposalPdf.mockResolvedValue(Buffer.from('%PDF-'));

    await POST(makeRequest(VALID_BODY));

    expect(buildDraftProposalPdfData).toHaveBeenCalledTimes(1);
    const [, input] = buildDraftProposalPdfData.mock.calls[0]!;
    expect(input).toEqual(VALID_BODY);
  });
});
