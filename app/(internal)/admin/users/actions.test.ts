import { beforeEach, describe, expect, it, vi } from 'vitest';

const createUser = vi.fn();
const upsert = vi.fn();
const updateEq = vi.fn();
const update = vi.fn(() => ({ eq: updateEq }));
const deleteEq = vi.fn();
const del = vi.fn(() => ({ eq: deleteEq }));

const from = vi.fn((table: string) => {
  if (table === 'allowed_emails') return { upsert, delete: del };
  if (table === 'profiles') return { update };
  throw new Error(`tabla no mockeada: ${table}`);
});

const serviceClient = { auth: { admin: { createUser } }, from };

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => serviceClient),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const getUser = vi.fn();
const profilesSelectSingle = vi.fn();
const sessionClient = {
  auth: { getUser },
  from: vi.fn((table: string) => {
    if (table === 'profiles') {
      return { select: () => ({ eq: () => ({ single: profilesSelectSingle }) }) };
    }
    throw new Error(`tabla no mockeada en la sesión: ${table}`);
  }),
};
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => sessionClient),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Map([['x-forwarded-proto', 'https'], ['host', 'advertising.weekendesk.fr']])),
}));

const sendEmail = vi.fn();
vi.mock('@/lib/email/resend-client', () => ({ sendEmail }));

const { createTeamUser, removeTeamUser } = await import('./actions.js');

describe('createTeamUser', () => {
  beforeEach(() => {
    createUser.mockReset();
    upsert.mockReset();
    from.mockClear();
    getUser.mockReset();
    profilesSelectSingle.mockReset();
    sendEmail.mockReset();
    getUser.mockResolvedValue({ data: { user: { id: 'inviter-1' } } });
    profilesSelectSingle.mockResolvedValue({ data: { full_name: 'Vincent Pla' } });
    sendEmail.mockResolvedValue({ ok: true, id: 'email_1' });
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_EMAIL;
  });

  it(
    'crea el acceso con app_metadata.must_change_password = true (ronda 15, ajuste de seguridad): ' +
      'el admin genera la contraseña inicial, así que la conoce temporalmente — debe dejar de servir ' +
      'en cuanto la persona entra',
    async () => {
      createUser.mockResolvedValue({ error: null });
      upsert.mockResolvedValue({ error: null });

      const result = await createTeamUser({
        email: 'remi.challal@weekendesk.fr',
        fullName: 'Rémi Challal',
        password: 'una-contraseña-larga',
        note: '',
        inviteLanguage: 'FR',
      });

      expect(result).toEqual({ ok: true, alreadyExisted: false });
      expect(createUser).toHaveBeenCalledWith({
        email: 'remi.challal@weekendesk.fr',
        password: 'una-contraseña-larga',
        email_confirm: true,
        user_metadata: { full_name: 'Rémi Challal' },
        app_metadata: { must_change_password: true },
      });
    },
  );

  it(
    'guarda el idioma elegido al invitar en allowed_emails.invite_language (CLAUDE.md, ronda 17, ' +
      'bloque 3): decide el idioma del futuro email de invitación y se copia a profiles.preferred_language ' +
      'en el primer login',
    async () => {
      createUser.mockResolvedValue({ error: null });
      upsert.mockResolvedValue({ error: null });

      await createTeamUser({
        email: 'remi.challal@weekendesk.fr',
        fullName: 'Rémi Challal',
        password: 'una-contraseña-larga',
        note: '',
        inviteLanguage: 'FR',
      });

      expect(upsert).toHaveBeenCalledWith(
        { email: 'remi.challal@weekendesk.fr', full_name: 'Rémi Challal', note: null, invite_language: 'FR' },
        { onConflict: 'email' },
      );
    },
  );

  it(
    'app_metadata, no user_metadata: el flag de cambio obligatorio va donde el propio usuario no puede ' +
      'escribir con su sesión, para que solo cambiar la contraseña de verdad pueda apagarlo',
    async () => {
      createUser.mockResolvedValue({ error: null });
      upsert.mockResolvedValue({ error: null });

      await createTeamUser({ email: 'mario.martinez@weekendesk.fr', fullName: '', password: 'contraseñalarga', note: '', inviteLanguage: 'ES' });

      const call = createUser.mock.calls[0]![0];
      expect(call.app_metadata).toEqual({ must_change_password: true });
      expect(call.user_metadata).not.toHaveProperty('must_change_password');
    },
  );

  it('rechaza una contraseña inicial de menos de 8 caracteres sin llamar a Supabase', async () => {
    const result = await createTeamUser({ email: 'x@weekendesk.fr', fullName: '', password: 'corta', note: '', inviteLanguage: 'ES' });
    expect(result.ok).toBe(false);
    expect(createUser).not.toHaveBeenCalled();
  });

  it('rechaza un email inválido sin llamar a Supabase', async () => {
    const result = await createTeamUser({
      email: 'no-es-un-email',
      fullName: '',
      password: 'contraseñalarga',
      note: '',
      inviteLanguage: 'ES',
    });
    expect(result.ok).toBe(false);
    expect(createUser).not.toHaveBeenCalled();
  });

  it('marca alreadyExisted cuando el usuario ya existe en Supabase Auth, y sigue añadiéndolo a la lista blanca', async () => {
    createUser.mockResolvedValue({ error: { message: 'User already registered' } });
    upsert.mockResolvedValue({ error: null });

    const result = await createTeamUser({
      email: 'mario.martinez@weekendesk.fr',
      fullName: '',
      password: 'contraseñalarga',
      note: '',
      inviteLanguage: 'ES',
    });

    expect(result).toEqual({ ok: true, alreadyExisted: true });
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it('devuelve el error si falla la lista blanca después de crear el usuario', async () => {
    createUser.mockResolvedValue({ error: null });
    upsert.mockResolvedValue({ error: { message: 'boom' } });

    const result = await createTeamUser({
      email: 'nueva.persona@weekendesk.fr',
      fullName: '',
      password: 'contraseñalarga',
      note: '',
      inviteLanguage: 'ES',
    });

    expect(result.ok).toBe(false);
  });

  it(
    'manda el email 1 de invitación con RESEND_API_KEY/RESEND_FROM_EMAIL configuradas, ' +
      'en el idioma elegido al invitar y con el nombre de quien invita',
    async () => {
      process.env.RESEND_API_KEY = 'key';
      process.env.RESEND_FROM_EMAIL = 'advertising@weekendesk.fr';
      createUser.mockResolvedValue({ error: null });
      upsert.mockResolvedValue({ error: null });

      const result = await createTeamUser({
        email: 'remi.challal@weekendesk.fr',
        fullName: 'Rémi Challal',
        password: 'una-contraseña-larga',
        note: '',
        inviteLanguage: 'FR',
      });

      expect(result.ok).toBe(true);
      expect(sendEmail).toHaveBeenCalledTimes(1);
      const [emailInput] = sendEmail.mock.calls[0] as [{ to: string[]; subject: string; html: string }];
      expect(emailInput.to).toEqual(['remi.challal@weekendesk.fr']);
      expect(emailInput.subject).toContain('Vincent Pla');
      expect(emailInput.html).toContain('https://advertising.weekendesk.fr/login');
    },
  );

  it('sin RESEND_API_KEY/RESEND_FROM_EMAIL, no manda el email pero el alta sigue teniendo éxito', async () => {
    createUser.mockResolvedValue({ error: null });
    upsert.mockResolvedValue({ error: null });

    const result = await createTeamUser({
      email: 'remi.challal@weekendesk.fr',
      fullName: 'Rémi Challal',
      password: 'una-contraseña-larga',
      note: '',
      inviteLanguage: 'FR',
    });

    expect(result.ok).toBe(true);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('un fallo al mandar el email de invitación no tumba el alta (el acceso ya se creó de verdad)', async () => {
    process.env.RESEND_API_KEY = 'key';
    process.env.RESEND_FROM_EMAIL = 'advertising@weekendesk.fr';
    createUser.mockResolvedValue({ error: null });
    upsert.mockResolvedValue({ error: null });
    sendEmail.mockResolvedValue({ ok: false, error: 'Resend caído' });

    const result = await createTeamUser({
      email: 'remi.challal@weekendesk.fr',
      fullName: 'Rémi Challal',
      password: 'una-contraseña-larga',
      note: '',
      inviteLanguage: 'FR',
    });

    expect(result).toEqual({ ok: true, alreadyExisted: false });
  });
});

describe('removeTeamUser', () => {
  beforeEach(() => {
    deleteEq.mockReset();
    updateEq.mockReset();
    del.mockClear();
    update.mockClear();
  });

  it('quita de la lista blanca y desactiva el profiles si existe', async () => {
    deleteEq.mockResolvedValue({ error: null });
    updateEq.mockResolvedValue({ error: null });

    const result = await removeTeamUser('Remi.Challal@Weekendesk.fr');

    expect(result).toEqual({ ok: true });
    expect(deleteEq).toHaveBeenCalledWith('email', 'remi.challal@weekendesk.fr');
    expect(update).toHaveBeenCalledWith({ is_active: false });
    expect(updateEq).toHaveBeenCalledWith('email', 'remi.challal@weekendesk.fr');
  });

  it('devuelve el error si falla borrar de la lista blanca', async () => {
    deleteEq.mockResolvedValue({ error: { message: 'boom' } });

    const result = await removeTeamUser('remi.challal@weekendesk.fr');

    expect(result.ok).toBe(false);
    expect(updateEq).not.toHaveBeenCalled();
  });
});
