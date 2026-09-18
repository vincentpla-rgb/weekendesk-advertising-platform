import { describe, expect, it } from 'vitest';

import { allocateProRata, applyRate, euros, marginFloor, toEuros } from '../money.js';

describe('conversión', () => {
  it('pasa de euros a céntimos sin arrastrar coma flotante', () => {
    expect(euros(152.5)).toBe(15_250);
    expect(euros(0.1 + 0.2)).toBe(30);
    expect(toEuros(30_500)).toBe(305);
  });
});

describe('marginFloor', () => {
  it('con el 50 % el suelo es el doble del coste', () => {
    expect(marginFloor(15_250, 0.5)).toBe(30_500);
    expect(marginFloor(14_000, 0.5)).toBe(28_000);
  });

  it('redondea hacia arriba: nunca un céntimo por debajo del margen exigido', () => {
    // Coste impar: 111 / 0,50 = 222 exacto; 111 al 60 % → 111 / 0,40 = 277,5 → 278
    expect(marginFloor(111, 0.6)).toBe(278);
    expect((278 - 111) / 278).toBeGreaterThanOrEqual(0.6);
  });

  it('usa 1 - margen, no el margen: al 60 % el suelo es coste / 0,40', () => {
    expect(marginFloor(40_000, 0.6)).toBe(100_000);
  });

  it('rechaza tasas fuera de rango', () => {
    expect(() => marginFloor(1000, 0)).toThrow(RangeError);
    expect(() => marginFloor(1000, 1)).toThrow(RangeError);
  });
});

describe('allocateProRata', () => {
  it('reparte en proporción exacta cuando la división es limpia', () => {
    expect(allocateProRata(22_150, [400_000, 43_000])).toEqual([20_000, 2150]);
  });

  it('la suma del reparto es siempre el total, con restos', () => {
    const casos: Array<[number, number[]]> = [
      [100, [1, 1, 1]],
      [1, [1, 1, 1, 1]],
      [9999, [7, 11, 13, 17, 19]],
      [215_25, [400_000, 30_500]],
      [123_457, [1, 2, 3, 4, 5, 6, 7]],
    ];
    for (const [total, weights] of casos) {
      const reparto = allocateProRata(total, weights);
      expect(reparto.reduce((a, b) => a + b, 0)).toBe(total);
      expect(reparto.every(Number.isInteger)).toBe(true);
    }
  });

  it('en empate de resto gana el índice más bajo: reparto determinista', () => {
    expect(allocateProRata(1, [1, 1])).toEqual([1, 0]);
    expect(allocateProRata(2, [1, 1, 1])).toEqual([1, 1, 0]);
  });

  it('reparte cero cuando no hay nada que repartir o los pesos son nulos', () => {
    expect(allocateProRata(0, [5, 5])).toEqual([0, 0]);
    expect(allocateProRata(500, [0, 0])).toEqual([0, 0]);
    expect(allocateProRata(500, [])).toEqual([]);
  });

  it('exige un total entero de céntimos', () => {
    expect(() => allocateProRata(10.5, [1, 1])).toThrow(TypeError);
  });
});

describe('applyRate', () => {
  it('redondea al céntimo', () => {
    expect(applyRate(30_000, 0.4)).toBe(12_000);
    expect(applyRate(333, 0.5)).toBe(167); // 166,5 → 167
  });
});
