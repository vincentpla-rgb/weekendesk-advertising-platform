/**
 * Aritmética monetaria en céntimos enteros.
 *
 * El suelo de margen y el prorrateo de descuentos exigen que la suma de las
 * líneas cuadre EXACTAMENTE con el total de la opción. Con coma flotante no
 * cuadra. Todo importe de este proyecto es un entero de céntimos.
 */

/** Importe en céntimos. Siempre entero. */
export type Cents = number;

/** 1.234,56 € → 123456 */
export function euros(amount: number): Cents {
  return Math.round(amount * 100);
}

/** 123456 → 1234.56 */
export function toEuros(cents: Cents): number {
  return cents / 100;
}

/** Aplica una fracción (0,40 = 40 %) redondeando al céntimo. */
export function applyRate(cents: Cents, rate: number): Cents {
  return Math.round(cents * rate);
}

/**
 * Suelo de margen: precio mínimo para que el margen bruto de la línea
 * `(precio - coste) / precio` alcance `marginRate`.
 *
 *     precio >= coste / (1 - marginRate)
 *
 * Con el 50 % de CLAUDE.md §4.3 esto es `coste / 0,50`, exactamente lo que dice
 * la especificación. Se escribe con `1 - marginRate` y no con `marginRate`
 * porque el parámetro es editable en admin: si algún día pasa al 60 %, el suelo
 * correcto es `coste / 0,40`, no `coste / 0,60`.
 *
 * Redondea hacia ARRIBA para no quedar nunca un céntimo por debajo del margen
 * exigido.
 */
export function marginFloor(costCents: Cents, marginRate: number): Cents {
  if (marginRate <= 0 || marginRate >= 1) {
    throw new RangeError(`Tasa de margen fuera de rango: ${marginRate}`);
  }
  return Math.ceil(costCents / (1 - marginRate));
}

/**
 * Reparte `total` entre varias líneas en proporción a `weights`, por el método
 * de los restos mayores. La suma del resultado es exactamente `total`.
 *
 * En caso de empate de resto gana el índice más bajo, de modo que el reparto
 * es determinista y los tests son reproducibles.
 */
export function allocateProRata(total: Cents, weights: number[]): Cents[] {
  if (weights.length === 0) return [];
  if (!Number.isInteger(total)) {
    throw new TypeError(`El total a repartir debe ser un entero de céntimos: ${total}`);
  }

  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0 || total === 0) return weights.map(() => 0);

  const exact = weights.map((w) => (total * w) / sum);
  const allocated = exact.map(Math.floor);

  let remainder = total - allocated.reduce((a, b) => a + b, 0);
  const byFraction = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);

  for (let i = 0; remainder > 0 && i < byFraction.length; i++) {
    allocated[byFraction[i]!.index]! += 1;
    remainder -= 1;
  }

  return allocated;
}
