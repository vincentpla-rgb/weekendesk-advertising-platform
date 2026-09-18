import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

import type { Database } from './database.types.js';

/**
 * Cliente de Supabase para Server Components, Route Handlers y Server
 * Actions. Usa la clave anon y las cookies de la sesión: la identidad real es
 * la del usuario autenticado (magic link), y RLS decide qué puede hacer.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Llamado desde un Server Component: la sesión ya la refresca el
            // middleware. Se puede ignorar con seguridad.
          }
        },
      },
    },
  );
}

/**
 * Cliente para la pantalla pública y sus API routes: mismo proyecto, sin
 * cookies de sesión de equipo (el visitante no tiene cuenta). Solo puede
 * llamar a lo que esté concedido a `anon`: get_public_proposal,
 * mark_public_proposal_viewed, accept_public_proposal, reject_public_proposal.
 */
export function createPublicClient() {
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => [],
        setAll: () => {},
      },
    },
  );
}
