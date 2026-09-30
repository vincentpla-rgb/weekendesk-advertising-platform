import { getCounterProposalReceivedAmEmailTemplate } from './templates/index';
import type { EmailContent } from './proposal-email';

/**
 * Email 5 (ronda 17, bloque 1, punto 1): avisa al advertising manager de que
 * ha llegado una contrapropuesta — antes de esta ronda, solo se enteraba
 * abriendo `/proposals` y viendo el badge `COUNTERED`. Idioma:
 * `profiles.preferred_language` del propio AM (ronda 17, bloque 3), nunca el
 * idioma del cliente — es un email interno.
 */
export interface CounterProposalReceivedAmEmailInput {
  readonly ownerFullName: string;
  readonly advertiserName: string;
  readonly proposalNumber: string;
  readonly optionCode: string;
  readonly reviewUrl: string;
  /** `profiles.preferred_language`, restringido a ES/FR/EN (ronda 17, bloque 3). */
  readonly language: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

export function buildCounterProposalReceivedAmEmailContent(
  input: CounterProposalReceivedAmEmailInput,
): EmailContent {
  const template = getCounterProposalReceivedAmEmailTemplate(input.language);
  const subject = template.subject(input.advertiserName, input.proposalNumber);
  const body = template.body(input.advertiserName, input.optionCode);

  const text = [
    template.greeting(firstName(input.ownerFullName)),
    '',
    body,
    '',
    `[ ${template.cta} ]`,
    input.reviewUrl,
    '',
    template.department,
    'Weekendesk SAS',
  ].join('\n');

  const html = `
<!doctype html>
<html>
  <body style="font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; background: #ffffff; padding: 16px;">
    <div style="max-width: 560px; margin: 0 auto;">
      <p style="margin: 0 0 16px;">${escapeHtml(template.greeting(firstName(input.ownerFullName)))}</p>
      <p style="margin: 0 0 20px;">${escapeHtml(body)}</p>
      <p style="margin: 0 0 20px;">
        <a href="${input.reviewUrl}" style="background: #f8443a; color: #ffffff; padding: 10px 20px; border-radius: 4px; text-decoration: none; font-weight: 600; display: inline-block;">
          ${escapeHtml(template.cta)}
        </a>
      </p>
      <p style="margin: 0;">
        ${escapeHtml(template.department)}<br>
        Weekendesk SAS
      </p>
    </div>
  </body>
</html>`.trim();

  return { subject, html, text };
}
