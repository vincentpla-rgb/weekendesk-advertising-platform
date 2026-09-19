/**
 * Construye el enlace de `/auth/confirm` a partir del payload del "Send
 * Email Hook" de Supabase Auth (CLAUDE.md §2). Con el hook activo, Supabase
 * ya no genera su propio `?code=` — hay que montar el enlace a mano con el
 * `token_hash` que trae `email_data`.
 *
 * Infraestructura del magic link, sin usar en la app hoy: el login pasó a
 * email + contraseña (CLAUDE.md §10.3, el enlace se consumía antes de que la
 * persona lo abriera). Se deja tal cual por si se recupera más adelante.
 *
 * Puro, sin I/O, para poder probarlo sin un hook real de Supabase (que no se
 * puede reproducir en este entorno de desarrollo, ver CLAUDE.md §10.1.2).
 */
export interface SendEmailHookData {
  readonly token_hash: string;
  readonly redirect_to: string;
  readonly email_action_type: string;
  readonly site_url: string;
}

export function buildConfirmUrl(emailData: SendEmailHookData): string {
  const base = (emailData.site_url || emailData.redirect_to || '').replace(/\/$/, '');

  // redirect_to viaja como URL absoluta (viene de `emailRedirectTo` en
  // signInWithOtp, app/login/page.tsx), que apunta a
  // /auth/callback?next=<destino> — /auth/callback es la ruta del flujo PKCE
  // normal, no la de este hook, así que el destino real para /auth/confirm
  // sigue siendo ese `next` anidado, nunca la propia ruta /auth/callback. Por
  // eso se lee el parámetro `next` de redirect_to en vez de su `pathname` a
  // secas: usar solo el pathname mandaría al usuario a /auth/callback sin
  // código, que rebota a /login (bug real, ver app/login/page.tsx).
  let next = '/proposals/new';
  try {
    const redirectUrl = new URL(emailData.redirect_to);
    next = redirectUrl.searchParams.get('next') || redirectUrl.pathname;
  } catch {
    // No era una URL absoluta: se usa tal cual como ruta relativa.
    next = emailData.redirect_to || next;
  }

  const params = new URLSearchParams({
    token_hash: emailData.token_hash,
    type: emailData.email_action_type,
    next,
  });
  return `${base}/auth/confirm?${params.toString()}`;
}
