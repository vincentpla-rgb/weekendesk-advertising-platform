/**
 * Año fiscal Weekendesk: 1 de mayo – 30 de abril (CLAUDE.md §0).
 *
 *   Q1 = mayo-julio · Q2 = agosto-octubre · Q3 = noviembre-enero · Q4 = febrero-abril
 *
 * Una campaña se imputa al quarter de su FECHA DE FIRMA, no de ejecución.
 */

export interface FiscalPeriod {
  /** Año de inicio del año fiscal: FY2026 = 01/05/2026 → 30/04/2027. */
  readonly year: number;
  readonly quarter: 1 | 2 | 3 | 4;
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
