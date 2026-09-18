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
  | 'LEAD_TIME_INSUFFICIENT'
  | 'AVAILABILITY_NOT_CONFIRMED'
  | 'SUPPORT_NOT_SELLABLE'
  | 'EMPTY_BRIEF';

export interface CheckResult {
  readonly code: CheckCode;
  readonly severity: 'BLOCKER' | 'WARNING';
  readonly message: string;
  readonly optionId?: string | null;
  readonly supportId?: string;
  readonly market?: Market;
}

export interface PreSendContext {
  readonly today: Date;
  readonly campaignStart: Date | null;
  readonly brief: string | null;
  /** Claves `SUPPORT|MERCADO` con check manual de disponibilidad registrado. */
  readonly confirmedAvailability: ReadonlySet<string>;
  readonly parameters: PricingParameters;
  /** Festivos por mercado (CLAUDE.md §9). Estado inicial: `DEFAULT_HOLIDAYS`. */
  readonly holidays: readonly PublicHoliday[];
}

export function availabilityKey(supportId: string, market: Market): string {
  return `${supportId}|${market}`;
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
  options: readonly PricedOption[],
  ctx: PreSendContext,
): PreSendReport {
  const blockers: CheckResult[] = [];
  const warnings: CheckResult[] = [];

  for (const option of options) {
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

    for (const line of option.lines) {
      // 2. Antelación insuficiente. Por línea, no por opción: el calendario de
      //    festivos es por mercado, así que dos soportes con la misma
      //    antelación nominal pueden tener distinta fecha límite real según
      //    el mercado en el que se contraten.
      if (ctx.campaignStart !== null) {
        const available = businessDaysBetween(
          ctx.today,
          ctx.campaignStart,
          line.market,
          ctx.holidays,
        );
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
      }

      // 3. Disponibilidad no confirmada con Marketing.
      if (
        line.requiresAvailabilityCheck &&
        !ctx.confirmedAvailability.has(availabilityKey(line.supportId, line.market))
      ) {
        blockers.push({
          code: 'AVAILABILITY_NOT_CONFIRMED',
          severity: 'BLOCKER',
          message:
            `${line.supportId} en ${line.market}: falta el check manual de disponibilidad ` +
            `con Marketing (con quién y cuándo).`,
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
