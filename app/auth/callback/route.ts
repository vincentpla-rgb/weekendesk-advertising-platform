import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { authorizeTeamSession } from '@/lib/supabase/authorize-session';

/**
 * Vuelta del magic link del equipo (CLAUDE.md §2): canjea el código PKCE
 * (`?code=`) por una sesión con `exchangeCodeForSession` **antes** de
 * comprobar nada, y solo entonces resuelve la lista blanca y redirige a
 * `next`. Es la ruta a la que `emailRedirectTo` (`app/login/page.tsx`,
 * `lib/supabase/login-redirect.ts`) apunta siempre — apuntar directo a la
 * página destino, saltándose este canje, fue un bug real (el enlace se
 * quedaba en `otp_expired` sin crear sesión nunca).
 *
 * `/auth/confirm` (con `token_hash` en vez de `code`) es la vuelta que usaría
 * el "Send Email Hook" de Supabase (`app/api/auth/send-email/`) si algún día
 * se activa en el dashboard; hoy no lo está, así que esta es la única vuelta
 * real en producción.
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
