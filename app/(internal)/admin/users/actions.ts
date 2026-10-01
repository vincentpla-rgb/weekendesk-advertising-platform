'use server';

/**
 * Alta de usuarios del equipo desde la app (CLAUDE.md §9, ronda 2 de
 * correcciones): hasta ahora había que crear el usuario en Supabase Auth
 * (dashboard) Y añadirlo a `allowed_emails` a mano por SQL — dos pasos
 * manuales que bloqueaban a Rémi y Mario. Esta pantalla hace ambos en uno.
 *
 * Usa la clave de servicio (`createServiceClient`, ver `lib/supabase/service.ts`)
 * porque `supabase.auth.admin.createUser` — la única forma de crear un
 * usuario con contraseña sin pasar por el flujo de registro público — exige
 * la clave `service_role`; una sesión normal no tiene ese permiso.
 *
 * Ajuste de seguridad (ronda 15): el admin ve y comunica la contraseña
 * inicial, así que la conoce, aunque sea de forma temporal — para que deje
 * de servir de nada en cuanto la persona entra, el acceso se crea con
 * `app_metadata.must_change_password = true` (ver `app/change-password/`,
 * que la apaga al cambiar la contraseña, y `lib/supabase/auth-gate.ts`, que
 * bloquea cualquier otra pantalla mientras siga en `true`). Va en
 * `app_metadata`, no en `user_metadata`: `user_metadata` lo puede escribir
 * el propio usuario con su sesión (`supabase.auth.updateUser({ data })`),
 * así que alguien podría apagar el aviso sin llegar a cambiar la contraseña;
 * `app_metadata` solo lo escribe la clave de servicio, así que cambiar la
 * contraseña es la única forma de que se apague.
 *
 * No hay una capa de roles todavía (CLAUDE.md no define "quién administra a
 * quién": el modelo de acceso es "miembro de equipo o no", is_team_member()).
 * Por eso cualquier miembro de equipo autenticado puede acceder a esta
 * pantalla y dar de alta a otro — no solo Vincent. Si hiciera falta
 * restringirlo a un rol de administrador, es una columna nueva en `profiles`
 * y una comprobación aquí; no está pedido en esta pasada.
 */

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { defaultFullName } from '@/lib/supabase/team-access';
import type { InternalLanguage } from '@/lib/i18n-internal';
import { sendEmail } from '@/lib/email/resend-client';
import { buildTransactionalEmailContent } from '@/lib/email/transactional-email';

export type CreateTeamUserResult =
  | { readonly ok: true; readonly alreadyExisted: boolean }
  | { readonly ok: false; readonly error: string };

export async function createTeamUser(input: {
  email: string;
  fullName: string;
  password: string;
  note: string;
  /**
   * Idioma elegido al invitar (CLAUDE.md, ronda 17, bloque 3): decide el
   * idioma del email de invitación (pendiente de plantilla, bloque 2 —
   * `allowed_emails.invite_language` se guarda igual, listo para cuando
   * exista) y queda preprogramado como idioma de interfaz por defecto para
   * esta persona en sus siguientes logins (`profiles.preferred_language`,
   * copiado en `resolveTeamAccess`/`lib/supabase/team-access.ts` en el
   * momento de su primer login).
   */
  inviteLanguage: InternalLanguage;
}): Promise<CreateTeamUserResult> {
  const email = input.email.trim().toLowerCase();
  const fullName = input.fullName.trim() || defaultFullName(email);

  if (!email || !email.includes('@')) {
    return { ok: false, error: 'Email inválido' };
  }
  if (input.password.length < 8) {
    return { ok: false, error: 'La contraseña inicial debe tener al menos 8 caracteres' };
  }

  const service = createServiceClient();

  const { error: createError } = await service.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
    app_metadata: { must_change_password: true },
  });

  // Un email que ya tiene usuario en Supabase Auth no es un fallo aquí: puede
  // ser justo el caso que motiva esta pantalla (usuario creado a mano antes,
  // sin allowed_emails) — se sigue igual, solo se avisa en el resultado.
  const alreadyExisted =
    !!createError &&
    /already|existe|registered/i.test(createError.message ?? '');

  if (createError && !alreadyExisted) {
    return { ok: false, error: `No se pudo crear el usuario en Supabase Auth: ${createError.message}` };
  }

  const { error: upsertError } = await service
    .from('allowed_emails')
    .upsert(
      { email, full_name: fullName, note: input.note.trim() || null, invite_language: input.inviteLanguage },
      { onConflict: 'email' },
    );

  if (upsertError) {
    return { ok: false, error: `Usuario creado, pero falló la lista blanca: ${upsertError.message}` };
  }

  await sendInviteEmail({ email, fullName, inviteLanguage: input.inviteLanguage });

  revalidatePath('/admin/users');
  return { ok: true, alreadyExisted };
}

/**
 * Email 1, "Invitación de nuevo usuario" (CLAUDE.md §9, ronda 18, bloque 2):
 * se manda en el mismo paso que el alta, en `invite_language` — nunca
 * bloquea el alta si falla (acceso ya creado de verdad; el admin puede
 * comunicar la contraseña a mano si el correo no llega, igual que ya podía
 * hacerlo antes de que este email existiera). Mismo criterio de
 * degradación que el resto de emails de esta ronda: sin
 * `RESEND_API_KEY`/`RESEND_FROM_EMAIL` configuradas, se omite sin más.
 */
async function sendInviteEmail(input: {
  readonly email: string;
  readonly fullName: string;
  readonly inviteLanguage: InternalLanguage;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromAddress = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !fromAddress) {
    console.info('[invite] RESEND_API_KEY/RESEND_FROM_EMAIL no configuradas — no se manda la invitación.');
    return;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let inviterName = 'Weekendesk Advertising';
  if (user) {
    const { data: inviterProfile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single();
    if (inviterProfile?.full_name) inviterName = inviterProfile.full_name;
  }

  const h = await headers();
  const proto = h.get('x-forwarded-proto') ?? 'https';
  const ctaUrl = `${proto}://${h.get('host')}/login`;

  const { subject, html, text } = buildTransactionalEmailContent({
    key: 'invite',
    language: input.inviteLanguage,
    inviteeFirstName: input.fullName.trim().split(/\s+/)[0] || input.fullName,
    inviterName,
    ctaUrl,
  });

  const result = await sendEmail({ from: fromAddress, to: [input.email], subject, html, text }, apiKey);
  if (!result.ok) {
    console.error(`[invite] no se pudo mandar la invitación a ${input.email}: ${result.error}`);
  }
}

export type RemoveTeamUserResult = { readonly ok: true } | { readonly ok: false; readonly error: string };

/**
 * Revoca el acceso: quita de `allowed_emails` (bloquea logins nuevos, ver
 * `app/login/actions.ts`) y, si ya existe un `profiles` de un login previo,
 * lo desactiva (`is_active = false`) para cerrar también una sesión ya
 * abierta la próxima vez que is_team_member() se evalúe. No borra el usuario
 * de Supabase Auth: revertirlo es solo volver a darlo de alta aquí.
 */
export async function removeTeamUser(email: string): Promise<RemoveTeamUserResult> {
  const normalized = email.trim().toLowerCase();
  const service = createServiceClient();

  const { error: deleteError } = await service.from('allowed_emails').delete().eq('email', normalized);
  if (deleteError) {
    return { ok: false, error: deleteError.message };
  }

  const { error: deactivateError } = await service
    .from('profiles')
    .update({ is_active: false })
    .eq('email', normalized);
  if (deactivateError) {
    return { ok: false, error: deactivateError.message };
  }

  revalidatePath('/admin/users');
  return { ok: true };
}
