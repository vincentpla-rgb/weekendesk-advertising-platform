import { describe, expect, it } from 'vitest';

import { buildCounterProposalAcceptedClientEmailContent } from './counter-proposal-accepted-client-email.js';

const BASE = {
  contactFullName: 'Marie Dupont',
  proposalNumber: '2026-014',
};

describe('buildCounterProposalAcceptedClientEmailContent', () => {
  it('selecciona la plantilla en español y usa el primer nombre del contacto', () => {
    const email = buildCounterProposalAcceptedClientEmailContent({ ...BASE, language: 'ES' });

    expect(email.subject).toBe('Hemos aceptado tu propuesta — 2026-014');
    expect(email.text).toContain('Hola Marie:');
    expect(email.html).toContain('Hola Marie:');
  });

  it('funciona en los 5 idiomas de cara al cliente y siempre incluye el número de presupuesto', () => {
    for (const language of ['ES', 'EN', 'FR', 'IT', 'NL'] as const) {
      const email = buildCounterProposalAcceptedClientEmailContent({ ...BASE, language });
      expect(email.subject).toContain(BASE.proposalNumber);
      expect(email.text.length).toBeGreaterThan(0);
      expect(email.html).toContain('<!doctype html>');
    }
  });

  it('cae a inglés para un idioma no soportado', () => {
    const email = buildCounterProposalAcceptedClientEmailContent({ ...BASE, language: 'XX' as never });
    expect(email.text).toContain('Dear Marie,');
  });

  it('nunca menciona precios ni IVA (mismo criterio que el resto de emails de cara al cliente)', () => {
    for (const language of ['ES', 'EN', 'FR', 'IT', 'NL'] as const) {
      const email = buildCounterProposalAcceptedClientEmailContent({ ...BASE, language });
      for (const term of ['IVA', 'TVA', 'BTW', 'VAT', '€']) {
        expect(email.text).not.toContain(term);
      }
    }
  });
});
