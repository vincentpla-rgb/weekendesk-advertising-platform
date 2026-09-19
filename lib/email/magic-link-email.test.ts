import { describe, expect, it } from 'vitest';

import { buildMagicLinkEmailContent } from './magic-link-email.js';

describe('buildMagicLinkEmailContent', () => {
  it('incluye el enlace en el texto y en el botón HTML', () => {
    const link = 'https://weekendesk-advertising.vercel.app/auth/confirm?token_hash=abc&type=magiclink&next=/proposals/new';
    const email = buildMagicLinkEmailContent(link);

    expect(email.text).toContain(link);
    expect(email.html).toContain(`href="${link}"`);
  });

  it('tiene un asunto en español, coherente con /login', () => {
    const email = buildMagicLinkEmailContent('https://example.com/auth/confirm');
    expect(email.subject.toLowerCase()).toContain('acceso');
  });
});
