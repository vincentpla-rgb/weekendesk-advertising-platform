import type { ContentLanguage } from '../domain';
import {
  btn,
  checks,
  escapeHtml,
  firstName,
  formatDateLong,
  formatMoney,
  formatPercent,
  gap,
  h1,
  interpolate,
  numbered,
  para,
  pill,
  quote,
  renderEmailShell,
  rowsCard,
  sect,
  small,
} from './weekendesk-shell';
import { getTxEmailCopy, getTxLabels } from './transactional-copy';
import type { EmailContent } from './proposal-email';

/**
 * Builder genérico de los emails NUEVOS de esta ronda (CLAUDE.md §9/§10.3,
 * ronda 18, bloque 2), sobre la plantilla visual compartida
 * (`weekendesk-shell.ts`) y el copy de `docs/emails/email-copy.json`
 * (`transactional-copy.ts`).
 *
 * **Alcance deliberado, no todo el catálogo de 14 vive aquí.** Los 5 emails
 * ya construidos en rondas anteriores (proposal/2, counter_am/5,
 * counter_accepted/6, counter_rejected/7, counter_received/9) se quedan tal
 * cual, con su estilo sobrio original — reenfocarlos al nuevo diseño
 * ramificado es un cambio puramente visual sobre flujos ya probados y en
 * producción, y counter_am en concreto necesitaría además datos nuevos (la
 * tabla de rentabilidad original/contrapropuesta) que su punto de llamada
 * actual no calcula — deliberadamente diferido, documentado en CLAUDE.md
 * §10.3, no decidido en silencio. `blocked_am` (12) y `new_version` (13)
 * están bloqueados por una decisión de producto que no se ha tomado (ver
 * `buildTransactionalEmailContent` más abajo) y lanzan un error claro si se
 * llaman.
 *
 * **Adjuntos PDF, omitidos a propósito.** El copy original (emails 3, 4, 5,
 * 6) da por hecho que cada uno de esos emails lleva un PDF adjunto — pero
 * la generación de PDF sigue fuera del MVP (CLAUDE.md §1, "v2"). Prometer
 * un adjunto que nunca llega violaría "ninguna cifra sin fuente... se omite"
 * (§8) tanto como inventar una cifra: se omiten el bloque `attach()` y,
 * en los emails al cliente, el paso de "steps" que menciona el PDF (se
 * queda solo el primer paso, el único que no depende de él).
 */

export type NewTxEmailKey =
  | 'invite'
  | 'accepted_client'
  | 'accepted_am'
  | 'rejected_am'
  | 'reminder'
  | 'expired_am'
  | 'opened_am';

interface BaseInput {
  readonly language: ContentLanguage;
}

export interface InviteEmailInput extends BaseInput {
  readonly key: 'invite';
  readonly inviteeFirstName: string;
  readonly inviterName: string;
  readonly ctaUrl: string;
}

export interface AcceptedClientEmailInput extends BaseInput {
  readonly key: 'accepted_client';
  readonly contactFirstName: string;
  readonly clientCompany: string;
  readonly proposalNumber: string;
  readonly optionName: string;
  readonly markets: string;
  readonly amountCents: number;
  readonly billedTo: string;
  readonly creatorName: string;
}

export interface AcceptedAmEmailInput extends BaseInput {
  readonly key: 'accepted_am';
  readonly amFirstName: string;
  readonly clientCompany: string;
  readonly proposalNumber: string;
  readonly optionName: string;
  readonly markets: string;
  readonly saleCents: number;
  readonly costCents: number;
  readonly marginCents: number;
  /** Fracción (0,50 = 50 %), `null` si el motor no pudo calcularla (p. ej. opción nacida de una contrapropuesta, CLAUDE.md ronda 16). */
  readonly marginRate: number | null;
  readonly ctaUrl: string;
}

export interface RejectedAmEmailInput extends BaseInput {
  readonly key: 'rejected_am';
  readonly amFirstName: string;
  readonly clientCompany: string;
  readonly proposalNumber: string;
  /** Motivo tecleado por el cliente (`rejections.reason`), ya en el idioma del AM si hizo falta traducirlo (CLAUDE.md ronda 17, mismo patrón que `rejectCounterProposal`) — `null` si el cliente no escribió nada (campo opcional). */
  readonly reasonText: string | null;
  readonly ctaUrl: string;
}

export interface ReminderEmailInput extends BaseInput {
  readonly key: 'reminder';
  readonly contactFirstName: string;
  readonly clientCompany: string;
  readonly proposalNumber: string;
  readonly validUntilIso: string;
  readonly creatorName: string;
  readonly ctaUrl: string;
}

export interface ExpiredAmEmailInput extends BaseInput {
  readonly key: 'expired_am';
  readonly amFirstName: string;
  readonly clientCompany: string;
  readonly proposalNumber: string;
  readonly validUntilIso: string;
  readonly ctaUrl: string;
}

export interface OpenedAmEmailInput extends BaseInput {
  readonly key: 'opened_am';
  readonly amFirstName: string;
  readonly clientCompany: string;
  readonly proposalNumber: string;
  readonly validUntilIso: string | null;
  readonly ctaUrl: string;
}

export type TransactionalEmailInput =
  | InviteEmailInput
  | AcceptedClientEmailInput
  | AcceptedAmEmailInput
  | RejectedAmEmailInput
  | ReminderEmailInput
  | ExpiredAmEmailInput
  | OpenedAmEmailInput;

/** Interpola con valores YA escapados — para insertar dentro de un bloque `allowHtml` (solo `intro`, la única plantilla con `<strong>` literal). */
function interpolateHtml(template: string, vars: Record<string, string>): string {
  const escaped: Record<string, string> = {};
  for (const [k, v] of Object.entries(vars)) escaped[k] = escapeHtml(v);
  return interpolate(template, escaped);
}


export function buildTransactionalEmailContent(input: TransactionalEmailInput): EmailContent {
  const { copy: c, lang, audience } = getTxEmailCopy(input.key, input.language);
  const L = getTxLabels(lang);

  if (input.key === 'invite') {
    const vars = { firstName: input.inviteeFirstName, inviterName: input.inviterName };
    const subject = interpolate(c.subject ?? '', vars);
    const preheader = interpolate(c.preheader ?? '', vars);
    const inner = [
      h1(c.title ?? ''),
      para(interpolateHtml(c.intro ?? '', vars), '', true),
      checks((c.points ?? []).map((p) => interpolate(p, {}))),
      gap(4),
      rowsCard([
        [L.role, escapeHtml('Advertising Manager')],
        [L.invitedBy, escapeHtml(input.inviterName)],
      ]),
      gap(24),
      btn(c.cta ?? '', input.ctaUrl, 'primary'),
      small(c.note ?? ''),
    ].join('');
    return finish({ subject, preheader, inner, audience, L, language: input.language });
  }

  if (input.key === 'accepted_client') {
    const vars = {
      firstName: input.contactFirstName,
      proposalNumber: input.proposalNumber,
      clientCompany: input.clientCompany,
    };
    const subject = interpolate(c.subject ?? '', vars);
    const preheader = interpolate(c.preheader ?? '', vars);
    const stepsAll = (c.steps ?? []).map((s) => interpolate(s, { creatorName: input.creatorName }));
    // Se queda solo el primer paso (coordinación humana) — el segundo da por
    // hecho un PDF adjunto que este MVP todavía no genera (ver cabecera del módulo).
    const steps = stepsAll.slice(0, 1);
    const inner = [
      h1(c.title ?? ''),
      para(interpolateHtml(c.intro ?? '', vars), '', true),
      rowsCard([
        [L.proposal, escapeHtml(input.proposalNumber)],
        [L.option, escapeHtml(input.optionName)],
        [L.markets, escapeHtml(input.markets)],
        [L.amount, formatMoney(input.amountCents, input.language)],
        [L.billedTo, escapeHtml(input.billedTo)],
      ]),
      gap(24),
      sect(c.nextTitle ?? ''),
      numbered(steps),
      small(c.note ?? ''),
    ].join('');
    return finish({ subject, preheader, inner, audience, L, language: input.language });
  }

  if (input.key === 'accepted_am') {
    const vars = {
      clientCompany: input.clientCompany,
      proposalNumber: input.proposalNumber,
      optionName: input.optionName,
      marginPct: input.marginRate !== null ? formatPercent(input.marginRate, input.language) : '—',
    };
    const subject = interpolate(c.subject ?? '', vars);
    const preheader = interpolate(c.preheader ?? '', vars);
    const ok = input.marginRate !== null && input.marginRate >= 0.5;
    const inner = [
      h1(c.title ?? ''),
      para(interpolateHtml(c.intro ?? '', vars), '', true),
      rowsCard([
        [L.proposal, escapeHtml(input.proposalNumber)],
        [L.client, escapeHtml(input.clientCompany)],
        [L.option, escapeHtml(input.optionName)],
        [L.markets, escapeHtml(input.markets)],
      ]),
      gap(24),
      sect(c.finTitle ?? ''),
      rowsCard([
        [L.sale, formatMoney(input.saleCents, input.language)],
        [L.cost, formatMoney(input.costCents, input.language)],
        [L.margin, formatMoney(input.marginCents, input.language)],
        [
          L.marginPct,
          input.marginRate !== null
            ? `${formatPercent(input.marginRate, input.language)} &nbsp; ${pill(ok, ok ? L.statusOk : L.statusKo)}`
            : '—',
        ],
        [L.minMargin, formatPercent(0.5, input.language)],
      ]),
      gap(24),
      btn(c.cta ?? '', input.ctaUrl, 'primary'),
      small(c.note ?? ''),
    ].join('');
    return finish({ subject, preheader, inner, audience, L, language: input.language });
  }

  if (input.key === 'rejected_am') {
    const vars = { clientCompany: input.clientCompany, proposalNumber: input.proposalNumber };
    const subject = interpolate(c.subject ?? '', vars);
    const preheader = interpolate(c.preheader ?? '', vars);
    const reasonBlock =
      input.reasonText && input.reasonText.trim() !== '' ? quote(c.reasonLabel ?? '', input.reasonText) + gap(24) : '';
    const inner = [
      h1(c.title ?? ''),
      para(interpolateHtml(c.intro ?? '', vars), '', true),
      rowsCard([
        [L.proposal, escapeHtml(input.proposalNumber)],
        [L.client, escapeHtml(input.clientCompany)],
      ]),
      gap(24),
      reasonBlock,
      para(c.after ?? '', 'margin-bottom:24px;'),
      btn(c.cta ?? '', input.ctaUrl, 'primary'),
      small(c.note ?? ''),
    ].join('');
    return finish({ subject, preheader, inner, audience, L, language: input.language });
  }

  if (input.key === 'reminder') {
    const validUntil = formatDateLong(new Date(input.validUntilIso), input.language);
    const vars = {
      firstName: input.contactFirstName,
      proposalNumber: input.proposalNumber,
      clientCompany: input.clientCompany,
      validUntil,
    };
    const subject = interpolate(c.subject ?? '', vars);
    const preheader = interpolate(c.preheader ?? '', vars);
    const inner = [
      h1(c.title ?? ''),
      para(interpolateHtml(c.intro ?? '', vars), '', true),
      rowsCard([
        [L.proposal, escapeHtml(input.proposalNumber)],
        [L.validUntil, escapeHtml(validUntil)],
      ]),
      gap(24),
      btn(c.cta ?? '', input.ctaUrl, 'primary'),
      small(interpolate(c.note ?? '', { creatorName: input.creatorName })),
    ].join('');
    return finish({ subject, preheader, inner, audience, L, language: input.language });
  }

  if (input.key === 'expired_am') {
    const validUntil = formatDateLong(new Date(input.validUntilIso), input.language);
    const vars = { clientCompany: input.clientCompany, proposalNumber: input.proposalNumber, validUntil };
    const subject = interpolate(c.subject ?? '', vars);
    const preheader = interpolate(c.preheader ?? '', vars);
    const inner = [
      h1(c.title ?? ''),
      para(interpolateHtml(c.intro ?? '', vars), '', true),
      rowsCard([
        [L.proposal, escapeHtml(input.proposalNumber)],
        [L.client, escapeHtml(input.clientCompany)],
        [L.validUntil, escapeHtml(validUntil)],
      ]),
      gap(24),
      para(c.after ?? '', 'margin-bottom:24px;'),
      btn(c.cta ?? '', input.ctaUrl, 'primary'),
      small(c.note ?? ''),
    ].join('');
    return finish({ subject, preheader, inner, audience, L, language: input.language });
  }

  // opened_am
  const vars = { clientCompany: input.clientCompany, proposalNumber: input.proposalNumber };
  const subject = interpolate(c.subject ?? '', vars);
  const preheader = interpolate(c.preheader ?? '', vars);
  const validUntilRow: readonly [string, string][] = input.validUntilIso
    ? [[L.validUntil, escapeHtml(formatDateLong(new Date(input.validUntilIso), input.language))]]
    : [];
  const inner = [
    h1(c.title ?? ''),
    para(interpolateHtml(c.intro ?? '', vars), '', true),
    rowsCard([
      [L.proposal, escapeHtml(input.proposalNumber)],
      [L.client, escapeHtml(input.clientCompany)],
      ...validUntilRow,
    ]),
    gap(24),
    para(c.after ?? '', 'margin-bottom:24px;'),
    btn(c.cta ?? '', input.ctaUrl, 'primary'),
    small(c.note ?? ''),
  ].join('');
  return finish({ subject, preheader, inner, audience, L, language: input.language });
}

/**
 * `blocked_am` (12) y `new_version` (13) están bloqueados por una decisión
 * de producto sin tomar, no por falta de tiempo de implementación — ver
 * CLAUDE.md §9/§10.3 (ronda 18):
 *   - `blocked_am`: avisar a los AMs de OTROS presupuestos ya enviados (no
 *     solo el que se acaba de aceptar) cuando una aceptación nueva hace que
 *     dejen de poder aceptarse, requiere una consulta nueva ("¿qué otros
 *     SENT/VIEWED chocan ahora?") que no existe en ningún sitio del
 *     esquema — y una decisión sobre si además hay que expirarlos
 *     automáticamente o solo avisar. No se ha pedido explícitamente.
 *   - `new_version`: el email asume que un comercial puede sustituir un
 *     presupuesto YA ENVIADO por una versión nueva que invalida el enlace
 *     anterior — CLAUDE.md §10.1.2 documenta esto como "sin implementar"
 *     (el editor de la ronda 13 solo cubre un `DRAFT` nunca enviado con
 *     éxito; "Duplicar" crea un presupuesto independiente, sin invalidar el
 *     original). Construir ese mecanismo es una funcionalidad nueva, no un
 *     email.
 */
export function buildBlockedTransactionalEmail(key: 'blocked_am' | 'new_version'): never {
  throw new Error(
    `[transactional-email] "${key}" está bloqueado: depende de una decisión de producto sin tomar (CLAUDE.md §9/§10.3, ronda 18) — no tiene disparador real.`,
  );
}

function finish(opts: {
  readonly subject: string;
  readonly preheader: string;
  readonly inner: string;
  readonly audience: 'client' | 'internal';
  readonly L: Record<string, string>;
  readonly language: ContentLanguage;
}): EmailContent {
  const footer = opts.audience === 'client' ? opts.L.footerClient : opts.L.footerInternal;
  const html = renderEmailShell({
    language: opts.language,
    audience: opts.audience,
    subject: opts.subject,
    preheader: opts.preheader,
    innerHtml: opts.inner,
    internalBadgeText: opts.L.internal,
    footerText: footer,
    legalText: opts.L.legal,
  });
  const text = htmlBlockToText(opts.inner, opts.subject);
  return { subject: opts.subject, html, text };
}

/**
 * Texto plano honesto, derivado del MISMO contenido que el HTML (nunca una
 * segunda copia a mano que pudiera divergir) — quita las etiquetas,
 * decodifica las entidades que usan los bloques (`&amp;`, `&nbsp;`, la
 * marca de verificación de `checks()`) y colapsa el espacio en blanco
 * resultante, igual criterio que exige CLAUDE.md para "siempre texto plano
 * además de HTML" (§5.6, extendido aquí a los emails nuevos).
 */
function htmlBlockToText(innerHtml: string, subject: string): string {
  const withoutTags = innerHtml
    .replace(/<tr>/g, '\n')
    .replace(/<\/(p|h1|div)>/g, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#10003;/g, '✓')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n');
  return `${subject}\n\n${withoutTags}`;
}

export { firstName };
