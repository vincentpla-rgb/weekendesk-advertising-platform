/**
 * Festivos por mercado — CLAUDE.md §9, resuelto.
 *
 * BE-NL es la edición neerlandófona de Bélgica (Flandes), no los Países Bajos:
 * comparte el calendario de festivos nacionales belgas con BE-FR (son
 * festivos federales, no de comunidad lingüística).
 *
 * España e Italia tienen además festivos regionales/municipales que no se
 * incluyen aquí: solo el calendario nacional.
 */

import type { Market } from './types.js';

export interface PublicHoliday {
  readonly market: Market;
  /** ISO date, YYYY-MM-DD. */
  readonly date: string;
  readonly name: string;
}

/**
 * Festivos nacionales 2026-2027. Estado inicial — en producción viven en
 * `market_holidays`, editable desde admin. Los festivos móviles se calculan
 * a partir de la fecha de Pascua (algoritmo de Gauss); no son una cifra de
 * negocio sin fuente, son fechas legales públicas.
 */
export const DEFAULT_HOLIDAYS: readonly PublicHoliday[] = [
  // --- Francia ---
  { market: 'FR', date: '2026-01-01', name: "Jour de l'An" },
  { market: 'FR', date: '2026-04-06', name: 'Lundi de Pâques' },
  { market: 'FR', date: '2026-05-01', name: 'Fête du Travail' },
  { market: 'FR', date: '2026-05-08', name: 'Victoire 1945' },
  { market: 'FR', date: '2026-05-14', name: 'Ascension' },
  { market: 'FR', date: '2026-05-25', name: 'Lundi de Pentecôte' },
  { market: 'FR', date: '2026-07-14', name: 'Fête Nationale' },
  { market: 'FR', date: '2026-08-15', name: 'Assomption' },
  { market: 'FR', date: '2026-11-01', name: 'Toussaint' },
  { market: 'FR', date: '2026-11-11', name: 'Armistice 1918' },
  { market: 'FR', date: '2026-12-25', name: 'Noël' },
  { market: 'FR', date: '2027-01-01', name: "Jour de l'An" },
  { market: 'FR', date: '2027-03-29', name: 'Lundi de Pâques' },
  { market: 'FR', date: '2027-05-01', name: 'Fête du Travail' },
  { market: 'FR', date: '2027-05-06', name: 'Ascension' },
  { market: 'FR', date: '2027-05-08', name: 'Victoire 1945' },
  { market: 'FR', date: '2027-05-17', name: 'Lundi de Pentecôte' },
  { market: 'FR', date: '2027-07-14', name: 'Fête Nationale' },
  { market: 'FR', date: '2027-08-15', name: 'Assomption' },
  { market: 'FR', date: '2027-11-01', name: 'Toussaint' },
  { market: 'FR', date: '2027-11-11', name: 'Armistice 1918' },
  { market: 'FR', date: '2027-12-25', name: 'Noël' },

  // --- España: nacionales fijos + Viernes Santo ---
  { market: 'ES', date: '2026-01-01', name: 'Año Nuevo' },
  { market: 'ES', date: '2026-04-03', name: 'Viernes Santo' },
  { market: 'ES', date: '2026-05-01', name: 'Fiesta del Trabajo' },
  { market: 'ES', date: '2026-08-15', name: 'Asunción de la Virgen' },
  { market: 'ES', date: '2026-10-12', name: 'Fiesta Nacional de España' },
  { market: 'ES', date: '2026-11-01', name: 'Todos los Santos' },
  { market: 'ES', date: '2026-12-06', name: 'Día de la Constitución' },
  { market: 'ES', date: '2026-12-08', name: 'Inmaculada Concepción' },
  { market: 'ES', date: '2026-12-25', name: 'Navidad' },
  { market: 'ES', date: '2027-01-01', name: 'Año Nuevo' },
  { market: 'ES', date: '2027-03-26', name: 'Viernes Santo' },
  { market: 'ES', date: '2027-05-01', name: 'Fiesta del Trabajo' },
  { market: 'ES', date: '2027-08-15', name: 'Asunción de la Virgen' },
  { market: 'ES', date: '2027-10-12', name: 'Fiesta Nacional de España' },
  { market: 'ES', date: '2027-11-01', name: 'Todos los Santos' },
  { market: 'ES', date: '2027-12-06', name: 'Día de la Constitución' },
  { market: 'ES', date: '2027-12-08', name: 'Inmaculada Concepción' },
  { market: 'ES', date: '2027-12-25', name: 'Navidad' },

  // --- Italia ---
  { market: 'IT', date: '2026-01-01', name: 'Capodanno' },
  { market: 'IT', date: '2026-01-06', name: 'Epifania' },
  { market: 'IT', date: '2026-04-06', name: "Lunedì dell'Angelo" },
  { market: 'IT', date: '2026-04-25', name: 'Festa della Liberazione' },
  { market: 'IT', date: '2026-05-01', name: 'Festa del Lavoro' },
  { market: 'IT', date: '2026-06-02', name: 'Festa della Repubblica' },
  { market: 'IT', date: '2026-08-15', name: 'Ferragosto' },
  { market: 'IT', date: '2026-11-01', name: 'Ognissanti' },
  { market: 'IT', date: '2026-12-08', name: 'Immacolata Concezione' },
  { market: 'IT', date: '2026-12-25', name: 'Natale' },
  { market: 'IT', date: '2026-12-26', name: 'Santo Stefano' },
  { market: 'IT', date: '2027-01-01', name: 'Capodanno' },
  { market: 'IT', date: '2027-01-06', name: 'Epifania' },
  { market: 'IT', date: '2027-03-29', name: "Lunedì dell'Angelo" },
  { market: 'IT', date: '2027-04-25', name: 'Festa della Liberazione' },
  { market: 'IT', date: '2027-05-01', name: 'Festa del Lavoro' },
  { market: 'IT', date: '2027-06-02', name: 'Festa della Repubblica' },
  { market: 'IT', date: '2027-08-15', name: 'Ferragosto' },
  { market: 'IT', date: '2027-11-01', name: 'Ognissanti' },
  { market: 'IT', date: '2027-12-08', name: 'Immacolata Concezione' },
  { market: 'IT', date: '2027-12-25', name: 'Natale' },
  { market: 'IT', date: '2027-12-26', name: 'Santo Stefano' },

  // --- Bélgica: festivos federales, iguales para BE-FR y BE-NL ---
  ...(['BE_FR', 'BE_NL'] as const).flatMap((market): PublicHoliday[] => [
    { market, date: '2026-01-01', name: 'Nouvel An / Nieuwjaar' },
    { market, date: '2026-04-06', name: 'Lundi de Pâques / Paasmaandag' },
    { market, date: '2026-05-01', name: 'Fête du Travail / Dag van de Arbeid' },
    { market, date: '2026-05-14', name: 'Ascension / O.-L.-H. Hemelvaart' },
    { market, date: '2026-05-25', name: 'Lundi de Pentecôte / Pinkstermaandag' },
    { market, date: '2026-07-21', name: 'Fête Nationale / Nationale Feestdag' },
    { market, date: '2026-08-15', name: 'Assomption / O.-L.-V. Hemelvaart' },
    { market, date: '2026-11-01', name: 'Toussaint / Allerheiligen' },
    { market, date: '2026-11-11', name: 'Armistice / Wapenstilstand' },
    { market, date: '2026-12-25', name: 'Noël / Kerstmis' },
    { market, date: '2027-01-01', name: 'Nouvel An / Nieuwjaar' },
    { market, date: '2027-03-29', name: 'Lundi de Pâques / Paasmaandag' },
    { market, date: '2027-05-01', name: 'Fête du Travail / Dag van de Arbeid' },
    { market, date: '2027-05-06', name: 'Ascension / O.-L.-H. Hemelvaart' },
    { market, date: '2027-05-17', name: 'Lundi de Pentecôte / Pinkstermaandag' },
    { market, date: '2027-07-21', name: 'Fête Nationale / Nationale Feestdag' },
    { market, date: '2027-08-15', name: 'Assomption / O.-L.-V. Hemelvaart' },
    { market, date: '2027-11-01', name: 'Toussaint / Allerheiligen' },
    { market, date: '2027-11-11', name: 'Armistice / Wapenstilstand' },
    { market, date: '2027-12-25', name: 'Noël / Kerstmis' },
  ]),
];

export function isHoliday(
  date: Date,
  market: Market,
  holidays: readonly PublicHoliday[],
): boolean {
  const iso = date.toISOString().slice(0, 10);
  return holidays.some((h) => h.market === market && h.date === iso);
}
