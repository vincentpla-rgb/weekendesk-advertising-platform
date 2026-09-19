/**
 * Textos de la pantalla pública en el idioma del cliente (CLAUDE.md §6).
 *
 * Dos categorías muy distintas, a propósito separadas:
 *
 * 1. Microcopy de interfaz (botones, cabeceras, cuenta atrás): traducción
 *    directa, sin riesgo de negocio. Se traduce aquí sin más.
 *
 * 2. La mención legal de IVA fuera de Francia (CLAUDE.md §7): el documento
 *    solo trae el texto en **español**, verbatim, y dice que las versiones
 *    FR/IT/NL/EN "están disponibles" en otro sitio (Drive) sin darlas.
 *    Inventar esa traducción sería inventar texto fiscal — no se hace.
 *    Mientras no lleguen las versiones aprobadas, la mención solo se
 *    renderiza en español; en el resto de idiomas no aparece nada (mejor
 *    ausente que traducido a ojo).
 */

import type { ContentLanguage } from './domain';

export interface PublicCopy {
  readonly offerPeriod: string;
  readonly validUntil: string;
  readonly daysRemaining: (n: number) => string;
  readonly expired: string;
  readonly brief: string;
  readonly reach: string;
  readonly noReachData: string;
  readonly accept: string;
  readonly reject: string;
  readonly rejectWholeProposal: string;
  readonly acceptForm: {
    readonly title: string;
    readonly legalName: string;
    readonly billingAddress: string;
    readonly vatNumber: string;
    readonly billingContactName: string;
    readonly billingContactEmail: string;
    readonly signerName: string;
    readonly signerRole: string;
    readonly purchaseOrderReference: string;
    readonly submit: string;
    readonly pricesExcludeVat: string;
  };
  readonly rejectForm: {
    readonly title: string;
    readonly reason: string;
    readonly submit: string;
  };
  readonly acceptedThankYou: string;
  readonly rejectedThankYou: string;
}

const es: PublicCopy = {
  offerPeriod: 'Periodo de campaña',
  validUntil: 'Válida hasta',
  daysRemaining: (n) => (n <= 0 ? 'Caduca hoy' : `Caduca en ${n} día${n === 1 ? '' : 's'}`),
  expired: 'Esta oferta ha caducado.',
  brief: 'Sobre la campaña',
  reach: 'Alcance',
  noReachData: 'Sin dato medido',
  accept: 'Aceptar esta opción',
  reject: 'Rechazar',
  rejectWholeProposal: 'Rechazar toda la propuesta',
  acceptForm: {
    title: 'Aceptar esta opción',
    legalName: 'Razón social',
    billingAddress: 'Dirección de facturación',
    vatNumber: 'Número de IVA intracomunitario',
    billingContactName: 'Contacto de facturación',
    billingContactEmail: 'Email de facturación',
    signerName: 'Nombre del firmante',
    signerRole: 'Cargo del firmante',
    purchaseOrderReference: 'Referencia de pedido o expediente',
    submit: 'Confirmar aceptación',
    pricesExcludeVat: 'Importes expresados sin IVA.',
  },
  rejectForm: {
    title: 'Rechazar la propuesta',
    reason: 'Motivo (opcional)',
    submit: 'Confirmar rechazo',
  },
  acceptedThankYou: 'Gracias. Hemos registrado la aceptación; nos pondremos en contacto en breve.',
  rejectedThankYou: 'Hemos registrado tu respuesta. Gracias por tu tiempo.',
};

const en: PublicCopy = {
  offerPeriod: 'Campaign period',
  validUntil: 'Valid until',
  daysRemaining: (n) => (n <= 0 ? 'Expires today' : `Expires in ${n} day${n === 1 ? '' : 's'}`),
  expired: 'This offer has expired.',
  brief: 'About the campaign',
  reach: 'Reach',
  noReachData: 'No measured data',
  accept: 'Accept this option',
  reject: 'Reject',
  rejectWholeProposal: 'Reject the whole proposal',
  acceptForm: {
    title: 'Accept this option',
    legalName: 'Legal name',
    billingAddress: 'Billing address',
    vatNumber: 'Intra-EU VAT number',
    billingContactName: 'Billing contact',
    billingContactEmail: 'Billing email',
    signerName: 'Signer name',
    signerRole: 'Signer role',
    purchaseOrderReference: 'Purchase order / file reference',
    submit: 'Confirm acceptance',
    pricesExcludeVat: 'Amounts shown exclude VAT.',
  },
  rejectForm: {
    title: 'Reject this proposal',
    reason: 'Reason (optional)',
    submit: 'Confirm rejection',
  },
  acceptedThankYou: "Thank you. We've recorded your acceptance and will be in touch shortly.",
  rejectedThankYou: "We've recorded your response. Thank you for your time.",
};

// FR, IT, NL: microcopy propia (sin riesgo de negocio); la mención de IVA no
// se traduce sin la versión aprobada (ver arriba).
const fr: PublicCopy = {
  ...en,
  offerPeriod: 'Période de campagne',
  validUntil: "Valable jusqu'au",
  daysRemaining: (n) => (n <= 0 ? "Expire aujourd'hui" : `Expire dans ${n} jour${n === 1 ? '' : 's'}`),
  expired: 'Cette offre a expiré.',
  brief: 'À propos de la campagne',
  reach: 'Audience',
  noReachData: 'Aucune donnée mesurée',
  accept: 'Accepter cette option',
  reject: 'Refuser',
  rejectWholeProposal: "Refuser l'ensemble de la proposition",
  acceptForm: {
    ...en.acceptForm,
    title: 'Accepter cette option',
    legalName: 'Raison sociale',
    billingAddress: 'Adresse de facturation',
    vatNumber: 'Numéro de TVA intracommunautaire',
    billingContactName: 'Contact facturation',
    billingContactEmail: 'Email de facturation',
    signerName: 'Nom du signataire',
    signerRole: 'Fonction du signataire',
    purchaseOrderReference: 'Référence de commande ou de dossier',
    submit: "Confirmer l'acceptation",
  },
  rejectForm: { title: 'Refuser la proposition', reason: 'Motif (optionnel)', submit: 'Confirmer le refus' },
  acceptedThankYou: 'Merci. Votre acceptation a été enregistrée ; nous vous recontactons rapidement.',
  rejectedThankYou: 'Votre réponse a été enregistrée. Merci pour votre temps.',
};

const it: PublicCopy = {
  ...en,
  offerPeriod: 'Periodo della campagna',
  validUntil: 'Valido fino al',
  daysRemaining: (n) => (n <= 0 ? 'Scade oggi' : `Scade tra ${n} giorno${n === 1 ? '' : 'i'}`),
  expired: 'Questa offerta è scaduta.',
  brief: 'Informazioni sulla campagna',
  reach: 'Copertura',
  noReachData: 'Nessun dato misurato',
  accept: 'Accetta questa opzione',
  reject: 'Rifiuta',
  rejectWholeProposal: "Rifiuta l'intera proposta",
  acceptForm: {
    ...en.acceptForm,
    title: 'Accetta questa opzione',
    legalName: 'Ragione sociale',
    billingAddress: 'Indirizzo di fatturazione',
    vatNumber: 'Numero di partita IVA intracomunitaria',
    billingContactName: 'Contatto di fatturazione',
    billingContactEmail: 'Email di fatturazione',
    signerName: 'Nome del firmatario',
    signerRole: 'Ruolo del firmatario',
    purchaseOrderReference: "Riferimento dell'ordine o della pratica",
    submit: "Conferma l'accettazione",
  },
  rejectForm: { title: 'Rifiuta la proposta', reason: 'Motivo (facoltativo)', submit: 'Conferma il rifiuto' },
  acceptedThankYou: 'Grazie. Abbiamo registrato la tua accettazione; ti ricontatteremo a breve.',
  rejectedThankYou: 'Abbiamo registrato la tua risposta. Grazie per il tuo tempo.',
};

const nl: PublicCopy = {
  ...en,
  offerPeriod: 'Campagneperiode',
  validUntil: 'Geldig tot',
  daysRemaining: (n) => (n <= 0 ? 'Verloopt vandaag' : `Verloopt over ${n} dag${n === 1 ? '' : 'en'}`),
  expired: 'Dit aanbod is verlopen.',
  brief: 'Over de campagne',
  reach: 'Bereik',
  noReachData: 'Geen gemeten gegevens',
  accept: 'Deze optie accepteren',
  reject: 'Weigeren',
  rejectWholeProposal: 'Het hele voorstel weigeren',
  acceptForm: {
    ...en.acceptForm,
    title: 'Deze optie accepteren',
    legalName: 'Bedrijfsnaam',
    billingAddress: 'Factuuradres',
    vatNumber: 'Intracommunautair btw-nummer',
    billingContactName: 'Facturatiecontact',
    billingContactEmail: 'Facturatie-e-mail',
    signerName: 'Naam ondertekenaar',
    signerRole: 'Functie ondertekenaar',
    purchaseOrderReference: 'Bestel- of dossierreferentie',
    submit: 'Acceptatie bevestigen',
  },
  rejectForm: { title: 'Voorstel weigeren', reason: 'Reden (optioneel)', submit: 'Weigering bevestigen' },
  acceptedThankYou: 'Bedankt. We hebben je acceptatie geregistreerd en nemen snel contact op.',
  rejectedThankYou: 'We hebben je antwoord geregistreerd. Bedankt voor je tijd.',
};

const COPY: Record<ContentLanguage, PublicCopy> = { ES: es, EN: en, FR: fr, IT: it, NL: nl };

export function getPublicCopy(language: string): PublicCopy {
  return COPY[language as ContentLanguage] ?? en;
}

/**
 * Mención legal de IVA fuera de Francia (CLAUDE.md §7). Solo hay texto
 * aprobado en español; en el resto de idiomas se omite a propósito hasta
 * tener la traducción real (no se inventa texto fiscal).
 */
/**
 * Textos del email de envío (CLAUDE.md §2): microcopy sin riesgo de negocio,
 * traducida igual que `PublicCopy`. La mención de IVA sigue viviendo solo en
 * `getVatNotice` — aquí no se repite ni se traduce.
 */
export interface EmailCopy {
  readonly subject: (advertiserName: string) => string;
  readonly greeting: string;
  readonly intro: string;
  readonly briefHeading: string;
  readonly cta: string;
  readonly validity: (days: number) => string;
  readonly signOff: string;
}

const emailEs: EmailCopy = {
  subject: (advertiser) => `Tu propuesta publicitaria Weekendesk — ${advertiser}`,
  greeting: 'Hola,',
  intro: 'Te enviamos la propuesta publicitaria de Weekendesk para tu campaña.',
  briefHeading: 'Sobre la campaña',
  cta: 'Ver la propuesta',
  validity: (days) => `Esta oferta es válida durante ${days} días desde hoy.`,
  signOff: 'Un saludo,\nEquipo Weekendesk Advertising',
};

const emailEn: EmailCopy = {
  subject: (advertiser) => `Your Weekendesk advertising proposal — ${advertiser}`,
  greeting: 'Hello,',
  intro: "Here's the Weekendesk advertising proposal for your campaign.",
  briefHeading: 'About the campaign',
  cta: 'View the proposal',
  validity: (days) => `This offer is valid for ${days} days from today.`,
  signOff: 'Best regards,\nWeekendesk Advertising Team',
};

const emailFr: EmailCopy = {
  subject: (advertiser) => `Votre proposition publicitaire Weekendesk — ${advertiser}`,
  greeting: 'Bonjour,',
  intro: 'Voici la proposition publicitaire Weekendesk pour votre campagne.',
  briefHeading: 'À propos de la campagne',
  cta: 'Voir la proposition',
  validity: (days) => `Cette offre est valable ${days} jours à compter d'aujourd'hui.`,
  signOff: "Cordialement,\nL'équipe Weekendesk Advertising",
};

const emailIt: EmailCopy = {
  subject: (advertiser) => `La tua proposta pubblicitaria Weekendesk — ${advertiser}`,
  greeting: 'Ciao,',
  intro: 'Ecco la proposta pubblicitaria Weekendesk per la tua campagna.',
  briefHeading: 'Informazioni sulla campagna',
  cta: 'Vedi la proposta',
  validity: (days) => `Questa offerta è valida per ${days} giorni da oggi.`,
  signOff: 'Cordiali saluti,\nTeam Weekendesk Advertising',
};

const emailNl: EmailCopy = {
  subject: (advertiser) => `Je Weekendesk-advertentievoorstel — ${advertiser}`,
  greeting: 'Hallo,',
  intro: 'Hierbij het Weekendesk-advertentievoorstel voor je campagne.',
  briefHeading: 'Over de campagne',
  cta: 'Bekijk het voorstel',
  validity: (days) => `Dit aanbod is ${days} dagen geldig vanaf vandaag.`,
  signOff: 'Met vriendelijke groet,\nWeekendesk Advertising Team',
};

const EMAIL_COPY: Record<ContentLanguage, EmailCopy> = {
  ES: emailEs,
  EN: emailEn,
  FR: emailFr,
  IT: emailIt,
  NL: emailNl,
};

export function getEmailCopy(language: string): EmailCopy {
  return EMAIL_COPY[language as ContentLanguage] ?? emailEn;
}

export function getVatNotice(language: string): string | null {
  if (language !== 'ES') return null;
  return (
    'Importes expresados sin IVA. Operación no sujeta a IVA francés: inversión del sujeto pasivo ' +
    'conforme al artículo 44 de la Directiva 2006/112/CE. La exención queda condicionada a la ' +
    'validez del número de IVA intracomunitario del cliente en el momento de la emisión de la ' +
    'factura. En su defecto, se aplicará el IVA francés del 20 %.'
  );
}
