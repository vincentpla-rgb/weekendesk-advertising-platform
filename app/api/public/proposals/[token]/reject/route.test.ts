import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Email 8 (AM: aviso de rechazo simple, con motivo) — CLAUDE.md §9/§10.3,
 * ronda 18, bloque 2. El motivo se traduce al idioma del AM (`translateText`,
 * mismo patrón que `rejectCounterProposal`, ronda 17) antes de construir el
 * email; nunca tumba la respuesta si Resend falla.
 */

const rpc = vi.fn();
const sendEmail = vi.fn();
const translateText = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createPublicClient: vi.fn(() => ({ rpc })),
}));
vi.mock('@/lib/email/resend-client', () => ({ sendEmail }));
vi.mock('@/lib/ai/translate-text', () => ({ translateText }));

const { POST } = await import('./route.js');

function makeRequest(body: Record<string, unknown>) {
  return new Request('https://weekendesk-advertising.vercel.app/api/public/proposals/tok123/reject', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

const RPC_DATA = {
  rejection_id: 'rej1',
  proposal_id: 'p1',
  proposal_number: '2026-014',
  advertiser_name: 'Destination Exemple',
  owner_email: 'vincent.pla@weekendesk.fr',
  owner_full_name: 'Vincent Pla',
  owner_language: 'FR',
};

describe('POST /api/public/proposals/[token]/reject', () => {
  beforeEach(() => {
    rpc.mockReset();
    sendEmail.mockReset();
    translateText.mockReset();
    translateText.mockImplementation(async ({ text }: { text: string }) => text);
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_EMAIL;
  });

  it('sin RESEND_API_KEY/RESEND_FROM_EMAIL: persiste igual, sin intentar mandar ningún email', async () => {
    rpc.mockResolvedValue({ data: RPC_DATA, error: null });

    const response = await POST(makeRequest({ reason: 'El importe no nos encaja' }), {
      params: Promise.resolve({ token: 'tok123' }),
    });

    expect(response.status).toBe(200);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(translateText).not.toHaveBeenCalled();
  });

  it('con Resend configurado: traduce el motivo al idioma del AM y manda el email 8', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    process.env.RESEND_FROM_EMAIL = 'Weekendesk Advertising <onboarding@resend.dev>';
    rpc.mockResolvedValue({ data: RPC_DATA, error: null });
    sendEmail.mockResolvedValue({ ok: true, id: 'resend-x' });
    translateText.mockResolvedValue('Le montant ne nous convient pas');

    await POST(makeRequest({ reason: 'El importe no nos encaja' }), { params: Promise.resolve({ token: 'tok123' }) });

    expect(translateText).toHaveBeenCalledWith({ text: 'El importe no nos encaja', targetLanguage: 'FR' });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const [call] = sendEmail.mock.calls[0] as [{ to: string[]; html: string }];
    expect(call.to).toEqual(['vincent.pla@weekendesk.fr']);
    expect(call.html).toContain('Le montant ne nous convient pas');
    expect(call.html).not.toContain('El importe no nos encaja');
  });

  it('sin motivo (campo opcional), no traduce nada y no muestra el bloque de cita', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    process.env.RESEND_FROM_EMAIL = 'Weekendesk Advertising <onboarding@resend.dev>';
    rpc.mockResolvedValue({ data: RPC_DATA, error: null });
    sendEmail.mockResolvedValue({ ok: true, id: 'resend-x' });

    await POST(makeRequest({ reason: null }), { params: Promise.resolve({ token: 'tok123' }) });

    expect(translateText).not.toHaveBeenCalled();
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it('un fallo al mandar el email 8 no cambia la respuesta HTTP (el rechazo ya se persistió)', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    process.env.RESEND_FROM_EMAIL = 'Weekendesk Advertising <onboarding@resend.dev>';
    rpc.mockResolvedValue({ data: RPC_DATA, error: null });
    sendEmail.mockResolvedValue({ ok: false, error: 'Resend caído' });

    const response = await POST(makeRequest({ reason: 'motivo' }), { params: Promise.resolve({ token: 'tok123' }) });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual(RPC_DATA);
  });

  it('sin datos de owner (owner_email ausente): no manda ningún email', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    process.env.RESEND_FROM_EMAIL = 'Weekendesk Advertising <onboarding@resend.dev>';
    rpc.mockResolvedValue({ data: { ...RPC_DATA, owner_email: null }, error: null });

    await POST(makeRequest({ reason: 'motivo' }), { params: Promise.resolve({ token: 'tok123' }) });

    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('si el RPC falla, no intenta mandar ningún email', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'Este envío ya no admite respuesta' } });

    const response = await POST(makeRequest({ reason: 'motivo' }), { params: Promise.resolve({ token: 'tok123' }) });

    expect(response.status).toBe(400);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
