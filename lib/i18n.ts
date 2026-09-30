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
  /** Modo "solo duración, sin fecha de inicio" (CLAUDE.md §5.3 bis). */
  readonly duration: (count: number, unit: 'WEEK' | 'MONTH') => string;
  readonly validUntil: string;
  readonly daysRemaining: (n: number) => string;
  readonly expired: string;
  readonly brief: string;
  readonly reach: string;
  readonly noReachData: string;
  readonly accept: string;
  readonly reject: string;
  readonly rejectWholeProposal: string;
  /** Botón "Proponer cambios" (CLAUDE.md, ronda 16): segunda vía dentro del flujo de rechazo, por opción. */
  readonly proposeChanges: string;
  readonly counterProposalForm: {
    readonly title: string;
    readonly intro: string;
    readonly colSupport: string;
    readonly colOriginalPrice: string;
    readonly colYourPrice: string;
    readonly colQuantity: string;
    readonly removeLine: string;
    readonly lineRemoved: string;
    readonly campaignPeriod: string;
    readonly campaignStart: string;
    readonly campaignEnd: string;
    readonly fiscalTitle: string;
    readonly cancel: string;
    readonly submit: string;
  };
  readonly counterProposalThankYou: string;
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
  duration: (n, unit) =>
    `Duración: ${n} ${unit === 'WEEK' ? (n === 1 ? 'semana' : 'semanas') : (n === 1 ? 'mes' : 'meses')} (fecha de inicio por confirmar)`,
  validUntil: 'Válida hasta',
  daysRemaining: (n) => (n <= 0 ? 'Caduca hoy' : `Caduca en ${n} día${n === 1 ? '' : 's'}`),
  expired: 'Esta oferta ha caducado.',
  brief: 'Sobre la campaña',
  reach: 'Alcance',
  noReachData: 'Sin dato medido',
  accept: 'Aceptar esta opción',
  reject: 'Rechazar',
  rejectWholeProposal: 'Rechazar toda la propuesta',
  proposeChanges: 'Proponer cambios',
  counterProposalForm: {
    title: 'Proponer cambios a esta opción',
    intro:
      'Puedes ajustar el precio, la cantidad y el periodo de cada soporte, o eliminar una línea entera. No es posible añadir soportes nuevos.',
    colSupport: 'Soporte',
    colOriginalPrice: 'Precio original',
    colYourPrice: 'Tu propuesta',
    colQuantity: 'Cantidad',
    removeLine: 'Eliminar esta línea',
    lineRemoved: 'Eliminada',
    campaignPeriod: 'Periodo de campaña',
    campaignStart: 'Inicio',
    campaignEnd: 'Fin',
    fiscalTitle: 'Tus datos fiscales',
    cancel: 'Cancelar',
    submit: 'Enviar propuesta',
  },
  counterProposalThankYou:
    'Gracias. Hemos recibido tu propuesta y la revisaremos en breve; nos pondremos en contacto contigo.',
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
  duration: (n, unit) =>
    `Duration: ${n} ${unit === 'WEEK' ? (n === 1 ? 'week' : 'weeks') : (n === 1 ? 'month' : 'months')} (start date to be confirmed)`,
  validUntil: 'Valid until',
  daysRemaining: (n) => (n <= 0 ? 'Expires today' : `Expires in ${n} day${n === 1 ? '' : 's'}`),
  expired: 'This offer has expired.',
  brief: 'About the campaign',
  reach: 'Reach',
  noReachData: 'No measured data',
  accept: 'Accept this option',
  reject: 'Reject',
  rejectWholeProposal: 'Reject the whole proposal',
  proposeChanges: 'Propose changes',
  counterProposalForm: {
    title: 'Propose changes to this option',
    intro:
      "You can adjust the price, quantity and period of each placement, or remove an entire line. You cannot add new placements.",
    colSupport: 'Placement',
    colOriginalPrice: 'Original price',
    colYourPrice: 'Your proposal',
    colQuantity: 'Quantity',
    removeLine: 'Remove this line',
    lineRemoved: 'Removed',
    campaignPeriod: 'Campaign period',
    campaignStart: 'Start',
    campaignEnd: 'End',
    fiscalTitle: 'Your fiscal details',
    cancel: 'Cancel',
    submit: 'Send proposal',
  },
  counterProposalThankYou: "Thank you. We've received your proposal and will review it shortly; we'll be in touch.",
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
  duration: (n, unit) =>
    `Durée : ${n} ${unit === 'WEEK' ? (n === 1 ? 'semaine' : 'semaines') : (n === 1 ? 'mois' : 'mois')} (date de début à confirmer)`,
  validUntil: "Valable jusqu'au",
  daysRemaining: (n) => (n <= 0 ? "Expire aujourd'hui" : `Expire dans ${n} jour${n === 1 ? '' : 's'}`),
  expired: 'Cette offre a expiré.',
  brief: 'À propos de la campagne',
  reach: 'Audience',
  noReachData: 'Aucune donnée mesurée',
  accept: 'Accepter cette option',
  reject: 'Refuser',
  rejectWholeProposal: "Refuser l'ensemble de la proposition",
  proposeChanges: 'Proposer des modifications',
  counterProposalForm: {
    title: 'Proposer des modifications à cette option',
    intro:
      "Vous pouvez ajuster le prix, la quantité et la période de chaque support, ou supprimer une ligne entière. Il n'est pas possible d'ajouter de nouveaux supports.",
    colSupport: 'Support',
    colOriginalPrice: 'Prix initial',
    colYourPrice: 'Votre proposition',
    colQuantity: 'Quantité',
    removeLine: 'Supprimer cette ligne',
    lineRemoved: 'Supprimée',
    campaignPeriod: 'Période de campagne',
    campaignStart: 'Début',
    campaignEnd: 'Fin',
    fiscalTitle: 'Vos données fiscales',
    cancel: 'Annuler',
    submit: 'Envoyer la proposition',
  },
  counterProposalThankYou:
    'Merci. Nous avons bien reçu votre proposition et l\'examinerons rapidement ; nous reviendrons vers vous.',
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
  duration: (n, unit) =>
    `Durata: ${n} ${unit === 'WEEK' ? (n === 1 ? 'settimana' : 'settimane') : (n === 1 ? 'mese' : 'mesi')} (data di inizio da confermare)`,
  validUntil: 'Valido fino al',
  daysRemaining: (n) => (n <= 0 ? 'Scade oggi' : `Scade tra ${n} giorno${n === 1 ? '' : 'i'}`),
  expired: 'Questa offerta è scaduta.',
  brief: 'Informazioni sulla campagna',
  reach: 'Copertura',
  noReachData: 'Nessun dato misurato',
  accept: 'Accetta questa opzione',
  reject: 'Rifiuta',
  rejectWholeProposal: "Rifiuta l'intera proposta",
  proposeChanges: 'Proponi modifiche',
  counterProposalForm: {
    title: 'Proponi modifiche a questa opzione',
    intro:
      'Puoi modificare il prezzo, la quantità e il periodo di ciascun supporto, oppure eliminare una riga intera. Non è possibile aggiungere nuovi supporti.',
    colSupport: 'Supporto',
    colOriginalPrice: 'Prezzo originale',
    colYourPrice: 'La tua proposta',
    colQuantity: 'Quantità',
    removeLine: 'Elimina questa riga',
    lineRemoved: 'Eliminata',
    campaignPeriod: 'Periodo della campagna',
    campaignStart: 'Inizio',
    campaignEnd: 'Fine',
    fiscalTitle: 'I tuoi dati fiscali',
    cancel: 'Annulla',
    submit: 'Invia la proposta',
  },
  counterProposalThankYou:
    'Grazie. Abbiamo ricevuto la tua proposta e la esamineremo a breve; ti ricontatteremo.',
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
  duration: (n, unit) =>
    `Duur: ${n} ${unit === 'WEEK' ? (n === 1 ? 'week' : 'weken') : (n === 1 ? 'maand' : 'maanden')} (startdatum nog te bevestigen)`,
  validUntil: 'Geldig tot',
  daysRemaining: (n) => (n <= 0 ? 'Verloopt vandaag' : `Verloopt over ${n} dag${n === 1 ? '' : 'en'}`),
  expired: 'Dit aanbod is verlopen.',
  brief: 'Over de campagne',
  reach: 'Bereik',
  noReachData: 'Geen gemeten gegevens',
  accept: 'Deze optie accepteren',
  reject: 'Weigeren',
  rejectWholeProposal: 'Het hele voorstel weigeren',
  proposeChanges: 'Wijzigingen voorstellen',
  counterProposalForm: {
    title: 'Wijzigingen voorstellen voor deze optie',
    intro:
      'U kunt de prijs, hoeveelheid en periode van elk kanaal aanpassen, of een hele regel verwijderen. Nieuwe kanalen toevoegen is niet mogelijk.',
    colSupport: 'Kanaal',
    colOriginalPrice: 'Oorspronkelijke prijs',
    colYourPrice: 'Uw voorstel',
    colQuantity: 'Aantal',
    removeLine: 'Deze regel verwijderen',
    lineRemoved: 'Verwijderd',
    campaignPeriod: 'Campagneperiode',
    campaignStart: 'Start',
    campaignEnd: 'Einde',
    fiscalTitle: 'Uw fiscale gegevens',
    cancel: 'Annuleren',
    submit: 'Voorstel versturen',
  },
  counterProposalThankYou:
    'Bedankt. We hebben uw voorstel ontvangen en bekijken het binnenkort; we nemen contact met u op.',
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
export function getVatNotice(language: string): string | null {
  if (language !== 'ES') return null;
  return (
    'Importes expresados sin IVA. Operación no sujeta a IVA francés: inversión del sujeto pasivo ' +
    'conforme al artículo 44 de la Directiva 2006/112/CE. La exención queda condicionada a la ' +
    'validez del número de IVA intracomunitario del cliente en el momento de la emisión de la ' +
    'factura. En su defecto, se aplicará el IVA francés del 20 %.'
  );
}
