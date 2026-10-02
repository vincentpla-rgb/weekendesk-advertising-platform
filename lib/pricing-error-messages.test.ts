import { describe, expect, it } from 'vitest';

import { PricingError, type PricingErrorCode } from '@/src/pricing/index.js';
import { DICTS_FOR_TESTING, interpolate, type I18nKey } from '@/lib/i18n-internal';
import { pricingErrorMessage } from './pricing-error-messages';

const ALL_CODES: PricingErrorCode[] = [
  'QUANTITY_NOT_POSITIVE',
  'MEDIA_BUDGET_MISSING',
  'MEDIA_BUDGET_INVALID',
  'MEDIA_MONTHS_INVALID',
  'MANUAL_FEE_INVALID',
  'MANUAL_FEE_REASON_REQUIRED',
  'NOT_MEDIA_BUY_SUPPORT',
  'UNKNOWN_SUPPORT',
  'DUPLICATE_SUPPORT_IN_OPTION',
  'NO_MARKET_SELECTED',
  'NO_COEFFICIENT_FOR_MARKET',
  'MANUAL_DISCOUNT_REASON_REQUIRED',
  'MANUAL_DISCOUNT_OUT_OF_RANGE',
];

/** `t()` real de cada idioma, sin montar ningún `InternalI18nProvider` de React. */
function realT(language: 'ES' | 'FR' | 'EN') {
  return (key: I18nKey, vars?: Record<string, string>) =>
    interpolate(DICTS_FOR_TESTING[language][key] ?? DICTS_FOR_TESTING.ES[key] ?? key, vars);
}

describe('pricingErrorMessage', () => {
  it('traduce cada PricingErrorCode a un texto en español (nunca el nombre de variable interno)', () => {
    const t = realT('ES');
    for (const code of ALL_CODES) {
      const err = new PricingError('mensaje técnico interno, nunca debe llegar a pantalla', code, {
        support: 'INF-01',
        market: 'FR',
        rate: '12.3',
      });
      const message = pricingErrorMessage(err, t);
      expect(message).not.toContain('mensaje técnico interno');
      expect(message.length).toBeGreaterThan(0);
    }
  });

  it('interpola las variables del error en el texto traducido', () => {
    const t = realT('ES');
    const err = new PricingError('x', 'MANUAL_FEE_INVALID', { support: 'INF-01' });
    expect(pricingErrorMessage(err, t)).toBe(
      'INF-01: el importe para el influencer debe ser un número válido.',
    );
  });

  it('funciona en los tres idiomas de interfaz, con un texto distinto en cada uno', () => {
    const err = new PricingError('x', 'MANUAL_FEE_INVALID', { support: 'INF-01' });
    const es = pricingErrorMessage(err, realT('ES'));
    const fr = pricingErrorMessage(err, realT('FR'));
    const en = pricingErrorMessage(err, realT('EN'));
    expect(new Set([es, fr, en]).size).toBe(3);
    expect(en).toContain('INF-01');
    expect(fr).toContain('INF-01');
  });

  it('cae al mensaje genérico si el error no es un PricingError', () => {
    const t = realT('ES');
    expect(pricingErrorMessage(new Error('boom'), t)).toBe(t('pricingError.generic'));
    expect(pricingErrorMessage('boom', t)).toBe(t('pricingError.generic'));
  });

  it('cae al mensaje genérico si el PricingError no lleva código (null, construcción antigua)', () => {
    const t = realT('ES');
    const err = new PricingError('algo falló');
    expect(pricingErrorMessage(err, t)).toBe(t('pricingError.generic'));
  });

  it('nunca concatena err.message al resultado (ese texto es para logs, no para pantalla)', () => {
    const t = realT('ES');
    const err = new PricingError('INF-01: manualFeeCents debe ser un entero de céntimos no negativo', 'MANUAL_FEE_INVALID', {
      support: 'INF-01',
    });
    const message = pricingErrorMessage(err, t);
    expect(message).not.toContain('manualFeeCents');
    expect(message).not.toContain('entero de céntimos');
  });
});
