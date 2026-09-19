import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Verificación de firma Standard Webhooks (https://www.standardwebhooks.com/),
 * el esquema que usa el "Send Email Hook" de Supabase Auth para el envío de
 * emails de autenticación (CLAUDE.md §2: magic link por Resend en vez del
 * SMTP de pruebas de Supabase).
 *
 * Contenido firmado: `${id}.${timestamp}.${body}`, HMAC-SHA256 con el secreto
 * en base64 (sin el prefijo `whsec_` que usa Supabase al mostrarlo). La
 * cabecera `webhook-signature` puede traer varias firmas separadas por
 * espacio, cada una con el formato `v1,<base64>` — basta con que una coincida.
 *
 * Implementado a mano (sin la librería `standardwebhooks`) para no añadir una
 * dependencia nueva solo por esto: el esquema es HMAC simple y cabe en unas
 * pocas líneas con `node:crypto`.
 */
export interface WebhookHeaders {
  readonly id: string | null;
  readonly timestamp: string | null;
  readonly signature: string | null;
}

function decodeSecret(secret: string): Buffer {
  const raw = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret;
  return Buffer.from(raw, 'base64');
}

export function verifyStandardWebhook(payload: string, headers: WebhookHeaders, secret: string): boolean {
  if (!headers.id || !headers.timestamp || !headers.signature) return false;

  const signedContent = `${headers.id}.${headers.timestamp}.${payload}`;
  const expected = createHmac('sha256', decodeSecret(secret)).update(signedContent).digest('base64');
  const expectedBuffer = Buffer.from(expected);

  return headers.signature
    .split(' ')
    .map((entry) => entry.split(',')[1])
    .filter((candidate): candidate is string => Boolean(candidate))
    .some((candidate) => {
      const candidateBuffer = Buffer.from(candidate);
      return (
        candidateBuffer.length === expectedBuffer.length && timingSafeEqual(candidateBuffer, expectedBuffer)
      );
    });
}
