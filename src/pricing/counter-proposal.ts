/**
 * Revisión interna del margen de una contrapropuesta (CLAUDE.md, ronda 16,
 * bloque 3). El cliente teclea precio/cantidad directamente en la pantalla
 * pública — sin coeficientes de mercado ni descuentos, nunca pasa por
 * `priceOption` (CLAUDE.md §8: cero lógica de negocio de pricing llega al
 * cliente). Aquí, puertas adentro, se compara ese precio contra el COSTE
 * INTERNO real (`unitCost`, el mismo que usa el motor) para que el
 * advertising manager vea el margen resultante antes de aceptar.
 *
 * Deliberadamente NO se reutiliza `priceOption`: reintroducir el motor de
 * coeficientes recalcularía un precio que el cliente nunca vio ni aceptó —
 * lo único que hace falta aquí es el COSTE, no un precio de venta nuevo.
 */
import { marginFloor } from './money.js';
import { unitCost } from './engine.js';
import type { Cents } from './money.js';
import type { Catalog, Market, PricingParameters } from './types.js';
import { PricingError } from './engine.js';

export interface CounterProposalLineInput {
  readonly supportId: string;
  readonly market: Market;
  /** El cliente borró esta línea (CLAUDE.md, ronda 16, bloque 2, punto 3): sin margen, no se compra. */
  readonly deleted: boolean;
  readonly clientPriceCents: Cents;
  readonly clientQuantity: number;
  /**
   * Mercado líder de la línea ORIGINAL (`proposal_option_lines.is_lead_market`):
   * determina si cuentan las horas de diseño en el coste (CLAUDE.md §4.2).
   * La contrapropuesta no puede cambiar el mercado de una línea (solo su
   * precio/cantidad/fechas o borrarla), así que este dato viene siempre del
   * presupuesto original, nunca de la contrapropuesta.
   */
  readonly isLeadMarket: boolean;
}

export interface CounterProposalLineMargin {
  readonly costCents: Cents;
  readonly marginCents: Cents;
  /** Fracción: 0,50 = 50 %. Puede ser negativa si el precio no cubre el coste. */
  readonly marginRate: number;
  readonly floorCents: Cents;
  readonly belowFloor: boolean;
}

export interface CounterProposalLineReview extends CounterProposalLineInput {
  /**
   * `null` en dos casos, sin relación entre sí:
   *  - Línea eliminada por el cliente: no se compra, no hay margen que revisar.
   *  - Soporte de media buy (ADS-*, INF-01, CLAUDE.md §4.4): el cliente
   *    teclea directamente el presupuesto de medios, sin coeficientes ni
   *    fee de gestión que comparar contra el suelo del 50 % — "sin margen
   *    aplicable" (confirmado por Vincent, ronda 16, punto 3).
   */
  readonly margin: CounterProposalLineMargin | null;
}

function reviewLine(
  line: CounterProposalLineInput,
  catalog: Catalog,
  parameters: PricingParameters,
): CounterProposalLineReview {
  const support = catalog.get(line.supportId);
  if (!support) {
    throw new PricingError(`Soporte desconocido: ${line.supportId}`);
  }

  if (line.deleted || support.isMediaBuy) {
    return { ...line, margin: null };
  }

  const unitCostCents = unitCost(support, line.market, parameters, line.isLeadMarket);
  const costCents = Math.round(unitCostCents * line.clientQuantity);
  const marginCents = line.clientPriceCents - costCents;
  const marginRate = line.clientPriceCents > 0 ? marginCents / line.clientPriceCents : 0;
  const floorCents = costCents > 0 ? marginFloor(costCents, parameters.minMarginRate) : 0;
  const belowFloor = line.clientPriceCents < floorCents;

  return { ...line, margin: { costCents, marginCents, marginRate, floorCents, belowFloor } };
}

/** Revisa cada línea de la contrapropuesta contra el coste interno real. Orden preservado. */
export function reviewCounterProposalLines(
  lines: readonly CounterProposalLineInput[],
  catalog: Catalog,
  parameters: PricingParameters,
): readonly CounterProposalLineReview[] {
  return lines.map((line) => reviewLine(line, catalog, parameters));
}
