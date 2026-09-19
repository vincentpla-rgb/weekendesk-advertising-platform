/**
 * Construye el enlace de `/auth/confirm` a partir del payload del "Send
 * Email Hook" de Supabase Auth (CLAUDE.md §2). Con el hook activo, Supabase
 * ya no genera su propio `?code=` — hay que montar el enlace a mano con el
 * `token_hash` que trae `email_data`.
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
  // signInWithOtp) — nos quedamos solo con la ruta: el destino sigue siendo
  // este mismo sitio, nunca uno externo.
  let next = emailData.redirect_to || '/proposals/new';
  try {
    next = new URL(emailData.redirect_to).pathname;
  } catch {
    // No era una URL absoluta: se usa tal cual como ruta relativa.
  }

  const params = new URLSearchParams({
    token_hash: emailData.token_hash,
    type: emailData.email_action_type,
    next,
  });
  return `${base}/auth/confirm?${params.toString()}`;
}
