import { describe, expect, it } from 'vitest';

import { buildCounterProposalReceivedAmEmailContent } from './counter-proposal-received-am-email.js';

const BASE = {
  ownerFullName: 'Vincent Pla',
  advertiserName: 'Office de tourisme de Amiens',
  proposalNumber: '2026-014',
  optionCode: 'Estándar (A)',
  reviewUrl: 'https://weekendesk-advertising.vercel.app/proposals/abc-123',
};

describe('buildCounterProposalReceivedAmEmailContent', () => {
  it('selecciona la plantilla en español y usa el primer nombre del AM', () => {
    const email = buildCounterProposalReceivedAmEmailContent({ ...BASE, language: 'ES' });

    expect(email.subject).toBe('Nueva contrapropuesta — Office de tourisme de Amiens (2026-014)');
    expect(email.text).toContain('Hola Vincent:');
    expect(email.text).toContain(BASE.advertiserName);
    expect(email.text).toContain(BASE.optionCode);
    expect(email.text).toContain(BASE.reviewUrl);
    expect(email.html).toContain(BASE.reviewUrl);
  });

  it('cae a español (no inglés) para un idioma no reconocido — interno, no de cara al cliente', () => {
    const email = buildCounterProposalReceivedAmEmailContent({ ...BASE, language: 'XX' });
    expect(email.text).toContain('Hola Vincent:');
  });

  it('funciona en los tres idiomas de interfaz interna (ES/FR/EN)', () => {
    for (const language of ['ES', 'FR', 'EN']) {
      const email = buildCounterProposalReceivedAmEmailContent({ ...BASE, language });
      expect(email.subject).toContain(BASE.advertiserName);
      expect(email.subject).toContain(BASE.proposalNumber);
      expect(email.text).toContain(BASE.reviewUrl);
      expect(email.html).toContain(BASE.reviewUrl);
    }
  });

  it('el enlace de revisión aparece como CTA con el texto de la plantilla', () => {
    const email = buildCounterProposalReceivedAmEmailContent({ ...BASE, language: 'EN' });
    expect(email.text).toContain('Review counter-offer');
    expect(email.html).toContain('Review counter-offer');
  });

  it('manda siempre versión texto plano además de HTML', () => {
    const email = buildCounterProposalReceivedAmEmailContent({ ...BASE, language: 'FR' });
    expect(email.text.length).toBeGreaterThan(0);
    expect(email.html).toContain('<!doctype html>');
  });
});
