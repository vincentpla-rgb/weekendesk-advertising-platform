import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import type { Database } from './database.types.js';
import { resolveAuthGateDecision } from './auth-gate.js';

/**
 * Refresca la sesión de Supabase en cada petición y protege las rutas
 * internas (CLAUDE.md §2): login con email + contraseña, sin Google SSO.
 * `allowed_emails` es la lista blanca; `profiles` es el perfil de equipo
 * activo que crea automáticamente `loginWithPassword` en el primer login de
 * un email permitido (ver `lib/supabase/team-access.ts`) — aquí solo se
 * comprueba que haya sesión, la lista blanca ya se resolvió al hacer login.
 *
 * Segunda puerta, ronda 15 (CLAUDE.md §10.3): si el usuario tiene pendiente
 * el cambio obligatorio de la contraseña inicial que le dio un admin
 * (`user.app_metadata.must_change_password`, ver `app/(internal)/admin/users/actions.ts`
 * y `app/change-password/`), se le redirige a `/change-password` antes de
 * dejarle entrar a cualquier otra pantalla — o se bloquea con un 403 si
 * intenta llamar a una API interna directamente. La decisión de qué hacer
 * con cada ruta vive en `resolveAuthGateDecision` (`./auth-gate.ts`), pura y
 * testeada sin necesidad de construir un `NextRequest` real.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const decision = resolveAuthGateDecision({
    pathname: request.nextUrl.pathname,
    hasUser: !!user,
    mustChangePassword: user?.app_metadata?.['must_change_password'] === true,
  });

  if (decision.action === 'redirect') {
    const url = request.nextUrl.clone();
    url.pathname = decision.to;
    url.searchParams.set('next', request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  if (decision.action === 'block-json') {
    return NextResponse.json(
      { error: 'Cambio de contraseña obligatorio pendiente. Ve a /change-password.' },
      { status: 403 },
    );
  }

  return response;
}
