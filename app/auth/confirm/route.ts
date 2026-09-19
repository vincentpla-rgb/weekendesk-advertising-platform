import { NextResponse } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';

import { createClient } from '@/lib/supabase/server';
import { authorizeTeamSession } from '@/lib/supabase/authorize-session';

/**
 * Vuelta del magic link enviado por Resend (CLAUDE.md §2). El "Send Email
 * Hook" de Supabase Auth (`app/api/auth/send-email/route.ts`) construye el
 * enlace a esta ruta con `token_hash` y `type` en vez de dejar que Supabase
 * genere su propio `?code=` con la plantilla por defecto — así el email lo
 * manda Resend y no el SMTP de pruebas de Supabase.
 *
 * `verifyOtp` con `token_hash` es independiente del flujo PKCE de
 * `/auth/callback`: no hace falta un `code_verifier` guardado en el
 * navegador, solo el hash que ya viaja en el propio enlace.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const next = searchParams.get('next') ?? '/proposals/new';

  if (!tokenHash || !type) {
    return NextResponse.redirect(`${origin}/login`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

  if (error) {
    return NextResponse.redirect(`${origin}/login`);
  }

  return authorizeTeamSession(supabase, origin, next);
}
