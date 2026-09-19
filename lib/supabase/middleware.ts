import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import type { Database } from './database.types.js';

/**
 * Refresca la sesión de Supabase en cada petición y protege las rutas
 * internas con la lista blanca de emails (CLAUDE.md §2): magic link, sin
 * Google SSO. `allowed_emails` es la lista blanca; `profiles` es el perfil
 * de equipo activo que crea automáticamente /auth/callback en el primer
 * login de un email permitido (ver `lib/supabase/team-access.ts`). Aquí solo
 * se comprueba que haya sesión — la lista blanca ya se resolvió al volver
 * del magic link.
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

  const isPublicRoute =
    request.nextUrl.pathname === '/login' ||
    request.nextUrl.pathname.startsWith('/auth') ||
    request.nextUrl.pathname.startsWith('/p/') ||
    request.nextUrl.pathname.startsWith('/api/public') ||
    request.nextUrl.pathname.startsWith('/api/vies');

  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  return response;
}
