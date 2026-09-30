import type { PricingParameters } from './types.js';

/**
 * Estado inicial de los parámetros económicos (CLAUDE.md §3).
 *
 * NO son constantes de cálculo: en producción salen de `pricing_parameter_sets`
 * y sus tablas hijas, editables desde admin. Esto es el mismo juego que carga la
 * migración de seed, disponible para tests y para arrancar en frío.
 *
 * El fichero original (ADVERTISING DEALS — GLOBAL OVERVIEW) usa 50 €/h y 45 % de
 * margen. Están obsoletos.
 */
/**
 * Coeficiente de Países Bajos (NL, ronda 14) — PROVISIONAL, ajustable si el
 * negocio lo requiere. No validado por Quentin Heliot, a diferencia del
 * resto de coeficientes de esta tabla. Es una extrapolación lógica de la
 * serie existente (FR 1,00 → ES 0,88 → BE_FR 0,79 → BE_NL 0,75 → IT 0,74),
 * cuyos saltos decrecientes (-0,12, -0,09, -0,04, -0,01) sugieren un
 * siguiente salto de -0,01: IT 0,74 − 0,01 = 0,73. Ver CLAUDE.md §3/§9.
 */
export const NL_MARKET_COEFFICIENT_PROVISIONAL = 0.73;

export const DEFAULT_PRICING_PARAMETERS: PricingParameters = {
  hourlyRateCents: 3500, // 35 €/h interna cargada — validado por Quentin Heliot (CFO)
  minMarginRate: 0.5, // suelo duro por línea y por opción
  mediaFeeRate: 0.4, // fee de gestión sobre el presupuesto de medios
  marketCoefficients: {
    FR: 1.0,
    ES: 0.88,
    BE_FR: 0.79,
    BE_NL: 0.75,
    IT: 0.74,
    NL: NL_MARKET_COEFFICIENT_PROVISIONAL,
  },
  // Base = tarifa neta de medios. Umbrales inclusivos (CLAUDE.md §4.5).
  volumeDiscountTiers: [
    { fromCents: 0, rate: 0 },
    { fromCents: 300_000, rate: 0.05 },
    { fromCents: 600_000, rate: 0.1 },
    { fromCents: 1_000_000, rate: 0.15 },
    { fromCents: 1_500_000, rate: 0.2 },
  ],
};

/** Descuento multimercado orientativo. NUNCA se aplica automáticamente. */
export const MULTIMARKET_DISCOUNT_GUIDANCE: Readonly<Record<number, number>> = {
  2: 0.1,
  3: 0.15,
  4: 0.2,
  5: 0.2,
  6: 0.2,
};
