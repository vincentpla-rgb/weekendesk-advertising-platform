/**
 * Envío de email por la API REST de Resend. Sin el SDK `resend` para no
 * añadir una dependencia nueva solo por una llamada HTTP — el mismo patrón
 * que `lib/vies.ts` para la API de la UE.
 *
 * **`EMAIL_DRY_RUN` (ronda 18, bloque 2).** Con la variable de entorno a
 * `'true'`/`'1'`, `sendEmail` no llama a la API real de Resend — registra el
 * envío con `console.info` (destinatarios, asunto, primeras líneas del
 * texto plano) y devuelve un éxito simulado con un id reconocible
 * (`dry-run-<timestamp aleatorio>`). Pensado para poder ejercitar los
 * disparadores de los 14 emails (CLAUDE.md §9, bloque 2) en un entorno sin
 * `RESEND_API_KEY` real, sin arriesgarse a mandar correos de prueba a
 * direcciones reales ni a gastar la cuota del dominio de pruebas de Resend.
 * Nunca se activa por accidente: hay que fijar la variable explícitamente.
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export interface SendEmailInput {
  readonly from: string;
  readonly to: readonly string[];
  readonly cc?: readonly string[];
  readonly bcc?: readonly string[];
  readonly replyTo?: string;
  readonly subject: string;
  readonly html: string;
  readonly text: string;
}

export type SendEmailResult = { readonly ok: true; readonly id: string } | { readonly ok: false; readonly error: string };

export function isEmailDryRun(): boolean {
  const value = (process.env.EMAIL_DRY_RUN ?? '').trim().toLowerCase();
  return value === 'true' || value === '1';
}

export async function sendEmail(input: SendEmailInput, apiKey: string): Promise<SendEmailResult> {
  if (isEmailDryRun()) {
    const id = `dry-run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    console.info(
      `[EMAIL_DRY_RUN] ${id} · to=${input.to.join(',')}` +
        (input.cc?.length ? ` cc=${input.cc.join(',')}` : '') +
        (input.replyTo ? ` replyTo=${input.replyTo}` : '') +
        ` · subject="${input.subject}"\n${input.text.slice(0, 300)}`,
    );
    return { ok: true, id };
  }

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: input.from,
        to: input.to,
        cc: input.cc,
        bcc: input.bcc,
        reply_to: input.replyTo,
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      return { ok: false, error: `Resend respondió ${response.status}: ${body}` };
    }

    const data = (await response.json()) as { id: string };
    return { ok: true, id: data.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'error de red desconocido' };
  }
}
