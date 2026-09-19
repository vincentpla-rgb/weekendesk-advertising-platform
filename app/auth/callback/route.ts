import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { createSupabaseTeamAccessGateway, resolveTeamAccess } from '@/lib/supabase/team-access';

/**
 * Vuelta del magic link. Intercambia el código por sesión y comprueba la
 * lista blanca (`allowed_emails`): un email autenticado que no esté ahí se
 * desconecta y se redirige a /no-autorizado.
 *
 * La comprobación usa la clave de servicio (`resolveTeamAccess`), no la
 * sesión del propio usuario: tanto `allowed_emails` como `profiles` tienen
 * una política RLS que exige `is_team_member()`, y `is_team_member()` exige
 * un `profiles` activo — el mismo que un usuario en su primer login todavía
 * no tiene. Con la sesión del usuario esa comprobación es circular y se
 * queda fuera para siempre aunque su email esté en la lista blanca; con la
 * clave de servicio no lo es, y de paso crea el `profiles` que falta la
 * primera vez.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/proposals/new';

  if (!code) {
    return NextResponse.redirect(`${origin}/login`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/login`);
  }

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
