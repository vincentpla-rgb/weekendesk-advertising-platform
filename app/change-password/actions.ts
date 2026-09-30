'use server';

/**
 * Cambio de contraseña obligatorio en el primer login (CLAUDE.md §2, §10.3,
 * ronda 15). Se dispara cuando `user.app_metadata.must_change_password` es
 * `true` (marcado al crear el acceso, `app/(internal)/admin/users/actions.ts`)
 * y `lib/supabase/auth-gate.ts` redirige aquí antes de dejar entrar a
 * cualquier otra pantalla.
 *
 * 100 % en la sesión ya autenticada con la contraseña temporal — nunca por
 * email. Ya hubo un problema serio de cuota con el plan gratuito de
 * Supabase Auth (~4 emails/hora) que dejó un bucle de login imposible de
 * romper durante días (CLAUDE.md §10.3: el magic link se abandonó por esto
 * y por el rastreador de clics de Resend/SES). Este flujo no manda ningún
 * email — `supabase.auth.updateUser({ password })` cambia la contraseña
 * directamente sobre la sesión ya abierta.
 */

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

export type ChangePasswordResult = { readonly ok: true } | { readonly ok: false; readonly error: string };

const MIN_PASSWORD_LENGTH = 8;

export async function changePassword(newPassword: string): Promise<ChangePasswordResult> {
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.` };
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: 'No autenticado. Vuelve a iniciar sesión.' };
  }

  const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
  if (updateError) {
    return { ok: false, error: updateError.message };
  }

  // `app_metadata` no lo puede escribir la sesión del propio usuario (por
  // diseño, ver actions.ts de /admin/users) — hace falta la clave de
  // servicio para apagar el aviso. Si esto fallara, la contraseña YA ha
  // cambiado; el usuario solo vería el aviso una vez más de lo necesario en
  // su próximo intento, nunca una contraseña sin cambiar.
  const service = createServiceClient();
  const { error: metadataError } = await service.auth.admin.updateUserById(user.id, {
    app_metadata: { must_change_password: false },
  });

  if (metadataError) {
    return {
      ok: false,
      error: `Contraseña actualizada, pero no se pudo desactivar el aviso de cambio obligatorio: ${metadataError.message}. Vuelve a intentarlo.`,
    };
  }

  return { ok: true };
}
