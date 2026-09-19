import { describe, expect, it } from 'vitest';

import { buildLoginRedirectUrl } from './login-redirect.js';

describe('buildLoginRedirectUrl', () => {
  it('apunta siempre a /auth/callback, nunca directamente a la página destino (bug real corregido)', () => {
    const url = buildLoginRedirectUrl('https://weekendesk-advertising-platform.vercel.app', '/proposals/new');
    const parsed = new URL(url);

    expect(parsed.origin + parsed.pathname).toBe('https://weekendesk-advertising-platform.vercel.app/auth/callback');
    expect(parsed.searchParams.get('next')).toBe('/proposals/new');
  });

  it('usa el origin recibido como parámetro, no uno escrito a mano', () => {
    const url = buildLoginRedirectUrl('https://otro-origen.example.com', '/proposals/new');
    expect(url.startsWith('https://otro-origen.example.com/auth/callback')).toBe(true);
  });

  it('codifica el destino en next para que sobreviva como query param', () => {
    const url = buildLoginRedirectUrl('https://example.com', '/proposals/new?foo=bar');
    const parsed = new URL(url);
    expect(parsed.searchParams.get('next')).toBe('/proposals/new?foo=bar');
  });
});
