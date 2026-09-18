/**
 * Controles previos al envío — CLAUDE.md §5.3.
 *
 * Bloquean el botón de envío. Son forzables, pero solo dejando registro de
 * autor, motivo y marca de tiempo (tabla `overrides`).
 */

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
}

export function availabilityKey(supportId: string, market: Market): string {
  return `${supportId}|${market}`;
}

/**
 * Días laborables (lunes a viernes) estrictamente entre dos fechas.
 * Sin calendario de festivos: pendiente de decisión (CLAUDE.md §9).
 */
export function businessDaysBetween(from: Date, to: Date): number {
  const start = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const end = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  if (end <= start) return 0;

  let count = 0;
  for (let t = start + 86_400_000; t <= end; t += 86_400_000) {
    const day = new Date(t).getUTCDay(); // 0 domingo, 6 sábado
    if (day !== 0 && day !== 6) count += 1;
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

  const availableBusinessDays =
    ctx.campaignStart === null ? null : businessDaysBetween(ctx.today, ctx.campaignStart);

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

    // 2. Antelación insuficiente frente al soporte más lento de la opción.
    if (availableBusinessDays !== null && availableBusinessDays < option.maxLeadTimeBusinessDays) {
      blockers.push({
        code: 'LEAD_TIME_INSUFFICIENT',
        severity: 'BLOCKER',
        message:
          `Opción ${option.name ?? option.id ?? '—'}: quedan ${availableBusinessDays} días ` +
          `laborables hasta el inicio y el soporte más lento exige ` +
          `${option.maxLeadTimeBusinessDays}.`,
        optionId: option.id,
      });
    }

    for (const line of option.lines) {
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
