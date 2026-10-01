import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Emails 3 (cliente: confirmación de aceptación) y 4 (AM: aviso con
 * rentabilidad) — CLAUDE.md §9/§10.3, ronda 18, bloque 2. Ninguno de los
 * dos puede tumbar la respuesta: la aceptación ya se persistió con éxito en
 * `accept_public_proposal`.
 */

const rpc = vi.fn();
const checkVies = vi.fn();
const sendEmail = vi.fn();

vi.mock('@/lib/vies', () => ({ checkVies }));
vi.mock('@/lib/supabase/server', () => ({
  createPublicClient: vi.fn(() => ({ rpc })),
}));
vi.mock('@/lib/email/resend-client', () => ({ sendEmail }));

const { POST } = await import('./route.js');

function makeRequest(body: Record<string, unknown>) {
  return new Request('https://weekendesk-advertising.vercel.app/api/public/proposals/tok123/accept', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  optionCode: 'A',
  legalName: 'Office Test SAS',
  billingAddress: '1 rue de Test',
  vatNumber: '',
  billingContactName: 'Jean Dupont',
  billingContactEmail: 'jean@example.com',
  signerName: 'Jean Dupont',
  signerRole: 'Directeur',
  purchaseOrderReference: '',
};

const RPC_DATA = {
  acceptance_id: 'acc1',
  vat_regime: 'FR_VAT_20',
  proposal_id: 'p1',
  proposal_number: '2026-014',
  proposal_language: 'FR',
  option_name: 'Pack Premium',
  markets: ['FR', 'ES'],
  sale_cents: 600000,
  cost_cents: 252000,
  margin_cents: 348000,
  margin_rate: 0.58,
  advertiser_name: 'Destination Exemple',
  contact_full_name: 'Camille Dupont',
  contact_email: 'camille@example.com',
  owner_email: 'vincent.pla@weekendesk.fr',
  owner_full_name: 'Vincent Pla',
  owner_language: 'ES',
};

describe('POST /api/public/proposals/[token]/accept', () => {
  beforeEach(() => {
    rpc.mockReset();
    checkVies.mockReset();
    sendEmail.mockReset();
    checkVies.mockResolvedValue({ result: 'UNAVAILABLE', raw: {} });
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_EMAIL;
  });

  it('sin RESEND_API_KEY/RESEND_FROM_EMAIL: persiste igual, sin intentar mandar ningún email', async () => {
    rpc.mockResolvedValue({ data: RPC_DATA, error: null });

    const response = await POST(makeRequest(VALID_BODY), { params: Promise.resolve({ token: 'tok123' }) });

    expect(response.status).toBe(200);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('con Resend configurado: manda el email 3 (cliente) y el email 4 (AM, con margen)', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    process.env.RESEND_FROM_EMAIL = 'Weekendesk Advertising <onboarding@resend.dev>';
    rpc.mockResolvedValue({ data: RPC_DATA, error: null });
    sendEmail.mockResolvedValue({ ok: true, id: 'resend-x' });

    await POST(makeRequest(VALID_BODY), { params: Promise.resolve({ token: 'tok123' }) });

    expect(sendEmail).toHaveBeenCalledTimes(2);
    const [clientCall, amCall] = sendEmail.mock.calls.map((c) => c[0]);
    expect(clientCall.to).toEqual(['camille@example.com']);
    expect(clientCall.html).not.toMatch(/252\s?000|2\s?520|coste/i);
    expect(amCall.to).toEqual(['vincent.pla@weekendesk.fr']);
    expect(amCall.html).toContain('Sobre el mínimo');
  });

  it('un fallo al mandar el email 3/4 no cambia la respuesta HTTP (la aceptación ya se persistió)', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    process.env.RESEND_FROM_EMAIL = 'Weekendesk Advertising <onboarding@resend.dev>';
    rpc.mockResolvedValue({ data: RPC_DATA, error: null });
    sendEmail.mockResolvedValue({ ok: false, error: 'Resend caído' });

    const response = await POST(makeRequest(VALID_BODY), { params: Promise.resolve({ token: 'tok123' }) });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual(RPC_DATA);
  });

  it('sin datos suficientes (sale_cents null, p. ej. opción nacida de una contrapropuesta): no manda ningún email', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    process.env.RESEND_FROM_EMAIL = 'Weekendesk Advertising <onboarding@resend.dev>';
    rpc.mockResolvedValue({ data: { ...RPC_DATA, sale_cents: null, cost_cents: null, margin_cents: null }, error: null });
    sendEmail.mockResolvedValue({ ok: true, id: 'resend-x' });

    await POST(makeRequest(VALID_BODY), { params: Promise.resolve({ token: 'tok123' }) });

    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('si el RPC falla, no intenta mandar ningún email', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'Enlace no válido' } });

    const response = await POST(makeRequest(VALID_BODY), { params: Promise.resolve({ token: 'tok123' }) });

    expect(response.status).toBe(400);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
