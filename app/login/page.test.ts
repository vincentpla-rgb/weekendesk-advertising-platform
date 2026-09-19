import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Guarda de regresión para el cambio de login por email/contraseña
 * (CLAUDE.md §10.3): el magic link se quitó de `/login` porque el enlace se
 * consumía antes de que la persona lo abriera (rastreador de clics de
 * Resend/SES), un problema que no depende de este código y no se pudo
 * arreglar. Esta prueba lee el código fuente real de la página para que un
 * futuro revert — a mano o por un cambio automatizado que reintroduzca
 * `signInWithOtp` sin darse cuenta — falle aquí, no en producción otra vez.
 */
const SOURCE = readFileSync(fileURLToPath(new URL('./page.tsx', import.meta.url)), 'utf-8');

describe('app/login/page.tsx — login con email y contraseña, sin magic link', () => {
  it('no llama a signInWithOtp: el magic link se quitó del login', () => {
    expect(SOURCE).not.toContain('signInWithOtp');
  });

  it('usa loginWithPassword (Server Action) para autenticar', () => {
    expect(SOURCE).toContain("from './actions'");
    expect(SOURCE).toMatch(/loginWithPassword\(/);
  });

  it('tiene un campo de contraseña real, no solo de email', () => {
    expect(SOURCE).toMatch(/type="password"/);
  });

  it('no ofrece recuperación de contraseña por email (fuera de alcance en esta versión)', () => {
    expect(SOURCE.toLowerCase()).not.toContain('recuperar');
    expect(SOURCE.toLowerCase()).not.toContain('forgot');
    expect(SOURCE.toLowerCase()).not.toContain('reset');
  });

  it('no ofrece registro público: no llama a signUp, solo a signInWith*', () => {
    expect(SOURCE).not.toMatch(/\.signUp\(/);
  });
});
