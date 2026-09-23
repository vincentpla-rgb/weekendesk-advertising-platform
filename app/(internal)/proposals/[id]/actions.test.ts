import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `retryProposalSend` (CLAUDE.md §10.1.2, §10.3): reintenta SOLO el paso de
 * mandar el email de un presupuesto que se quedó en DRAFT porque Resend
 * falló (o no estaba configurado) la primera vez — nunca recalcula el
 * precio. Mismo patrón de mocks que `app/api/proposals/route.test.ts`, que
 * ya prueba el envío original.
 */

const getUser = vi.fn();
const rpc = vi.fn();
const maybeSingleProposal = vi.fn();
const maybeSingleParamSet = vi.fn();
const sendEmail = vi.fn();
const buildProposalEmailContent = vi.fn(() => ({ subject: 's', html: '<p>h</p>', text: 't' }));
const revalidatePath = vi.fn();
const headersGet = vi.fn((key: string) => (key === 'host' ? 'app.weekendesk.fr' : 'https'));

const supabaseClient = {
  auth: { getUser },
  rpc,
  from: vi.fn((table: string) => {
    if (table === 'proposals') {
      return { select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: maybeSingleProposal })) })) };
    }
    if (table === 'pricing_parameter_sets') {
      return { select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: maybeSingleParamSet })) })) };
    }
    throw new Error(`tabla inesperada: ${table}`);
  }),
};

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => supabaseClient),
}));
vi.mock('@/lib/email/resend-client', () => ({ sendEmail }));
vi.mock('@/lib/email/proposal-email', () => ({ buildProposalEmailContent }));
vi.mock('next/cache', () => ({ revalidatePath }));
vi.mock('next/headers', () => ({ headers: vi.fn(async () => ({ get: headersGet })) }));

const { retryProposalSend } = await import('./actions.js');

function validProposal(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'p1',
    status: 'DRAFT',
    language: 'FR',
    brief: 'Brief',
    public_token: 'tok123',
    parameter_set_id: 'ps1',
    accounts: { legal_name: 'Office One' },
    contacts: { full_name: 'Jean Dupont', email: 'jean@example.com' },
    profiles: { full_name: 'Vincent Pla' },
    proposal_options: [{ id: 'o1' }, { id: 'o2' }],
    ...overrides,
  };
}

describe('retryProposalSend', () => {
  beforeEach(() => {
    getUser.mockReset();
    rpc.mockReset();
    maybeSingleProposal.mockReset();
    maybeSingleParamSet.mockReset();
    sendEmail.mockReset();
    revalidatePath.mockReset();
    getUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'vincent.pla@weekendesk.fr' } } });
    maybeSingleParamSet.mockResolvedValue({ data: { offer_validity_days: 14 }, error: null });
    process.env.RESEND_API_KEY = 'test-key';
    process.env.RESEND_FROM_EMAIL = 'Weekendesk Advertising <onboarding@resend.dev>';
  });

  it('rechaza un presupuesto que ya no está en DRAFT, sin tocar Resend', async () => {
    maybeSingleProposal.mockResolvedValue({ data: validProposal({ status: 'SENT' }), error: null });

    const result = await retryProposalSend('p1');

    expect(result.ok).toBe(false);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('rechaza un presupuesto que no existe', async () => {
    maybeSingleProposal.mockResolvedValue({ data: null, error: null });

    const result = await retryProposalSend('does-not-exist');

    expect(result.ok).toBe(false);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('sin RESEND_API_KEY/RESEND_FROM_EMAIL: registra el fallo, no manda el email', async () => {
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_EMAIL;
    maybeSingleProposal.mockResolvedValue({ data: validProposal(), error: null });
    rpc.mockResolvedValue({ data: null, error: null });

    const result = await retryProposalSend('p1');

    expect(result.ok).toBe(false);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith('log_proposal_send_failure', expect.anything());
    expect(rpc).not.toHaveBeenCalledWith('mark_proposal_sent', expect.anything());
  });

  it('si Resend falla al reintentar, registra el fallo y el envío sigue en DRAFT', async () => {
    maybeSingleProposal.mockResolvedValue({ data: validProposal(), error: null });
    sendEmail.mockResolvedValue({ ok: false, error: 'Resend respondió 500' });
    rpc.mockResolvedValue({ data: null, error: null });

    const result = await retryProposalSend('p1');

    expect(result.ok).toBe(false);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('log_proposal_send_failure', expect.anything());
    expect(rpc).not.toHaveBeenCalledWith('mark_proposal_sent', expect.anything());
  });

  it('con éxito, manda el email, marca SENT y revalida el detalle y el listado', async () => {
    maybeSingleProposal.mockResolvedValue({ data: validProposal(), error: null });
    sendEmail.mockResolvedValue({ ok: true, id: 'resend-1' });
    rpc.mockResolvedValue({ data: {}, error: null });

    const result = await retryProposalSend('p1');

    expect(result.ok).toBe(true);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('mark_proposal_sent', expect.objectContaining({ p_proposal_id: 'p1' }));
    expect(rpc).not.toHaveBeenCalledWith('log_proposal_send_failure', expect.anything());
    expect(revalidatePath).toHaveBeenCalledWith('/proposals/p1');
    expect(revalidatePath).toHaveBeenCalledWith('/proposals');

    // El email no se recalcula el precio: usa el número de opciones ya
    // persistido y el nombre del comercial ORIGINAL (profiles.full_name del
    // creador), no el de quien pulsa "reintentar" (CLAUDE.md §5.6).
    expect(buildProposalEmailContent).toHaveBeenCalledWith(
      expect.objectContaining({ numberOfOptions: 2, salesName: 'Vincent Pla', language: 'FR' }),
    );
  });
});
