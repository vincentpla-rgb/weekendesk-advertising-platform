import { describe, expect, it } from 'vitest';

import { buildProposalEmailContent } from './proposal-email.js';

const BASE = {
  advertiserName: 'Office de tourisme de Amiens',
  brief: 'Campaña de invierno, foco en escapadas de fin de semana.',
  publicUrl: 'https://weekendesk-advertising.vercel.app/p/abc123',
  validityDays: 14,
};

describe('buildProposalEmailContent', () => {
  it('incluye el brief, el enlace único y la validez en español', () => {
    const email = buildProposalEmailContent({ ...BASE, language: 'ES' });

    expect(email.subject).toContain('Office de tourisme de Amiens');
    expect(email.text).toContain(BASE.brief);
    expect(email.text).toContain(BASE.publicUrl);
    expect(email.text).toContain('14 días');
    expect(email.html).toContain(BASE.publicUrl);
    expect(email.html).toContain('14 días');
  });

  it('incluye la mención de IVA en español (única traducción aprobada, CLAUDE.md §7)', () => {
    const email = buildProposalEmailContent({ ...BASE, language: 'ES' });
    expect(email.text).toContain('inversión del sujeto pasivo');
  });

  it('omite la mención de IVA en idiomas sin traducción aprobada', () => {
    const email = buildProposalEmailContent({ ...BASE, language: 'FR' });
    expect(email.text).not.toContain('inversión del sujeto pasivo');
    expect(email.html).not.toContain('inversión del sujeto pasivo');
  });

  it('escribe el cuerpo en el idioma del cliente (francés)', () => {
    const email = buildProposalEmailContent({ ...BASE, language: 'FR' });
    expect(email.text).toContain('Bonjour,');
    expect(email.text).toContain('Voir la proposition');
  });

  it('omite la sección de brief cuando está vacío, sin dejar un hueco', () => {
    const email = buildProposalEmailContent({ ...BASE, brief: null, language: 'ES' });
    expect(email.html).not.toContain('Sobre la campaña');
  });

  it('escapa HTML del brief para no permitir inyección en la página del email', () => {
    const email = buildProposalEmailContent({
      ...BASE,
      brief: '<script>alert(1)</script>',
      language: 'ES',
    });
    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('&lt;script&gt;');
  });

  it('cae a inglés si el idioma no es uno de los cinco soportados', () => {
    const email = buildProposalEmailContent({ ...BASE, language: 'DE' as never });
    expect(email.text).toContain('Hello,');
  });
});
