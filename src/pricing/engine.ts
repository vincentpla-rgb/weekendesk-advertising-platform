/**
 * Motor de precios — CLAUDE.md §4.
 *
 * Puro: no lee de la base de datos. Recibe parámetros y catálogo, devuelve el
 * cálculo completo con su traza (coste, suelo, descuento nominal y efectivo).
 *
 * Orden del cálculo, por opción:
 *
 *   0. la opción elige sus mercados UNA VEZ; cada línea (soporte) se expande
 *      automáticamente a todos ellos — ya no hay mercado por línea (§4.2, ronda 2)
 *   1. coste por línea×mercado, con la regla multimercado por opción (§4.1, §4.2)
 *   2. tarifa bruta y suelo de margen → tarifa de lista            (§4.3)
 *      · media buy: fee = max(medios × 40 %, mínimo mensual × meses) (§4.4)
 *   3. base del descuento = suma de tarifas de lista, NETA DE MEDIOS (§4.5)
 *   4. descuento por volumen + descuentos manuales, repartidos a prorrata
 *   5. reaplicación del suelo línea a línea; el exceso no se redistribuye
 */

import { allocateProRata, applyRate, marginFloor, type Cents } from './money.js';
import type {
  AppliedDiscount,
  Catalog,
  Market,
  OptionInput,
  OptionLineInput,
  PricedLine,
  PricedOption,
  PricingParameters,
  PricingWarning,
  SupportDefinition,
} from './types.js';

export class PricingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PricingError';
  }
}

export interface PricingContext {
  readonly parameters: PricingParameters;
  readonly catalog: Catalog;
}

// -----------------------------------------------------------------------------
// Auxiliares
// -----------------------------------------------------------------------------

function coefficientFor(parameters: PricingParameters, market: Market): number {
  const coefficient = parameters.marketCoefficients[market];
  if (coefficient === undefined) {
    throw new PricingError(`Sin coeficiente para el mercado ${market}`);
  }
  return coefficient;
}

function externalCostFor(support: SupportDefinition, market: Market): Cents {
  return support.markets?.[market]?.externalCostCents ?? support.externalCostCents;
}

function isSellable(support: SupportDefinition, market: Market): boolean {
  return support.markets?.[market]?.sellable ?? true;
}

/** Tramo de volumen. Umbrales inclusivos: exactamente 3.000 € da 5 %. */
export function volumeDiscountRate(parameters: PricingParameters, baseCents: Cents): number {
  let rate = 0;
  for (const tier of parameters.volumeDiscountTiers) {
    if (baseCents >= tier.fromCents) rate = tier.rate;
  }
  return rate;
}

/**
 * Fee de gestión de un soporte de media buy (CLAUDE.md §4.4).
 *
 *     fee = max(medios × fee_rate ; fee_minimo_mensual × meses)
 *
 * Si el mínimo mensual es `null` (ADS-03, INF-01: sin dato confirmado) no hay
 * suelo y el fee es solo el porcentaje. No se inventa un mínimo.
 */
export function mediaManagementFee(
  parameters: PricingParameters,
  mediaBudgetCents: Cents,
  months: number,
  minMonthlyFeeCents: Cents | null,
): { feeCents: Cents; minimumCents: Cents; minimumApplied: boolean } {
  const percentageFee = applyRate(mediaBudgetCents, parameters.mediaFeeRate);
  const minimumCents = minMonthlyFeeCents === null ? 0 : minMonthlyFeeCents * months;
  return {
    feeCents: Math.max(percentageFee, minimumCents),
    minimumCents,
    minimumApplied: minimumCents > percentageFee,
  };
}

/**
 * Mercado que paga el diseño (CLAUDE.md §4.2, ronda 2): el de mayor
 * coeficiente entre los elegidos para la OPCIÓN. Como todo soporte se vende
 * ahora automáticamente en todos los mercados de la opción (§4.2), ya no hace
 * falta resolverlo por soporte: es uno solo, igual para toda la opción.
 */
function resolveLeadMarket(markets: readonly Market[], parameters: PricingParameters): Market {
  return markets.reduce((best, market) =>
    coefficientFor(parameters, market) > coefficientFor(parameters, best) ? market : best,
  );
}

function validate(line: OptionLineInput, support: SupportDefinition): void {
  const quantity = line.quantity ?? 1;
  if (!(quantity > 0)) {
    throw new PricingError(`${line.supportId}: la cantidad debe ser mayor que cero`);
  }
  if (support.isMediaBuy) {
    if (line.mediaBudgetCents === undefined) {
      throw new PricingError(
        `${line.supportId} es un soporte de media buy: falta mediaBudgetCents`,
      );
    }
    if (line.mediaBudgetCents < 0 || !Number.isInteger(line.mediaBudgetCents)) {
      throw new PricingError(
        `${line.supportId}: mediaBudgetCents debe ser un entero de céntimos no negativo`,
      );
    }
    const months = line.mediaMonths ?? 0;
    if (!Number.isInteger(months) || months < 1) {
      throw new PricingError(
        `${line.supportId}: mediaMonths debe ser un entero de al menos 1 mes`,
      );
    }
  } else if (line.mediaBudgetCents !== undefined || line.mediaMonths !== undefined) {
    throw new PricingError(
      `${line.supportId} no es un soporte de media buy: no admite presupuesto de medios`,
    );
  }
}

// -----------------------------------------------------------------------------
// Cálculo de línea, antes de descuento
// -----------------------------------------------------------------------------

interface PreDiscountLine {
  readonly base: Omit<
    PricedLine,
    'discountCents' | 'netPriceCents' | 'billedTotalCents' | 'marginCents' | 'marginRate'
  >;
  readonly warnings: PricingWarning[];
}

function priceLineBeforeDiscount(
  line: OptionLineInput,
  market: Market,
  ctx: PricingContext,
  isLeadMarket: boolean,
): PreDiscountLine {
  const { parameters, catalog } = ctx;
  const support = catalog.get(line.supportId);
  if (!support) throw new PricingError(`Soporte desconocido: ${line.supportId}`);
  validate(line, support);

  const quantity = line.quantity ?? 1;
  const warnings: PricingWarning[] = [];
  const sellable = isSellable(support, market);
  if (!sellable) {
    warnings.push({
      code: 'NOT_SELLABLE_IN_MARKET',
      message:
        `${support.id} no es vendible en ${market}` +
        (support.markets?.[market]?.note ? `: ${support.markets[market]!.note}` : ''),
      supportId: support.id,
      market,
    });
  }

  // --- 1. Coste (§4.1 + §4.2) ------------------------------------------------
  // El diseño se reutiliza entre mercados; el coste externo no.
  const billableHours = isLeadMarket
    ? support.businessHours + support.designHours
    : support.businessHours;
  const unitCostCents =
    Math.round(billableHours * parameters.hourlyRateCents) + externalCostFor(support, market);
  // El coste escala con la cantidad: 3 stories son 3 boosts.
  const costCents = Math.round(unitCostCents * quantity);

  const theoreticalMarginFloor = marginFloor(costCents, parameters.minMarginRate);

  // --- 2. Tarifa de lista ----------------------------------------------------
  let grossPriceCents = 0;
  let listPriceCents: Cents;
  let enforcedFloorCents: Cents;
  let floorApplied = false;
  let mediaBudgetCents = 0;
  let mediaMonths: number | null = null;

  if (support.isMediaBuy) {
    // Fuera de la fórmula general. Los medios van a coste, sin margen.
    mediaBudgetCents = line.mediaBudgetCents ?? 0;
    mediaMonths = line.mediaMonths ?? 1;

    if (support.minMonthlyFeeCents === null) {
      warnings.push({
        code: 'MISSING_MIN_MONTHLY_FEE',
        message:
          `${support.id}: sin fee mínimo mensual confirmado. El fee se calcula solo como ` +
          `medios × ${(parameters.mediaFeeRate * 100).toFixed(0)} %, sin suelo. ` +
          `Parámetro pendiente (CLAUDE.md §9).`,
        supportId: support.id,
        market,
      });
    }

    const fee = mediaManagementFee(
      parameters,
      mediaBudgetCents,
      mediaMonths,
      support.minMonthlyFeeCents,
    );
    listPriceCents = fee.feeCents;
    // El "mínimo" mensual es un mínimo también frente a los descuentos.
    enforcedFloorCents = fee.minimumCents;
    floorApplied = fee.minimumApplied;
  } else {
    grossPriceCents = Math.round(
      support.basePriceCents * coefficientFor(parameters, market) * quantity,
    );
    enforcedFloorCents = theoreticalMarginFloor;
    listPriceCents = Math.max(grossPriceCents, enforcedFloorCents);
    floorApplied = listPriceCents > grossPriceCents;
    if (floorApplied) {
      warnings.push({
        code: 'MARGIN_FLOOR_APPLIED',
        message:
          `${support.id} en ${market}: la tarifa sube de ` +
          `${(grossPriceCents / 100).toFixed(2)} € a ${(listPriceCents / 100).toFixed(2)} € ` +
          `por el suelo de margen del ${(parameters.minMarginRate * 100).toFixed(0)} %.`,
        supportId: support.id,
        market,
      });
    }
  }

  return {
    base: {
      supportId: support.id,
      supportName: support.name,
      market,
      quantity,
      isMediaBuy: support.isMediaBuy,
      sellable,
      isLeadMarket,
      unitCostCents,
      costCents,
      grossPriceCents,
      marginFloorCents: theoreticalMarginFloor,
      enforcedFloorCents,
      floorApplied,
      listPriceCents,
      mediaBudgetCents,
      mediaMonths,
      leadTimeBusinessDays: support.leadTimeBusinessDays,
      requiresAvailabilityCheck: support.requiresAvailabilityCheck,
      warnings,
    },
    warnings,
  };
}

// -----------------------------------------------------------------------------
// Opción
// -----------------------------------------------------------------------------

export function priceOption(input: OptionInput, ctx: PricingContext): PricedOption {
  const { parameters } = ctx;

  const markets = [...new Set(input.markets)];
  if (markets.length === 0) {
    throw new PricingError('La opción no tiene ningún mercado seleccionado');
  }
  for (const market of markets) coefficientFor(parameters, market); // valida que exista coeficiente

  const seen = new Set<string>();
  for (const line of input.lines) {
    if (seen.has(line.supportId)) {
      throw new PricingError(
        `${line.supportId} aparece dos veces en la misma opción. ` +
          `Usa la cantidad: duplicar la línea recontaría el diseño.`,
      );
    }
    seen.add(line.supportId);
  }

  const leadMarket = resolveLeadMarket(markets, parameters);
  const priced = input.lines.flatMap((line) =>
    markets.map((market) => priceLineBeforeDiscount(line, market, ctx, market === leadMarket)),
  );

  // --- 3. Base del descuento: neta de medios (§4.5) --------------------------
  // El presupuesto de medios ni suma para el tramo ni se descuenta: es dinero
  // del cliente en tránsito. El fee de gestión sí, porque es margen.
  const grossNetOfMediaCents = priced.reduce((sum, p) => sum + p.base.listPriceCents, 0);

  // --- 4. Descuentos ---------------------------------------------------------
  const discounts: AppliedDiscount[] = [];
  // Interruptor por opción (CLAUDE.md §4.5, ronda 9): con el descuento por
  // volumen desactivado, la tarifa bruta se factura sin ningún descuento por
  // tramo — los descuentos manuales, si los hay, se suman igual más abajo.
  const volumeRate = input.volumeDiscountDisabled
    ? 0
    : volumeDiscountRate(parameters, grossNetOfMediaCents);
  if (volumeRate > 0) {
    discounts.push({ kind: 'VOLUME', rate: volumeRate, reason: null });
  }
  for (const manual of input.manualDiscounts ?? []) {
    if (!manual.reason || manual.reason.trim() === '') {
      throw new PricingError('Todo descuento manual exige un motivo registrado (CLAUDE.md §4.5)');
    }
    if (manual.rate <= 0 || manual.rate >= 1) {
      throw new PricingError(`Descuento manual fuera de rango: ${manual.rate}`);
    }
    discounts.push({
      kind: 'MANUAL',
      rate: manual.rate,
      reason: manual.reason,
      ...(manual.author !== undefined ? { author: manual.author } : {}),
    });
  }

  // Los descuentos se SUMAN sobre la base (supuesto pendiente, CLAUDE.md §9).
  const nominalDiscountRate = Math.min(discounts.reduce((sum, d) => sum + d.rate, 0), 1);
  const nominalDiscountCents = applyRate(grossNetOfMediaCents, nominalDiscountRate);

  const allocation = allocateProRata(
    nominalDiscountCents,
    priced.map((p) => p.base.listPriceCents),
  );

  // --- 5. Reaplicar el suelo. El exceso NO se redistribuye. -------------------
  const lines: PricedLine[] = priced.map((p, index) => {
    const requested = allocation[index] ?? 0;
    const afterDiscount = p.base.listPriceCents - requested;
    const netPriceCents = Math.max(afterDiscount, p.base.enforcedFloorCents, 0);
    const discountCents = p.base.listPriceCents - netPriceCents;

    const warnings = [...p.base.warnings];
    if (requested > 0 && discountCents < requested) {
      warnings.push({
        code: 'DISCOUNT_ABSORBED_BY_FLOOR',
        message:
          `${p.base.supportId} en ${p.base.market}: el suelo absorbe ` +
          `${((requested - discountCents) / 100).toFixed(2)} € del descuento.`,
        supportId: p.base.supportId,
        market: p.base.market,
      });
    }

    const marginCents = netPriceCents - p.base.costCents;
    const marginRate = netPriceCents > 0 ? marginCents / netPriceCents : null;

    if (
      p.base.isMediaBuy &&
      marginRate !== null &&
      marginRate < parameters.minMarginRate - 1e-9
    ) {
      // Los soportes de media buy no llevan suelo de margen por línea: están
      // fuera de la fórmula general. Se avisa, y el control de opción decide.
      warnings.push({
        code: 'MEDIA_BUY_LINE_BELOW_MARGIN_FLOOR',
        message:
          `${p.base.supportId} en ${p.base.market}: el fee de ` +
          `${(netPriceCents / 100).toFixed(2)} € deja un margen del ` +
          `${(marginRate * 100).toFixed(1)} % sobre un coste interno de ` +
          `${(p.base.costCents / 100).toFixed(2)} €.`,
        supportId: p.base.supportId,
        market: p.base.market,
      });
    }

    return {
      ...p.base,
      warnings,
      discountCents,
      netPriceCents,
      billedTotalCents: netPriceCents + p.base.mediaBudgetCents,
      marginCents,
      marginRate,
    };
  });

  // --- Totales ---------------------------------------------------------------
  const netRevenueCents = lines.reduce((s, l) => s + l.netPriceCents, 0);
  const mediaBudgetCents = lines.reduce((s, l) => s + l.mediaBudgetCents, 0);
  const costCents = lines.reduce((s, l) => s + l.costCents, 0);
  const effectiveDiscountCents = grossNetOfMediaCents - netRevenueCents;
  const marginCents = netRevenueCents - costCents;
  const marginRate = netRevenueCents > 0 ? marginCents / netRevenueCents : null;
  const meetsMarginFloor = marginRate !== null && marginRate >= parameters.minMarginRate - 1e-9;

  const warnings: PricingWarning[] = lines.flatMap((l) => l.warnings);
  if (!meetsMarginFloor) {
    warnings.push({
      code: 'OPTION_BELOW_MARGIN_FLOOR',
      message:
        `La opción deja un margen del ${marginRate === null ? '—' : (marginRate * 100).toFixed(1)} %, ` +
        `por debajo del ${(parameters.minMarginRate * 100).toFixed(0)} % exigido. ` +
        `El margen se mide neto de medios.`,
    });
  }

  return {
    id: input.id ?? null,
    name: input.name ?? null,
    lines,
    markets,
    grossNetOfMediaCents,
    discounts,
    nominalDiscountRate,
    nominalDiscountCents,
    effectiveDiscountCents,
    effectiveDiscountRate:
      grossNetOfMediaCents > 0 ? effectiveDiscountCents / grossNetOfMediaCents : 0,
    netRevenueCents,
    mediaBudgetCents,
    billedTotalCents: netRevenueCents + mediaBudgetCents,
    costCents,
    marginCents,
    marginRate,
    meetsMarginFloor,
    maxLeadTimeBusinessDays: lines.reduce((max, l) => Math.max(max, l.leadTimeBusinessDays), 0),
    warnings,
  };
}

/** Precio de las 2-3 opciones de un envío. Cada opción es independiente. */
export function priceProposal(
  options: readonly OptionInput[],
  ctx: PricingContext,
): PricedOption[] {
  return options.map((option) => priceOption(option, ctx));
}

/** Coste interno unitario de un soporte en un mercado (CLAUDE.md §4.1, §4.2). */
export function unitCost(
  support: SupportDefinition,
  market: Market,
  parameters: PricingParameters,
  isLeadMarket: boolean,
): Cents {
  const hours = isLeadMarket ? support.businessHours + support.designHours : support.businessHours;
  return Math.round(hours * parameters.hourlyRateCents) + externalCostFor(support, market);
}
