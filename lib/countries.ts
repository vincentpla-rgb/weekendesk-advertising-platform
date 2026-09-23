/**
 * Lista de países ISO 3166-1 alfa-2, para el desplegable de "País" al crear
 * una cuenta (CLAUDE.md §5.1, sustituye al campo de texto libre "País
 * (ISO-2, ej. FR)" — incomprensible para quien no conoce el estándar).
 *
 * Restringida (ronda 9, CLAUDE.md §10.3 novies) a los países donde
 * Weekendesk tiene hoteles o clientes de publicidad: Francia, España,
 * Portugal, Andorra, Italia, Suiza, Alemania, Luxemburgo, Bélgica, Países
 * Bajos. Es el país DEL CLIENTE (`accounts.country_code`) — distinto de los
 * 5 mercados de venta de Weekendesk (FR/ES/IT/BE-FR/BE-NL, `Market` en
 * `src/pricing/types.ts`): un cliente puede estar en un país (p. ej.
 * Andorra o Suiza) donde Weekendesk no vende ningún soporte todavía. Antes
 * de esta ronda la lista tenía ~60 países de toda Europa/mundo; se acotó a
 * los que de verdad pueden aparecer como cuenta real, no una lista completa
 * ISO que nadie usaría entera en este negocio.
 *
 * Solo se guardan los CÓDIGOS aquí: el nombre visible se genera con
 * `Intl.DisplayNames`, ya localizado al idioma de interfaz activo (ES/FR/EN).
 */
export const COUNTRY_CODES: readonly string[] = [
  'FR', 'ES', 'PT', 'AD', 'IT', 'CH', 'DE', 'LU', 'BE', 'NL',
];

/** Nombre visible del país, localizado al idioma dado (ISO-2 del idioma de interfaz). */
export function countryName(code: string, uiLanguage: 'es' | 'fr' | 'en'): string {
  try {
    const displayNames = new Intl.DisplayNames([uiLanguage], { type: 'region' });
    return displayNames.of(code) ?? code;
  } catch {
    return code;
  }
}
