import type { ContentLanguage } from '../domain';
import { getProposalEmailTemplate } from './templates/index';

/**
 * Contenido del email de envío de un presupuesto (CLAUDE.md §2), a partir de
 * las plantillas de `lib/email/templates/` (una por idioma). Puro y sin I/O
 * para poder probarlo sin red ni Resend real.
 *
 * Tres reglas de contenido, fijadas por Vincent y recogidas en las
 * plantillas (CLAUDE.md §2, §5.2):
 *   1. Sin mención de IVA — va en la pantalla comparativa, no aquí.
 *   2. Sin precios — ni total, ni "desde", ni rango.
 *   3. El asunto lleva el anunciante, nunca el nombre de la campaña.
 */
export interface ProposalEmailInput {
  /** Nombre del anunciante (razón social de la cuenta). Va en el asunto, nunca el nombre de la campaña. */
  readonly advertiserName: string;
  /** Nombre completo del contacto del cliente; se usa solo el primer nombre en el saludo. */
  readonly contactFullName: string;
  /** Brief de campaña tal cual lo escribió el comercial (texto plano, CLAUDE.md §5.2). */
  readonly brief: string | null;
  readonly numberOfOptions: number;
  readonly publicUrl: string;
  /** Fecha de caducidad de la oferta (ISO), formateada según el idioma del cliente. */
  readonly expiresAtIso: string;
  /** Nombre del comercial que envía (creador del presupuesto). */
  readonly salesName: string;
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

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

function formatExpiryDate(isoDate: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }).format(
    new Date(isoDate),
  );
}

export function buildProposalEmailContent(input: ProposalEmailInput): EmailContent {
  const template = getProposalEmailTemplate(input.language);
  const subject = template.subject(input.advertiserName);
  const expiryDate = formatExpiryDate(input.expiresAtIso, template.dateLocale);

  const textLines = [
    template.greeting(firstName(input.contactFullName)),
    '',
    ...(input.brief ? [input.brief, ''] : []),
    template.optionsLine(input.numberOfOptions),
    '',
    `[ ${template.cta} ]`,
    input.publicUrl,
    '',
    template.postCtaLine,
    '',
    template.validityLine(expiryDate),
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

  // Texto sobrio a propósito (sin logo, sin tarjeta con sombra, sin colores
  // de marca de fondo): estos destinatarios son organismos públicos y los
  // filtros corporativos tratan mejor el texto simple. Un único enlace
  // destacado como botón, nada más.
  const html = `
<!doctype html>
<html>
  <body style="font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; background: #ffffff; padding: 16px;">
    <div style="max-width: 560px; margin: 0 auto;">
      <p style="margin: 0 0 16px;">${escapeHtml(template.greeting(firstName(input.contactFullName)))}</p>
      ${input.brief ? `<p style="margin: 0 0 16px; white-space: pre-wrap;">${escapeHtml(input.brief)}</p>` : ''}
      <p style="margin: 0 0 20px;">${escapeHtml(template.optionsLine(input.numberOfOptions))}</p>
      <p style="margin: 0 0 20px;">
        <a href="${input.publicUrl}" style="background: #f8443a; color: #ffffff; padding: 10px 20px; border-radius: 4px; text-decoration: none; font-weight: 600; display: inline-block;">
          ${escapeHtml(template.cta)}
        </a>
      </p>
      <p style="margin: 0 0 16px;">${escapeHtml(template.postCtaLine)}</p>
      <p style="margin: 0 0 16px;">${escapeHtml(template.validityLine(expiryDate))}</p>
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
