import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Guarda de regresión (CLAUDE.md §10.1.1, ronda 21): la raíz de la app
 * redirige al dashboard, no al creador de presupuestos — mismo criterio que
 * `app/login/page.tsx` y la cabecera interna desde la ronda 20.
 */
const SOURCE = readFileSync(fileURLToPath(new URL('./page.tsx', import.meta.url)), 'utf-8');

describe('app/page.tsx — raíz de la app', () => {
  it('redirige a /dashboard, no a /proposals/new', () => {
    expect(SOURCE).toContain("redirect('/dashboard')");
    expect(SOURCE).not.toContain("redirect('/proposals/new')");
  });
});
