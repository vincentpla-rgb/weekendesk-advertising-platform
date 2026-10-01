/**
 * Controles previos al envío — CLAUDE.md §5.3.
 *
 * Bloquean el botón de envío. De los bloqueos duros solo uno es forzable
 * (LEAD_TIME_INSUFFICIENT, ronda 11): los demás (fechas inválidas,
 * presupuesto de medios vacío, conflicto de disponibilidad) son errores de
 * datos o compromisos ya cerrados con otro cliente, no decisiones de
 * negocio, y no tienen forma de saltarse.
 *
 * Puro: no conoce el idioma de interfaz. Cada resultado lleva una clave de
 * traducción (`messageKey`) y las variables para interpolarla (`messageVars`)
 * — el componente que renderiza (`PreSendChecklist.tsx`) es quien llama a
 * `t(messageKey, messageVars)` con el idioma activo (ronda 11: antes los
 * textos venían en español, escritos directamente aquí).
 */

import type { PublicHoliday } from './holidays.js';
import type { Market, PricedOption, PricingParameters } from './types.js';

export type CheckCode =
  | 'MARGIN_BELOW_FLOOR'
  | 'CALCULATION_ERROR'
  | 'CAMPAIGN_DATES_INVALID'
  | 'LEAD_TIME_INSUFFICIENT'
  | 'LEAD_TIME_FORCED'
  | 'SUPPORT_NOT_SELLABLE'
  | 'MEDIA_BUDGET_MISSING'
  | 'MEDIA_FEE_EXCEEDS_BUDGET'
  | 'MEDIA_SPLIT_REQUIRED'
  | 'EMPTY_BRIEF';

/** Claves del diccionario de i18n (`lib/i18n-internal.tsx`), namespace `checklist.*`. */
export type CheckMessageKey =
  | 'checklist.marginBelowFloor'
  | 'checklist.calculationError'
  | 'checklist.campaignDatesInvalid'
  | 'checklist.leadTimeInsufficient'
  | 'checklist.leadTimeForced'
  | 'checklist.supportNotSellable'
  | 'checklist.mediaBudgetMissing'
  | 'checklist.mediaFeeExceedsBudget'
  | 'checklist.mediaSplitRequired'
  | 'checklist.emptyBrief';

export interface CheckResult {
  readonly code: CheckCode;
  readonly severity: 'BLOCKER' | 'WARNING';
  readonly messageKey: CheckMessageKey;
  /** Interpolados en la plantilla de `messageKey` por el componente que traduce. */
  readonly messageVars?: Record<string, string>;
  readonly optionId?: string | null;
  readonly supportId?: string;
  readonly market?: Market;
  /**
   * `true` únicamente en el bloqueo LEAD_TIME_INSUFFICIENT (ronda 11): es el
   * ÚNICO bloqueo duro forzable por el usuario — una decisión de negocio
   * legítima (p. ej. un cliente grande acepta el riesgo de un plazo
   * ajustado). Los demás bloqueos (fechas inválidas, presupuesto de medios
   * vacío, conflicto de disponibilidad) son errores de datos o compromisos
   * ya cerrados con otro cliente: no llevan este campo, y no existe ningún
   * mecanismo — ni en este módulo ni en `create_and_send_proposal` — para
   * saltárselos.
   */
  readonly forcible?: boolean;
}

/**
 * Un soporte+mercado concretos de una opción cuya antelación insuficiente ya
 * se forzó a mano (CLAUDE.md §5.3, ronda 11). El motivo es obligatorio: sin
 * él, `runPreSendChecks` ignora la entrada y el bloqueo se mantiene — el
 * mismo control se aplica aquí y en `create_and_send_proposal` (la columna
 * `overrides.reason` no admite vacío).
 */
export interface LeadTimeOverride {
  readonly supportId: string;
  readonly market: Market;
  readonly reason: string;
}

/**
 * Fechas de campaña de UNA opción (CLAUDE.md §5.3, ronda 2: por opción, no
 * por envío). `campaignStart: null` es una campaña cotizada solo por
 * duración ("1 mes"), sin fecha de inicio concreta — no se puede comprobar
 * la antelación, así que el control 2 simplemente no se evalúa para ella
 * (§5.3 bis). Ese aviso se muestra una sola vez, junto al selector de
 * periodo de la opción en la propia interfaz (`ProposalBuilder.tsx`,
 * `proposalBuilder.durationOnlyWarning`) — no en este checklist (ronda 22:
 * antes de esta ronda, el mismo aviso aparecía aquí TAMBIÉN, una vez por
 * cada opción en modo duración, duplicando el de la interfaz).
 */
export interface PreSendOptionContext {
  readonly option: PricedOption;
  readonly campaignStart: Date | null;
  /** Solo relevante en modo "fechas concretas" — `null` en modo "solo duración" o si aún no se ha rellenado. */
  readonly campaignEnd: Date | null;
  /** Antelaciones insuficientes ya forzadas a mano para esta opción (ronda 11). */
  readonly leadTimeOverrides?: readonly LeadTimeOverride[];
  /**
   * `true` si el motor no pudo calcular esta opción (un dato inválido en una
   * línea hizo que `priceOption` lanzara, CLAUDE.md §10.3 — ronda 22). Con
   * esto activo, ninguno de los demás controles de la opción se evalúa:
   * `option.lines` está vacío y no hay nada real que comprobar, así que se
   * bloquea con un único aviso ("no se puede calcular el margen") en vez de
   * dar un falso "por debajo del suelo" sobre un margen que es `null`.
   */
  readonly calculationError?: boolean;
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

function leadTimeOverrideKey(supportId: string, market: Market): string {
  return `${supportId}|${market}`;
}

export function runPreSendChecks(
  options: readonly PreSendOptionContext[],
  ctx: PreSendContext,
): PreSendReport {
  const blockers: CheckResult[] = [];
  const warnings: CheckResult[] = [];

  for (const { option, campaignStart, campaignEnd, leadTimeOverrides, calculationError } of options) {
    const optionLabel = option.name ?? option.id ?? '—';

    // El motor no pudo calcular esta opción (ronda 22): ningún otro control
    // tiene nada real que comprobar — `option.lines` está vacío y el margen
    // es `null`, no "bajo el suelo". Un único aviso claro, y se salta el
    // resto de controles de esta opción.
    if (calculationError) {
      blockers.push({
        code: 'CALCULATION_ERROR',
        severity: 'BLOCKER',
        messageKey: 'checklist.calculationError',
        messageVars: { option: optionLabel },
        optionId: option.id,
      });
      continue;
    }

    // 1. Margen por debajo del 50 % en cualquier opción. No se compensa una
    //    opción floja con otra. Bloqueo duro: no forzable.
    if (!option.meetsMarginFloor) {
      blockers.push({
        code: 'MARGIN_BELOW_FLOOR',
        severity: 'BLOCKER',
        messageKey: 'checklist.marginBelowFloor',
        messageVars: {
          option: optionLabel,
          rate: option.marginRate === null ? '—' : (option.marginRate * 100).toFixed(1),
          min: (ctx.parameters.minMarginRate * 100).toFixed(0),
        },
        optionId: option.id,
      });
    }

    // Fechas de campaña inválidas: el fin no puede ser anterior al inicio.
    // Solo se evalúa cuando ambas fechas están rellenas (modo "fechas
    // concretas") — en modo "solo duración" no hay fechas que comparar.
    // Bloqueo duro: es un error de datos, no una decisión de negocio — no
    // existe ningún camino para forzarlo (CLAUDE.md §5.3, ronda 11).
    if (campaignStart !== null && campaignEnd !== null && campaignEnd < campaignStart) {
      blockers.push({
        code: 'CAMPAIGN_DATES_INVALID',
        severity: 'BLOCKER',
        messageKey: 'checklist.campaignDatesInvalid',
        messageVars: { option: optionLabel },
        optionId: option.id,
      });
    }

    // Presupuesto de medios obligatorio (CLAUDE.md §4.4, ronda 9): es una
    // cifra de negociación con el cliente, nunca se calcula sola — sin ella
    // el fee de gestión no tiene sentido de negocio. Una vez por soporte, no
    // por mercado: el presupuesto es el mismo en todos los mercados de la
    // opción (§4.2), así que comprobarlo línea a línea repetiría el mismo
    // aviso una vez por mercado. Bloqueo duro: falta un dato obligatorio
    // para poder calcular el precio — no forzable (ronda 11).
    const flaggedMediaBudget = new Set<string>();
    // Caso límite (CLAUDE.md §4.4, ronda 10): el presupuesto del cliente no
    // cubre el fee de gestión — el reparto automático dejaría el importe
    // real al medio en negativo, lo cual es absurdo. Bloquea el envío: hay
    // que forzar el reparto a mano (`manualFeeCents`, no este control) o
    // subir el presupuesto. Una vez por soporte, no por mercado (mismo
    // presupuesto en todos los mercados de la opción, §4.2).
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
          messageKey: 'checklist.mediaBudgetMissing',
          messageVars: { support: line.supportId },
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
          messageKey: 'checklist.mediaFeeExceedsBudget',
          messageVars: {
            support: line.supportId,
            amount: (-line.mediaRealSpendCents / 100).toFixed(2),
          },
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
          messageKey: 'checklist.mediaSplitRequired',
          messageVars: { support: line.supportId },
          optionId: option.id,
          supportId: line.supportId,
        });
      }
    }

    for (const line of option.lines) {
      // 2. Antelación insuficiente. Por línea, no por opción: el calendario de
      //    festivos es por mercado, así que dos soportes con la misma
      //    antelación nominal pueden tener distinta fecha límite real según
      //    el mercado en el que se contraten. ÚNICO bloqueo duro forzable
      //    (CLAUDE.md §5.3, ronda 11): una decisión de negocio legítima, con
      //    motivo obligatorio, registrada con autor y marca de tiempo en
      //    `overrides` al enviar (`create_and_send_proposal`).
      if (campaignStart !== null) {
        const available = businessDaysBetween(ctx.today, campaignStart, line.market, ctx.holidays);
        if (available < line.leadTimeBusinessDays) {
          const override = leadTimeOverrides?.find(
            (o) => o.supportId === line.supportId && o.market === line.market,
          );
          if (override && override.reason.trim() !== '') {
            // Forzado a mano, con motivo: deja de bloquear, pero queda
            // constancia visible en el checklist (y, al enviar, en
            // `overrides` y en `proposal_option_lines`, CLAUDE.md §10.1.1).
            warnings.push({
              code: 'LEAD_TIME_FORCED',
              severity: 'WARNING',
              messageKey: 'checklist.leadTimeForced',
              messageVars: {
                support: line.supportId,
                market: line.market,
                reason: override.reason,
              },
              optionId: option.id,
              supportId: line.supportId,
              market: line.market,
            });
          } else {
            blockers.push({
              code: 'LEAD_TIME_INSUFFICIENT',
              severity: 'BLOCKER',
              messageKey: 'checklist.leadTimeInsufficient',
              messageVars: {
                support: line.supportId,
                market: line.market,
                available: String(available),
                required: String(line.leadTimeBusinessDays),
              },
              optionId: option.id,
              supportId: line.supportId,
              market: line.market,
              forcible: true,
            });
          }
        }
      }

      if (!line.sellable) {
        blockers.push({
          code: 'SUPPORT_NOT_SELLABLE',
          severity: 'BLOCKER',
          messageKey: 'checklist.supportNotSellable',
          messageVars: { support: line.supportId, market: line.market },
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
      messageKey: 'checklist.emptyBrief',
    });
  }

  return { blockers, warnings, canSend: blockers.length === 0 };
}
