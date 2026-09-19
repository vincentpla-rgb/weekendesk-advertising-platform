'use server';

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { createSupabaseTeamAccessGateway, resolveTeamAccess } from '@/lib/supabase/team-access';

export type LoginResult = { readonly ok: true } | { readonly ok: false; readonly error: string };

/**
 * Login con email y contraseña (CLAUDE.md §2, §10.3): sustituye al magic
 * link, que se quedó dos días sin funcionar en producción — el enlace se
 * consumía antes de que la persona hiciera clic, en la infraestructura de
 * Resend/SES (rastreador de clics `awstrack.me`), un punto fuera del
 * control de esta aplicación y que no se pudo desactivar en el dominio de
 * pruebas. Contraseña, sin ningún email de por medio, no tiene ese problema.
 *
 * Reutiliza `resolveTeamAccess` (lib/supabase/team-access.ts): la misma
 * lista blanca y el mismo aprovisionamiento de `profiles` que usaba el
 * magic link — lo único que cambia es cómo se llega hasta aquí, no quién
 * decide el acceso. Si el email autenticado no está en `allowed_emails`, se
 * cierra inmediatamente la sesión que Supabase acaba de abrir: nunca se deja
 * una sesión autenticada sin perfil de equipo.
 *
 * Sin recuperación de contraseña por email en esta versión — depender del
 * correo para entrar es exactamente el problema que este cambio resuelve.
 * Los usuarios los da de alta un administrador desde Supabase (Authentication
 * > Users), no hay registro público.
 */
export async function loginWithPassword(email: string, password: string): Promise<LoginResult> {
  const supabase = await createClient();

  const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
  if (authError) {
    // Supabase no distingue "no existe" de "contraseña incorrecta" en el
    // mensaje de error — tampoco lo hacemos aquí, por la misma razón que el
    // login anterior no comprobaba la lista blanca antes de enviar el enlace:
    // no revelar qué emails tienen cuenta.
    return { ok: false, error: 'Email o contraseña incorrectos.' };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email) {
    return { ok: false, error: 'No se pudo iniciar sesión. Inténtalo de nuevo.' };
  }

  const gateway = createSupabaseTeamAccessGateway(createServiceClient());
  const authorized = await resolveTeamAccess(gateway, { id: user.id, email: user.email });

  if (!authorized) {
    await supabase.auth.signOut();
    return {
      ok: false,
      error: 'Este email no tiene acceso a Weekendesk Advertising. Pide a Vincent que te añada en allowed_emails.',
    };
  }

  return { ok: true };
}
