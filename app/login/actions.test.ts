import { beforeEach, describe, expect, it, vi } from 'vitest';

const signInWithPassword = vi.fn();
const getUser = vi.fn();
const signOut = vi.fn();
const resolveTeamAccess = vi.fn();
const createSupabaseTeamAccessGateway = vi.fn(() => ({}));

// Objetos distintos y reconocibles a propósito: si loginWithPassword alguna
// vez construyera el gateway con el cliente de sesión en vez de con el de
// servicio (la dependencia circular de RLS de CLAUDE.md §10.3 — un usuario
// nuevo no puede leer su propia fila de allowed_emails con su propia
// sesión, reproducido contra un PostgreSQL 16 real en
// scripts/verify-rls-self-read.sh), este test lo detecta comparando qué
// objeto llega a createSupabaseTeamAccessGateway.
const sessionClient = { auth: { signInWithPassword, getUser, signOut } };
const serviceClient = { marker: 'service-role-client' };

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => sessionClient),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => serviceClient),
}));

// `resolveTeamAccess` en sí ya tiene su propia batería de tests
// (lib/supabase/team-access.test.ts) — aquí solo se comprueba que
// loginWithPassword la llama con lo correcto y actúa bien según su
// resultado, no se reimplementa esa lógica.
vi.mock('@/lib/supabase/team-access', () => ({
  createSupabaseTeamAccessGateway,
  resolveTeamAccess,
}));

const { loginWithPassword } = await import('./actions.js');

describe('loginWithPassword', () => {
  beforeEach(() => {
    signInWithPassword.mockReset();
    getUser.mockReset();
    signOut.mockReset();
    resolveTeamAccess.mockReset();
    createSupabaseTeamAccessGateway.mockClear();
  });

  it('rechaza credenciales incorrectas sin comprobar la lista blanca', async () => {
    signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } });

    const result = await loginWithPassword('vincent.pla@weekendesk.fr', 'mal');

    expect(result).toEqual({ ok: false, error: 'Email o contraseña incorrectos.' });
    expect(resolveTeamAccess).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });

  it('cierra la sesión y deniega el acceso si el email no está en la lista blanca', async () => {
    signInWithPassword.mockResolvedValue({ error: null });
    getUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'fuera@weekendesk.fr' } } });
    resolveTeamAccess.mockResolvedValue(false);

    const result = await loginWithPassword('fuera@weekendesk.fr', 'correcta');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('no tiene acceso');
    }
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('permite el acceso si el email está en la lista blanca, sin cerrar la sesión', async () => {
    signInWithPassword.mockResolvedValue({ error: null });
    getUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'vincent.pla@weekendesk.fr' } } });
    resolveTeamAccess.mockResolvedValue(true);

    const result = await loginWithPassword('vincent.pla@weekendesk.fr', 'correcta');

    expect(result).toEqual({ ok: true });
    expect(signOut).not.toHaveBeenCalled();
  });

  it('pasa el id y el email de la sesión recién creada a resolveTeamAccess', async () => {
    signInWithPassword.mockResolvedValue({ error: null });
    getUser.mockResolvedValue({ data: { user: { id: 'user-42', email: 'mario.martinez@weekendesk.fr' } } });
    resolveTeamAccess.mockResolvedValue(true);

    await loginWithPassword('mario.martinez@weekendesk.fr', 'correcta');

    expect(resolveTeamAccess).toHaveBeenCalledWith(
      expect.anything(),
      { id: 'user-42', email: 'mario.martinez@weekendesk.fr' },
    );
  });

  it('no revienta si signInWithPassword tiene éxito pero no hay usuario en la sesión', async () => {
    signInWithPassword.mockResolvedValue({ error: null });
    getUser.mockResolvedValue({ data: { user: null } });

    const result = await loginWithPassword('vincent.pla@weekendesk.fr', 'correcta');

    expect(result.ok).toBe(false);
    expect(resolveTeamAccess).not.toHaveBeenCalled();
  });

  it(
    'construye el gateway de la lista blanca con el cliente de SERVICIO, nunca con el de sesión ' +
      '(la dependencia circular de RLS solo se evita así, CLAUDE.md §10.3)',
    async () => {
      signInWithPassword.mockResolvedValue({ error: null });
      getUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'vincent.pla@weekendesk.fr' } } });
      resolveTeamAccess.mockResolvedValue(true);

      await loginWithPassword('vincent.pla@weekendesk.fr', 'correcta');

      expect(createSupabaseTeamAccessGateway).toHaveBeenCalledTimes(1);
      expect(createSupabaseTeamAccessGateway).toHaveBeenCalledWith(serviceClient);
      expect(createSupabaseTeamAccessGateway).not.toHaveBeenCalledWith(sessionClient);
    },
  );
});
