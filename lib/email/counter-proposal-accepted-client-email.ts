import type { ContentLanguage } from '../domain';
import { getCounterProposalAcceptedClientEmailTemplate } from './templates/index';
import type { EmailContent } from './proposal-email';

/**
 * Email 6 (ronda 17, bloque 1, punto 2): confirma al cliente que su
 * contrapropuesta fue aceptada — conectado en `acceptCounterProposal`
 * (`app/(internal)/proposals/[id]/counter-proposal-actions.ts`), mismo
 * patrón que el email de rechazo ya conectado ahí.
 */
export interface CounterProposalAcceptedClientEmailInput {
  readonly contactFullName: string;
  readonly proposalNumber: string;
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

export function buildCounterProposalAcceptedClientEmailContent(
  input: CounterProposalAcceptedClientEmailInput,
): EmailContent {
  const template = getCounterProposalAcceptedClientEmailTemplate(input.language);
  const subject = template.subject(input.proposalNumber);

  const text = [
    template.greeting(firstName(input.contactFullName)),
    '',
    template.body,
    '',
    template.closingLine,
    '',
    template.signOff,
    '',
    template.department,
    'Weekendesk SAS',
  ].join('\n');

  const html = `
<!doctype html>
<html>
  <body style="font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; background: #ffffff; padding: 16px;">
    <div style="max-width: 560px; margin: 0 auto;">
      <p style="margin: 0 0 16px;">${escapeHtml(template.greeting(firstName(input.contactFullName)))}</p>
      <p style="margin: 0 0 16px;">${escapeHtml(template.body)}</p>
      <p style="margin: 0 0 16px;">${escapeHtml(template.closingLine)}</p>
      <p style="margin: 0;">
        ${escapeHtml(template.signOff)}<br>
        ${escapeHtml(template.department)}<br>
        Weekendesk SAS
      </p>
    </div>
  </body>
</html>`.trim();

  return { subject, html, text };
}
