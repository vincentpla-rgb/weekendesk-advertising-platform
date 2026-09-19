import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { authorizeTeamSession } from '@/lib/supabase/authorize-session';

/**
 * Vuelta del magic link del equipo (CLAUDE.md §2): canjea el código PKCE
 * (`?code=`) por una sesión con `exchangeCodeForSession` **antes** de
 * comprobar nada, y solo entonces resuelve la lista blanca y redirige a
 * `next`.
 *
 * Infraestructura del magic link, sin usar en la app hoy: el login pasó a
 * email + contraseña (`app/login/actions.ts`, `loginWithPassword`) porque el
 * enlace se consumía antes de que la persona lo abriera — el rastreador de
 * clics de Resend/SES abría el `code` de un solo uso antes del clic real, un
 * problema de infraestructura ajeno a este código (CLAUDE.md §10.3). Nada
 * genera ya un enlace hacia aquí, pero se deja tal cual por si se recupera
 * más adelante: sigue siendo la ruta a la que apuntaría `emailRedirectTo`
 * (`lib/supabase/login-redirect.ts`) si el magic link volviera.
 *
 * `/auth/confirm` (con `token_hash` en vez de `code`) sería la vuelta si el
 * "Send Email Hook" de Supabase (`app/api/auth/send-email/`) se activara en
 * el dashboard — tampoco está en uso.
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
