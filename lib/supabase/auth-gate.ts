/**
 * Decisión pura de la puerta de acceso del middleware (CLAUDE.md §2, ronda
 * 15), separada de `NextRequest`/`NextResponse` para poder testearla sin
 * construir objetos de Next.js — mismo patrón que `buildLoginRedirectUrl`
 * (`lib/supabase/login-redirect.ts`).
 *
 * Dos motivos para no dejar pasar una petición, evaluados en este orden:
 *  1. Sin sesión y la ruta no es pública -> a `/login`.
 *  2. Con sesión pero con el cambio de contraseña obligatorio pendiente
 *     (ver `app/change-password/`) y la ruta no es pública ni es la propia
 *     pantalla de cambio -> a `/change-password` si es una página, o un
 *     bloqueo JSON si es una ruta `/api/*` — para que una llamada directa a
 *     la API tampoco pueda saltarse el cambio de contraseña.
 */
export type AuthGateDecision =
  | { readonly action: 'allow' }
  | { readonly action: 'redirect'; readonly to: string }
  | { readonly action: 'block-json' };

const PUBLIC_PATH_PREFIXES = ['/auth', '/p/', '/api/public', '/api/vies', '/api/auth/send-email'] as const;

export const CHANGE_PASSWORD_PATH = '/change-password';

/**
 * Rutas que no exigen sesión: la pantalla pública del cliente (`/p/[token]`
 * y sus API), la verificación de VIES, el "Send Email Hook" de Supabase
 * (autenticado con su propia firma de webhook, no con cookie de sesión), y
 * la maquinaria de `/auth` (login, callback del magic link dormido, signout).
 */
export function isPublicRoute(pathname: string): boolean {
  if (pathname === '/login') return true;
  return PUBLIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function resolveAuthGateDecision(input: {
  readonly pathname: string;
  readonly hasUser: boolean;
  /** `user.app_metadata.must_change_password === true` (ver app/change-password/actions.ts). */
  readonly mustChangePassword: boolean;
}): AuthGateDecision {
  const publicRoute = isPublicRoute(input.pathname);

  if (!input.hasUser) {
    return publicRoute ? { action: 'allow' } : { action: 'redirect', to: '/login' };
  }

  const isChangePasswordRoute = input.pathname === CHANGE_PASSWORD_PATH;
  if (input.mustChangePassword && !publicRoute && !isChangePasswordRoute) {
    return input.pathname.startsWith('/api/') ? { action: 'block-json' } : { action: 'redirect', to: CHANGE_PASSWORD_PATH };
  }

  return { action: 'allow' };
}
