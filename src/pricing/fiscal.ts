/**
 * Año fiscal Weekendesk: 1 de mayo – 30 de abril (CLAUDE.md §0).
 *
 *   Q1 = mayo-julio · Q2 = agosto-octubre · Q3 = noviembre-enero · Q4 = febrero-abril
 *
 * Una campaña se imputa al quarter de su FECHA DE FIRMA, no de ejecución.
 *
 * Réplica exacta, en TypeScript puro, de `fiscal_year_of`/`fiscal_quarter_of`
 * (`supabase/migrations/20260918120000_initial_schema.sql`) — las mismas
 * funciones que ya usa la base de datos para imputar cada aceptación a su
 * quarter fiscal (`acceptances.fiscal_year`/`fiscal_quarter`, por trigger).
 * El dashboard (ronda 18, bloque 4) usa la MISMA lógica para construir
 * selectores de año/quarter — nunca una aproximación aparte que pudiera
 * desincronizarse de lo que la base de datos ya calculó al aceptar.
 */

export type FiscalQuarter = 1 | 2 | 3 | 4;

export interface FiscalPeriod {
  /** Año de inicio del año fiscal: FY2026 = 01/05/2026 → 30/04/2027. */
  readonly year: number;
  readonly quarter: FiscalQuarter;
}

export function fiscalPeriodOf(date: Date): FiscalPeriod {
  const month = date.getUTCMonth() + 1; // 1-12
  const year = date.getUTCFullYear();
  return {
    year: month >= 5 ? year : year - 1,
    quarter: (Math.floor(((month - 5 + 12) % 12) / 3) + 1) as 1 | 2 | 3 | 4,
  };
}

export function fiscalYearLabel(period: FiscalPeriod): string {
  return `FY${period.year}/${String((period.year + 1) % 100).padStart(2, '0')} Q${period.quarter}`;
}

/** Los cuatro quarters, en orden — para poblar selectores (ronda 18, dashboard/objetivos). */
export const FISCAL_QUARTERS: readonly FiscalQuarter[] = [1, 2, 3, 4];

/** El año fiscal en curso ahora mismo, en UTC (ronda 18: valor por defecto del selector del dashboard/objetivos). */
export function currentFiscalYear(now: Date = new Date()): number {
  return fiscalPeriodOf(now).year;
}
