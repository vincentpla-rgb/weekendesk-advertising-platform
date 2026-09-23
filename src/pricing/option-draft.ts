/**
 * Estado "borrador" de una opción mientras se construye en el creador de
 * presupuestos (CLAUDE.md §5.1, §5.3 bis) — puro, sin React: transiciones de
 * estado testeables sin renderizar nada. `components/ProposalBuilder.tsx`
 * solo conecta `useState` a estas funciones.
 *
 * Punto central (CLAUDE.md §4, ronda 6): cuando el soporte de una línea se
 * vende en la MISMA unidad que el periodo de la opción (semana con semana,
 * mes con mes), la cantidad se rellena SOLA al fijar o cambiar el periodo —
 * nunca empieza en 1 esperando que el comercial pulse un botón. Cada línea
 * lleva `quantityAutoSynced`: mientras sea `true`, esta capa mantiene su
 * cantidad al día; en cuanto el comercial la edita a mano pasa a `false` y no
 * se vuelve a tocar sola. El resto (coste, precio, tramo de descuento,
 * margen, comparación entre opciones) ya se recalculaba en cada render a
 * través del motor puro (`priceOption`) — este módulo no cambia eso, solo
 * arregla la única pieza que sí dependía de una acción manual.
 */

import { euros } from './money.js';
import type { Catalog, ManualDiscount, Market, OptionInput, OptionLineInput, SupportDefinition } from './types.js';
import { computeDurationUnits, suggestedQuantity, type DurationSupportUnit, type DurationUnits } from './duration.js';

export type ScheduleMode = 'DATES' | 'DURATION_ONLY';

/** Subconjunto de `OptionDraft` que determina la duración vigente de la opción. */
export interface OptionScheduleDraft {
  readonly scheduleMode: ScheduleMode;
  readonly campaignStart: string;
  readonly campaignEnd: string;
  readonly durationCount: number | '';
  readonly durationUnit: DurationSupportUnit;
}

export interface LineDraft {
  readonly key: string;
  readonly supportId: string;
  readonly quantity: number;
  /**
   * `true` mientras la cantidad la mantiene esta capa a partir de la
   * duración de la opción; `false` en cuanto el comercial la edita a mano —
   * a partir de ahí se respeta y no se sobrescribe sola.
   */
  readonly quantityAutoSynced: boolean;
  /**
   * Presupuesto de medios en euros (CLAUDE.md §4.4, ronda 9): cifra de
   * NEGOCIACIÓN con el cliente, nunca se calcula sola. Vacío por defecto —
   * obligando a rellenarlo antes de enviar (§10.3 novies): sin presupuesto,
   * el fee de gestión no se puede calcular con sentido de negocio.
   */
  readonly mediaBudgetEuros: number | '';
}

export interface DiscountDraft {
  readonly key: string;
  readonly ratePercent: number | '';
  readonly reason: string;
}

export interface OptionDraft extends OptionScheduleDraft {
  readonly key: string;
  readonly code: 'A' | 'B' | 'C';
  readonly name: string;
  readonly pitch: string;
  /** Mercados de la opción, elegidos UNA VEZ (CLAUDE.md §4.2, ronda 2). */
  readonly markets: readonly Market[];
  readonly lines: readonly LineDraft[];
  readonly discounts: readonly DiscountDraft[];
  /**
   * Interruptor por opción (CLAUDE.md §4.5, ronda 9): desactiva el
   * descuento automático por volumen, aunque la tarifa bruta supere el
   * umbral que lo activaría. Distinto de `discounts` (los manuales, que
   * siguen sumándose aparte). Por defecto `false`.
   */
  readonly volumeDiscountDisabled: boolean;
}

const SCHEDULE_FIELDS = new Set<string>([
  'scheduleMode',
  'campaignStart',
  'campaignEnd',
  'durationCount',
  'durationUnit',
]);

/**
 * Duración vigente de la opción en modo "fechas concretas", en la MISMA
 * conversión que alimenta el resto del motor (`computeDurationUnits`) — o
 * `null` si el periodo aún no está completo. En modo "solo duración" no hay
 * un desglose semanas/meses (el comercial eligió una unidad única): esa
 * lectura vive directamente en `suggestedQuantityForSupport`.
 */
export function optionDurationUnits(schedule: OptionScheduleDraft): DurationUnits | null {
  if (schedule.scheduleMode !== 'DATES') return null;
  if (!schedule.campaignStart || !schedule.campaignEnd) return null;
  try {
    return computeDurationUnits(
      new Date(`${schedule.campaignStart}T00:00:00Z`),
      new Date(`${schedule.campaignEnd}T00:00:00Z`),
    );
  } catch {
    return null;
  }
}

/**
 * La cantidad que sugiere el periodo vigente de la opción para un soporte
 * dado, o `null` si no se puede sugerir nada — soporte con una unidad que no
 * es semana/mes (p. ej. "Campaña" o "Colaboración": sigue siendo cantidad 1
 * por defecto, sin sugerencia), periodo aún sin determinar, o —en modo "solo
 * duración"— una unidad elegida que no coincide con la del soporte.
 */
export function suggestedQuantityForSupport(
  schedule: OptionScheduleDraft,
  support: SupportDefinition | undefined,
): number | null {
  if (!support) return null;
  if (support.unit !== 'WEEK' && support.unit !== 'MONTH') return null;

  if (schedule.scheduleMode === 'DURATION_ONLY') {
    if (schedule.durationCount === '' || schedule.durationUnit !== support.unit) return null;
    return schedule.durationCount;
  }

  const units = optionDurationUnits(schedule);
  if (units === null) return null;
  return suggestedQuantity(units, support.unit as DurationSupportUnit);
}

/**
 * Duración de la opción EN MESES, para el fee mínimo mensual de un soporte
 * de media buy (CLAUDE.md §4.4, ronda 9) — nunca un campo manual suelto:
 * se deriva del periodo vigente de la opción, igual que la cantidad
 * sugerida de las demás líneas (§4, ronda 6). A diferencia de esa cantidad,
 * no depende de la unidad del soporte (un soporte de media buy puede tener
 * `unit: 'COLLABORATION'`, como INF-01, cuya cantidad — número de
 * colaboraciones — es un eje distinto de la duración en meses).
 *
 * En modo "fechas concretas" es `computeDurationUnits(...).months` (días
 * naturales entre las dos fechas, redondeado hacia arriba a meses de 30
 * días — la misma aproximación que usa el resto del motor, CLAUDE.md §5.3).
 * En modo "solo duración": si la unidad elegida ya es "mes", el número es
 * directo; si es "semana", se aproxima con la misma equivalencia de 7/30
 * días que usa `computeDurationUnits` para no introducir una segunda regla
 * de conversión.
 */
export function suggestedMediaMonths(schedule: OptionScheduleDraft): number | null {
  if (schedule.scheduleMode === 'DURATION_ONLY') {
    if (schedule.durationCount === '') return null;
    if (schedule.durationUnit === 'MONTH') return schedule.durationCount;
    return Math.ceil((schedule.durationCount * 7) / 30);
  }
  const units = optionDurationUnits(schedule);
  return units === null ? null : units.months;
}

/** Nueva línea con la cantidad ya sugerida por el periodo vigente de la opción, si aplica — nunca empieza en 1 esperando una acción manual. */
export function createLineDraft(catalog: Catalog, schedule: OptionScheduleDraft, supportId: string, key: string): LineDraft {
  const suggested = suggestedQuantityForSupport(schedule, catalog.get(supportId));
  return {
    key,
    supportId,
    quantity: suggested ?? 1,
    quantityAutoSynced: true,
    mediaBudgetEuros: '',
  };
}

export function createOptionDraft(
  catalog: Catalog,
  code: OptionDraft['code'],
  key: string,
  lineKey: string,
  supports: readonly SupportDefinition[],
): OptionDraft {
  const schedule: OptionScheduleDraft = {
    scheduleMode: 'DATES',
    campaignStart: '',
    campaignEnd: '',
    durationCount: '',
    durationUnit: 'WEEK',
  };
  return {
    key,
    code,
    name: '',
    pitch: '',
    markets: ['FR'],
    ...schedule,
    lines: [createLineDraft(catalog, schedule, supports[0]?.id ?? '', lineKey)],
    discounts: [],
    volumeDiscountDisabled: false,
  };
}

/** Recalcula, en cascada, la cantidad de toda línea auto-sincronizada de la opción — nunca toca una línea que el comercial ya editó a mano. */
export function resyncAutoQuantities(catalog: Catalog, draft: OptionDraft): OptionDraft {
  let changed = false;
  const lines = draft.lines.map((line) => {
    if (!line.quantityAutoSynced) return line;
    const suggested = suggestedQuantityForSupport(draft, catalog.get(line.supportId));
    if (suggested === null || suggested === line.quantity) return line;
    changed = true;
    return { ...line, quantity: suggested };
  });
  return changed ? { ...draft, lines } : draft;
}

/**
 * Cambia campos de la opción (mercados, nombre, periodo…). Si el patch toca
 * el periodo (fechas, modo, duración), resincroniza en cascada las
 * cantidades automáticas — el comercial no tiene que pulsar nada aparte de
 * cambiar la fecha.
 */
export function updateOptionDraft(
  catalog: Catalog,
  draft: OptionDraft,
  patch: Partial<Omit<OptionDraft, 'key' | 'code' | 'lines' | 'discounts'>>,
): OptionDraft {
  const merged = { ...draft, ...patch };
  const touchesSchedule = Object.keys(patch).some((k) => SCHEDULE_FIELDS.has(k));
  return touchesSchedule ? resyncAutoQuantities(catalog, merged) : merged;
}

/** Añade una línea a la opción, con su cantidad ya sugerida por el periodo vigente. */
export function addLineDraft(catalog: Catalog, draft: OptionDraft, supportId: string, key: string): OptionDraft {
  return { ...draft, lines: [...draft.lines, createLineDraft(catalog, draft, supportId, key)] };
}

export function removeLineDraft(draft: OptionDraft, lineKey: string): OptionDraft {
  return { ...draft, lines: draft.lines.filter((l) => l.key !== lineKey) };
}

/**
 * Cambia el soporte de una línea existente. Si seguía en modo automático,
 * recalcula la cantidad sugerida para el soporte nuevo; si el comercial la
 * había editado a mano, se respeta el valor y no se toca.
 */
export function setLineSupport(catalog: Catalog, draft: OptionDraft, lineKey: string, supportId: string): OptionDraft {
  return {
    ...draft,
    lines: draft.lines.map((line) => {
      if (line.key !== lineKey) return line;
      if (!line.quantityAutoSynced) return { ...line, supportId };
      const suggested = suggestedQuantityForSupport(draft, catalog.get(supportId));
      return { ...line, supportId, quantity: suggested ?? 1 };
    }),
  };
}

/**
 * El comercial teclea una cantidad a mano: se respeta tal cual y la línea
 * deja de auto-sincronizarse — un cambio posterior del periodo ya no la
 * sobrescribe sola.
 */
export function setLineQuantityManually(draft: OptionDraft, lineKey: string, quantity: number): OptionDraft {
  return {
    ...draft,
    lines: draft.lines.map((line) =>
      line.key === lineKey ? { ...line, quantity, quantityAutoSynced: false } : line,
    ),
  };
}

/**
 * "Usar duración": resincroniza una línea que se había editado a mano, por
 * si el periodo cambió después de esa edición. Sin efecto si el soporte no
 * tiene una cantidad que sugerir (unidad no semana/mes, o sin coincidir con
 * la duración vigente).
 */
export function resyncLineQuantity(catalog: Catalog, draft: OptionDraft, lineKey: string): OptionDraft {
  return {
    ...draft,
    lines: draft.lines.map((line) => {
      if (line.key !== lineKey) return line;
      const suggested = suggestedQuantityForSupport(draft, catalog.get(line.supportId));
      if (suggested === null) return line;
      return { ...line, quantity: suggested, quantityAutoSynced: true };
    }),
  };
}

export function updateLineDraft(draft: OptionDraft, lineKey: string, patch: Partial<Pick<LineDraft, 'mediaBudgetEuros'>>): OptionDraft {
  return {
    ...draft,
    lines: draft.lines.map((line) => (line.key === lineKey ? { ...line, ...patch } : line)),
  };
}

export function toggleOptionMarket(draft: OptionDraft, market: Market): OptionDraft {
  const has = draft.markets.includes(market);
  // No se permite dejar la opción sin ningún mercado.
  if (has && draft.markets.length === 1) return draft;
  const markets = has ? draft.markets.filter((m) => m !== market) : [...draft.markets, market];
  return { ...draft, markets };
}

export function addOptionDiscount(draft: OptionDraft, key: string): OptionDraft {
  return { ...draft, discounts: [...draft.discounts, { key, ratePercent: '', reason: '' }] };
}

export function updateOptionDiscount(draft: OptionDraft, discountKey: string, patch: Partial<DiscountDraft>): OptionDraft {
  return {
    ...draft,
    discounts: draft.discounts.map((d) => (d.key === discountKey ? { ...d, ...patch } : d)),
  };
}

export function removeOptionDiscount(draft: OptionDraft, discountKey: string): OptionDraft {
  return { ...draft, discounts: draft.discounts.filter((d) => d.key !== discountKey) };
}

/**
 * Convierte el borrador de la interfaz al `OptionInput` que consume el motor
 * puro (`priceOption`) — la MISMA conversión que usa la vista previa en vivo
 * del creador y que, en el servidor, se vuelve a aplicar sobre los datos
 * crudos al enviar (`app/api/proposals/route.ts`). Ninguna capa reimplementa
 * el cálculo: solo dan forma a la misma entrada.
 */
export function toOptionInput(catalog: Catalog, draft: OptionDraft): OptionInput {
  return {
    id: draft.key,
    name: draft.name || undefined,
    markets: draft.markets,
    lines: draft.lines
      .filter((l) => l.supportId)
      .map((l): OptionLineInput => {
        const support = catalog.get(l.supportId);
        return {
          supportId: l.supportId,
          quantity: l.quantity,
          ...(support?.isMediaBuy
            ? {
                mediaBudgetCents: l.mediaBudgetEuros === '' ? 0 : euros(l.mediaBudgetEuros),
                // Nunca un campo manual: la duración de la opción, en meses
                // (CLAUDE.md §4.4, ronda 9) — ver `suggestedMediaMonths`.
                mediaMonths: suggestedMediaMonths(draft) ?? 1,
              }
            : {}),
        };
      }),
    manualDiscounts: draft.discounts
      .filter((d) => d.ratePercent !== '' && d.reason.trim() !== '')
      .map((d): ManualDiscount => ({ rate: Number(d.ratePercent) / 100, reason: d.reason })),
    volumeDiscountDisabled: draft.volumeDiscountDisabled,
  };
}
