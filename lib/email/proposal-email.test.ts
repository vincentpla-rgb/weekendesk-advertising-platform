import { describe, expect, it } from 'vitest';

import { buildProposalEmailContent } from './proposal-email.js';

const BASE = {
  advertiserName: 'Office de tourisme de Amiens',
  contactFullName: 'Marie Dupont',
  brief: 'Campaña de invierno, foco en escapadas de fin de semana.',
  numberOfOptions: 3,
  publicUrl: 'https://weekendesk-advertising.vercel.app/p/abc123',
  expiresAtIso: '2026-10-03T00:00:00.000Z',
  salesName: 'Vincent Pla',
};

// Fragmentos que nunca deben aparecer en el cuerpo del email (reglas 1 y 2
// de CLAUDE.md §2/§5.2: sin mención de IVA, sin precios).
const PRICE_LEADS = ['€', 'EUR', 'precio', 'Precio', 'desde', 'total', 'Total', 'HT'];
const VAT_LEADS = [
  'IVA',
  'TVA',
  'BTW',
  'VAT',
  'sujeto pasivo',
  'assujetti',
  'reverse charge',
  'inversión del sujeto',
];

describe('buildProposalEmailContent', () => {
  it('selecciona la plantilla en español y usa el primer nombre del contacto', () => {
    const email = buildProposalEmailContent({ ...BASE, language: 'ES' });

    expect(email.subject).toBe('Propuesta de visibilidad Weekendesk — Office de tourisme de Amiens');
    expect(email.text).toContain('Hola Marie:');
    expect(email.text).toContain(BASE.brief);
    expect(email.text).toContain(BASE.publicUrl);
    expect(email.text).toContain('Vincent Pla');
  });

  it('selecciona la plantilla en francés en el idioma del cliente', () => {
    const email = buildProposalEmailContent({ ...BASE, language: 'FR' });
    expect(email.subject).toBe('Proposition de visibilité Weekendesk — Office de tourisme de Amiens');
    expect(email.text).toContain('Bonjour Marie,');
    expect(email.text).toContain('Bien cordialement,');
  });

  it('selecciona la plantilla en italiano', () => {
    const email = buildProposalEmailContent({ ...BASE, language: 'IT' });
    expect(email.subject).toBe('Proposta di visibilità Weekendesk — Office de tourisme de Amiens');
    expect(email.text).toContain('Gentile Marie,');
  });

  it('selecciona la plantilla en neerlandés', () => {
    const email = buildProposalEmailContent({ ...BASE, language: 'NL' });
    expect(email.subject).toBe('Zichtbaarheidsvoorstel Weekendesk — Office de tourisme de Amiens');
    expect(email.text).toContain('Beste Marie,');
  });

  it('selecciona la plantilla en inglés', () => {
    const email = buildProposalEmailContent({ ...BASE, language: 'EN' });
    expect(email.subject).toBe('Weekendesk visibility proposal — Office de tourisme de Amiens');
    expect(email.text).toContain('Dear Marie,');
  });

  it('cae a inglés si el idioma no es uno de los cinco soportados', () => {
    const email = buildProposalEmailContent({ ...BASE, language: 'DE' as never });
    expect(email.text).toContain('Dear Marie,');
  });

  it('el asunto lleva el anunciante, nunca el nombre de la campaña (regla 3)', () => {
    const email = buildProposalEmailContent({
      ...BASE,
      brief: 'Campaña "Navidad mágica en los Pirineos" — foco familias',
      language: 'ES',
    });
    expect(email.subject).not.toContain('Navidad mágica');
    expect(email.subject).toBe('Propuesta de visibilidad Weekendesk — Office de tourisme de Amiens');
  });

  describe.each(['ES', 'FR', 'IT', 'NL', 'EN'] as const)('regla 1 y 2 en %s', (language) => {
    it('no contiene ningún precio', () => {
      const email = buildProposalEmailContent({ ...BASE, language });
      for (const lead of PRICE_LEADS) {
        expect(email.text).not.toContain(lead);
        expect(email.html).not.toContain(lead);
      }
    });

    it('no contiene ninguna mención de IVA', () => {
      const email = buildProposalEmailContent({ ...BASE, language });
      for (const lead of VAT_LEADS) {
        expect(email.text.toLowerCase()).not.toContain(lead.toLowerCase());
        expect(email.html.toLowerCase()).not.toContain(lead.toLowerCase());
      }
    });
  });

  it('concuerda en singular cuando solo hay 1 opción (caso defensivo: CLAUDE.md exige 2–3 en producción)', () => {
    const es = buildProposalEmailContent({ ...BASE, numberOfOptions: 1, language: 'ES' });
    expect(es.text).toContain('con 1 fórmula entre la que elegir');
    expect(es.text).not.toContain('fórmulas');

    const fr = buildProposalEmailContent({ ...BASE, numberOfOptions: 1, language: 'FR' });
    expect(fr.text).toContain('1 formule au choix');
    expect(fr.text).not.toContain('formules');

    const it_ = buildProposalEmailContent({ ...BASE, numberOfOptions: 1, language: 'IT' });
    expect(it_.text).toContain('1 formula tra cui scegliere');

    const nl = buildProposalEmailContent({ ...BASE, numberOfOptions: 1, language: 'NL' });
    expect(nl.text).toContain('1 formule om uit te kiezen');
    expect(nl.text).not.toContain('formules');

    const en = buildProposalEmailContent({ ...BASE, numberOfOptions: 1, language: 'EN' });
    expect(en.text).toContain('1 package to choose from');
    expect(en.text).not.toContain('packages');
  });

  it('concuerda en plural con 2 y 3 opciones en cada idioma', () => {
    for (const n of [2, 3]) {
      expect(buildProposalEmailContent({ ...BASE, numberOfOptions: n, language: 'ES' }).text).toContain(
        `con ${n} fórmulas entre las que elegir`,
      );
      expect(buildProposalEmailContent({ ...BASE, numberOfOptions: n, language: 'FR' }).text).toContain(
        `${n} formules au choix`,
      );
      expect(buildProposalEmailContent({ ...BASE, numberOfOptions: n, language: 'IT' }).text).toContain(
        `${n} formule tra cui scegliere`,
      );
      expect(buildProposalEmailContent({ ...BASE, numberOfOptions: n, language: 'NL' }).text).toContain(
        `${n} formules om uit te kiezen`,
      );
      expect(buildProposalEmailContent({ ...BASE, numberOfOptions: n, language: 'EN' }).text).toContain(
        `${n} packages to choose from`,
      );
    }
  });

  it('omite el párrafo del brief cuando está vacío, sin dejar un hueco', () => {
    const email = buildProposalEmailContent({ ...BASE, brief: null, language: 'ES' });
    expect(email.text).not.toContain('null');
    expect(email.html).not.toContain('null');
  });

  it('escapa HTML del brief para no permitir inyección', () => {
    const email = buildProposalEmailContent({
      ...BASE,
      brief: '<script>alert(1)</script>',
      language: 'ES',
    });
    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('&lt;script&gt;');
  });

  it('formatea la fecha de caducidad en el idioma del cliente', () => {
    const es = buildProposalEmailContent({ ...BASE, language: 'ES' });
    expect(es.text).toContain('La propuesta es válida hasta el 3 de octubre de 2026.');

    const fr = buildProposalEmailContent({ ...BASE, language: 'FR' });
    expect(fr.text).toContain("Cette proposition est valable jusqu'au 3 octobre 2026.");

    const en = buildProposalEmailContent({ ...BASE, language: 'EN' });
    expect(en.text).toContain('This proposal is valid until 3 October 2026.');
  });

  it('el enlace único aparece tanto en texto plano como en el botón HTML', () => {
    const email = buildProposalEmailContent({ ...BASE, language: 'ES' });
    expect(email.text).toContain(BASE.publicUrl);
    expect(email.html).toContain(`href="${BASE.publicUrl}"`);
  });

  it('la firma usa el nombre del comercial y el departamento, sin cargo personal inventado', () => {
    const email = buildProposalEmailContent({ ...BASE, language: 'ES' });
    expect(email.text).toContain('Vincent Pla\nPublicidad\nWeekendesk SAS');

    const fr = buildProposalEmailContent({ ...BASE, language: 'FR' });
    expect(fr.text).toContain('Vincent Pla\nRégie publicitaire\nWeekendesk SAS');
  });
});
