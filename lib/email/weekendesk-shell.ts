import type { ContentLanguage } from '../domain';

/**
 * Plantilla visual compartida de los 14 emails transaccionales (CLAUDE.md
 * §9/§10.3, ronda 18, bloque 2), portada fielmente de
 * `docs/emails/emails-advertising-preview.html` (Weekendesk UltraHand v0.3 /
 * Brandbook 2025) — los mismos tokens, la misma tabla de bloques
 * (`rowsCard`, `numbered`, `checks`, `attach`, `quote`, `btn`…), el mismo
 * documento de email-safe HTML (tablas, estilos inline, sin CSS custom
 * properties: los clientes de correo no los soportan). No se reimplementa
 * desde cero: es una traducción directa, función a función, del `<script>`
 * del propio preview que Vincent subió — para que el email real y la
 * referencia visual no puedan divergir en silencio.
 *
 * Sustituye al estilo "sobrio, sin maquetación" que llevaban los primeros
 * emails de este proyecto (CLAUDE.md §5.6, rondas 1-17) — ver CLAUDE.md
 * §10.3 (ronda 18) para la decisión de adoptar este diseño para los 14.
 */

export type EmailJsonLang = 'es' | 'fr' | 'en' | 'it' | 'nl';

const LANG_TO_JSON: Record<ContentLanguage, EmailJsonLang> = {
  ES: 'es',
  FR: 'fr',
  EN: 'en',
  IT: 'it',
  NL: 'nl',
};

export function toJsonLang(language: ContentLanguage): EmailJsonLang {
  return LANG_TO_JSON[language];
}

const LOCALE: Record<EmailJsonLang, string> = {
  es: 'es-ES',
  fr: 'fr-FR',
  en: 'en-GB',
  it: 'it-IT',
  nl: 'nl-BE',
};

/** `EMAIL_TOKENS`: token del design system -> hex, igual que en el preview. */
const C = {
  fg1: '#1E1E1E',
  fg2: '#4F4F4F',
  fg3: '#888888',
  bg1: '#FFFFFF',
  bg2: '#F6F6F6',
  bd: '#D1D1D1',
  bd2: '#E7E7E7',
  red: '#F8443A',
  ok: '#198571',
  okBg: '#E3FDED',
  no: '#EC0202',
  noBg: '#FFE1E1',
  navy: '#001C4D',
} as const;

const LOGO_URL = 'https://static.booking.weekendesk.fr/storage/website/logos/logo-orange-h96.png';
const FH = "'Host Grotesk','Helvetica Neue',Helvetica,Arial,sans-serif";
const FB = "'Inter','Helvetica Neue',Helvetica,Arial,sans-serif";
const P = `font-family:${FB};`;

export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Interpola `{{var}}` igual que `tpl()` en el preview — deja la llave intacta si falta la variable. */
export function interpolate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => (vars[key] !== undefined ? vars[key] : `{{${key}}}`));
}

export function formatMoney(cents: number, language: ContentLanguage, signed = false): string {
  const euros = cents / 100;
  return new Intl.NumberFormat(LOCALE[toJsonLang(language)], {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
    useGrouping: true,
    signDisplay: signed ? 'exceptZero' : 'auto',
  }).format(euros);
}

export function formatPercent(rate: number, language: ContentLanguage): string {
  return new Intl.NumberFormat(LOCALE[toJsonLang(language)], {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(rate);
}

export function formatPoints(diffRate: number, language: ContentLanguage, unit: string): string {
  const formatted = new Intl.NumberFormat(LOCALE[toJsonLang(language)], {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
    signDisplay: 'exceptZero',
  }).format(diffRate * 100);
  return `${formatted} ${unit}`;
}

export function formatDateLong(date: Date, language: ContentLanguage): string {
  return new Intl.DateTimeFormat(LOCALE[toJsonLang(language)], { dateStyle: 'long' }).format(date);
}

/* ── Bloques email-safe (tablas + estilos inline), portados 1:1 del preview ── */

export function btn(label: string, href: string, kind: 'primary' | 'secondary' = 'primary'): string {
  return kind === 'primary'
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="${C.red}" style="border-radius:8px;"><a href="${href}" style="display:inline-block;padding:16px 20px;${P}font-size:16px;font-weight:700;line-height:1.2;color:#FFFFFF;text-decoration:none;border-radius:8px;">${escapeHtml(label)}</a></td></tr></table>`
    : `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="${C.bg1}" style="border-radius:8px;border:1px solid ${C.bd};"><a href="${href}" style="display:inline-block;padding:16px 20px;${P}font-size:16px;font-weight:400;line-height:1.2;color:${C.fg1};text-decoration:none;border-radius:8px;">${escapeHtml(label)}</a></td></tr></table>`;
}

export function h1(text: string): string {
  return `<h1 style="margin:0 0 16px;font-family:${FH};font-weight:800;font-size:28px;line-height:1.15;letter-spacing:-0.5px;color:${C.fg1};">${escapeHtml(text)}</h1>`;
}

/** `allowHtml`: el único caso con marcado de confianza es `intro`, que puede llevar `<strong>` (nombres ya escapados por el llamador). */
export function para(textOrHtml: string, extraStyle = '', allowHtml = false): string {
  const content = allowHtml ? textOrHtml : escapeHtml(textOrHtml);
  return `<p style="margin:0 0 24px;${P}font-size:16px;line-height:1.5;color:${C.fg1};${extraStyle}">${content}</p>`;
}

export function small(text: string): string {
  return `<p style="margin:24px 0 0;${P}font-size:14px;line-height:1.5;color:${C.fg2};">${escapeHtml(text)}</p>`;
}

export function sect(text: string): string {
  return `<p style="margin:0 0 12px;font-family:${FH};font-weight:700;font-size:18px;line-height:1.22;color:${C.fg1};">${escapeHtml(text)}</p>`;
}

export function gap(px: number): string {
  return `<div style="height:${px}px;line-height:${px}px;font-size:0;">&nbsp;</div>`;
}

export function pill(ok: boolean, text: string, onTint = false): string {
  const bg = onTint ? C.bg1 : ok ? C.okBg : C.noBg;
  const color = ok ? C.ok : C.no;
  return `<span style="display:inline-block;padding:4px 8px;border-radius:8px;${P}font-size:12px;line-height:1.3;background:${bg};color:${color};font-weight:600;">${escapeHtml(text)}</span>`;
}

export function rowsCard(rows: readonly (readonly [string, string])[]): string {
  const tr = rows
    .map(([l, v], i) => {
      const border = i < rows.length - 1 ? `border-bottom:1px solid ${C.bd2};` : '';
      return `<tr><td style="padding:12px 16px;${border}${P}font-size:14px;line-height:1.4;color:${C.fg3};width:40%;vertical-align:top;">${escapeHtml(l)}</td><td style="padding:12px 16px;${border}${P}font-size:14px;line-height:1.4;color:${C.fg1};font-weight:600;vertical-align:top;">${v}</td></tr>`;
    })
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${C.bd};border-radius:16px;border-collapse:separate;border-spacing:0;">${tr}</table>`;
}

export function numbered(items: readonly string[]): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${items
    .map(
      (t, i) =>
        `<tr><td width="36" valign="top" style="padding:0 0 12px;"><div style="width:24px;height:24px;line-height:24px;text-align:center;border-radius:12px;background:${C.bg2};font-family:${FH};font-weight:800;font-size:13px;color:${C.fg1};">${i + 1}</div></td><td valign="top" style="padding:0 0 12px;${P}font-size:16px;line-height:1.5;color:${C.fg1};">${escapeHtml(t)}</td></tr>`,
    )
    .join('')}</table>`;
}

export function checks(items: readonly string[]): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${items
    .map(
      (t) =>
        `<tr><td width="28" valign="top" style="padding:0 0 12px;${P}font-size:16px;line-height:1.5;color:${C.ok};font-weight:700;">&#10003;</td><td valign="top" style="padding:0 0 12px;${P}font-size:16px;line-height:1.5;color:${C.fg1};">${escapeHtml(t)}</td></tr>`,
    )
    .join('')}</table>`;
}

export function quote(label: string, text: string, note?: string): string {
  const noteHtml = note
    ? `<div style="margin-top:8px;font-size:14px;color:${C.fg2};">${escapeHtml(note)}</div>`
    : '';
  return `<p style="margin:0 0 4px;${P}font-size:12px;color:${C.fg3};">${escapeHtml(label)}</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-left:3px solid ${C.navy};padding:4px 0 4px 16px;${P}font-size:16px;line-height:1.5;color:${C.fg1};">${escapeHtml(text)}${noteHtml}</td></tr></table>`;
}

/** Tabla comparativa original/contrapropuesta/diferencia (email 5, `counter_am`). */
export function comparisonTable(opts: {
  readonly labelOriginal: string;
  readonly labelCounter: string;
  readonly labelDiff: string;
  readonly rows: readonly {
    readonly label: string;
    readonly original: string;
    readonly counter: string;
    readonly diff: string;
  }[];
}): string {
  const th = (t: string, align = 'right') =>
    `<td style="padding:10px 12px;${P}font-size:12px;color:${C.fg3};text-align:${align};border-bottom:1px solid ${C.bd};">${escapeHtml(t)}</td>`;
  const td = (t: string, align = 'right', bold = false) =>
    `<td style="padding:10px 12px;${P}font-size:14px;line-height:1.3;color:${C.fg1};text-align:${align};${bold ? 'font-weight:600;' : ''}border-bottom:1px solid ${C.bd2};">${t}</td>`;
  const rows = opts.rows
    .map(
      (r) =>
        `<tr>${td(escapeHtml(r.label), 'left')}${td(r.original)}${td(r.counter, 'right', true)}${td(r.diff)}</tr>`,
    )
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${C.bd};border-radius:16px;border-collapse:separate;border-spacing:0;">
    <tr>${th('', 'left')}${th(opts.labelOriginal)}${th(opts.labelCounter)}${th(opts.labelDiff)}</tr>
    ${rows}
  </table>`;
}

export function verdictBanner(ok: boolean, pillText: string, text: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="background:${ok ? C.okBg : C.noBg};border-radius:8px;padding:16px;${P}font-size:14px;line-height:1.5;color:${C.fg1};">${pill(ok, pillText, true)}${gap(8)}${escapeHtml(text)}</td></tr></table>`;
}

export interface EmailShellInput {
  readonly language: ContentLanguage;
  /** `internal` muestra el badge "Uso interno" junto al logo (CLAUDE.md, audiencia de cada email). */
  readonly audience: 'client' | 'internal';
  readonly subject: string;
  readonly preheader: string;
  /** HTML ya construido con los bloques de arriba — el cuerpo del email, sin cabecera ni pie. */
  readonly innerHtml: string;
  readonly internalBadgeText: string;
  readonly footerText: string;
  readonly legalText: string;
}

/** Documento HTML completo (cabecera con logo, cuerpo, pie), igual estructura que el preview. */
export function renderEmailShell(input: EmailShellInput): string {
  const jsonLang = toJsonLang(input.language);
  const badge =
    input.audience === 'internal'
      ? `<td align="right" style="padding:0;"><span style="display:inline-block;padding:4px 8px;border-radius:8px;background:${C.bg2};${P}font-size:12px;color:${C.fg2};">${escapeHtml(input.internalBadgeText)}</span></td>`
      : '<td></td>';

  return `<!DOCTYPE html>
<html lang="${jsonLang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
<title>${escapeHtml(input.subject)}</title>
<style>
  body{margin:0;padding:0;background:${C.bg2};-webkit-text-size-adjust:100%;}
  @media only screen and (max-width:600px){
    .wrap{width:100% !important;}
    .px{padding-left:24px !important;padding-right:24px !important;}
    h1{font-size:24px !important;}
  }
</style></head>
<body style="margin:0;padding:0;background:${C.bg2};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:${C.bg2};">${escapeHtml(input.preheader)}${'&nbsp;&zwnj;'.repeat(40)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.bg2}"><tr><td align="center" style="padding:32px 12px;">
  <table role="presentation" class="wrap" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:${C.bg1};border:1px solid ${C.bd};border-radius:16px;border-collapse:separate;border-spacing:0;">
    <tr><td class="px" style="padding:32px 40px 24px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="padding:0;"><img src="${LOGO_URL}" alt="Weekendesk" width="143" height="24" style="display:inline-block;vertical-align:middle;border:0;outline:none;height:24px;width:143px;"> <span style="${P}font-size:12px;color:${C.fg3};vertical-align:middle;">&nbsp;advertising</span></td>${badge}
      </tr></table>
    </td></tr>
    <tr><td class="px" style="padding:0 40px 40px;">${input.innerHtml}</td></tr>
    <tr><td class="px" style="padding:24px 40px 32px;border-top:1px solid ${C.bd2};${P}font-size:12px;line-height:1.5;color:${C.fg3};">${escapeHtml(input.footerText)}<br>${escapeHtml(input.legalText)}</td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}
