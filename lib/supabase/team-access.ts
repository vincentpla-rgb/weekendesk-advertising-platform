import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from './database.types.js';

/**
 * Puente hacia `allowed_emails` / `profiles`, independiente de
 * @supabase/supabase-js para que `resolveTeamAccess` se pueda probar sin una
 * base de datos real (mismo patrón que `lib/pricing-context.ts` con el motor
 * de precios).
 */
export interface TeamAccessGateway {
  getProfile(userId: string): Promise<{ isActive: boolean } | null>;
  isEmailAllowed(email: string): Promise<boolean>;
  createProfile(input: { id: string; email: string }): Promise<boolean>;
}

/**
 * ¿Puede este usuario autenticado entrar a la app?
 *
 * `allowed_emails` es la lista blanca (CLAUDE.md §2); `profiles` es el
 * perfil de equipo activo que usan las políticas RLS del resto de tablas
 * (`is_team_member()`). Antes de esta función, un email añadido solo a
 * `allowed_emails` se quedaba fuera para siempre: /auth/callback solo
 * miraba `profiles`, y nada creaba esa fila automáticamente. Aquí, en el
 * primer login de un email que sí está en la lista blanca, se crea el
 * `profiles` que falta.
 *
 * Si el perfil ya existe, su `is_active` manda tal cual: un perfil
 * desactivado a mano no se reactiva solo porque el email siga en
 * `allowed_emails`.
 */
export async function resolveTeamAccess(
  gateway: TeamAccessGateway,
  user: { id: string; email: string },
): Promise<boolean> {
  const email = user.email.toLowerCase();

  const profile = await gateway.getProfile(user.id);
  if (profile) {
    return profile.isActive;
  }

  const allowed = await gateway.isEmailAllowed(email);
  if (!allowed) {
    return false;
  }

  return gateway.createProfile({ id: user.id, email });
}

/**
 * Gateway real, con la clave de servicio (ver `lib/supabase/service.ts`):
 * tanto la lectura de `allowed_emails` como la primera inserción en
 * `profiles` necesitan bypassar RLS, porque ambas políticas exigen
 * `is_team_member()`, que exige el `profiles` que todavía no existe.
 */
export function createSupabaseTeamAccessGateway(
  serviceClient: SupabaseClient<Database>,
): TeamAccessGateway {
  return {
    async getProfile(userId) {
      const { data } = await serviceClient
        .from('profiles')
        .select('is_active')
        .eq('id', userId)
        .maybeSingle();

      return data ? { isActive: data.is_active } : null;
    },

    async isEmailAllowed(email) {
      const { data } = await serviceClient
        .from('allowed_emails')
        .select('email')
        .eq('email', email)
        .maybeSingle();

      return data !== null;
    },

    async createProfile({ id, email }) {
      const { error } = await serviceClient
        .from('profiles')
        .insert({ id, email, full_name: email, is_active: true });

      return !error;
    },
  };
}
