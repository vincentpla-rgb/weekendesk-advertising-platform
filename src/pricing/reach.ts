/**
 * Audiencia — CLAUDE.md §3.
 *
 * REGLA ABSOLUTA: si no hay dato medido, el valor es NULO. Nunca cero, nunca
 * estimado. Un cliente (Office de tourisme d'Amiens) rechazó una propuesta por
 * citar cifras sin fuente.
 *
 * Y las tres métricas no son comparables ni sumables entre sí.
 */

import type { Cents } from './money.js';
import type { Market, SupportUnit } from './types.js';

export type ReachMetric = 'PAGE_VIEWS' | 'SESSIONS' | 'UNIQUE_USERS';

export interface ReachMeasurement {
  readonly supportId: string;
  readonly market: Market;
  /** `null` = sin dato medido. */
  readonly value: number | null;
  readonly metric: ReachMetric | null;
  readonly periodUnit: SupportUnit | null;
  readonly source: string | null;
  readonly measuredAt: string | null; // ISO date
}

export class ReachError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReachError';
  }
}

/**
 * Un dato solo es publicable si tiene valor, métrica, fuente y fecha.
 * Devuelve `null` en cualquier otro caso: la fila no aparece en la pantalla
 * del cliente.
 */
export function publishableReach(measurement: ReachMeasurement): ReachMeasurement | null {
  const { value, metric, source, measuredAt } = measurement;
  if (value === null || metric === null) return null;
  if (source === null || source.trim() === '') return null;
  if (measuredAt === null) return null;
  return measurement;
}

export interface ReachAggregate {
  readonly metric: ReachMetric;
  readonly value: number;
  /** Cuántas de las líneas consideradas aportan dato medido. */
  readonly linesWithData: number;
  readonly linesTotal: number;
  /** `false` si alguna línea no tiene dato: el total NO cubre la campaña entera. */
  readonly complete: boolean;
}

/**
 * Suma audiencias de una MISMA métrica.
 *
 * Lanza si se mezclan métricas distintas. Devuelve `null` si ninguna línea
 * tiene dato publicable: sin dato no hay total, y no se rellena con ceros.
 *
 * `complete` avisa de que el total es parcial. Quien lo presente debe decirlo;
 * un total parcial servido como total de campaña es una cifra sin respaldo.
 */
export function aggregateReach(
  measurements: readonly ReachMeasurement[],
): ReachAggregate | null {
  const publishable = measurements
    .map(publishableReach)
    .filter((m): m is ReachMeasurement => m !== null);

  if (publishable.length === 0) return null;

  const metrics = new Set(publishable.map((m) => m.metric));
  if (metrics.size > 1) {
    throw new ReachError(
      `No se pueden sumar métricas distintas: ${[...metrics].join(', ')}. ` +
        `Vistas de página, sesiones y usuarios únicos no son comparables (CLAUDE.md §3).`,
    );
  }

  return {
    metric: publishable[0]!.metric!,
    value: publishable.reduce((sum, m) => sum + (m.value ?? 0), 0),
    linesWithData: publishable.length,
    linesTotal: measurements.length,
    complete: publishable.length === measurements.length,
  };
}

/**
 * CPM en céntimos. `null` si no hay audiencia medida: sin reach no hay CPM,
 * y un CPM inventado es una cifra sin fuente como cualquier otra.
 */
export function cpmCents(priceCents: Cents, reach: ReachAggregate | null): Cents | null {
  if (reach === null || reach.value <= 0) return null;
  return Math.round((priceCents / reach.value) * 1000);
}
