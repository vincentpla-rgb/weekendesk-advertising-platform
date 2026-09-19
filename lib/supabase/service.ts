import { createClient as createSupabaseClient } from '@supabase/supabase-js';

import type { Database } from './database.types.js';

/**
 * Cliente con la clave de servicio: bypassa RLS. Solo para uso en servidor
 * (route handlers), nunca en el navegador ni en Server Components que
 * reenvíen datos sin filtrar.
 *
 * Hace falta para resolver el acceso de equipo en /auth/callback
 * (ver `lib/supabase/team-access.ts`): tanto `allowed_emails` como
 * `profiles` tienen una política RLS que exige `is_team_member()`, y
 * `is_team_member()` exige un `profiles` activo — el mismo que un usuario
 * en su primer login todavía no tiene. Con la sesión del propio usuario esa
 * comprobación es circular; con la clave de servicio no lo es.
 */
export function createServiceClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
