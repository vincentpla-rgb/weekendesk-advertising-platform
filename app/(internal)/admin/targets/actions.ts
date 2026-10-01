'use server';

/**
 * Objetivos por advertising manager y por quarter fiscal (CLAUDE.md §0,
 * ronda 18, bloque 4): "Debe ser editable desde admin". `quarterly_targets`
 * existe en el esquema desde la primerísima migración
 * (`20260918120000_initial_schema.sql`) — una fila por `(profile_id,
 * fiscal_year, fiscal_quarter)` — pero hasta esta ronda ningún flujo de la
 * aplicación leía ni escribía en ella (mismo patrón que `overrides` antes de
 * la ronda 9, o `is_admin` antes de la ronda 16). Confirmado por Vincent:
 * la tabla sirve tal cual, sin ningún cambio de esquema.
 *
 * `team_all` (RLS, esquema inicial) ya deja a cualquier miembro de equipo
 * activo leer y escribir esta tabla — mismo modelo de acceso que
 * `/admin/users` (CLAUDE.md §9: no existe todavía un rol "administrador"
 * que restrinja esta pantalla, y no se ha pedido en esta ronda).
 */

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import { euros } from '@/src/pricing/index.js';
import type { FiscalQuarter } from '@/src/pricing/index.js';

export type SetQuarterlyTargetResult = { readonly ok: true } | { readonly ok: false; readonly error: string };

/**
 * Upsert de un único objetivo (un AM, un año fiscal, un quarter). Un objetivo
 * en blanco en la interfaz se guarda como 0 €, nunca se borra la fila — así
 * `objetivo global = suma de las 4 filas` (CLAUDE.md §0) sigue siendo una
 * suma simple, sin tener que tratar "sin fila" y "fila en 0" como casos
 * distintos.
 */
export async function setQuarterlyTarget(input: {
  profileId: string;
  fiscalYear: number;
  fiscalQuarter: FiscalQuarter;
  targetEuros: number;
}): Promise<SetQuarterlyTargetResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: 'No autenticado' };
  }

  if (!Number.isFinite(input.targetEuros) || input.targetEuros < 0) {
    return { ok: false, error: 'El objetivo no puede ser negativo' };
  }

  const { error } = await supabase.from('quarterly_targets').upsert(
    {
      profile_id: input.profileId,
      fiscal_year: input.fiscalYear,
      fiscal_quarter: input.fiscalQuarter,
      target_cents: euros(input.targetEuros),
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'profile_id,fiscal_year,fiscal_quarter' },
  );

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath('/admin/targets');
  revalidatePath('/dashboard');
  return { ok: true };
}
