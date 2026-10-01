import type { ContentLanguage } from '../domain';
import { getCounterProposalRejectionEmailTemplate } from './templates/index';
import type { EmailContent } from './proposal-email';

/**
 * Email de rechazo de una contrapropuesta (CLAUDE.md, ronda 16, bloque 4):
 * el AM revisó lo que propuso el cliente y decide no aceptarlo, con un
 * motivo obligatorio (distinto del que el cliente escribió al rechazar el
 * presupuesto original, CLAUDE.md, ronda 16, bloque 3, punto 7). A
 * diferencia de `buildProposalEmailContent`, aquí NO se aplican las reglas
 * de §5.6 — es un email distinto, sobre una decisión ya tomada.
 */
export interface CounterProposalRejectionEmailInput {
  readonly advertiserName: string;
  readonly contactFullName: string;
  readonly proposalNumber: string;
  /** Motivo tecleado por el AM al rechazar la contrapropuesta (obligatorio, CLAUDE.md §5.4/§8). */
  readonly reason: string;
  readonly salesName: string;
  readonly language: ContentLanguage;
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

export function buildCounterProposalRejectionEmailContent(
  input: CounterProposalRejectionEmailInput,
): EmailContent {
  const template = getCounterProposalRejectionEmailTemplate(input.language);
  const subject = template.subject(input.advertiserName, input.proposalNumber);

  const textLines = [
    template.greeting(firstName(input.contactFullName)),
    '',
    template.intro,
    '',
    template.reasonIntro,
    input.reason,
    '',
    template.closingLine,
    '',
    template.signOff,
    '',
    input.salesName,
    template.department,
    'Weekendesk SAS',
  ];
  const text = textLines.join('\n');

  const html = `
<!doctype html>
<html>
  <body style="font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; background: #ffffff; padding: 16px;">
    <div style="max-width: 560px; margin: 0 auto;">
      <p style="margin: 0 0 16px;">${escapeHtml(template.greeting(firstName(input.contactFullName)))}</p>
      <p style="margin: 0 0 16px;">${escapeHtml(template.intro)}</p>
      <p style="margin: 0 0 4px; font-weight: 600;">${escapeHtml(template.reasonIntro)}</p>
      <p style="margin: 0 0 16px; white-space: pre-wrap;">${escapeHtml(input.reason)}</p>
      <p style="margin: 0 0 16px;">${escapeHtml(template.closingLine)}</p>
      <p style="margin: 0;">
        ${escapeHtml(template.signOff)}<br>
        ${escapeHtml(input.salesName)}<br>
        ${escapeHtml(template.department)}<br>
        Weekendesk SAS
      </p>
    </div>
  </body>
</html>`.trim();

  return { subject, html, text };
}
