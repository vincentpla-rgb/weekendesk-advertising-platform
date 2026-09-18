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

export const MARKET_LABELS: Record<string, string> = {
  FR: 'Francia',
  ES: 'España',
  IT: 'Italia',
  BE_FR: 'Bélgica (FR)',
  BE_NL: 'Bélgica (NL)',
};
