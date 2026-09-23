/**
 * Lista de países ISO 3166-1 alfa-2, para el desplegable de "País" al crear
 * una cuenta (CLAUDE.md §5.1, sustituye al campo de texto libre "País
 * (ISO-2, ej. FR)" — incomprensible para quien no conoce el estándar).
 *
 * Solo se guardan los CÓDIGOS aquí: el nombre visible se genera con
 * `Intl.DisplayNames`, ya localizado al idioma de interfaz activo (ES/FR/EN),
 * en vez de mantener a mano tres traducciones de ~250 nombres de país.
 */
export const COUNTRY_CODES: readonly string[] = [
  'FR', 'ES', 'IT', 'BE', 'NL', 'DE', 'PT', 'LU', 'CH', 'AT', 'GB', 'IE',
  'DK', 'SE', 'NO', 'FI', 'IS', 'PL', 'CZ', 'SK', 'HU', 'RO', 'BG', 'HR',
  'SI', 'GR', 'CY', 'MT', 'EE', 'LV', 'LT', 'AD', 'MC', 'SM', 'VA', 'LI',
  'US', 'CA', 'MX', 'BR', 'AR', 'CL', 'CO', 'PE', 'JP', 'CN', 'KR', 'IN',
  'AU', 'NZ', 'ZA', 'MA', 'TN', 'DZ', 'EG', 'TR', 'IL', 'AE', 'SA', 'QA',
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
