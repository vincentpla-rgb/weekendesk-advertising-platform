import { describe, expect, it, vi } from 'vitest';

import { defaultFullName, resolveTeamAccess, type TeamAccessGateway } from './team-access.js';

/**
 * Gateway en memoria: mismo contrato que el real (`createSupabaseTeamAccessGateway`)
 * sin tocar Supabase, para poder reproducir el bug de acceso sin una base de
 * datos real (CLAUDE.md §10.1.1: no hay proyecto Supabase conectado en este
 * entorno).
 *
 * `createProfile` simula la restricción `profiles.full_name NOT NULL` de la
 * migración inicial: si no le llega un `fullName` no vacío, se comporta
 * exactamente como Postgres — rechaza el insert con el mismo mensaje de error.
 */
function fakeGateway(state: {
  profiles: Map<string, { isActive: boolean }>;
  allowedEmails: Map<string, { fullName: string | null }>;
}): TeamAccessGateway {
  return {
    async getProfile(userId) {
      return state.profiles.get(userId) ?? null;
    },
    async getAllowedEmail(email) {
      return state.allowedEmails.get(email) ?? null;
    },
    async createProfile({ id, fullName }) {
      if (!fullName) {
        return {
          ok: false,
          error: 'null value in column "full_name" of relation "profiles" violates not-null constraint',
        };
      }
      state.profiles.set(id, { isActive: true });
      return { ok: true };
    },
  };
}

describe('resolveTeamAccess', () => {
  it(
    'reproduce el bug reportado: allowed_emails sin nombre y sin valor por defecto ' +
      'viola el NOT NULL de profiles.full_name y el usuario se queda fuera',
    async () => {
      const gateway = fakeGateway({
        profiles: new Map(),
        allowedEmails: new Map([['vincent.pla@weekendesk.fr', { fullName: null }]]),
      });

      const authorized = await resolveTeamAccess(
        gateway,
        { id: 'user-1', email: 'vincent.pla@weekendesk.fr' },
        () => {},
      );

      expect(authorized).toBe(true);
    },
  );

  it('deriva un nombre del email cuando allowed_emails no tiene full_name', async () => {
    const state = {
      profiles: new Map(),
      allowedEmails: new Map([['vincent.pla@weekendesk.fr', { fullName: null }]]),
    };
    const gateway = fakeGateway(state);

    await resolveTeamAccess(gateway, { id: 'user-1', email: 'vincent.pla@weekendesk.fr' }, () => {});

    expect(state.profiles.get('user-1')).toEqual({ isActive: true });
  });

  it('usa el full_name de allowed_emails cuando existe, en vez de derivarlo', async () => {
    const created: { fullName: string }[] = [];
    const gateway: TeamAccessGateway = {
      async getProfile() {
        return null;
      },
      async getAllowedEmail() {
        return { fullName: 'Vincent Pla' };
      },
      async createProfile({ fullName }) {
        created.push({ fullName });
        return { ok: true };
      },
    };

    await resolveTeamAccess(gateway, { id: 'user-1', email: 'vincent.pla@weekendesk.fr' });

    expect(created).toEqual([{ fullName: 'Vincent Pla' }]);
  });

  it('registra el error real de un fallo de creación en vez de perderlo en silencio', async () => {
    const gateway: TeamAccessGateway = {
      async getProfile() {
        return null;
      },
      async getAllowedEmail() {
        return { fullName: 'Vincent Pla' };
      },
      async createProfile() {
        return { ok: false, error: 'la conexión con la base de datos ha caducado' };
      },
    };
    const log = vi.fn();

    const authorized = await resolveTeamAccess(gateway, { id: 'user-1', email: 'vincent.pla@weekendesk.fr' }, log);

    expect(authorized).toBe(false);
    expect(log).toHaveBeenCalledTimes(1);
    const [message] = log.mock.calls[0] as [string];
    expect(message).toContain('la conexión con la base de datos ha caducado');
    expect(message).toContain('no porque no esté autorizado');
  });

  it('compara el email en minúsculas: allowed_emails guarda siempre en minúsculas', async () => {
    const gateway = fakeGateway({
      profiles: new Map(),
      allowedEmails: new Map([['vincent.pla@weekendesk.fr', { fullName: 'Vincent Pla' }]]),
    });

    const authorized = await resolveTeamAccess(gateway, {
      id: 'user-1',
      email: 'Vincent.Pla@Weekendesk.fr',
    });

    expect(authorized).toBe(true);
  });

  it('rechaza un email que no está en la lista blanca y no crea perfil', async () => {
    const state = { profiles: new Map(), allowedEmails: new Map() };
    const gateway = fakeGateway(state);

    const authorized = await resolveTeamAccess(gateway, {
      id: 'user-2',
      email: 'desconocido@weekendesk.fr',
    });

    expect(authorized).toBe(false);
    expect(state.profiles.has('user-2')).toBe(false);
  });

  it('respeta un perfil desactivado a mano, aunque el email siga en allowed_emails', async () => {
    const gateway = fakeGateway({
      profiles: new Map([['user-3', { isActive: false }]]),
      allowedEmails: new Map([['ex-empleado@weekendesk.fr', { fullName: 'Ex Empleado' }]]),
    });

    const authorized = await resolveTeamAccess(gateway, {
      id: 'user-3',
      email: 'ex-empleado@weekendesk.fr',
    });

    expect(authorized).toBe(false);
  });

  it('deja entrar a un perfil ya existente y activo sin volver a mirar allowed_emails', async () => {
    const gateway = fakeGateway({
      profiles: new Map([['user-4', { isActive: true }]]),
      allowedEmails: new Map(),
    });

    const authorized = await resolveTeamAccess(gateway, {
      id: 'user-4',
      email: 'rémi.challal@weekendesk.fr',
    });

    expect(authorized).toBe(true);
  });
});

describe('defaultFullName', () => {
  it('separa nombre y apellido por puntos, guiones o guiones bajos y los capitaliza', () => {
    expect(defaultFullName('vincent.pla@weekendesk.fr')).toBe('Vincent Pla');
    expect(defaultFullName('remi-challal@weekendesk.fr')).toBe('Remi Challal');
    expect(defaultFullName('mario_martinez@weekendesk.fr')).toBe('Mario Martinez');
  });

  it('capitaliza también un local-part de una sola palabra', () => {
    expect(defaultFullName('vincent@weekendesk.fr')).toBe('Vincent');
  });
});
