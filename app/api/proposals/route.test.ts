import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_CATALOG } from '@/src/pricing/catalog.js';
import { DEFAULT_PRICING_PARAMETERS } from '@/src/pricing/parameters.js';

/**
 * Guarda de regresión (CLAUDE.md §5.6, ronda 2 de correcciones): el idioma
 * del email de envío tiene que ser exactamente el mismo que el de la
 * pantalla pública — el "Idioma del cliente" que el comercial elige para
 * ESTE envío (`body.language`), no `contacts.language`. Ese último es un
 * dato persistente del contacto que puede arrastrar el idioma de un envío
 * anterior y desincronizarse silenciosamente del que se ve en `/p/[token]`.
 *
 * Se encontró así: `body.language` alimenta `proposals.language` (lo que lee
 * `get_public_proposal`), pero el email construía su copy con
 * `created.contact_language`, el valor de `contacts.language` devuelto por
 * `create_and_send_proposal` — dos campos distintos que, para un contacto ya
 * existente creado en un envío anterior en otro idioma, no tienen por qué
 * coincidir. No hay un test de integración de esta ruta completa (exige un
 * proyecto Supabase real, ver CLAUDE.md §10.1.2): esta prueba lee el código
 * fuente para que un futuro cambio no reintroduzca `contact_language` aquí
 * sin que salte algo.
 */
const SOURCE = readFileSync(fileURLToPath(new URL('./route.ts', import.meta.url)), 'utf-8');

describe('app/api/proposals/route.ts — idioma del email = idioma de la pantalla pública', () => {
  it('construye el email con body.language, no con contact_language', () => {
    expect(SOURCE).toMatch(/language:\s*body\.language/);
    expect(SOURCE).not.toContain('created.contact_language');
  });

  it('ya no pide contact_language al servidor: el email no depende del idioma persistido del contacto', () => {
    expect(SOURCE).not.toContain('contact_language');
  });
});

// =============================================================================
// Guarda de regresión de comportamiento (CLAUDE.md §10.3, ronda 4): el
// presupuesto (cuenta, contacto, opciones) tiene que persistir SIEMPRE que
// los datos sean válidos, incluso si Resend no está configurado. Se
// encontró en producción con `accounts` en 0 filas: la ruta comprobaba
// RESEND_API_KEY/RESEND_FROM_EMAIL ANTES de llamar a
// create_and_send_proposal y abortaba sin persistir nada si faltaban —
// nunca se llegaba a crear ni la cuenta ni el contacto. Verificado aparte,
// contra un PostgreSQL 16 real, que create_and_send_proposal en sí siempre
// insertó bien: el fallo estaba en que esta ruta no llegaba a llamarla.
// =============================================================================

const getUser = vi.fn();
const rpc = vi.fn();
const singleProfile = vi.fn();
const sendEmail = vi.fn();
const buildProposalEmailContent = vi.fn(() => ({ subject: 's', html: '<p>h</p>', text: 't' }));

// Cadena `.from('proposals').delete().eq('id', ...).eq('status', 'DRAFT')`
// (modo "Editar", CLAUDE.md §10.3 ter decies, ronda 13): mockeada aparte de
// select/single, para poder comprobar con qué columnas y valores se llama
// cada `.eq()` de la cadena.
const deleteEqStatus = vi.fn(async () => ({ error: null }));
const deleteEqId = vi.fn((_col: string, _val: string) => ({ eq: deleteEqStatus }));
const deleteMock = vi.fn(() => ({ eq: deleteEqId }));

const supabaseClient = {
  auth: { getUser },
  rpc,
  from: vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        single: singleProfile,
      })),
    })),
    delete: deleteMock,
  })),
};

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => supabaseClient),
}));

vi.mock('@/lib/pricing-context', () => ({
  loadPricingContext: vi.fn(async () => ({
    parameters: DEFAULT_PRICING_PARAMETERS,
    catalog: DEFAULT_CATALOG,
    holidays: [],
    offerValidityDays: 14,
  })),
}));

vi.mock('@/lib/email/resend-client', () => ({ sendEmail }));
vi.mock('@/lib/email/proposal-email', () => ({ buildProposalEmailContent }));

const { POST } = await import('./route.js');

function validBody() {
  return {
    accountId: null,
    newAccount: { legal_name: 'Office de tourisme Test', country_code: 'FR' },
    contactId: null,
    newContact: { full_name: 'Jean Dupont', email: 'jean@example.com', language: 'FR' },
    language: 'FR',
    brief: 'Campaña de prueba',
    options: [
      {
        code: 'A',
        name: 'Entrada',
        pitch: 'p',
        markets: ['FR'],
        campaignStart: null,
        campaignEnd: null,
        campaignDurationCount: null,
        campaignDurationUnit: null,
        lines: [{ supportId: 'ON-01', quantity: 1, mediaBudgetEuros: null, mediaMonths: null }],
        discounts: [],
        volumeDiscountDisabled: false,
        leadTimeOverrides: [],
      },
      {
        code: 'B',
        name: 'Amplia',
        pitch: 'p',
        markets: ['FR'],
        campaignStart: null,
        campaignEnd: null,
        campaignDurationCount: null,
        campaignDurationUnit: null,
        lines: [{ supportId: 'ON-01', quantity: 2, mediaBudgetEuros: null, mediaMonths: null }],
        discounts: [],
        volumeDiscountDisabled: false,
        leadTimeOverrides: [],
      },
    ],
  };
}

function request(body: unknown) {
  return new Request('http://localhost/api/proposals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/proposals — persiste aunque falte la configuración de Resend', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    getUser.mockReset();
    rpc.mockReset();
    singleProfile.mockReset();
    sendEmail.mockReset();
    deleteMock.mockClear();
    deleteEqId.mockClear();
    deleteEqStatus.mockClear();
    getUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'vincent.pla@weekendesk.fr' } } });
    singleProfile.mockResolvedValue({ data: { full_name: 'Vincent Pla' }, error: null });
    process.env = { ...originalEnv };
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_EMAIL;
  });

  it('llama a create_and_send_proposal (persiste cuenta/contacto/opciones) aunque falten las variables de Resend', async () => {
    rpc.mockImplementation(async (fn: string) => {
      if (fn === 'create_and_send_proposal') {
        return {
          data: {
            proposal_id: 'p1',
            proposal_number: '2026-001',
            public_token: 'tok123',
            contact_email: 'jean@example.com',
            contact_full_name: 'Jean Dupont',
            account_legal_name: 'Office de tourisme Test',
          },
          error: null,
        };
      }
      if (fn === 'log_proposal_send_failure') {
        return { data: null, error: null };
      }
      throw new Error(`rpc inesperado: ${fn}`);
    });

    const res = await POST(request(validBody()));

    // La llamada que persiste todo (cuenta, contacto, opciones, líneas) se
    // hizo — el bug real era que nunca se llegaba aquí.
    expect(rpc).toHaveBeenCalledWith('create_and_send_proposal', expect.anything());
    // Sin Resend configurado, se registra como fallo de envío, no se manda
    // el email, y el presupuesto se queda en DRAFT (no SENT).
    expect(rpc).toHaveBeenCalledWith('log_proposal_send_failure', expect.anything());
    expect(sendEmail).not.toHaveBeenCalled();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/se ha calculado y guardado/);
  });

  it('con Resend configurado, manda el email y marca el envío como SENT', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    process.env.RESEND_FROM_EMAIL = 'Weekendesk Advertising <onboarding@resend.dev>';

    rpc.mockImplementation(async (fn: string) => {
      if (fn === 'create_and_send_proposal') {
        return {
          data: {
            proposal_id: 'p1',
            proposal_number: '2026-001',
            public_token: 'tok123',
            contact_email: 'jean@example.com',
            contact_full_name: 'Jean Dupont',
            account_legal_name: 'Office de tourisme Test',
          },
          error: null,
        };
      }
      if (fn === 'mark_proposal_sent') {
        return { data: { expires_at: '2027-01-01', public_token: 'tok123' }, error: null };
      }
      throw new Error(`rpc inesperado: ${fn}`);
    });
    sendEmail.mockResolvedValue({ ok: true, id: 'resend-1' });

    const res = await POST(request(validBody()));

    expect(rpc).toHaveBeenCalledWith('create_and_send_proposal', expect.anything());
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('mark_proposal_sent', expect.anything());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.proposalNumber).toBe('2026-001');
    // Un envío normal (sin `replacesDraftId`) nunca borra nada.
    expect(deleteMock).not.toHaveBeenCalled();
  });
});

// =============================================================================
// CLAUDE.md §5.1, ronda 13: 1 a 3 opciones (antes 2-3 — exigir un mínimo de
// 2 era una validación de más, no una limitación real del modelo).
// =============================================================================

describe('POST /api/proposals — 1 a 3 opciones (ronda 13)', () => {
  beforeEach(() => {
    getUser.mockReset();
    rpc.mockReset();
    singleProfile.mockReset();
    sendEmail.mockReset();
    deleteMock.mockClear();
    deleteEqId.mockClear();
    deleteEqStatus.mockClear();
    getUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'vincent.pla@weekendesk.fr' } } });
    singleProfile.mockResolvedValue({ data: { full_name: 'Vincent Pla' }, error: null });
    process.env.RESEND_API_KEY = 'test-key';
    process.env.RESEND_FROM_EMAIL = 'Weekendesk Advertising <onboarding@resend.dev>';
    rpc.mockImplementation(async (fn: string) => {
      if (fn === 'create_and_send_proposal') {
        return {
          data: {
            proposal_id: 'p1',
            proposal_number: '2026-001',
            public_token: 'tok123',
            contact_email: 'jean@example.com',
            contact_full_name: 'Jean Dupont',
            account_legal_name: 'Office de tourisme Test',
          },
          error: null,
        };
      }
      if (fn === 'mark_proposal_sent') return { data: {}, error: null };
      throw new Error(`rpc inesperado: ${fn}`);
    });
    sendEmail.mockResolvedValue({ ok: true, id: 'resend-1' });
  });

  it('acepta un envío con una sola opción (ya no exige un mínimo de 2)', async () => {
    const body = validBody();
    const res = await POST(request({ ...body, options: [body.options[0]] }));
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('create_and_send_proposal', expect.anything());
  });

  it('rechaza un envío sin ninguna opción', async () => {
    const res = await POST(request({ ...validBody(), options: [] }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/entre 1 y 3/);
    expect(rpc).not.toHaveBeenCalledWith('create_and_send_proposal', expect.anything());
  });

  it('sigue rechazando más de 3 opciones', async () => {
    const body = validBody();
    const res = await POST(request({ ...body, options: [...body.options, body.options[0], body.options[0]] }));
    expect(res.status).toBe(400);
  });
});

// =============================================================================
// Modo "Editar" (CLAUDE.md §5.4, §10.3 ter decies, ronda 13): un presupuesto
// DRAFT que nunca llegó a enviarse con éxito se puede editar y reenviar. El
// borrador original se borra DESPUÉS de crear el reemplazo con éxito, nunca
// antes — si la creación fallara, no debe perderse ningún dato.
// =============================================================================

describe('POST /api/proposals — replacesDraftId (modo Editar, ronda 13)', () => {
  beforeEach(() => {
    getUser.mockReset();
    rpc.mockReset();
    singleProfile.mockReset();
    sendEmail.mockReset();
    deleteMock.mockClear();
    deleteEqId.mockClear();
    deleteEqStatus.mockClear();
    getUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'vincent.pla@weekendesk.fr' } } });
    singleProfile.mockResolvedValue({ data: { full_name: 'Vincent Pla' }, error: null });
    process.env.RESEND_API_KEY = 'test-key';
    process.env.RESEND_FROM_EMAIL = 'Weekendesk Advertising <onboarding@resend.dev>';
  });

  it('borra el borrador original después de crear el reemplazo con éxito', async () => {
    rpc.mockImplementation(async (fn: string) => {
      if (fn === 'create_and_send_proposal') {
        return {
          data: {
            proposal_id: 'p2',
            proposal_number: '2026-002',
            public_token: 'tok456',
            contact_email: 'jean@example.com',
            contact_full_name: 'Jean Dupont',
            account_legal_name: 'Office de tourisme Test',
          },
          error: null,
        };
      }
      if (fn === 'mark_proposal_sent') return { data: {}, error: null };
      throw new Error(`rpc inesperado: ${fn}`);
    });
    sendEmail.mockResolvedValue({ ok: true, id: 'resend-2' });

    const res = await POST(request({ ...validBody(), replacesDraftId: 'draft-1' }));

    expect(res.status).toBe(200);
    expect(deleteMock).toHaveBeenCalledTimes(1);
    expect(deleteEqId).toHaveBeenCalledWith('id', 'draft-1');
    expect(deleteEqStatus).toHaveBeenCalledWith('status', 'DRAFT');
  });

  it('si create_and_send_proposal falla, no intenta borrar nada (el borrador original no se pierde)', async () => {
    rpc.mockImplementation(async (fn: string) => {
      if (fn === 'create_and_send_proposal') {
        return { data: null, error: { message: 'conflicto de disponibilidad' } };
      }
      throw new Error(`rpc inesperado: ${fn}`);
    });

    const res = await POST(request({ ...validBody(), replacesDraftId: 'draft-1' }));

    expect(res.status).toBe(400);
    expect(deleteMock).not.toHaveBeenCalled();
  });
});
