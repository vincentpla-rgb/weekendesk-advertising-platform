import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Descarga manual del PDF del presupuesto (CLAUDE.md §1/§9) — siempre la
 * variante INTERNA (coste/margen), igual que ya muestra `/proposals/[id]`
 * sin restricción; exige sesión (CLAUDE.md §4.4/§6 solo protege de cara al
 * CLIENTE, esta ruta es puro equipo interno).
 */

const getUser = vi.fn();
const loadProposalPdfData = vi.fn();
const renderProposalPdf = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser } })),
}));
vi.mock('@/lib/pdf/proposal-pdf-loader', () => ({ loadProposalPdfData }));
vi.mock('@/lib/pdf/render-proposal-pdf', () => ({
  renderProposalPdf,
  proposalPdfFileName: vi.fn(() => 'weekendesk-2026-014-Destination-Exemple.pdf'),
}));

const { GET } = await import('./route.js');

function makeRequest(query = '') {
  return new Request(`https://weekendesk-advertising.vercel.app/api/proposals/p1/pdf${query}`);
}

describe('GET /api/proposals/[id]/pdf', () => {
  beforeEach(() => {
    getUser.mockReset();
    loadProposalPdfData.mockReset();
    renderProposalPdf.mockReset();
  });

  it('sin sesión: 401, sin tocar el loader ni el render', async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const response = await GET(makeRequest(), { params: Promise.resolve({ id: 'p1' }) });

    expect(response.status).toBe(401);
    expect(loadProposalPdfData).not.toHaveBeenCalled();
    expect(renderProposalPdf).not.toHaveBeenCalled();
  });

  it('presupuesto inexistente (o fuera de alcance de RLS): 404', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    loadProposalPdfData.mockResolvedValue(null);

    const response = await GET(makeRequest(), { params: Promise.resolve({ id: 'p1' }) });

    expect(response.status).toBe(404);
    expect(renderProposalPdf).not.toHaveBeenCalled();
  });

  it('con sesión y datos: devuelve el PDF con Content-Type y Content-Disposition correctos, variante internal', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    const pdfData = { proposalId: 'p1', proposalNumber: '2026-014' };
    loadProposalPdfData.mockResolvedValue(pdfData);
    renderProposalPdf.mockResolvedValue(Buffer.from('%PDF-fake-content'));

    const response = await GET(makeRequest(), { params: Promise.resolve({ id: 'p1' }) });

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/pdf');
    expect(response.headers.get('Content-Disposition')).toBe(
      'attachment; filename="weekendesk-2026-014-Destination-Exemple.pdf"',
    );
    expect(renderProposalPdf).toHaveBeenCalledWith(pdfData, 'internal');
    const buffer = Buffer.from(await response.arrayBuffer());
    expect(buffer.toString()).toBe('%PDF-fake-content');
  });

  it('?disposition=inline (ronda 23): mismo PDF, Content-Disposition inline en vez de attachment', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    const pdfData = { proposalId: 'p1', proposalNumber: '2026-014' };
    loadProposalPdfData.mockResolvedValue(pdfData);
    renderProposalPdf.mockResolvedValue(Buffer.from('%PDF-fake-content'));

    const response = await GET(makeRequest('?disposition=inline'), { params: Promise.resolve({ id: 'p1' }) });

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Disposition')).toBe(
      'inline; filename="weekendesk-2026-014-Destination-Exemple.pdf"',
    );
    expect(renderProposalPdf).toHaveBeenCalledWith(pdfData, 'internal');
  });

  it('un valor de ?disposition= distinto de "inline" cae a attachment, como por defecto', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    const pdfData = { proposalId: 'p1', proposalNumber: '2026-014' };
    loadProposalPdfData.mockResolvedValue(pdfData);
    renderProposalPdf.mockResolvedValue(Buffer.from('%PDF-fake-content'));

    const response = await GET(makeRequest('?disposition=download'), { params: Promise.resolve({ id: 'p1' }) });

    expect(response.headers.get('Content-Disposition')).toBe(
      'attachment; filename="weekendesk-2026-014-Destination-Exemple.pdf"',
    );
  });
});
