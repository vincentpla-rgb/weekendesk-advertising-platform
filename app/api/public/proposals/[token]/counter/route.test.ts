import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Emails 5 (AM: contrapropuesta recibida) y 9 (cliente: confirmación de
 * envío) — CLAUDE.md, ronda 17, bloque 1, puntos 1 y 3. Ninguno de los dos
 * puede tumbar la respuesta si Resend falla o si faltan datos de contacto:
 * la contrapropuesta ya se persistió con éxito en `submit_counter_proposal`.
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
  return new Request('https://weekendesk-advertising.vercel.app/api/public/proposals/tok123/counter', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  optionCode: 'A',
  lines: [
    {
      supportId: 'ON-01',
      market: 'FR',
      originalPriceCents: 43000,
      originalQuantity: 4,
      clientPriceCents: 35000,
      clientQuantity: 4,
      deleted: false,
    },
  ],
  campaignStart: '2027-01-01',
  campaignEnd: '2027-01-28',
  campaignDurationCount: null,
  campaignDurationUnit: null,
  legalName: 'Office Test',
  billingAddress: '1 rue de Test',
  vatNumber: '',
  billingContactName: 'Jean Dupont',
  billingContactEmail: 'jean@example.com',
  signerName: 'Jean Dupont',
  signerRole: 'Directeur',
  purchaseOrderReference: '',
};

const RPC_DATA = {
  counter_proposal_id: 'cp1',
  proposal_id: 'p1',
  proposal_number: '2026-014',
  proposal_language: 'FR',
  option_code: 'A',
  option_name: 'Estándar',
  advertiser_name: 'Office Test',
  contact_full_name: 'Jean Dupont',
  contact_email: 'jean@example.com',
  owner_email: 'vincent.pla@weekendesk.fr',
  owner_full_name: 'Vincent Pla',
  owner_language: 'ES',
};

describe('POST /api/public/proposals/[token]/counter', () => {
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

  it('con Resend configurado: manda el email 5 (AM) y el email 9 (cliente)', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    process.env.RESEND_FROM_EMAIL = 'Weekendesk Advertising <onboarding@resend.dev>';
    rpc.mockResolvedValue({ data: RPC_DATA, error: null });
    sendEmail.mockResolvedValue({ ok: true, id: 'resend-x' });

    await POST(makeRequest(VALID_BODY), { params: Promise.resolve({ token: 'tok123' }) });

    expect(sendEmail).toHaveBeenCalledTimes(2);
    const [amCall, clientCall] = sendEmail.mock.calls.map((c) => c[0]);
    expect(amCall.to).toEqual(['vincent.pla@weekendesk.fr']);
    expect(amCall.subject).toContain('Office Test');
    expect(clientCall.to).toEqual(['jean@example.com']);
  });

  it('un fallo al mandar el email 5/9 no cambia la respuesta HTTP (la contrapropuesta ya se persistió)', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    process.env.RESEND_FROM_EMAIL = 'Weekendesk Advertising <onboarding@resend.dev>';
    rpc.mockResolvedValue({ data: RPC_DATA, error: null });
    sendEmail.mockResolvedValue({ ok: false, error: 'Resend caído' });

    const response = await POST(makeRequest(VALID_BODY), { params: Promise.resolve({ token: 'tok123' }) });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual(RPC_DATA);
  });

  it('sin datos de owner (owner_email/owner_full_name/advertiser_name ausentes): no manda el email 5, sigue mandando el 9', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    process.env.RESEND_FROM_EMAIL = 'Weekendesk Advertising <onboarding@resend.dev>';
    rpc.mockResolvedValue({ data: { ...RPC_DATA, owner_email: null }, error: null });
    sendEmail.mockResolvedValue({ ok: true, id: 'resend-x' });

    await POST(makeRequest(VALID_BODY), { params: Promise.resolve({ token: 'tok123' }) });

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0]![0].to).toEqual(['jean@example.com']);
  });

  it('si el RPC falla, no intenta mandar ningún email', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'Enlace no válido' } });

    const response = await POST(makeRequest(VALID_BODY), { params: Promise.resolve({ token: 'tok123' }) });

    expect(response.status).toBe(400);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
