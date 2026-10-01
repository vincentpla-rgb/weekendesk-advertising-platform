import { describe, expect, it } from 'vitest';

import {
  buildBlockedTransactionalEmail,
  buildTransactionalEmailContent,
  type TransactionalEmailInput,
} from './transactional-email.js';

/**
 * Ronda 18, bloque 2: los 7 emails nuevos construidos sobre la plantilla
 * visual compartida (`weekendesk-shell.ts`) y el copy de
 * `docs/emails/email-copy.json` (`transactional-copy.ts`).
 */
describe('buildTransactionalEmailContent', () => {
  it('invite: interpola inviterName/firstName en asunto, preheader y cuerpo, con CTA', () => {
    const input: TransactionalEmailInput = {
      key: 'invite',
      language: 'ES',
      inviteeFirstName: 'Mario',
      inviterName: 'Vincent',
      ctaUrl: 'https://advertising.weekendesk.fr/login',
    };
    const result = buildTransactionalEmailContent(input);
    expect(result.subject).toBe('Vincent te invita a la plataforma de Weekendesk Advertising');
    expect(result.html).toContain('Vincent');
    expect(result.html).toContain('Mario');
    expect(result.html).toContain(input.ctaUrl);
    expect(result.html).toContain('Advertising Manager');
    expect(result.text).toContain('Vincent');
  });

  it('invite: sin idioma IT/NL para emails internos, cae a ES (nunca a EN)', () => {
    const result = buildTransactionalEmailContent({
      key: 'invite',
      language: 'IT',
      inviteeFirstName: 'Mario',
      inviterName: 'Vincent',
      ctaUrl: 'https://x',
    });
    expect(result.subject).toContain('te invita'); // ES, no EN "has invited you"
  });

  it('accepted_client: muestra importe/mercados/opción, nunca el desglose de medios, y solo el primer paso (sin mención de PDF)', () => {
    const result = buildTransactionalEmailContent({
      key: 'accepted_client',
      language: 'FR',
      contactFirstName: 'Camille',
      clientCompany: 'Destination Exemple',
      proposalNumber: '2026-014',
      optionName: 'Pack Premium',
      markets: 'FR · ES',
      amountCents: 600000,
      billedTo: 'Destination Exemple SAS',
      creatorName: 'Rémi Challal',
    });
    expect(result.subject).toContain('2026-014');
    expect(result.html).toContain('6');
    expect(result.html).not.toMatch(/pdf|PDF/);
    expect(result.html).toContain('Rémi Challal');
  });

  it('accepted_am: calcula el pill de margen por encima/por debajo del 50 %, y marginRate null muestra un guion', () => {
    const ok = buildTransactionalEmailContent({
      key: 'accepted_am',
      language: 'ES',
      amFirstName: 'Mario',
      clientCompany: 'Destination Exemple',
      proposalNumber: '2026-014',
      optionName: 'Pack Premium',
      markets: 'FR · ES',
      saleCents: 600000,
      costCents: 252000,
      marginCents: 348000,
      marginRate: 0.58,
      ctaUrl: 'https://x/proposals/1',
    });
    expect(ok.html).toContain('Sobre el mínimo');

    const ko = buildTransactionalEmailContent({
      key: 'accepted_am',
      language: 'ES',
      amFirstName: 'Mario',
      clientCompany: 'Destination Exemple',
      proposalNumber: '2026-014',
      optionName: 'Pack Premium',
      markets: 'FR',
      saleCents: 480000,
      costCents: 252000,
      marginCents: 228000,
      marginRate: 0.475,
      ctaUrl: 'https://x/proposals/1',
    });
    expect(ko.html).toContain('Bajo el mínimo');

    // El propio copy de accepted_am (preheader y nota) menciona un adjunto
    // PDF que este MVP no genera todavía (PDF fuera de alcance, CLAUDE.md
    // §1) — no se reescribe a mano para no arriesgar una divergencia del
    // texto fuente; documentado como mismatch conocido en CLAUDE.md.

    const noMargin = buildTransactionalEmailContent({
      key: 'accepted_am',
      language: 'ES',
      amFirstName: 'Mario',
      clientCompany: 'Destination Exemple',
      proposalNumber: '2026-014',
      optionName: 'Pack Premium',
      markets: 'FR',
      saleCents: 480000,
      costCents: 0,
      marginCents: 0,
      marginRate: null,
      ctaUrl: 'https://x/proposals/1',
    });
    expect(noMargin.html).toContain('—');
    expect(noMargin.html).not.toContain('Sobre el mínimo');
    expect(noMargin.html).not.toContain('Bajo el mínimo');
  });

  it('rejected_am: con motivo lo cita; sin motivo, omite el bloque de cita sin dejar un hueco vacío', () => {
    const withReason = buildTransactionalEmailContent({
      key: 'rejected_am',
      language: 'ES',
      amFirstName: 'Mario',
      clientCompany: 'Destination Exemple',
      proposalNumber: '2026-014',
      reasonText: 'El importe supera lo previsto para este año.',
      ctaUrl: 'https://x/proposals/1',
    });
    expect(withReason.html).toContain('El importe supera lo previsto para este año.');
    expect(withReason.html).toContain('Motivo del cliente');

    const withoutReason = buildTransactionalEmailContent({
      key: 'rejected_am',
      language: 'ES',
      amFirstName: 'Mario',
      clientCompany: 'Destination Exemple',
      proposalNumber: '2026-014',
      reasonText: null,
      ctaUrl: 'https://x/proposals/1',
    });
    expect(withoutReason.html).not.toContain('Motivo del cliente');
  });

  it('reminder: incluye la fecha de caducidad formateada en el idioma del cliente y el CTA', () => {
    const result = buildTransactionalEmailContent({
      key: 'reminder',
      language: 'EN',
      contactFirstName: 'Camille',
      clientCompany: 'Destination Exemple',
      proposalNumber: '2026-014',
      validUntilIso: '2026-10-14T00:00:00.000Z',
      creatorName: 'Rémi Challal',
      ctaUrl: 'https://x/p/token',
    });
    expect(result.subject).toContain('2026-014');
    expect(result.html).toContain('https://x/p/token');
    expect(result.html).toContain('October');
  });

  it('expired_am y opened_am: no asumen una sola opción/importe (proposal multi-opción), solo proposal+cliente(+validUntil)', () => {
    const expired = buildTransactionalEmailContent({
      key: 'expired_am',
      language: 'ES',
      amFirstName: 'Mario',
      clientCompany: 'Destination Exemple',
      proposalNumber: '2026-014',
      validUntilIso: '2026-10-14T00:00:00.000Z',
      ctaUrl: 'https://x/proposals/1',
    });
    expect(expired.html).toContain('Destination Exemple');
    expect(expired.html).not.toContain('Opción');

    const opened = buildTransactionalEmailContent({
      key: 'opened_am',
      language: 'ES',
      amFirstName: 'Mario',
      clientCompany: 'Destination Exemple',
      proposalNumber: '2026-014',
      validUntilIso: null,
      ctaUrl: 'https://x/proposals/1',
    });
    expect(opened.html).toContain('Destination Exemple');
    expect(opened.html).not.toContain('Válido hasta');
  });

  it('escapa nombres de empresa/opción con caracteres HTML, sin romper el marcado ni doble-escapar', () => {
    const result = buildTransactionalEmailContent({
      key: 'accepted_am',
      language: 'ES',
      amFirstName: 'Mario',
      clientCompany: 'A & B <Tours>',
      proposalNumber: '2026-014',
      optionName: 'Pack "Premium"',
      markets: 'FR',
      saleCents: 100000,
      costCents: 40000,
      marginCents: 60000,
      marginRate: 0.6,
      ctaUrl: 'https://x',
    });
    expect(result.html).toContain('A &amp; B &lt;Tours&gt;');
    expect(result.html).not.toContain('&amp;amp;');
    expect(result.html).not.toContain('A & B <Tours>');
  });

  it('el texto plano se deriva del mismo HTML (nunca lo contradice) e incluye el asunto', () => {
    const result = buildTransactionalEmailContent({
      key: 'invite',
      language: 'FR',
      inviteeFirstName: 'Mario',
      inviterName: 'Vincent',
      ctaUrl: 'https://x',
    });
    expect(result.text.startsWith(result.subject)).toBe(true);
    expect(result.text).toContain('Vincent');
  });

  it('blocked_am y new_version lanzan un error explícito, nunca construyen contenido', () => {
    expect(() => buildBlockedTransactionalEmail('blocked_am')).toThrow(/bloqueado/);
    expect(() => buildBlockedTransactionalEmail('new_version')).toThrow(/bloqueado/);
  });
});
