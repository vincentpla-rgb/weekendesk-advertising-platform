import type { ContentLanguage } from '../domain';

/**
 * Traducción automática de un motivo de rechazo tecleado a mano (ronda 17,
 * bloque 1, punto 4): CLAUDE.md pide que el motivo del rechazo (tanto
 * `counter_proposals.rejection_reason` como el futuro `rejections.reason`,
 * §5.4/§10.3) siga siendo texto libre — nada de códigos ni lista cerrada —
 * pero que llegue al destinatario en SU idioma, no en el que lo escribió
 * quien rechaza.
 *
 * Llamada REST directa a la API de mensajes de Anthropic, sin el SDK
 * `@anthropic-ai/sdk` — mismo criterio que `lib/email/resend-client.ts` y
 * `lib/vies.ts`: no añadir una dependencia nueva solo por una llamada HTTP.
 *
 * **Nunca bloquea el envío del email.** Cualquier fallo — sin
 * `ANTHROPIC_API_KEY` configurada, la API no responde, la respuesta no trae
 * texto reconocible — devuelve el texto ORIGINAL sin traducir, nunca lanza.
 * Quien llama no necesita comprobar nada: el resultado siempre es un string
 * usable como motivo de rechazo.
 */

const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

// Modelo pequeño y rápido a propósito: es una traducción de una frase corta,
// no una tarea que necesite razonamiento — Haiku basta y sale barato.
const TRANSLATION_MODEL = 'claude-haiku-4-5-20251001';

const LANGUAGE_NAMES_EN: Record<ContentLanguage, string> = {
  ES: 'Spanish',
  FR: 'French',
  IT: 'Italian',
  NL: 'Dutch',
  EN: 'English',
};

export interface TranslateTextInput {
  readonly text: string;
  readonly targetLanguage: ContentLanguage;
}

interface AnthropicMessageResponse {
  readonly content?: ReadonlyArray<{ readonly type?: string; readonly text?: string }>;
}

/**
 * Traduce `text` al idioma `targetLanguage`. Con el texto vacío, sin clave
 * configurada, o ante cualquier error (red, HTTP, formato de respuesta),
 * devuelve `text` tal cual — la traducción es una mejora, nunca un
 * requisito para que el email salga.
 */
export async function translateText(input: TranslateTextInput): Promise<string> {
  const original = input.text;
  const trimmed = original.trim();
  if (!trimmed) return original;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return original;

  try {
    const response = await fetch(ANTHROPIC_ENDPOINT, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: TRANSLATION_MODEL,
        max_tokens: 500,
        messages: [
          {
            role: 'user',
            content:
              `Translate the following text to ${LANGUAGE_NAMES_EN[input.targetLanguage]}. ` +
              'Reply with ONLY the translation, no quotes, no explanation, no preamble. ' +
              'If the text is already in that language, return it unchanged.\n\n' +
              trimmed,
          },
        ],
      }),
    });

    if (!response.ok) return original;

    const data = (await response.json()) as AnthropicMessageResponse;
    const translated = data.content?.find((block) => block.type === 'text')?.text ?? data.content?.[0]?.text;

    return typeof translated === 'string' && translated.trim() ? translated.trim() : original;
  } catch {
    return original;
  }
}
