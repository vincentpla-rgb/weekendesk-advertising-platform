import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from './database.types.js';

/**
 * Puente hacia `allowed_emails` / `profiles`, independiente de
 * @supabase/supabase-js para que `resolveTeamAccess` se pueda probar sin una
 * base de datos real (mismo patrón que `lib/pricing-context.ts` con el motor
 * de precios).
 *
 * `createProfile` devuelve el error tal cual en vez de un booleano: un fallo
 * de inserción (una restricción NOT NULL, un typo de columna, RLS mal
 * configurado) no es lo mismo que "no está en la lista blanca", y antes de
 * esto ambos casos se veían igual desde fuera — un usuario legítimo se
 * quedaba en /no-autorizado sin ninguna pista de que el problema era otro.
 */
export interface TeamAccessGateway {
  getProfile(userId: string): Promise<{ isActive: boolean } | null>;
  getAllowedEmail(email: string): Promise<{ fullName: string | null } | null>;
  createProfile(input: {
    id: string;
    email: string;
    fullName: string;
  }): Promise<{ ok: true } | { ok: false; error: string }>;
}

/**
 * Nombre por defecto a partir del email cuando `allowed_emails.full_name`
 * está vacío: "vincent.pla" → "Vincent Pla". `profiles.full_name` es NOT
 * NULL, así que siempre hace falta un valor, aunque sea provisional — el
 * comercial lo puede corregir a mano más tarde.
 */
export function defaultFullName(email: string): string {
  const localPart = email.split('@')[0] ?? email;
  const words = localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1));

  return words.length > 0 ? words.join(' ') : email;
}

/**
 * ¿Puede este usuario autenticado entrar a la app?
 *
 * `allowed_emails` es la lista blanca (CLAUDE.md §2); `profiles` es el
 * perfil de equipo activo que usan las políticas RLS del resto de tablas
 * (`is_team_member()`). Antes de esto, un email añadido solo a
 * `allowed_emails` se quedaba fuera para siempre: /auth/callback solo
 * miraba `profiles`, y nada creaba esa fila automáticamente. Aquí, en el
 * primer login de un email que sí está en la lista blanca, se crea el
 * `profiles` que falta.
 *
 * Si el perfil ya existe, su `is_active` manda tal cual: un perfil
 * desactivado a mano no se reactiva solo porque el email siga en
 * `allowed_emails`.
 *
 * Si la creación del perfil falla (por ejemplo, un fallo de base de datos
 * ajeno a la lista blanca), se registra con `log` y se deniega el acceso —
 * pero el registro dice explícitamente que el fallo es de aprovisionamiento,
 * no de autorización, para no repetir la confusión de "esto parece RLS"
 * cuando el problema real está en otro sitio.
 */
export async function resolveTeamAccess(
  gateway: TeamAccessGateway,
  user: { id: string; email: string },
  log: (message: string) => void = console.error,
): Promise<boolean> {
  const email = user.email.toLowerCase();

  const profile = await gateway.getProfile(user.id);
  if (profile) {
    return profile.isActive;
  }

  const allowed = await gateway.getAllowedEmail(email);
  if (!allowed) {
    return false;
  }

  const fullName = allowed.fullName?.trim() || defaultFullName(email);
  const result = await gateway.createProfile({ id: user.id, email, fullName });

  if (!result.ok) {
    log(
      `[team-access] ${email} está en allowed_emails pero no se pudo crear su profiles ` +
        `(id ${user.id}): ${result.error}. Se le deniega el acceso por este fallo de ` +
        'aprovisionamiento, no porque no esté autorizado.',
    );
    return false;
  }

  return true;
}

/**
 * Gateway real, con la clave de servicio (ver `lib/supabase/service.ts`):
 * tanto la lectura de `allowed_emails` como la primera inserción en
 * `profiles` necesitan bypassar RLS, porque ambas políticas exigen
 * `is_team_member()`, que exige el `profiles` que todavía no existe.
 *
 * También registra los errores de lectura de `getProfile`/`getAllowedEmail`
 * (por ejemplo, una clave de servicio mal configurada haría fallar ambas
 * consultas en silencio si no se comprobara `error`), no solo los de
 * `createProfile`.
 */
export function createSupabaseTeamAccessGateway(
  serviceClient: SupabaseClient<Database>,
  log: (message: string) => void = console.error,
): TeamAccessGateway {
  return {
    async getProfile(userId) {
      const { data, error } = await serviceClient
        .from('profiles')
        .select('is_active')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        log(`[team-access] error leyendo profiles de ${userId}: ${error.message}`);
        return null;
      }

      return data ? { isActive: data.is_active } : null;
    },

    async getAllowedEmail(email) {
      const { data, error } = await serviceClient
        .from('allowed_emails')
        .select('full_name')
        .eq('email', email)
        .maybeSingle();

      if (error) {
        log(`[team-access] error leyendo allowed_emails de ${email}: ${error.message}`);
        return null;
      }

      return data ? { fullName: data.full_name } : null;
    },

    async createProfile({ id, email, fullName }) {
      const { error } = await serviceClient
        .from('profiles')
        .insert({ id, email, full_name: fullName, is_active: true });

      return error ? { ok: false, error: error.message } : { ok: true };
    },
  };
}
