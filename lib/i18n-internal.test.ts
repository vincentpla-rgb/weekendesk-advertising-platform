import { describe, expect, it } from 'vitest';

import { interpolate } from './i18n-internal';

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
