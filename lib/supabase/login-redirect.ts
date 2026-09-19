/**
 * URL de retorno del magic link (CLAUDE.md §2): **siempre** `/auth/callback`,
 * con el destino final como `next`, nunca la página destino en sí.
 *
 * Bug real corregido aquí: `emailRedirectTo` apuntaba directamente a
 * `/proposals/new`. Supabase incrusta esa URL en el enlace del email como el
 * sitio que debe canjear el código PKCE (`exchangeCodeForSession`,
 * `app/auth/callback/route.ts`) — apuntar directo a la página destino salta
 * ese canje: nunca se crea sesión y el enlace acaba como `otp_expired` al
 * segundo toque (los logs de Vercel mostraban `/proposals/new` pero
 * `/auth/callback` no aparecía jamás).
 *
 * Puro y sin `window`, para poder probarlo sin un DOM real: el origin lo
 * decide quien llama (siempre `window.location.origin` en producción, nunca
 * una URL escrita a mano aquí).
 */
export function buildLoginRedirectUrl(origin: string, next: string): string {
  return `${origin}/auth/callback?next=${encodeURIComponent(next)}`;
}
