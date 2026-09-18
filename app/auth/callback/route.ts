import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

/**
 * Vuelta del magic link. Intercambia el código por sesión y comprueba la
 * lista blanca: un email autenticado pero sin perfil de equipo activo se
 * desconecta y se redirige a /no-autorizado. RLS ya bloquea el acceso a los
 * datos en cualquier caso (`is_team_member()`); esto es además para no dejar
 * ver la interfaz vacía a quien no debería estar aquí.
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

  if (!user) {
    return NextResponse.redirect(`${origin}/login`);
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', user.id)
    .eq('is_active', true)
    .maybeSingle();

  if (!profile) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/no-autorizado`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
