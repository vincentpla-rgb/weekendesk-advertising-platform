import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { authorizeTeamSession } from '@/lib/supabase/authorize-session';

/**
 * Vuelta de un flujo de auth basado en código PKCE (`?code=`). El magic link
 * del equipo ya no pasa por aquí — usa `/auth/confirm` con `token_hash`
 * (CLAUDE.md §2: el email del enlace ahora lo construye el "Send Email Hook"
 * de Supabase con Resend, no la plantilla por defecto de Supabase que
 * generaba un `code`). Se deja esta ruta por si algún flujo futuro (o un
 * enlace ya enviado antes del cambio) todavía trae un `code`.
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

  return authorizeTeamSession(supabase, origin, next);
}
