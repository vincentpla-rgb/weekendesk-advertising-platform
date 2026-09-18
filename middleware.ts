import type { NextRequest } from 'next/server';

import { updateSession } from './lib/supabase/middleware.js';

export function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Todas las rutas salvo los estáticos de Next y los assets. La pantalla
     * pública (/p/*) y el login quedan excluidos de la exigencia de sesión
     * dentro de updateSession, no aquí, porque de todos modos necesitan
     * pasar por el refresco de cookies de Supabase.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
