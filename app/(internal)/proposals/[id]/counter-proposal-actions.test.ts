import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `acceptCounterProposal`/`rejectCounterProposal` (CLAUDE.md, ronda 16,
 * bloque 3 y 4; ronda 17, bloque 1, puntos 2 y 4): server actions finas
 * sobre las funciones SQL `accept_counter_proposal`/`reject_counter_proposal`
 * — la comprobación de quién puede decidir vive en SQL
 * (`is_admin_or_proposal_owner`), no aquí.
 *
 * `rejectCounterProposal` manda además el email de rechazo (bloque 4), con
 * el motivo traducido al idioma del presupuesto (ronda 17, punto 4):
 * `translateText` está mockeado aquí, no probado de nuevo (tiene su propio
 * archivo, `lib/ai/translate-text.test.ts`) — solo se comprueba que se
 * invoca con el idioma correcto y que su resultado llega al builder del
 * email, no el motivo sin traducir.
 *
 * `acceptCounterProposal` manda el email 6 (cliente: contrapropuesta
 * aceptada, ronda 17, punto 2) tras crear el presupuesto nuevo. Un fallo en
 * ese envío nunca convierte un accept ya persistido en `ok: false` — se
 * refleja como `emailWarning` en un resultado que sigue siendo `ok: true`.
 */

const getUser = vi.fn();
const rpc = vi.fn();
const maybeSingleProposal = vi.fn();
const maybeSingleProfile = vi.fn();
const maybeSingleNewProposal = vi.fn();
const sendEmail = vi.fn();
const translateText = vi.fn(async ({ text }: { text: string }) => `[traducido] ${text}`);
const buildCounterProposalRejectionEmailContent = vi.fn(() => ({ subject: 's', html: '<p>h</p>', text: 't' }));
const buildCounterProposalAcceptedClientEmailContent = vi.fn(() => ({ subject: 's6', html: '<p>h6</p>', text: 't6' }));
const revalidatePath = vi.fn();

const supabaseClient = {
  auth: { getUser },
  rpc,
  from: vi.fn((table: string) => {
    if (table === 'proposals') {
      return {
        select: vi.fn((columns: string) => ({
          eq: vi.fn(() => ({
            maybeSingle: columns.includes('accounts') ? maybeSingleProposal : maybeSingleNewProposal,
          })),
        })),
      };
    }
    if (table === 'profiles') {
      return { select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: maybeSingleProfile })) })) };
    }
    throw new Error(`tabla inesperada: ${table}`);
  }),
};

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => supabaseClient),
}));
vi.mock('@/lib/email/resend-client', () => ({ sendEmail }));
vi.mock('@/lib/email/counter-proposal-rejection-email', () => ({ buildCounterProposalRejectionEmailContent }));
vi.mock('@/lib/email/counter-proposal-accepted-client-email', () => ({
  buildCounterProposalAcceptedClientEmailContent,
}));
vi.mock('@/lib/ai/translate-text', () => ({ translateText }));
vi.mock('next/cache', () => ({ revalidatePath }));

const { acceptCounterProposal, rejectCounterProposal } = await import('./counter-proposal-actions.js');

function validProposalRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    language: 'FR',
    proposal_number: '2026-014',
    accounts: { legal_name: 'Office Test' },
    contacts: { full_name: 'Jean Dupont', email: 'jean@example.com' },
    ...overrides,
  };
}

function newProposalRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    language: 'FR',
    proposal_number: '2026-015',
    contacts: { full_name: 'Jean Dupont', email: 'jean@example.com' },
    ...overrides,
  };
}

describe('acceptCounterProposal', () => {
  beforeEach(() => {
    getUser.mockReset();
    rpc.mockReset();
    maybeSingleNewProposal.mockReset();
    sendEmail.mockReset();
    buildCounterProposalAcceptedClientEmailContent.mockClear();
    revalidatePath.mockReset();
    getUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'vincent.pla@weekendesk.fr' } } });
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_EMAIL;
  });

  it('rechaza sin sesión, sin llamar al RPC', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const result = await acceptCounterProposal('p1', 'cp1', []);
    expect(result).toEqual({ ok: false, error: 'No autenticado' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('llama a accept_counter_proposal con los overrides de margen en snake_case', async () => {
    rpc.mockResolvedValue({ data: { new_proposal_id: 'p2', acceptance_id: 'a1' }, error: null });

    const result = await acceptCounterProposal('p1', 'cp1', [
      { supportId: 'ON-01', market: 'FR', reason: 'Cliente estratégico.' },
    ]);

    expect(result).toEqual({ ok: true, newProposalId: 'p2', emailWarning: expect.any(String) });
    expect(rpc).toHaveBeenCalledWith('accept_counter_proposal', {
      p_counter_proposal_id: 'cp1',
      p_margin_overrides: [{ support_id: 'ON-01', market: 'FR', reason: 'Cliente estratégico.' }],
    });
    expect(revalidatePath).toHaveBeenCalledWith('/proposals/p1');
    expect(revalidatePath).toHaveBeenCalledWith('/proposals/p2');
  });

  it('devuelve el error del RPC tal cual (p. ej. permiso denegado o conflicto de disponibilidad)', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'Solo el creador de este presupuesto o un administrador pueden decidir sobre esta contrapropuesta' } });

    const result = await acceptCounterProposal('p1', 'cp1', []);
    expect(result).toEqual({
      ok: false,
      error: 'Solo el creador de este presupuesto o un administrador pueden decidir sobre esta contrapropuesta',
    });
  });

  it('sin RESEND_API_KEY/RESEND_FROM_EMAIL: sigue ok:true, con un emailWarning legible', async () => {
    rpc.mockResolvedValue({ data: { new_proposal_id: 'p2', acceptance_id: 'a1' }, error: null });

    const result = await acceptCounterProposal('p1', 'cp1', []);

    expect(result.ok).toBe(true);
    expect((result as { emailWarning?: string }).emailWarning).toContain('RESEND_API_KEY');
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('con Resend configurado: manda el email 6 al cliente del presupuesto NUEVO, sin emailWarning', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    process.env.RESEND_FROM_EMAIL = 'Weekendesk Advertising <onboarding@resend.dev>';
    rpc.mockResolvedValue({ data: { new_proposal_id: 'p2', acceptance_id: 'a1' }, error: null });
    maybeSingleNewProposal.mockResolvedValue({ data: newProposalRow(), error: null });
    sendEmail.mockResolvedValue({ ok: true, id: 'resend-2' });

    const result = await acceptCounterProposal('p1', 'cp1', []);

    expect(result).toEqual({ ok: true, newProposalId: 'p2', emailWarning: undefined });
    expect(buildCounterProposalAcceptedClientEmailContent).toHaveBeenCalledWith(
      expect.objectContaining({ contactFullName: 'Jean Dupont', proposalNumber: '2026-015', language: 'FR' }),
    );
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: ['jean@example.com'], from: 'Weekendesk Advertising <onboarding@resend.dev>' }),
      'test-key',
    );
  });

  it('si el envío del email 6 falla, el accept sigue ok:true con emailWarning', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    process.env.RESEND_FROM_EMAIL = 'Weekendesk Advertising <onboarding@resend.dev>';
    rpc.mockResolvedValue({ data: { new_proposal_id: 'p2', acceptance_id: 'a1' }, error: null });
    maybeSingleNewProposal.mockResolvedValue({ data: newProposalRow(), error: null });
    sendEmail.mockResolvedValue({ ok: false, error: 'Resend caído' });

    const result = await acceptCounterProposal('p1', 'cp1', []);

    expect(result.ok).toBe(true);
    expect((result as { emailWarning?: string }).emailWarning).toContain('Resend caído');
  });
});

describe('rejectCounterProposal', () => {
  beforeEach(() => {
    getUser.mockReset();
    rpc.mockReset();
    maybeSingleProposal.mockReset();
    maybeSingleProfile.mockReset();
    sendEmail.mockReset();
    translateText.mockClear();
    buildCounterProposalRejectionEmailContent.mockClear();
    revalidatePath.mockReset();
    getUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'vincent.pla@weekendesk.fr' } } });
    maybeSingleProfile.mockResolvedValue({ data: { full_name: 'Vincent Pla' }, error: null });
    process.env.RESEND_API_KEY = 'test-key';
    process.env.RESEND_FROM_EMAIL = 'Weekendesk Advertising <onboarding@resend.dev>';
  });

  it('rechaza sin sesión, sin llamar al RPC ni a Resend', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const result = await rejectCounterProposal('p1', 'cp1', 'Motivo');
    expect(result).toEqual({ ok: false, error: 'No autenticado', decided: false });
    expect(rpc).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('devuelve decided:false si el RPC falla — nada se decidió todavía', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'Esta contrapropuesta ya se decidió (REJECTED)' } });
    const result = await rejectCounterProposal('p1', 'cp1', 'Motivo');
    expect(result).toEqual({ ok: false, error: 'Esta contrapropuesta ya se decidió (REJECTED)', decided: false });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('sin RESEND_API_KEY/RESEND_FROM_EMAIL: decided:true, no llama a sendEmail', async () => {
    delete process.env.RESEND_API_KEY;
    rpc.mockResolvedValue({ data: { ok: true }, error: null });
    maybeSingleProposal.mockResolvedValue({ data: validProposalRow(), error: null });

    const result = await rejectCounterProposal('p1', 'cp1', 'Precio insuficiente.');
    expect(result.ok).toBe(false);
    expect((result as { decided: boolean }).decided).toBe(true);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('si el envío de Resend falla, decided:true con el motivo del fallo', async () => {
    rpc.mockResolvedValue({ data: { ok: true }, error: null });
    maybeSingleProposal.mockResolvedValue({ data: validProposalRow(), error: null });
    sendEmail.mockResolvedValue({ ok: false, error: 'Resend caído' });

    const result = await rejectCounterProposal('p1', 'cp1', 'Precio insuficiente.');
    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining('Resend caído'),
      decided: true,
    });
  });

  it('éxito completo: RPC + email — construye el email con el motivo TRADUCIDO y el nombre del revisor', async () => {
    rpc.mockResolvedValue({ data: { ok: true }, error: null });
    maybeSingleProposal.mockResolvedValue({ data: validProposalRow(), error: null });
    sendEmail.mockResolvedValue({ ok: true, id: 'resend-1' });

    const result = await rejectCounterProposal('p1', 'cp1', 'Precio insuficiente.');

    expect(result).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith('reject_counter_proposal', {
      p_counter_proposal_id: 'cp1',
      p_reason: 'Precio insuficiente.',
    });
    expect(translateText).toHaveBeenCalledWith({ text: 'Precio insuficiente.', targetLanguage: 'FR' });
    expect(buildCounterProposalRejectionEmailContent).toHaveBeenCalledWith(
      expect.objectContaining({
        advertiserName: 'Office Test',
        contactFullName: 'Jean Dupont',
        proposalNumber: '2026-014',
        reason: '[traducido] Precio insuficiente.',
        salesName: 'Vincent Pla',
        language: 'FR',
      }),
    );
    expect(revalidatePath).toHaveBeenCalledWith('/proposals/p1');
  });

  it('un fallo de traducción no bloquea el envío: translateText ya cae al texto original por su cuenta', async () => {
    rpc.mockResolvedValue({ data: { ok: true }, error: null });
    maybeSingleProposal.mockResolvedValue({ data: validProposalRow(), error: null });
    sendEmail.mockResolvedValue({ ok: true, id: 'resend-1' });
    translateText.mockResolvedValueOnce('Precio insuficiente.');

    const result = await rejectCounterProposal('p1', 'cp1', 'Precio insuficiente.');

    expect(result).toEqual({ ok: true });
    expect(buildCounterProposalRejectionEmailContent).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'Precio insuficiente.' }),
    );
  });
});
