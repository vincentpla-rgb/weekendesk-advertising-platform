import { describe, expect, it } from 'vitest';

import { isPublicRoute, resolveAuthGateDecision } from './auth-gate.js';

describe('isPublicRoute', () => {
  it('reconoce las rutas públicas', () => {
    expect(isPublicRoute('/login')).toBe(true);
    expect(isPublicRoute('/auth/callback')).toBe(true);
    expect(isPublicRoute('/auth/signout')).toBe(true);
    expect(isPublicRoute('/p/abc123')).toBe(true);
    expect(isPublicRoute('/api/public/proposals/abc123/accept')).toBe(true);
    expect(isPublicRoute('/api/vies')).toBe(true);
    expect(isPublicRoute('/api/auth/send-email')).toBe(true);
  });

  it('no confunde una ruta interna con una pública', () => {
    expect(isPublicRoute('/proposals')).toBe(false);
    expect(isPublicRoute('/proposals/new')).toBe(false);
    expect(isPublicRoute('/admin/users')).toBe(false);
    expect(isPublicRoute('/api/proposals')).toBe(false);
    expect(isPublicRoute('/change-password')).toBe(false);
  });
});

describe('resolveAuthGateDecision', () => {
  it('sin sesión y ruta privada -> redirige a /login', () => {
    expect(
      resolveAuthGateDecision({ pathname: '/proposals', hasUser: false, mustChangePassword: false }),
    ).toEqual({ action: 'redirect', to: '/login' });
  });

  it('sin sesión y ruta pública -> deja pasar', () => {
    expect(resolveAuthGateDecision({ pathname: '/p/abc', hasUser: false, mustChangePassword: false })).toEqual({
      action: 'allow',
    });
  });

  it('con sesión, sin cambio de contraseña pendiente -> deja pasar cualquier ruta', () => {
    expect(
      resolveAuthGateDecision({ pathname: '/proposals/new', hasUser: true, mustChangePassword: false }),
    ).toEqual({ action: 'allow' });
  });

  it('con sesión y cambio de contraseña pendiente, página interna -> redirige a /change-password', () => {
    expect(
      resolveAuthGateDecision({ pathname: '/proposals/new', hasUser: true, mustChangePassword: true }),
    ).toEqual({ action: 'redirect', to: '/change-password' });
    expect(
      resolveAuthGateDecision({ pathname: '/admin/users', hasUser: true, mustChangePassword: true }),
    ).toEqual({ action: 'redirect', to: '/change-password' });
  });

  it('con sesión y cambio de contraseña pendiente, la propia pantalla de cambio -> deja pasar', () => {
    expect(
      resolveAuthGateDecision({ pathname: '/change-password', hasUser: true, mustChangePassword: true }),
    ).toEqual({ action: 'allow' });
  });

  it('con sesión y cambio de contraseña pendiente, ruta /api/* interna -> bloqueo JSON, nunca redirige', () => {
    expect(
      resolveAuthGateDecision({ pathname: '/api/proposals', hasUser: true, mustChangePassword: true }),
    ).toEqual({ action: 'block-json' });
  });

  it('con sesión y cambio de contraseña pendiente, ruta pública -> deja pasar (no la bloquea)', () => {
    // La pantalla pública del cliente, el signout y el resto de rutas
    // públicas no tienen nada que ver con la sesión de equipo: no se
    // interrumpen porque el admin todavía no haya cambiado su contraseña.
    expect(
      resolveAuthGateDecision({ pathname: '/p/abc123', hasUser: true, mustChangePassword: true }),
    ).toEqual({ action: 'allow' });
    expect(
      resolveAuthGateDecision({ pathname: '/auth/signout', hasUser: true, mustChangePassword: true }),
    ).toEqual({ action: 'allow' });
    expect(
      resolveAuthGateDecision({
        pathname: '/api/public/proposals/abc/accept',
        hasUser: true,
        mustChangePassword: true,
      }),
    ).toEqual({ action: 'allow' });
  });
});
