/**
 * Envío de email por la API REST de Resend. Sin el SDK `resend` para no
 * añadir una dependencia nueva solo por una llamada HTTP — el mismo patrón
 * que `lib/vies.ts` para la API de la UE.
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

export async function sendEmail(input: SendEmailInput, apiKey: string): Promise<SendEmailResult> {
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
