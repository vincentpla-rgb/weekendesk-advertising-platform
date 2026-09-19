import { NextResponse } from 'next/server';

import { verifyStandardWebhook } from '@/lib/email/verify-webhook';
import { sendEmail } from '@/lib/email/resend-client';
import { buildMagicLinkEmailContent } from '@/lib/email/magic-link-email';
import { buildConfirmUrl } from '@/lib/email/confirm-url';

/**
 * "Send Email Hook" de Supabase Auth (CLAUDE.md §2): reemplaza el SMTP de
 * pruebas de Supabase — limitado a 4 correos/hora y bloqueando al equipo —
 * por Resend. Se configura en el dashboard de Supabase (Authentication >
 * Hooks > Send Email), apuntando aquí, con el secreto de firma en
 * `SEND_EMAIL_HOOK_SECRET`.
 *
 * Contrato del hook (payload de Supabase, no de Resend): recibe `user.email`
 * y `email_data.{token_hash, redirect_to, email_action_type, site_url}`.
 * Supabase NO añade su propio enlace de confirmación cuando este hook está
 * activo — hay que construirlo a mano hacia `/auth/confirm`, que verifica el
 * `token_hash` con `supabase.auth.verifyOtp` (ver esa ruta).
 *
 * No verificado contra el hook real de Supabase en este entorno de
 * desarrollo (sin proyecto Supabase conectado, CLAUDE.md §10.1.2): la forma
 * del payload sigue la documentación de Supabase Auth Hooks. Conviene una
 * prueba manual tras configurar el hook en el proyecto real.
 */
interface SendEmailHookPayload {
  readonly user: { readonly email: string };
  readonly email_data: {
    readonly token_hash: string;
    readonly redirect_to: string;
    readonly email_action_type: string;
    readonly site_url: string;
  };
}

function hookError(httpCode: number, message: string) {
  return NextResponse.json({ error: { http_code: httpCode, message } }, { status: httpCode });
}

export async function POST(request: Request) {
  const secret = process.env.SEND_EMAIL_HOOK_SECRET;
  if (!secret) {
    return hookError(500, 'SEND_EMAIL_HOOK_SECRET no configurado');
  }

  const payloadText = await request.text();
  const verified = verifyStandardWebhook(
    payloadText,
    {
      id: request.headers.get('webhook-id'),
      timestamp: request.headers.get('webhook-timestamp'),
      signature: request.headers.get('webhook-signature'),
    },
    secret,
  );

  if (!verified) {
    return hookError(401, 'Firma de webhook inválida');
  }

  let body: SendEmailHookPayload;
  try {
    body = JSON.parse(payloadText);
  } catch {
    return hookError(400, 'JSON inválido');
  }

  const apiKey = process.env.RESEND_API_KEY;
  const fromAddress = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !fromAddress) {
    return hookError(500, 'Falta RESEND_API_KEY o RESEND_FROM_EMAIL');
  }

  const magicLink = buildConfirmUrl(body.email_data);
  const { subject, html, text } = buildMagicLinkEmailContent(magicLink);

  const result = await sendEmail(
    { from: fromAddress, to: [body.user.email], subject, html, text },
    apiKey,
  );

  if (!result.ok) {
    return hookError(500, result.error);
  }

  return NextResponse.json({});
}
