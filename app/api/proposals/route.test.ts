import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Guarda de regresión (CLAUDE.md §5.6, ronda 2 de correcciones): el idioma
 * del email de envío tiene que ser exactamente el mismo que el de la
 * pantalla pública — el "Idioma del cliente" que el comercial elige para
 * ESTE envío (`body.language`), no `contacts.language`. Ese último es un
 * dato persistente del contacto que puede arrastrar el idioma de un envío
 * anterior y desincronizarse silenciosamente del que se ve en `/p/[token]`.
 *
 * Se encontró así: `body.language` alimenta `proposals.language` (lo que lee
 * `get_public_proposal`), pero el email construía su copy con
 * `created.contact_language`, el valor de `contacts.language` devuelto por
 * `create_and_send_proposal` — dos campos distintos que, para un contacto ya
 * existente creado en un envío anterior en otro idioma, no tienen por qué
 * coincidir. No hay un test de integración de esta ruta completa (exige un
 * proyecto Supabase real, ver CLAUDE.md §10.1.2): esta prueba lee el código
 * fuente para que un futuro cambio no reintroduzca `contact_language` aquí
 * sin que salte algo.
 */
const SOURCE = readFileSync(fileURLToPath(new URL('./route.ts', import.meta.url)), 'utf-8');

describe('app/api/proposals/route.ts — idioma del email = idioma de la pantalla pública', () => {
  it('construye el email con body.language, no con contact_language', () => {
    expect(SOURCE).toMatch(/language:\s*body\.language/);
    expect(SOURCE).not.toContain('created.contact_language');
  });

  it('ya no pide contact_language al servidor: el email no depende del idioma persistido del contacto', () => {
    expect(SOURCE).not.toContain('contact_language');
  });
});
