import emailCopyJson from '@/docs/emails/email-copy.json';

import type { ContentLanguage } from '../domain';
import { toJsonLang, type EmailJsonLang } from './weekendesk-shell';

/**
 * Acceso tipado al copy de los 14 emails transaccionales (CLAUDE.md §9,
 * ronda 18, bloque 2). Importa `docs/emails/email-copy.json` directamente
 * como fuente única de verdad (el propio fichero se declara así en su
 * cabecera, `emails-advertising-copy.md`: "Fuente de verdad:
 * `email-copy.json`") — nunca se transcribe a mano a un módulo TS aparte,
 * para no arriesgar una divergencia silenciosa entre lo que Vincent validó
 * y lo que de verdad se envía (mismo motivo por el que, en rondas
 * anteriores, el material de migraciones se mandó como fichero, nunca
 * retecleado).
 */

export type TxEmailKey =
  | 'invite'
  | 'proposal'
  | 'accepted_client'
  | 'accepted_am'
  | 'counter_am'
  | 'counter_accepted'
  | 'counter_rejected'
  | 'rejected_am'
  | 'counter_received'
  | 'reminder'
  | 'expired_am'
  | 'blocked_am'
  | 'new_version'
  | 'opened_am';

export type TxAudience = 'client' | 'internal';

interface RawLangCopy {
  readonly subject?: string;
  readonly preheader?: string;
  readonly title?: string;
  readonly intro?: string;
  readonly points?: readonly string[];
  readonly cta?: string;
  readonly note?: string;
  readonly nextTitle?: string;
  readonly steps?: readonly string[];
  readonly attachDesc?: string;
  readonly finTitle?: string;
  readonly compTitle?: string;
  readonly commentLabel?: string;
  readonly verdictOk?: string;
  readonly verdictKo?: string;
  readonly reasonLabel?: string;
  readonly after?: string;
}

interface RawEmailEntry {
  readonly n: number;
  readonly audience: TxAudience;
  readonly title: string;
  readonly langs: Partial<Record<EmailJsonLang, RawLangCopy>>;
}

interface RawLabels {
  readonly [key: string]: string;
}

interface RawCopyFile {
  readonly labels: Record<EmailJsonLang, RawLabels>;
  readonly emails: Record<TxEmailKey, RawEmailEntry>;
  readonly reasons: {
    readonly clientReject: Record<string, Record<EmailJsonLang, string>>;
    readonly counterReject: Record<string, Record<EmailJsonLang, string>>;
  };
}

const COPY = emailCopyJson as unknown as RawCopyFile;

export interface ResolvedTxCopy {
  readonly lang: EmailJsonLang;
  /** `true` si el idioma pedido no tenía copy y se cayó a EN (CLAUDE.md, mismo criterio que el resto del proyecto: EN para emails de cliente, ES para internos — ver `getTxEmailCopy`). */
  readonly fallback: boolean;
  readonly audience: TxAudience;
  readonly n: number;
  readonly copy: RawLangCopy;
}

/**
 * Resuelve el copy de un email para un idioma. Caída honesta si el idioma
 * pedido no existe para este email (CLAUDE.md §5.6, "emails internos (1, 4,
 * 5): ES · FR · EN — no hay Advertising Managers IT/NL todavía"): los
 * emails internos caen a ES, los de cliente a EN — nunca se inventa una
 * traducción ni se deja un hueco en blanco.
 */
export function getTxEmailCopy(key: TxEmailKey, language: ContentLanguage): ResolvedTxCopy {
  const entry = COPY.emails[key];
  const requested = toJsonLang(language);
  const fallbackLang: EmailJsonLang = entry.audience === 'internal' ? 'es' : 'en';
  const usedLang = entry.langs[requested] ? requested : fallbackLang;
  const copy = entry.langs[usedLang];
  if (!copy) {
    throw new Error(`[transactional-copy] falta copy para "${key}" ni siquiera en el idioma de respaldo (${usedLang})`);
  }
  return { lang: usedLang, fallback: usedLang !== requested, audience: entry.audience, n: entry.n, copy };
}

export function getTxLabels(lang: EmailJsonLang): RawLabels {
  return COPY.labels[lang];
}

export type ClientRejectReasonCode = 'budget' | 'timing' | 'priority' | 'format' | 'other';
export type CounterRejectReasonCode = 'cost' | 'scope' | 'availability' | 'other';

export function getClientRejectReasonCopy(code: ClientRejectReasonCode, lang: EmailJsonLang): string | undefined {
  return COPY.reasons.clientReject[code]?.[lang];
}

export function getCounterRejectReasonCopy(code: CounterRejectReasonCode, lang: EmailJsonLang): string | undefined {
  return COPY.reasons.counterReject[code]?.[lang];
}
