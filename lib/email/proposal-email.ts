import type { ContentLanguage } from '../domain';
import { getEmailCopy, getVatNotice } from '../i18n';

/**
 * Contenido del email de envío (CLAUDE.md §2): brief, enlace único, validez
 * de 14 días y la mención de IVA que corresponda — en el idioma del cliente.
 * Puro y sin I/O para poder probarlo sin red ni Resend real.
 */
export interface ProposalEmailInput {
  readonly advertiserName: string;
  readonly brief: string | null;
  readonly publicUrl: string;
  readonly validityDays: number;
  readonly language: ContentLanguage;
}

export interface EmailContent {
  readonly subject: string;
  readonly html: string;
  readonly text: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildProposalEmailContent(input: ProposalEmailInput): EmailContent {
  const copy = getEmailCopy(input.language);
  const vatNotice = getVatNotice(input.language);
  const subject = copy.subject(input.advertiserName);
  const validityLine = copy.validity(input.validityDays);

  const textLines = [
    copy.greeting,
    '',
    copy.intro,
    ...(input.brief ? ['', `${copy.briefHeading}:`, input.brief] : []),
    '',
    `${copy.cta}: ${input.publicUrl}`,
    '',
    validityLine,
    ...(vatNotice ? ['', vatNotice] : []),
    '',
    copy.signOff,
  ];
  const text = textLines.join('\n');

  const html = `
<!doctype html>
<html>
  <body style="font-family: Inter, Arial, sans-serif; color: #001c4d; background: #f5f6f8; padding: 24px;">
    <table role="presentation" width="100%" style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 8px; padding: 32px;">
      <tr><td>
        <p style="margin: 0 0 16px;">${escapeHtml(copy.greeting)}</p>
        <p style="margin: 0 0 16px;">${escapeHtml(copy.intro)}</p>
        ${
          input.brief
            ? `<p style="margin: 0 0 8px; font-weight: 600;">${escapeHtml(copy.briefHeading)}</p>
        <p style="margin: 0 0 16px; white-space: pre-wrap;">${escapeHtml(input.brief)}</p>`
            : ''
        }
        <p style="margin: 24px 0;">
          <a href="${input.publicUrl}" style="background: #f8443a; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block;">
            ${escapeHtml(copy.cta)}
          </a>
        </p>
        <p style="margin: 0 0 16px; color: #5a6478; font-size: 13px;">${escapeHtml(validityLine)}</p>
        ${vatNotice ? `<p style="margin: 0 0 16px; color: #5a6478; font-size: 11px;">${escapeHtml(vatNotice)}</p>` : ''}
        <p style="margin: 24px 0 0; white-space: pre-wrap;">${escapeHtml(copy.signOff)}</p>
      </td></tr>
    </table>
  </body>
</html>`.trim();

  return { subject, html, text };
}
