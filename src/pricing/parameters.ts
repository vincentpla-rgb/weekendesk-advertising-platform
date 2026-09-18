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
};
