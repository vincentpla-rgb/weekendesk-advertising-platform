import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Cron diario (CLAUDE.md §9/§10.3, ronda 18, bloque 2, punto 7): recordatorio
 * de caducidad al cliente (email 10) + transición real a EXPIRED y aviso al
 * AM (email 11). Protegido con CRON_SECRET; la transición a EXPIRED corre
 * siempre, con o sin Resend configurado (es estado, no notificación).
 */

function makeBuilder(result: { data?: unknown; error?: unknown } = { data: null, error: null }) {
  const chainMethods = ['select', 'in', 'not', 'lte', 'gt', 'eq', 'update', 'insert'] as const;
  const obj: Record<string, unknown> = {};
  for (const m of chainMethods) {
    obj[m] = vi.fn(() => obj);
  }
  obj.then = (resolve: (value: { data?: unknown; error?: unknown }) => void) => Promise.resolve(result).then(resolve);
  return obj;
}

const sendEmail = vi.fn();
vi.mock('@/lib/email/resend-client', () => ({ sendEmail }));

const fromCalls: Record<string, number> = {};
let reminderCandidates: unknown[] = [];
let alreadyReminded: unknown[] = [];
let expiredCandidates: unknown[] = [];

const from = vi.fn((table: string) => {
  fromCalls[table] = (fromCalls[table] ?? 0) + 1;
  if (table === 'proposals') {
    if (fromCalls[table] === 1) return makeBuilder({ data: reminderCandidates, error: null });
    if (fromCalls[table] === 2) return makeBuilder({ data: expiredCandidates, error: null });
    return makeBuilder({ data: null, error: null }); // llamadas 3+: el update por cada candidato caducado
  }
  if (table === 'proposal_events') {
    if (fromCalls[table] === 1) return makeBuilder({ data: alreadyReminded, error: null });
    return makeBuilder({ data: null, error: null }); // inserts posteriores
  }
  throw new Error(`tabla no mockeada: ${table}`);
});

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => ({ from })),
}));

const { GET } = await import('./route.js');

function makeRequest(authorized = true) {
  const headers: Record<string, string> = {};
  if (authorized) headers.authorization = 'Bearer test-secret';
  return new Request('https://weekendesk-advertising.vercel.app/api/cron/daily-proposal-checks', { headers });
}

const REMINDER_CANDIDATE = {
  id: 'p1',
  proposal_number: '2026-014',
  public_token: 'tok1',
  language: 'FR',
  expires_at: new Date(Date.now() + 2 * 86_400_000).toISOString(),
  accounts: { legal_name: 'Destination Exemple' },
  contacts: { full_name: 'Camille Dupont', email: 'camille@example.com' },
  profiles: { full_name: 'Rémi Challal', email: 'remi@weekendesk.fr', preferred_language: 'FR' },
};

const EXPIRED_CANDIDATE = {
  id: 'p2',
  proposal_number: '2026-015',
  expires_at: new Date(Date.now() - 86_400_000).toISOString(),
  accounts: { legal_name: 'Office Test' },
  profiles: { full_name: 'Mario Martínez', email: 'mario@weekendesk.fr', preferred_language: 'ES' },
};

describe('GET /api/cron/daily-proposal-checks', () => {
  beforeEach(() => {
    for (const key of Object.keys(fromCalls)) delete fromCalls[key];
    from.mockClear();
    sendEmail.mockReset();
    sendEmail.mockResolvedValue({ ok: true, id: 'resend-x' });
    reminderCandidates = [];
    alreadyReminded = [];
    expiredCandidates = [];
    process.env.CRON_SECRET = 'test-secret';
    process.env.RESEND_API_KEY = 'key';
    process.env.RESEND_FROM_EMAIL = 'advertising@weekendesk.fr';
  });

  it('rechaza sin el CRON_SECRET correcto, sin tocar la base de datos', async () => {
    const response = await GET(makeRequest(false));
    expect(response.status).toBe(401);
    expect(from).not.toHaveBeenCalled();
  });

  it('manda el recordatorio (email 10) a un presupuesto que caduca dentro de la ventana, y registra el evento', async () => {
    reminderCandidates = [REMINDER_CANDIDATE];

    const response = await GET(makeRequest());
    const body = await response.json();

    expect(body.remindersSent).toBe(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0]![0].to).toEqual(['camille@example.com']);
  });

  it('no repite el recordatorio si ya hay un evento reminder_sent para ese presupuesto', async () => {
    reminderCandidates = [REMINDER_CANDIDATE];
    alreadyReminded = [{ proposal_id: 'p1' }];

    const response = await GET(makeRequest());
    const body = await response.json();

    expect(body.remindersSent).toBe(0);
  });

  it('transiciona a EXPIRED y manda el aviso al AM (email 11)', async () => {
    expiredCandidates = [EXPIRED_CANDIDATE];

    const response = await GET(makeRequest());
    const body = await response.json();

    expect(body.expired).toBe(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0]![0].to).toEqual(['mario@weekendesk.fr']);
  });

  it('sin RESEND_API_KEY/RESEND_FROM_EMAIL: la transición a EXPIRED corre igual, solo se omiten los emails', async () => {
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_EMAIL;
    reminderCandidates = [REMINDER_CANDIDATE];
    expiredCandidates = [EXPIRED_CANDIDATE];

    const response = await GET(makeRequest());
    const body = await response.json();

    expect(body.expired).toBe(1);
    expect(body.remindersSent).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
