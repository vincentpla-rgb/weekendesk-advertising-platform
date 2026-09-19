import { describe, expect, it } from 'vitest';

import { buildConfirmUrl } from './confirm-url.js';

describe('buildConfirmUrl', () => {
  it('construye /auth/confirm con token_hash, type y next a partir de una redirect_to absoluta', () => {
    const url = buildConfirmUrl({
      token_hash: 'abc123',
      redirect_to: 'https://weekendesk-advertising.vercel.app/proposals/new',
      email_action_type: 'magiclink',
      site_url: 'https://weekendesk-advertising.vercel.app',
    });

    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe('https://weekendesk-advertising.vercel.app/auth/confirm');
    expect(parsed.searchParams.get('token_hash')).toBe('abc123');
    expect(parsed.searchParams.get('type')).toBe('magiclink');
    expect(parsed.searchParams.get('next')).toBe('/proposals/new');
  });

  it('usa site_url como base aunque redirect_to apunte a otro origen', () => {
    const url = buildConfirmUrl({
      token_hash: 'abc123',
      redirect_to: 'https://otra-cosa.example.com/x',
      email_action_type: 'magiclink',
      site_url: 'https://weekendesk-advertising.vercel.app',
    });

    expect(url.startsWith('https://weekendesk-advertising.vercel.app/auth/confirm')).toBe(true);
  });

  it('no revienta si redirect_to no es una URL absoluta', () => {
    const url = buildConfirmUrl({
      token_hash: 'abc123',
      redirect_to: '/proposals/new',
      email_action_type: 'magiclink',
      site_url: 'https://weekendesk-advertising.vercel.app',
    });

    const parsed = new URL(url);
    expect(parsed.searchParams.get('next')).toBe('/proposals/new');
  });
});
