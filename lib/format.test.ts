import { describe, expect, it } from 'vitest';

import { supportLabel } from './format';

describe('supportLabel', () => {
  it('devuelve "nombre (código)" cuando hay nombre', () => {
    expect(supportLabel('Marketing Block', 'ON-01')).toBe('Marketing Block (ON-01)');
  });

  it('cae al código solo cuando no hay nombre (soporte desactivado o sin dato)', () => {
    expect(supportLabel(undefined, 'ON-99')).toBe('ON-99');
    expect(supportLabel(null, 'ON-99')).toBe('ON-99');
    expect(supportLabel('', 'ON-99')).toBe('ON-99');
  });
});
