import type { EmailContent } from './proposal-email';

/**
 * Email de acceso del equipo (magic link, CLAUDE.md §2). Herramienta interna
 * — igual que `/login`, se escribe solo en español, sin necesidad de i18n
 * por idioma de cliente.
 */
export function buildMagicLinkEmailContent(magicLink: string): EmailContent {
  const subject = 'Tu enlace de acceso a Weekendesk Advertising';
  const text = [
    'Hola,',
    '',
    'Pulsa este enlace para entrar en Weekendesk Advertising. Caduca en unos minutos y solo sirve una vez.',
    '',
    magicLink,
    '',
    'Si no has pedido este acceso, puedes ignorar este email.',
  ].join('\n');

  const html = `
<!doctype html>
<html>
  <body style="font-family: Inter, Arial, sans-serif; color: #001c4d; background: #f5f6f8; padding: 24px;">
    <table role="presentation" width="100%" style="max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 8px; padding: 32px;">
      <tr><td>
        <p style="margin: 0 0 16px;">Hola,</p>
        <p style="margin: 0 0 16px;">
          Pulsa el botón para entrar en Weekendesk Advertising. Caduca en unos minutos y solo sirve una vez.
        </p>
        <p style="margin: 24px 0;">
          <a href="${magicLink}" style="background: #f8443a; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block;">
            Entrar
          </a>
        </p>
        <p style="margin: 0; color: #5a6478; font-size: 13px;">
          Si no has pedido este acceso, puedes ignorar este email.
        </p>
      </td></tr>
    </table>
  </body>
</html>`.trim();

  return { subject, html, text };
}
