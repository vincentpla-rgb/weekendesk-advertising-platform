/**
 * Conversión de un periodo de campaña a unidades del motor (CLAUDE.md §5.3).
 *
 * Puro, sin fecha de "hoy" ni zona horaria del navegador: opera en días UTC,
 * igual que `checks.ts`. Es la MISMA conversión que alimenta la cantidad
 * sugerida en la interfaz — no hay una fórmula "de mostrar" distinta de la
 * "de calcular": si aquí dijera otra cosa que la cantidad real, el comercial
 * vería un número en pantalla que no es el que se factura.
 */

export interface DurationUnits {
  /** Días naturales, AMBOS extremos incluidos: 1 al 28 de octubre = 28 días. */
  readonly days: number;
  /** `days / 7`, redondeado hacia arriba: una semana empezada cuenta entera. */
  readonly weeks: number;
  /** `days / 30`, redondeado hacia arriba. Aproximado: no hay mes de duración fija. */
  readonly months: number;
}

/** Unidades de soporte para las que tiene sentido sugerir una cantidad a partir de la duración. */
export type DurationSupportUnit = 'WEEK' | 'MONTH';

export function computeDurationUnits(start: Date, end: Date): DurationUnits {
  const startUtc = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const endUtc = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  if (endUtc < startUtc) {
    throw new RangeError('La fecha de fin no puede ser anterior a la de inicio');
  }
  const days = Math.round((endUtc - startUtc) / 86_400_000) + 1;
  return {
    days,
    weeks: Math.ceil(days / 7),
    months: Math.ceil(days / 30),
  };
}

/** La cantidad que esta duración sugiere para un soporte de la unidad dada. */
export function suggestedQuantity(duration: DurationUnits, unit: DurationSupportUnit): number {
  return unit === 'WEEK' ? duration.weeks : duration.months;
}
