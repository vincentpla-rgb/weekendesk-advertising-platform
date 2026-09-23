import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_CATALOG } from '@/src/pricing/catalog.js';
import { DEFAULT_PRICING_PARAMETERS } from '@/src/pricing/parameters.js';

/**
 * `retryProposalSend` (CLAUDE.md §10.1.2, §10.3): reintenta SOLO el paso de
 * mandar el email de un presupuesto que se quedó en DRAFT porque Resend
 * falló (o no estaba configurado) la primera vez — nunca recalcula el
 * precio. Mismo patrón de mocks que `app/api/proposals/route.test.ts`, que
 * ya prueba el envío original.
 *
 * `duplicateProposal` (CLAUDE.md §10.3 octies, ronda 8): al contrario que
 * `retryProposalSend`, SÍ recalcula — con los parámetros vivos que
 * `loadPricingContext` devuelva en el momento de duplicar, nunca con los
 * números congelados de `frozen_snapshot`.
 */

const getUser = vi.fn();
const rpc = vi.fn();
const maybeSingleProposal = vi.fn();
const maybeSingleParamSet = vi.fn();
const sendEmail = vi.fn();
const buildProposalEmailContent = vi.fn(() => ({ subject: 's', html: '<p>h</p>', text: 't' }));
const revalidatePath = vi.fn();
const headersGet = vi.fn((key: string) => (key === 'host' ? 'app.weekendesk.fr' : 'https'));
const loadPricingContext = vi.fn();

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
vi.mock('@/lib/pricing-context', () => ({ loadPricingContext }));
vi.mock('next/cache', () => ({ revalidatePath }));
vi.mock('next/headers', () => ({ headers: vi.fn(async () => ({ get: headersGet })) }));

const { retryProposalSend, duplicateProposal } = await import('./actions.js');

function validProposal(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'p1',
    status: 'DRAFT',
    language: 'FR',
    brief: 'Brief',
    public_token: 'tok123',
    parameter_set_id: 'ps1',
    proposal_number: '2026-001',
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
    loadPricingContext.mockReset();
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
      expect.objectContaining({
        numberOfOptions: 2,
        salesName: 'Vincent Pla',
        language: 'FR',
        proposalNumber: '2026-001',
      }),
    );
  });
});

// =============================================================================
// duplicateProposal (CLAUDE.md §10.3 octies, ronda 8): a diferencia de
// retryProposalSend, SÍ recalcula — con los parámetros VIVOS que devuelva
// loadPricingContext en el momento de duplicar, nunca copiando los números
// congelados de frozen_snapshot. `priceOption`/`buildProposalOptionsPayload`
// son el motor real (no mockeados): estos tests comprueban el resultado del
// cálculo real, igual que `app/api/proposals/route.test.ts`.
// =============================================================================

const LIVE_CTX = {
  parameters: DEFAULT_PRICING_PARAMETERS,
  catalog: DEFAULT_CATALOG,
  holidays: [],
  offerValidityDays: 14,
};

function frozenProposal(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'p1',
    status: 'SENT',
    account_id: 'acc1',
    contact_id: 'contact1',
    language: 'FR',
    brief: 'Brief original',
    frozen_snapshot: {
      options: [
        {
          code: 'A',
          name: 'Entrada',
          pitch: 'p',
          markets: ['FR'],
          campaign_start: '2027-05-01',
          campaign_end: '2027-05-07',
          campaign_duration_count: null,
          campaign_duration_unit: null,
          // El coste congelado es deliberadamente absurdo (999_999_999): si
          // el duplicado lo copiara tal cual en vez de recalcular, este valor
          // reaparecería en la llamada a create_and_send_proposal — ningún
          // test lo espera, así que su sola presencia bastaría para fallar.
          lines: [
            {
              support_id: 'CRM-03',
              quantity: 1,
              media_budget_cents: null,
              media_months: null,
              is_lead_market: true,
              cost_cents: 999_999_999,
            },
          ],
          discounts: [
            { kind: 'MANUAL', rate: 0.1, reason: 'Cliente recurrente' },
            { kind: 'VOLUME', rate: 0.05, reason: null },
          ],
        },
        {
          code: 'B',
          name: 'Amplia',
          pitch: 'p',
          markets: ['FR'],
          campaign_start: '2027-05-01',
          campaign_end: '2027-05-14',
          campaign_duration_count: null,
          campaign_duration_unit: null,
          lines: [
            {
              support_id: 'CRM-03',
              quantity: 2,
              media_budget_cents: null,
              media_months: null,
              is_lead_market: true,
              cost_cents: 999_999_999,
            },
          ],
          discounts: [],
        },
      ],
    },
    ...overrides,
  };
}

describe('duplicateProposal', () => {
  beforeEach(() => {
    getUser.mockReset();
    rpc.mockReset();
    maybeSingleProposal.mockReset();
    loadPricingContext.mockReset();
    revalidatePath.mockReset();
    getUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'vincent.pla@weekendesk.fr' } } });
    loadPricingContext.mockResolvedValue(LIVE_CTX);
  });

  it('rechaza duplicar un presupuesto que sigue en DRAFT (todavía no se envió ni una vez)', async () => {
    maybeSingleProposal.mockResolvedValue({ data: frozenProposal({ status: 'DRAFT' }), error: null });

    const result = await duplicateProposal('p1');

    expect(result.ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('rechaza un presupuesto que no existe', async () => {
    maybeSingleProposal.mockResolvedValue({ data: null, error: null });

    const result = await duplicateProposal('does-not-exist');

    expect(result.ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each(['SENT', 'VIEWED', 'ACCEPTED', 'REJECTED', 'EXPIRED'] as const)(
    'duplica un presupuesto en estado %s: preserva soportes, mercados y fechas, pero no hereda estado ni datos de envío',
    async (status) => {
      maybeSingleProposal.mockResolvedValue({ data: frozenProposal({ status }), error: null });
      rpc.mockResolvedValue({ data: { proposal_id: 'p2', proposal_number: '2026-002' }, error: null });

      const result = await duplicateProposal('p1');

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('unreachable: se acaba de comprobar result.ok === true');
      expect(rpc).toHaveBeenCalledWith('create_and_send_proposal', expect.anything());

      const [, { payload }] = rpc.mock.calls[0] as [string, { payload: Record<string, unknown> }];

      // Cuenta, contacto, idioma y brief se preservan del original.
      expect(payload.account_id).toBe('acc1');
      expect(payload.contact_id).toBe('contact1');
      expect(payload.language).toBe('FR');
      expect(payload.brief).toBe('Brief original');

      // El payload que se manda a create_and_send_proposal nunca lleva
      // estado ni datos de envío: create_and_send_proposal siempre arranca
      // en DRAFT por sí sola (CLAUDE.md §10.3, punto 5) — no hay ningún
      // campo aquí que pudiera colar un estado o un sent_at heredado.
      expect(payload).not.toHaveProperty('status');
      expect(payload).not.toHaveProperty('sent_at');
      expect(payload).not.toHaveProperty('public_token');

      const options = payload.options as Array<Record<string, unknown>>;
      expect(options).toHaveLength(2);
      expect(options[0]).toMatchObject({
        code: 'A',
        markets: ['FR'],
        campaign_start: '2027-05-01',
        campaign_end: '2027-05-07',
      });
      expect(options[1]).toMatchObject({
        code: 'B',
        markets: ['FR'],
        campaign_start: '2027-05-01',
        campaign_end: '2027-05-14',
      });
      const linesA = options[0]!.lines as Array<Record<string, unknown>>;
      expect(linesA).toHaveLength(1);
      expect(linesA[0]).toMatchObject({ support_id: 'CRM-03', quantity: 1 });
      const linesB = options[1]!.lines as Array<Record<string, unknown>>;
      expect(linesB[0]).toMatchObject({ support_id: 'CRM-03', quantity: 2 });

      // Solo el descuento MANUAL sobrevive; el de VOLUME se recalcula solo.
      expect(options[0]!.discounts).toEqual([{ kind: 'MANUAL', rate: 0.1, reason: 'Cliente recurrente' }]);

      expect(result.newProposalId).toBe('p2');
      // Nunca hereda el número del original: el original ni siquiera se lee
      // (duplicateProposal no selecciona proposal_number del presupuesto de
      // origen) — el número nuevo sale exclusivamente de la respuesta de
      // create_and_send_proposal.
      expect(result.newProposalNumber).toBe('2026-002');
      expect(result.newProposalNumber).not.toBe('2026-001');

      expect(revalidatePath).toHaveBeenCalledWith('/proposals');
      expect(revalidatePath).toHaveBeenCalledWith('/accounts/acc1');
    },
  );

  it('recalcula con los parámetros VIVOS: el coste que se manda a create_and_send_proposal no es el congelado', async () => {
    maybeSingleProposal.mockResolvedValue({ data: frozenProposal(), error: null });
    rpc.mockResolvedValue({ data: { proposal_id: 'p2', proposal_number: '2026-002' }, error: null });

    await duplicateProposal('p1');

    const [, { payload }] = rpc.mock.calls[0] as [string, { payload: { options: Array<Record<string, unknown>> } }];
    const lineA = (payload.options[0]!.lines as Array<Record<string, unknown>>)[0]!;

    // El coste congelado (999_999_999) nunca llega a create_and_send_proposal:
    // se recalculó con el motor real y los parámetros vivos.
    expect(lineA.cost_cents).not.toBe(999_999_999);

    // El valor recalculado coincide EXACTAMENTE con lo que el motor real
    // (priceOption, sin mocks) da para el mismo soporte/cantidad/mercado con
    // los parámetros vivos — no un número aproximado ni de memoria: CRM-03
    // no es media buy, así que su coste es (business+design horas) × tarifa
    // hora, sin coste externo.
    const expectedCostCents = Math.round(
      (DEFAULT_CATALOG.get('CRM-03')!.businessHours + DEFAULT_CATALOG.get('CRM-03')!.designHours) *
        DEFAULT_PRICING_PARAMETERS.hourlyRateCents,
    );
    expect(lineA.cost_cents).toBe(expectedCostCents);
  });

  it('con parámetros vivos distintos de los que produjeron el original, la copia refleja el cambio (p. ej. una tarifa hora nueva)', async () => {
    maybeSingleProposal.mockResolvedValue({ data: frozenProposal(), error: null });
    rpc.mockResolvedValue({ data: { proposal_id: 'p2', proposal_number: '2026-002' }, error: null });

    const higherRateCtx = {
      ...LIVE_CTX,
      parameters: { ...DEFAULT_PRICING_PARAMETERS, hourlyRateCents: 5000 },
    };
    loadPricingContext.mockResolvedValue(higherRateCtx);

    await duplicateProposal('p1');

    const [, { payload }] = rpc.mock.calls[0] as [string, { payload: { options: Array<Record<string, unknown>> } }];
    const lineA = (payload.options[0]!.lines as Array<Record<string, unknown>>)[0]!;

    const expectedCostCents = Math.round(
      (DEFAULT_CATALOG.get('CRM-03')!.businessHours + DEFAULT_CATALOG.get('CRM-03')!.designHours) * 5000,
    );
    expect(lineA.cost_cents).toBe(expectedCostCents);
    // Y sigue sin ser ni por casualidad el valor congelado del original.
    expect(lineA.cost_cents).not.toBe(999_999_999);
  });

  it('si el presupuesto original no tiene datos de opciones en frozen_snapshot, no llama a create_and_send_proposal', async () => {
    maybeSingleProposal.mockResolvedValue({ data: frozenProposal({ frozen_snapshot: null }), error: null });

    const result = await duplicateProposal('p1');

    expect(result.ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });
});
