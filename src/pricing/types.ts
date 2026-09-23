import type { Cents } from './money.js';

export type Market = 'FR' | 'ES' | 'IT' | 'BE_FR' | 'BE_NL';

export const MARKETS: readonly Market[] = ['FR', 'ES', 'IT', 'BE_FR', 'BE_NL'] as const;

export type Channel =
  | 'ONSITE' | 'CRM' | 'SOCIAL' | 'SOCIAL_ADS' | 'DISPLAY_SEA' | 'CONTENT' | 'INFLUENCER';

export type SupportUnit =
  | 'WEEK' | 'CAMPAIGN' | 'SEND' | 'INSERTION_WEEK' | 'MONTH' | 'UNIT' | 'COLLABORATION';

// -----------------------------------------------------------------------------
// Parámetros (CLAUDE.md §3). Editables en admin: el motor los RECIBE, nunca los
// define. Los valores por defecto de parameters.ts son estado inicial.
// -----------------------------------------------------------------------------

export interface VolumeDiscountTier {
  /** Umbral inclusivo sobre la base neta de medios. */
  readonly fromCents: Cents;
  /** Fracción: 0,05 = 5 %. */
  readonly rate: number;
}

export interface PricingParameters {
  /** Tarifa hora interna cargada. 3500 = 35 €/h. */
  readonly hourlyRateCents: Cents;
  /** Suelo duro de margen bruto. 0,50 = 50 %. */
  readonly minMarginRate: number;
  /** Fee de gestión sobre el presupuesto de medios. 0,40 = 40 %. */
  readonly mediaFeeRate: number;
  readonly marketCoefficients: Readonly<Record<Market, number>>;
  readonly volumeDiscountTiers: readonly VolumeDiscountTier[];
}

// -----------------------------------------------------------------------------
// Catálogo
// -----------------------------------------------------------------------------

export interface SupportMarketSettings {
  readonly sellable: boolean;
  /** Coste externo específico del mercado. Pendiente: ¿el boost son 100 € en los 5? */
  readonly externalCostCents?: Cents;
  readonly note?: string;
}

export interface SupportDefinition {
  readonly id: string;
  readonly name: string;
  readonly channel: Channel;
  readonly unit: SupportUnit;
  readonly businessHours: number;
  readonly designHours: number;
  /** Coste externo directo por unidad. Para SOC-* es el boost social. */
  readonly externalCostCents: Cents;
  readonly leadTimeBusinessDays: number;
  /** Precio base recomendado en índice FR. Informativo en soportes de media buy. */
  readonly basePriceCents: Cents;
  readonly isMediaBuy: boolean;
  /**
   * Fee mínimo mensual. `null` = SIN DATO CONFIRMADO (ADS-03, INF-01).
   * El motor calcula entonces el fee sin suelo y avisa. No se inventa.
   */
  readonly minMonthlyFeeCents: Cents | null;
  readonly requiresAvailabilityCheck: boolean;
  readonly markets?: Readonly<Partial<Record<Market, SupportMarketSettings>>>;
}

export type Catalog = ReadonlyMap<string, SupportDefinition>;

// -----------------------------------------------------------------------------
// Entrada
// -----------------------------------------------------------------------------

export interface ManualDiscount {
  /** Fracción: 0,10 = 10 %. */
  readonly rate: number;
  /** Obligatorio. Toda excepción se registra con motivo (CLAUDE.md §4.5, §8). */
  readonly reason: string;
  readonly author?: string;
}

export interface OptionLineInput {
  readonly supportId: string;
  /** Número de unidades (semanas, envíos, stories…). Por defecto 1. Se aplica igual en cada mercado de la opción. */
  readonly quantity?: number;
  /** Solo media buy: presupuesto de medios del cliente, a coste. Se aplica igual en cada mercado de la opción. */
  readonly mediaBudgetCents?: Cents;
  /** Solo media buy: meses de campaña, para el fee mínimo mensual. */
  readonly mediaMonths?: number;
}

export interface OptionInput {
  readonly id?: string;
  readonly name?: string;
  /**
   * Mercados de la opción, elegidos UNA VEZ (CLAUDE.md §4.2, ronda 2). Todo
   * soporte de `lines` se vende automáticamente en todos estos mercados: no
   * existe ya un mercado por línea. El mercado líder (el que paga el diseño)
   * es el de mayor coeficiente entre estos, igual para todos los soportes de
   * la opción — porque, por construcción, todo soporte aparece en todos ellos.
   */
  readonly markets: readonly Market[];
  readonly lines: readonly OptionLineInput[];
  /** Multimercado y cualquier otro descuento comercial. Nunca automáticos. */
  readonly manualDiscounts?: readonly ManualDiscount[];
  /**
   * Interruptor por opción (CLAUDE.md §4.5, ronda 9): desactiva el descuento
   * automático por volumen para esta opción, aunque su tarifa bruta supere
   * el umbral que lo activaría — la tarifa se factura sin ningún descuento
   * por tramo. Distinto de los descuentos manuales, que se suman aparte y
   * siguen aplicándose igual. Por defecto `false` (el descuento por volumen
   * se aplica normalmente).
   */
  readonly volumeDiscountDisabled?: boolean;
}

// -----------------------------------------------------------------------------
// Salida
// -----------------------------------------------------------------------------

export type WarningCode =
  | 'MISSING_MIN_MONTHLY_FEE'
  | 'NOT_SELLABLE_IN_MARKET'
  | 'MARGIN_FLOOR_APPLIED'
  | 'DISCOUNT_ABSORBED_BY_FLOOR'
  | 'MEDIA_BUY_LINE_BELOW_MARGIN_FLOOR'
  | 'OPTION_BELOW_MARGIN_FLOOR';

export interface PricingWarning {
  readonly code: WarningCode;
  readonly message: string;
  readonly supportId?: string;
  readonly market?: Market;
}

export interface PricedLine {
  readonly supportId: string;
  readonly supportName: string;
  readonly market: Market;
  readonly quantity: number;
  readonly isMediaBuy: boolean;
  readonly sellable: boolean;

  /** true si esta línea paga las horas de diseño (CLAUDE.md §4.2). */
  readonly isLeadMarket: boolean;

  readonly unitCostCents: Cents;
  readonly costCents: Cents;

  /** `precio_base × coeficiente × cantidad`. 0 en media buy: no aplica. */
  readonly grossPriceCents: Cents;
  /** `coste / (1 - margen mínimo)`. Informativo en media buy. */
  readonly marginFloorCents: Cents;
  /** Suelo realmente exigido: el de margen, o el fee mínimo en media buy. */
  readonly enforcedFloorCents: Cents;
  readonly floorApplied: boolean;

  /** Tarifa antes de descuento, neta de medios. En media buy es el fee. */
  readonly listPriceCents: Cents;
  readonly discountCents: Cents;
  /** Tarifa después de descuento y de reaplicar el suelo. Neta de medios. */
  readonly netPriceCents: Cents;

  readonly mediaBudgetCents: Cents;
  readonly mediaMonths: number | null;
  /** Lo que se factura al cliente: neto + medios. */
  readonly billedTotalCents: Cents;

  readonly marginCents: Cents;
  readonly marginRate: number | null;

  readonly leadTimeBusinessDays: number;
  readonly requiresAvailabilityCheck: boolean;
  readonly warnings: readonly PricingWarning[];
}

export interface AppliedDiscount {
  readonly kind: 'VOLUME' | 'MANUAL';
  readonly rate: number;
  readonly reason: string | null;
  readonly author?: string;
}

export interface PricedOption {
  readonly id: string | null;
  readonly name: string | null;
  readonly lines: readonly PricedLine[];
  readonly markets: readonly Market[];

  /** Base del descuento = tarifa neta de medios, antes de descuento. */
  readonly grossNetOfMediaCents: Cents;

  readonly discounts: readonly AppliedDiscount[];
  /** Suma de las tasas aplicadas, tal como se ofrece al cliente. */
  readonly nominalDiscountRate: number;
  readonly nominalDiscountCents: Cents;
  /** Descuento realmente concedido tras reaplicar los suelos. */
  readonly effectiveDiscountCents: Cents;
  readonly effectiveDiscountRate: number;

  /** `importe_neto_de_medios` del dashboard. El objetivo se mide sobre esto. */
  readonly netRevenueCents: Cents;
  readonly mediaBudgetCents: Cents;
  /** `importe_facturado`: cifra de negocio contable. */
  readonly billedTotalCents: Cents;

  readonly costCents: Cents;
  readonly marginCents: Cents;
  readonly marginRate: number | null;
  readonly meetsMarginFloor: boolean;

  readonly maxLeadTimeBusinessDays: number;
  readonly warnings: readonly PricingWarning[];
}
