/** Formato de importes y fechas para las pantallas. Precios siempre HT (CLAUDE.md §6). */

export function formatCents(cents: number, locale = 'fr-FR'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

export function formatPercent(rate: number, locale = 'fr-FR'): string {
  return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }).format(rate);
}

export function formatDate(iso: string | Date, locale = 'fr-FR'): string {
  const date = typeof iso === 'string' ? new Date(iso) : iso;
  return new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', year: 'numeric' }).format(
    date,
  );
}

/**
 * "Nombre completo (CÓDIGO)" — p. ej. "Marketing Block (ON-01)" — nunca solo
 * el código a secas (CLAUDE.md §10.3 ter decies, ronda 13). Se usa tanto en
 * el desplegable de soporte del creador, como en las tablas de líneas del
 * detalle interno y de la pantalla pública del cliente — un único formato,
 * un único sitio que lo define. `name` puede faltar (soporte desactivado
 * fuera del catálogo cargado, o sin dato todavía): cae al código solo, nunca
 * a una cadena vacía.
 */
export function supportLabel(name: string | null | undefined, id: string): string {
  return name ? `${name} (${id})` : id;
}

export const MARKET_LABELS: Record<string, string> = {
  FR: 'Francia',
  ES: 'España',
  IT: 'Italia',
  BE_FR: 'Bélgica (FR)',
  BE_NL: 'Bélgica (NL)',
};
