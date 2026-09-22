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
 * No hay una capa de roles todavía (CLAUDE.md no define "quién administra a
 * quién": el modelo de acceso es "miembro de equipo o no", is_team_member()).
 * Por eso cualquier miembro de equipo autenticado puede acceder a esta
 * pantalla y dar de alta a otro — no solo Vincent. Si hiciera falta
 * restringirlo a un rol de administrador, es una columna nueva en `profiles`
 * y una comprobación aquí; no está pedido en esta pasada.
 */

import { revalidatePath } from 'next/cache';

import { createServiceClient } from '@/lib/supabase/service';
import { defaultFullName } from '@/lib/supabase/team-access';

export type CreateTeamUserResult =
  | { readonly ok: true; readonly alreadyExisted: boolean }
  | { readonly ok: false; readonly error: string };

export async function createTeamUser(input: {
  email: string;
  fullName: string;
  password: string;
  note: string;
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
    .upsert({ email, full_name: fullName, note: input.note.trim() || null }, { onConflict: 'email' });

  if (upsertError) {
    return { ok: false, error: `Usuario creado, pero falló la lista blanca: ${upsertError.message}` };
  }

  revalidatePath('/admin/users');
  return { ok: true, alreadyExisted };
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
