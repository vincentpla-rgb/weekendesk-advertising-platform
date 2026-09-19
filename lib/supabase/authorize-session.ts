import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from './database.types.js';
import { createServiceClient } from './service';
import { createSupabaseTeamAccessGateway, resolveTeamAccess } from './team-access';

/**
 * Comprueba la lista blanca para una sesión ya autenticada (magic link ya
 * canjeado, sea por `/auth/callback` con `code` o por `/auth/confirm` con
 * `token_hash`) y redirige. Compartido entre las dos rutas para no duplicar
 * la lógica de aprovisionamiento de `lib/supabase/team-access.ts`.
 */
export async function authorizeTeamSession(
  supabase: SupabaseClient<Database>,
  origin: string,
  next: string,
): Promise<NextResponse> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email) {
    return NextResponse.redirect(`${origin}/login`);
  }

  const gateway = createSupabaseTeamAccessGateway(createServiceClient());
  const authorized = await resolveTeamAccess(gateway, { id: user.id, email: user.email });

  if (!authorized) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/no-autorizado`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
