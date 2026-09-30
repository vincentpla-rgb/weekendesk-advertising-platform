import { describe, expect, it } from 'vitest';

import { DICTS_FOR_TESTING, INTERNAL_LANGUAGES, interpolate } from './i18n-internal';

describe('interpolate', () => {
  it('sin vars, devuelve el texto tal cual', () => {
    expect(interpolate('Hola mundo')).toBe('Hola mundo');
  });

  it('sustituye una variable', () => {
    expect(interpolate('Hola {name}', { name: 'Vincent' })).toBe('Hola Vincent');
  });

  it('sustituye TODAS las apariciones de una variable repetida (ronda 11)', () => {
    // Bug real: checklist.leadTimeInsufficient usa {market} dos veces —
    // con un replace() de un solo uso, la segunda aparición se quedaba sin
    // traducir. Ver CLAUDE.md §10.3 undecies.
    expect(interpolate('{support} en {market}, festivos de {market}', { support: 'ON-01', market: 'FR' })).toBe(
      'ON-01 en FR, festivos de FR',
    );
  });

  it('sustituye varias variables distintas', () => {
    expect(interpolate('{a} y {b}', { a: '1', b: '2' })).toBe('1 y 2');
  });
});

describe('market.* (ronda 14, sexto mercado NL)', () => {
  const MARKET_KEYS = ['market.FR', 'market.ES', 'market.IT', 'market.BE_FR', 'market.BE_NL', 'market.NL'] as const;

  it.each(INTERNAL_LANGUAGES)('%s tiene una etiqueta para los 6 mercados', (lang) => {
    for (const key of MARKET_KEYS) {
      expect(DICTS_FOR_TESTING[lang][key]).toBeTruthy();
    }
  });

  it('NL y BE_NL tienen etiquetas distintas en cada idioma (no se confunden)', () => {
    for (const lang of INTERNAL_LANGUAGES) {
      expect(DICTS_FOR_TESTING[lang]['market.NL']).not.toBe(DICTS_FOR_TESTING[lang]['market.BE_NL']);
    }
  });

  it('ES usa "Países Bajos" para NL, distinto de "Bélgica (NL)"', () => {
    expect(DICTS_FOR_TESTING.ES['market.NL']).toBe('Países Bajos');
    expect(DICTS_FOR_TESTING.ES['market.BE_NL']).toBe('Bélgica (NL)');
  });
});
