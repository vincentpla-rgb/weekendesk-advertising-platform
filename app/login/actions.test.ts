import { beforeEach, describe, expect, it, vi } from 'vitest';

const signInWithPassword = vi.fn();
const getUser = vi.fn();
const signOut = vi.fn();
const resolveTeamAccess = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { signInWithPassword, getUser, signOut },
  })),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => ({})),
}));

// `resolveTeamAccess` en sí ya tiene su propia batería de tests
// (lib/supabase/team-access.test.ts) — aquí solo se comprueba que
// loginWithPassword la llama con lo correcto y actúa bien según su
// resultado, no se reimplementa esa lógica.
vi.mock('@/lib/supabase/team-access', () => ({
  createSupabaseTeamAccessGateway: vi.fn(() => ({})),
  resolveTeamAccess,
}));

const { loginWithPassword } = await import('./actions.js');

describe('loginWithPassword', () => {
  beforeEach(() => {
    signInWithPassword.mockReset();
    getUser.mockReset();
    signOut.mockReset();
    resolveTeamAccess.mockReset();
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
});
