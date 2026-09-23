import { describe, expect, it } from 'vitest';

import { COUNTRY_CODES, countryName } from './countries.js';

/**
 * Ronda 9 (CLAUDE.md §10.3 novies): el desplegable de país en "Cuenta y
 * contacto" se restringe a los países donde Weekendesk tiene hoteles o
 * clientes de publicidad — antes tenía ~60 países de toda Europa/mundo.
 * Es el país DEL CLIENTE, no debe confundirse con los 5 mercados de venta
 * de Weekendesk (FR/ES/IT/BE-FR/BE-NL).
 */
describe('COUNTRY_CODES (ronda 9)', () => {
  it('contiene exactamente los 10 países pedidos, ni más ni menos', () => {
    const expected = ['FR', 'ES', 'PT', 'AD', 'IT', 'CH', 'DE', 'LU', 'BE', 'NL'];
    expect([...COUNTRY_CODES].sort()).toEqual([...expected].sort());
    expect(COUNTRY_CODES).toHaveLength(10);
  });

  it('ya no incluye países fuera de la lista restringida (antes había ~60)', () => {
    for (const excluded of ['US', 'GB', 'AT', 'JP', 'CN', 'AU', 'MA', 'TR', 'IE', 'DK']) {
      expect(COUNTRY_CODES).not.toContain(excluded);
    }
  });

  it('no confunde el país del cliente con los mercados de venta de Weekendesk (FR/ES/IT/BE-FR/BE-NL)', () => {
    // 'BE' (Bélgica, país) es válido; los mercados internos usan 'BE_FR'/'BE_NL',
    // que nunca deben aparecer en esta lista de países ISO-2.
    expect(COUNTRY_CODES).toContain('BE');
    expect(COUNTRY_CODES).not.toContain('BE_FR');
    expect(COUNTRY_CODES).not.toContain('BE_NL');
  });

  it('cada código produce un nombre de país localizado en los tres idiomas de interfaz', () => {
    for (const code of COUNTRY_CODES) {
      for (const locale of ['es', 'fr', 'en'] as const) {
        const name = countryName(code, locale);
        expect(name).not.toBe('');
        expect(typeof name).toBe('string');
      }
    }
  });
});
