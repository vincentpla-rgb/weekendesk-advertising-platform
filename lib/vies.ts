/**
 * Verificación VIES (CLAUDE.md §7). Se llama desde una ruta de servidor
 * (tiene salida de red; una función de Postgres no la tiene de forma
 * fiable). Guardar siempre número, fecha de verificación y resultado — eso lo
 * hace accept_public_proposal (o resolve_vat_regime en un reintento), no
 * este módulo.
 *
 * Tres resultados posibles, y solo dos de ellos fijan un régimen de IVA:
 *   VALID       -> autoliquidación
 *   INVALID     -> IVA francés 20 % (incluye un número con formato irreconocible)
 *   UNAVAILABLE -> fallo técnico (red, timeout, servicio caído, respuesta sin
 *                  `valid` ni error claro). NO se traduce a ningún régimen:
 *                  la aceptación no se bloquea por esto, pero el régimen
 *                  queda `PENDING` hasta reintentar con éxito.
 */

const VIES_ENDPOINT = 'https://ec.europa.eu/taxation_customs/vies/rest-api/ms';

export type ViesResult = 'VALID' | 'INVALID' | 'UNAVAILABLE';

export interface ViesCheckOutcome {
  readonly result: ViesResult;
  readonly raw: unknown;
}

/** Separa "FR12345678901" en { countryCode: "FR", number: "12345678901" }. */
export function splitVatNumber(vatNumber: string): { countryCode: string; number: string } | null {
  const cleaned = vatNumber.replace(/[\s.-]/g, '').toUpperCase();
  const match = /^([A-Z]{2})([A-Z0-9]{2,20})$/.exec(cleaned);
  if (!match) return null;
  return { countryCode: match[1]!, number: match[2]! };
}

export async function checkVies(vatNumber: string): Promise<ViesCheckOutcome> {
  const parsed = splitVatNumber(vatNumber);
  if (!parsed) {
    return { result: 'INVALID', raw: { error: 'FORMATO_NO_RECONOCIDO', input: vatNumber } };
  }

  try {
    const response = await fetch(
      `${VIES_ENDPOINT}/${parsed.countryCode}/vat/${encodeURIComponent(parsed.number)}`,
      { method: 'GET', signal: AbortSignal.timeout(8_000) },
    );

    if (!response.ok) {
      return { result: 'UNAVAILABLE', raw: { httpStatus: response.status } };
    }

    const body = (await response.json()) as { valid?: boolean; userError?: string };

    if (typeof body.valid === 'boolean') {
      return { result: body.valid ? 'VALID' : 'INVALID', raw: body };
    }

    // userError distinto de vacío (p. ej. INVALID_INPUT, SERVICE_UNAVAILABLE):
    // no se puede afirmar ni invalidez ni validez con certeza.
    return { result: 'UNAVAILABLE', raw: body };
  } catch (err) {
    return {
      result: 'UNAVAILABLE',
      raw: { error: err instanceof Error ? err.message : 'desconocido' },
    };
  }
}
