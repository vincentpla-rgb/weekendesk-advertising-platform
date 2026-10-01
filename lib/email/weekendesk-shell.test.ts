import { describe, expect, it } from 'vitest';

import {
  escapeHtml,
  formatDateLong,
  formatMoney,
  formatPercent,
  formatPoints,
  interpolate,
  rowsCard,
  toJsonLang,
} from './weekendesk-shell.js';

describe('weekendesk-shell', () => {
  it('toJsonLang mapea los 5 idiomas de CLAUDE.md §2 a las claves en minúscula del copy', () => {
    expect(toJsonLang('ES')).toBe('es');
    expect(toJsonLang('FR')).toBe('fr');
    expect(toJsonLang('EN')).toBe('en');
    expect(toJsonLang('IT')).toBe('it');
    expect(toJsonLang('NL')).toBe('nl');
  });

  it('interpolate sustituye TODAS las apariciones de una variable repetida (no solo la primera, CLAUDE.md §10.3 undecies)', () => {
    const result = interpolate('{{market}} y otra vez {{market}}', { market: 'FR' });
    expect(result).toBe('FR y otra vez FR');
  });

  it('interpolate deja la llave intacta si falta la variable, en vez de "undefined"', () => {
    expect(interpolate('Hola {{firstName}}', {})).toBe('Hola {{firstName}}');
  });

  it('escapeHtml escapa & < > sin escapar comillas (no hace falta en un nodo de texto)', () => {
    expect(escapeHtml('A & B <script>')).toBe('A &amp; B &lt;script&gt;');
  });

  it('formatMoney redondea a euros sin decimales, con separador de miles del idioma', () => {
    expect(formatMoney(600000, 'ES')).toContain('6.000');
    expect(formatMoney(600000, 'EN')).toContain('6,000');
  });

  it('formatMoney con signed muestra el signo incluso en positivo', () => {
    expect(formatMoney(60000, 'ES', true)).toMatch(/^\+/);
    expect(formatMoney(-60000, 'ES', true)).toMatch(/^-/);
  });

  it('formatPercent da un decimal, formatPoints dos cifras con signo', () => {
    expect(formatPercent(0.58, 'EN')).toBe('58.0%');
    expect(formatPoints(0.03, 'EN', 'pts')).toContain('pts');
    expect(formatPoints(0.03, 'EN', 'pts')).toMatch(/^\+/);
  });

  it('formatDateLong usa el locale del idioma del cliente', () => {
    const d = new Date('2026-10-14T00:00:00.000Z');
    expect(formatDateLong(d, 'EN')).toContain('October');
    expect(formatDateLong(d, 'ES')).toContain('octubre');
  });

  it('rowsCard no escapa el valor (puede llevar HTML de confianza como un pill) — el llamador debe escapar lo que no lo sea', () => {
    const html = rowsCard([['Label', '<b>valor</b>']]);
    expect(html).toContain('<b>valor</b>');
    expect(html).toContain('Label');
  });
});
