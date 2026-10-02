import { PricingError, type PricingErrorCode } from '@/src/pricing/index.js';
import type { I18nKey } from '@/lib/i18n-internal';

/**
 * Traduce un `PricingError` del motor (`src/pricing/engine.ts`) al idioma de
 * interfaz activo — ronda 22. El motor es puro y nunca conoce idiomas
 * (CLAUDE.md §10.1, mismo principio que separa `CheckResult.messageKey` de la
 * prosa en `checks.ts`, ronda 11): lanza un `code` + `vars` estables, y esta
 * capa de UI es la única que decide el texto. Antes de esta ronda, la vista
 * previa en vivo (`ProposalBuilder.tsx`) mostraba `err.message` tal cual —
 * texto técnico, siempre en español, con nombres de variable de programación
 * ("manualFeeCents") — directamente al comercial, fuera cual fuera su idioma
 * de interfaz.
 */
const PRICING_ERROR_MESSAGE_KEY: Record<PricingErrorCode, I18nKey> = {
  QUANTITY_NOT_POSITIVE: 'pricingError.quantityNotPositive',
  MEDIA_BUDGET_MISSING: 'pricingError.mediaBudgetMissing',
  MEDIA_BUDGET_INVALID: 'pricingError.mediaBudgetInvalid',
  MEDIA_MONTHS_INVALID: 'pricingError.mediaMonthsInvalid',
  MANUAL_FEE_INVALID: 'pricingError.manualFeeInvalid',
  MANUAL_FEE_REASON_REQUIRED: 'pricingError.manualFeeReasonRequired',
  NOT_MEDIA_BUY_SUPPORT: 'pricingError.notMediaBuySupport',
  UNKNOWN_SUPPORT: 'pricingError.unknownSupport',
  DUPLICATE_SUPPORT_IN_OPTION: 'pricingError.duplicateSupportInOption',
  NO_MARKET_SELECTED: 'pricingError.noMarketSelected',
  NO_COEFFICIENT_FOR_MARKET: 'pricingError.noCoefficientForMarket',
  MANUAL_DISCOUNT_REASON_REQUIRED: 'pricingError.manualDiscountReasonRequired',
  MANUAL_DISCOUNT_OUT_OF_RANGE: 'pricingError.manualDiscountOutOfRange',
};

/**
 * `err` puede no ser un `PricingError` (p. ej. un bug de verdad en otro
 * sitio) — en ese caso, o si lleva un `code` que esta capa no reconoce
 * todavía, cae a un mensaje genérico traducido en vez de mostrar nada en
 * español sin traducir. Nunca se concatena `err.message` al resultado: ese
 * texto es para logs/depuración, no para pantalla.
 */
export function pricingErrorMessage(
  err: unknown,
  t: (key: I18nKey, vars?: Record<string, string>) => string,
): string {
  if (err instanceof PricingError && err.code && err.code in PRICING_ERROR_MESSAGE_KEY) {
    return t(PRICING_ERROR_MESSAGE_KEY[err.code], err.vars);
  }
  return t('pricingError.generic');
}
