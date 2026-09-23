/**
 * Controles previos al envío — CLAUDE.md §5.3.
 *
 * Bloquean el botón de envío. Son forzables, pero solo dejando registro de
 * autor, motivo y marca de tiempo (tabla `overrides`).
 */

import type { PublicHoliday } from './holidays.js';
import type { Market, PricedOption, PricingParameters } from './types.js';

export type CheckCode =
  | 'MARGIN_BELOW_FLOOR'
  | 'CAMPAIGN_DATES_INVALID'
  | 'LEAD_TIME_INSUFFICIENT'
  | 'LEAD_TIME_NOT_VERIFIABLE'
  | 'SUPPORT_NOT_SELLABLE'
  | 'MEDIA_BUDGET_MISSING'
  | 'MEDIA_FEE_EXCEEDS_BUDGET'
  | 'MEDIA_SPLIT_REQUIRED'
  | 'EMPTY_BRIEF';

export interface CheckResult {
  readonly code: CheckCode;
  readonly severity: 'BLOCKER' | 'WARNING';
  readonly message: string;
  readonly optionId?: string | null;
  readonly supportId?: string;
  readonly market?: Market;
}

/**
 * Fechas de campaña de UNA opción (CLAUDE.md §5.3, ronda 2: por opción, no
 * por envío). `campaignStart: null` con `durationOnly: true` es una campaña
 * cotizada solo por duración ("1 mes"), sin fecha de inicio concreta — no se
 * puede comprobar la antelación y se avisa de forma visible en vez de
 * bloquear en silencio (§5.3 bis).
 */
export interface PreSendOptionContext {
  readonly option: PricedOption;
  readonly campaignStart: Date | null;
  /** Solo relevante en modo "fechas concretas" — `null` en modo "solo duración" o si aún no se ha rellenado. */
  readonly campaignEnd: Date | null;
  readonly durationOnly: boolean;
}

export interface PreSendContext {
  readonly today: Date;
  readonly brief: string | null;
  readonly parameters: PricingParameters;
  /** Festivos por mercado (CLAUDE.md §9). Estado inicial: `DEFAULT_HOLIDAYS`. */
  readonly holidays: readonly PublicHoliday[];
}

/**
 * Días laborables (lunes a viernes, excluidos los festivos del mercado)
 * estrictamente entre dos fechas.
 *
 * El calendario es por mercado: 15 días laborables desde diciembre no son
 * los mismos en FR (excluye 25/12 y 11/11) que en IT (excluye además 26/12,
 * 8/12 y 6/1). Sin esto la calculadora podía decir que se llegaba a tiempo
 * a una campaña de Navidad cuando en realidad no.
 */
export function businessDaysBetween(
  from: Date,
  to: Date,
  market: Market,
  holidays: readonly PublicHoliday[],
): number {
  const start = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const end = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  if (end <= start) return 0;

  const marketHolidays = new Set(
    holidays.filter((h) => h.market === market).map((h) => h.date),
  );

  let count = 0;
  for (let t = start + 86_400_000; t <= end; t += 86_400_000) {
    const d = new Date(t);
    const day = d.getUTCDay(); // 0 domingo, 6 sábado
    if (day === 0 || day === 6) continue;
    if (marketHolidays.has(d.toISOString().slice(0, 10))) continue;
    count += 1;
  }
  return count;
}

export interface PreSendReport {
  readonly blockers: readonly CheckResult[];
  readonly warnings: readonly CheckResult[];
  /** `false` mientras quede un bloqueo sin forzar con motivo. */
  readonly canSend: boolean;
}

export function runPreSendChecks(
  options: readonly PreSendOptionContext[],
  ctx: PreSendContext,
): PreSendReport {
  const blockers: CheckResult[] = [];
  const warnings: CheckResult[] = [];

  for (const { option, campaignStart, campaignEnd, durationOnly } of options) {
    // 1. Margen por debajo del 50 % en cualquier opción. No se compensa una
    //    opción floja con otra.
    if (!option.meetsMarginFloor) {
      blockers.push({
        code: 'MARGIN_BELOW_FLOOR',
        severity: 'BLOCKER',
        message:
          `Opción ${option.name ?? option.id ?? '—'}: margen del ` +
          `${option.marginRate === null ? '—' : (option.marginRate * 100).toFixed(1)} %, ` +
          `por debajo del ${(ctx.parameters.minMarginRate * 100).toFixed(0)} % exigido.`,
        optionId: option.id,
      });
    }

    // Fechas de campaña inválidas: el fin no puede ser anterior al inicio.
    // Solo se evalúa cuando ambas fechas están rellenas (modo "fechas
    // concretas") — en modo "solo duración" no hay fechas que comparar.
    if (campaignStart !== null && campaignEnd !== null && campaignEnd < campaignStart) {
      blockers.push({
        code: 'CAMPAIGN_DATES_INVALID',
        severity: 'BLOCKER',
        message: `Opción ${option.name ?? option.id ?? '—'}: la fecha de fin de campaña no puede ser anterior a la de inicio.`,
        optionId: option.id,
      });
    }

    // Presupuesto de medios obligatorio (CLAUDE.md §4.4, ronda 9): es una
    // cifra de negociación con el cliente, nunca se calcula sola — sin ella
    // el fee de gestión no tiene sentido de negocio. Una vez por soporte, no
    // por mercado: el presupuesto es el mismo en todos los mercados de la
    // opción (§4.2), así que comprobarlo línea a línea repetiría el mismo
    // aviso una vez por mercado.
    const flaggedMediaBudget = new Set<string>();
    // Caso límite (CLAUDE.md §4.4, ronda 10): el presupuesto del cliente no
    // cubre el fee de gestión — el reparto automático dejaría el importe
    // real al medio en negativo, lo cual es absurdo. Bloquea el envío: hay
    // que forzar el reparto a mano o subir el presupuesto. Una vez por
    // soporte, no por mercado (mismo presupuesto en todos los mercados de
    // la opción, §4.2).
    const flaggedFeeExceedsBudget = new Set<string>();
    // Soportes con reparto SIEMPRE manual (INF-01, `alwaysManualMediaSplit`):
    // el envío se bloquea mientras el fee no se haya forzado a mano.
    const flaggedSplitRequired = new Set<string>();
    for (const line of option.lines) {
      if (line.isMediaBuy && line.mediaBudgetCents === 0 && !flaggedMediaBudget.has(line.supportId)) {
        flaggedMediaBudget.add(line.supportId);
        blockers.push({
          code: 'MEDIA_BUDGET_MISSING',
          severity: 'BLOCKER',
          message: `${line.supportId}: falta el presupuesto de medios (€). Es obligatorio para calcular el fee de gestión.`,
          optionId: option.id,
          supportId: line.supportId,
        });
      }
      if (
        line.isMediaBuy &&
        line.mediaRealSpendCents !== null &&
        line.mediaRealSpendCents < 0 &&
        !flaggedFeeExceedsBudget.has(line.supportId)
      ) {
        flaggedFeeExceedsBudget.add(line.supportId);
        blockers.push({
          code: 'MEDIA_FEE_EXCEEDS_BUDGET',
          severity: 'BLOCKER',
          message:
            `${line.supportId}: el presupuesto de medios del cliente no cubre el mínimo de gestión ` +
            `(faltan ${(-line.mediaRealSpendCents / 100).toFixed(2)} €). Fuerza el reparto a mano ` +
            `o sube el presupuesto.`,
          optionId: option.id,
          supportId: line.supportId,
        });
      }
      if (
        line.isMediaBuy &&
        line.alwaysManualMediaSplit &&
        !line.feeForced &&
        !flaggedSplitRequired.has(line.supportId)
      ) {
        flaggedSplitRequired.add(line.supportId);
        blockers.push({
          code: 'MEDIA_SPLIT_REQUIRED',
          severity: 'BLOCKER',
          message: `${line.supportId}: el reparto entre el importe para el medio real y el fee de gestión nunca es automático. Confírmalo a mano antes de enviar.`,
          optionId: option.id,
          supportId: line.supportId,
        });
      }
    }

    for (const line of option.lines) {
      // 2. Antelación insuficiente. Por línea, no por opción: el calendario de
      //    festivos es por mercado, así que dos soportes con la misma
      //    antelación nominal pueden tener distinta fecha límite real según
      //    el mercado en el que se contraten.
      if (campaignStart !== null) {
        const available = businessDaysBetween(ctx.today, campaignStart, line.market, ctx.holidays);
        if (available < line.leadTimeBusinessDays) {
          blockers.push({
            code: 'LEAD_TIME_INSUFFICIENT',
            severity: 'BLOCKER',
            message:
              `${line.supportId} en ${line.market}: quedan ${available} días laborables ` +
              `hasta el inicio (descontando festivos de ${line.market}) y el soporte exige ` +
              `${line.leadTimeBusinessDays}.`,
            optionId: option.id,
            supportId: line.supportId,
            market: line.market,
          });
        }
      } else if (durationOnly) {
        // Cotizada solo por duración, sin fecha de inicio concreta (§5.3 bis):
        // no se puede comprobar la antelación. Aviso visible, no bloqueo.
        warnings.push({
          code: 'LEAD_TIME_NOT_VERIFIABLE',
          severity: 'WARNING',
          message:
            `Opción ${option.name ?? option.id ?? '—'}: cotizada solo por duración, sin fecha de ` +
            `inicio. No se puede comprobar la antelación de ${line.supportId} en ${line.market} ` +
            `(exige ${line.leadTimeBusinessDays} días laborables).`,
          optionId: option.id,
          supportId: line.supportId,
          market: line.market,
        });
      }

      if (!line.sellable) {
        blockers.push({
          code: 'SUPPORT_NOT_SELLABLE',
          severity: 'BLOCKER',
          message: `${line.supportId} no es vendible en ${line.market}.`,
          optionId: option.id,
          supportId: line.supportId,
          market: line.market,
        });
      }
    }
  }

  // 4. Brief vacío: aviso, no bloqueo.
  if (ctx.brief === null || ctx.brief.trim() === '') {
    warnings.push({
      code: 'EMPTY_BRIEF',
      severity: 'WARNING',
      message: 'El brief de campaña está vacío. Se reutiliza en el email y, más adelante, en el PDF.',
    });
  }

  return { blockers, warnings, canSend: blockers.length === 0 };
}
