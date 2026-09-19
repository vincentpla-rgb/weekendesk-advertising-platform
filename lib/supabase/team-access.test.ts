import { describe, expect, it } from 'vitest';

import { resolveTeamAccess, type TeamAccessGateway } from './team-access.js';

/**
 * Gateway en memoria: mismo contrato que el real (`createSupabaseTeamAccessGateway`)
 * sin tocar Supabase, para poder reproducir el bug de acceso sin una base de
 * datos real (CLAUDE.md §10.1.1: no hay proyecto Supabase conectado en este
 * entorno).
 */
function fakeGateway(state: {
  profiles: Map<string, { isActive: boolean }>;
  allowedEmails: Set<string>;
}): TeamAccessGateway {
  return {
    async getProfile(userId) {
      return state.profiles.get(userId) ?? null;
    },
    async isEmailAllowed(email) {
      return state.allowedEmails.has(email);
    },
    async createProfile({ id, email: _email }) {
      state.profiles.set(id, { isActive: true });
      return true;
    },
  };
}

describe('resolveTeamAccess', () => {
  it(
    'reproduce el bug reportado: email en allowed_emails pero sin fila en profiles ' +
      'debía entrar y en su lugar se quedaba fuera para siempre',
    async () => {
      const gateway = fakeGateway({
        profiles: new Map(),
        allowedEmails: new Set(['vincent.pla@weekendesk.fr']),
      });

      const authorized = await resolveTeamAccess(gateway, {
        id: 'user-1',
        email: 'vincent.pla@weekendesk.fr',
      });

      expect(authorized).toBe(true);
    },
  );

  it('crea el profiles que falta la primera vez, para que las siguientes visitas no repitan el alta', async () => {
    const state = { profiles: new Map(), allowedEmails: new Set(['vincent.pla@weekendesk.fr']) };
    const gateway = fakeGateway(state);

    await resolveTeamAccess(gateway, { id: 'user-1', email: 'vincent.pla@weekendesk.fr' });

    expect(state.profiles.get('user-1')).toEqual({ isActive: true });
  });

  it('compara el email en minúsculas: allowed_emails guarda siempre en minúsculas', async () => {
    const gateway = fakeGateway({
      profiles: new Map(),
      allowedEmails: new Set(['vincent.pla@weekendesk.fr']),
    });

    const authorized = await resolveTeamAccess(gateway, {
      id: 'user-1',
      email: 'Vincent.Pla@Weekendesk.fr',
    });

    expect(authorized).toBe(true);
  });

  it('rechaza un email que no está en la lista blanca y no crea perfil', async () => {
    const state = { profiles: new Map(), allowedEmails: new Set<string>() };
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
      allowedEmails: new Set(['ex-empleado@weekendesk.fr']),
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
      allowedEmails: new Set(),
    });

    const authorized = await resolveTeamAccess(gateway, {
      id: 'user-4',
      email: 'rémi.challal@weekendesk.fr',
    });

    expect(authorized).toBe(true);
  });
});
