import { describe, expect, it } from 'vitest';

import { buildCounterProposalRejectionEmailContent } from './counter-proposal-rejection-email.js';

const BASE = {
  advertiserName: 'Office de tourisme de Amiens',
  contactFullName: 'Marie Dupont',
  proposalNumber: '2026-014',
  reason: 'El precio propuesto no cubre el coste interno de la línea, ni con el descuento habitual.',
  salesName: 'Vincent Pla',
};

describe('buildCounterProposalRejectionEmailContent', () => {
  it('selecciona la plantilla en español, usa el primer nombre y no aplica la regla de §5.6', () => {
    const email = buildCounterProposalRejectionEmailContent({ ...BASE, language: 'ES' });

    expect(email.subject).toBe('Sobre tu propuesta — Office de tourisme de Amiens (2026-014)');
    expect(email.text).toContain('Hola Marie:');
    expect(email.text).toContain(BASE.reason);
    expect(email.text).toContain('Vincent Pla');
    expect(email.html).toContain(BASE.reason);
  });

  it('incluye el motivo del AM en las 5 plantillas de idioma, texto y HTML', () => {
    for (const language of ['ES', 'EN', 'FR', 'IT', 'NL'] as const) {
      const email = buildCounterProposalRejectionEmailContent({ ...BASE, language });
      expect(email.text).toContain(BASE.reason);
      expect(email.html).toContain(BASE.reason);
      expect(email.subject).toContain(BASE.advertiserName);
      expect(email.subject).toContain(BASE.proposalNumber);
    }
  });

  it('cae a inglés para un idioma no soportado', () => {
    const email = buildCounterProposalRejectionEmailContent({ ...BASE, language: 'XX' as never });
    expect(email.text).toContain('Dear Marie,');
  });

  it('escapa HTML en el motivo tecleado por el AM (nunca inyecta markup sin escapar)', () => {
    const email = buildCounterProposalRejectionEmailContent({
      ...BASE,
      reason: '<script>alert(1)</script>',
      language: 'ES',
    });
    expect(email.html).not.toContain('<script>alert(1)</script>');
    expect(email.html).toContain('&lt;script&gt;');
  });

  it('manda siempre versión texto plano además de HTML (mismo patrón que el email de propuesta)', () => {
    const email = buildCounterProposalRejectionEmailContent({ ...BASE, language: 'FR' });
    expect(email.text.length).toBeGreaterThan(0);
    expect(email.html).toContain('<!doctype html>');
  });
});
