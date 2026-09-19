import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Guarda de regresión para el bug real de producción: `emailRedirectTo`
 * apuntaba directo a `/proposals/new` en vez de a `/auth/callback`, y el
 * enlace mágico se quedaba en `otp_expired` sin crear sesión nunca (el
 * código PKCE nunca se canjeaba).
 *
 * `lib/supabase/login-redirect.test.ts` ya prueba `buildLoginRedirectUrl`
 * en aislamiento — eso demuestra que la función es correcta, pero no que
 * `/login` la use de verdad: la primera vez que se corrigió este bug, el
 * commit del arreglo llegó a esta misma rama pero no se fusionó a `main` a
 * tiempo (un problema de proceso, no de código), y la página en producción
 * siguió construyendo `emailRedirectTo` a mano durante otro ciclo completo.
 * Esta prueba lee el código fuente real de la página para que un futuro
 * revert — a mano o por un cambio automatizado que reintroduzca el patrón
 * antiguo sin darse cuenta — falle aquí, no en producción.
 */
const SOURCE = readFileSync(fileURLToPath(new URL('./page.tsx', import.meta.url)), 'utf-8');

describe('app/login/page.tsx — construcción de emailRedirectTo', () => {
  it('importa y usa buildLoginRedirectUrl para emailRedirectTo', () => {
    expect(SOURCE).toContain("from '@/lib/supabase/login-redirect'");
    expect(SOURCE).toMatch(/emailRedirectTo:\s*buildLoginRedirectUrl\(/);
  });

  it('no reintroduce el patrón que causó el bug: una plantilla que apunta directo a la página destino', () => {
    // El bug real: `emailRedirectTo: \`${window.location.origin}/proposals/new\``
    // — cualquier literal de plantilla que combine el origin con una ruta
    // que NO sea /auth/callback, asignado directamente a emailRedirectTo.
    expect(SOURCE).not.toMatch(/emailRedirectTo:\s*`\$\{[^}]*origin[^}]*\}\/(?!auth\/callback)/);
  });

  it('llama a signInWithOtp exactamente una vez (un único punto de construcción del enlace)', () => {
    const matches = SOURCE.match(/signInWithOtp/g) ?? [];
    expect(matches).toHaveLength(1);
  });
});
