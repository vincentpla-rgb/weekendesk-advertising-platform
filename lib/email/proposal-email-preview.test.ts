import { describe, expect, it, vi } from 'vitest';

import { buildProposalEmailContent } from './proposal-email.js';
import {
  buildDraftProposalEmailPreview,
  DRAFT_EMAIL_PREVIEW_PROPOSAL_NUMBER,
  DRAFT_EMAIL_PREVIEW_PUBLIC_URL,
} from './proposal-email-preview.js';

const BASE = {
  advertiserName: 'Office de tourisme de Amiens',
  contactFullName: 'Marie Dupont',
  brief: 'Campaña de invierno, foco en escapadas de fin de semana.',
  numberOfOptions: 2,
  salesName: 'Vincent Pla',
  offerValidityDays: 14,
};

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

describe('buildDraftProposalEmailPreview', () => {
  // El punto central pedido por Vincent: "tests que confirmen que la vista
  // previa usa exactamente la misma plantilla y lógica de idioma que el
  // envío real, para que no puedan divergir". Se comprueba por construcción,
  // no por coincidencia: llamando a buildProposalEmailContent (la función
  // que también usa app/api/proposals/route.ts) con los mismos campos, más
  // los dos placeholders exactos que sustituyen a publicUrl/proposalNumber,
  // el resultado tiene que ser IDÉNTICO byte a byte — cualquier divergencia
  // futura entre los dos caminos rompería este test.
  describe.each(['ES', 'FR', 'IT', 'NL', 'EN'] as const)('idioma %s', (language) => {
    it('delega en buildProposalEmailContent con los placeholders de borrador', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-09-25T10:00:00.000Z'));

      const preview = buildDraftProposalEmailPreview({ ...BASE, language });

      const expiresAtIso = new Date(Date.now() + BASE.offerValidityDays * 86_400_000).toISOString();
      const expected = buildProposalEmailContent({
        advertiserName: BASE.advertiserName,
        contactFullName: BASE.contactFullName,
        brief: BASE.brief,
        numberOfOptions: BASE.numberOfOptions,
        publicUrl: DRAFT_EMAIL_PREVIEW_PUBLIC_URL,
        expiresAtIso,
        salesName: BASE.salesName,
        proposalNumber: DRAFT_EMAIL_PREVIEW_PROPOSAL_NUMBER,
        language,
      });

      expect(preview).toEqual(expected);

      vi.useRealTimers();
    });

    it('nunca menciona el IVA, igual que el email real (confirmado explícitamente por el usuario)', () => {
      const preview = buildDraftProposalEmailPreview({ ...BASE, language });
      for (const lead of VAT_LEADS) {
        expect(preview.text.toLowerCase()).not.toContain(lead.toLowerCase());
        expect(preview.html.toLowerCase()).not.toContain(lead.toLowerCase());
      }
    });

    it('nunca menciona ningún precio, igual que el email real', () => {
      const preview = buildDraftProposalEmailPreview({ ...BASE, language });
      for (const lead of ['€', 'EUR', 'desde', 'Total']) {
        expect(preview.text).not.toContain(lead);
        expect(preview.html).not.toContain(lead);
      }
    });
  });

  it('usa marcadores de posición honestos para el enlace público y el número de presupuesto', () => {
    const preview = buildDraftProposalEmailPreview({ ...BASE, language: 'ES' });

    expect(preview.text).toContain(DRAFT_EMAIL_PREVIEW_PUBLIC_URL);
    expect(preview.html).toContain(DRAFT_EMAIL_PREVIEW_PUBLIC_URL);
    expect(preview.text).toContain(DRAFT_EMAIL_PREVIEW_PROPOSAL_NUMBER);
    expect(preview.html).toContain(DRAFT_EMAIL_PREVIEW_PROPOSAL_NUMBER);

    // No deben parecer un token público real (48 hex) ni un número de
    // presupuesto real (<año>-NNN, CLAUDE.md §10.3 octies) — para que nadie
    // los confunda con datos reales si copia la vista previa.
    expect(DRAFT_EMAIL_PREVIEW_PUBLIC_URL).not.toMatch(/\/p\/[0-9a-f]{48}$/);
    expect(DRAFT_EMAIL_PREVIEW_PROPOSAL_NUMBER).not.toMatch(/^\d{4}-\d{3}$/);
  });

  it('respeta la validez de la oferta configurada (CLAUDE.md §7) al calcular la fecha de caducidad', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    const preview = buildDraftProposalEmailPreview({ ...BASE, offerValidityDays: 14, language: 'ES' });
    expect(preview.text).toContain('15 de enero de 2026');

    vi.useRealTimers();
  });

  it('funciona con un brief vacío, sin dejar un hueco ni un "null"', () => {
    const preview = buildDraftProposalEmailPreview({ ...BASE, brief: null, language: 'ES' });
    expect(preview.text).not.toContain('null');
    expect(preview.html).not.toContain('null');
  });

  it('funciona con una sola opción todavía en construcción (borrador sin las 2-3 opciones finales)', () => {
    const preview = buildDraftProposalEmailPreview({ ...BASE, numberOfOptions: 1, language: 'ES' });
    expect(preview.text).toContain('con 1 fórmula entre la que elegir');
  });
});
