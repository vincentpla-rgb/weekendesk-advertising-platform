import { beforeEach, describe, expect, it, vi } from 'vitest';

const getUser = vi.fn();
const updateUser = vi.fn();
const updateUserById = vi.fn();

const sessionClient = { auth: { getUser, updateUser } };
const serviceClient = { auth: { admin: { updateUserById } } };

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => sessionClient),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => serviceClient),
}));

const { changePassword } = await import('./actions.js');

describe('changePassword', () => {
  beforeEach(() => {
    getUser.mockReset();
    updateUser.mockReset();
    updateUserById.mockReset();
  });

  it('rechaza una contraseña de menos de 8 caracteres sin tocar Supabase', async () => {
    const result = await changePassword('corta1');

    expect(result.ok).toBe(false);
    expect(getUser).not.toHaveBeenCalled();
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('rechaza si no hay sesión, sin intentar cambiar nada', async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const result = await changePassword('una-contraseña-larga');

    expect(result.ok).toBe(false);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it(
    'cambia la contraseña con la sesión del propio usuario y apaga must_change_password en ' +
      'app_metadata con la clave de servicio, nunca al revés',
    async () => {
      getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
      updateUser.mockResolvedValue({ error: null });
      updateUserById.mockResolvedValue({ error: null });

      const result = await changePassword('una-contraseña-larga');

      expect(result).toEqual({ ok: true });
      expect(updateUser).toHaveBeenCalledWith({ password: 'una-contraseña-larga' });
      expect(updateUserById).toHaveBeenCalledWith('user-1', {
        app_metadata: { must_change_password: false },
      });
    },
  );

  it(
    'nunca manda `data` (user_metadata) al cambiar la contraseña con la sesión propia — el usuario no ' +
      'puede escribir app_metadata con su propia sesión, por diseño (ver comentario de seguridad)',
    async () => {
      getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
      updateUser.mockResolvedValue({ error: null });
      updateUserById.mockResolvedValue({ error: null });

      await changePassword('una-contraseña-larga');

      const call = updateUser.mock.calls[0]![0];
      expect(call).not.toHaveProperty('data');
      expect(call).not.toHaveProperty('app_metadata');
    },
  );

  it('devuelve el error de Supabase si falla el cambio de contraseña, sin tocar app_metadata', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    updateUser.mockResolvedValue({ error: { message: 'Password should be at least 6 characters' } });

    const result = await changePassword('una-contraseña-larga');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('Password should be at least 6 characters');
    }
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it(
    'si la contraseña cambia pero falla apagar app_metadata, lo deja explícito: la contraseña ya cambió, ' +
      'no se pierde ni se muestra como si nada hubiera pasado',
    async () => {
      getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
      updateUser.mockResolvedValue({ error: null });
      updateUserById.mockResolvedValue({ error: { message: 'boom' } });

      const result = await changePassword('una-contraseña-larga');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Contraseña actualizada');
        expect(result.error).toContain('boom');
      }
    },
  );
});
