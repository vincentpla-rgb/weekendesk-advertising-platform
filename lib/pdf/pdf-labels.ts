/**
 * Etiquetas de la variante INTERNA del PDF (coste/margen, CLAUDE.md §4.4/
 * §6 — nunca en la variante de cara al cliente). Restringidas a los tres
 * idiomas de la interfaz interna (ES/FR/EN, mismo criterio que
 * `lib/i18n-internal.tsx`/`lib/email/transactional-copy.ts`), cae a ES.
 *
 * La variante de cara al CLIENTE reutiliza en su lugar `getPublicCopy`
 * (`lib/i18n.ts`) para lo que ya tiene traducido (brief, reach, periodo,
 * validez, mención de IVA) — nunca un segundo diccionario con el riesgo de
 * divergir del que ya usa la pantalla pública.
 */

export interface PdfInternalLabels {
  readonly title: string;
  readonly proposalNumber: string;
  readonly advertiser: string;
  readonly contact: string;
  readonly owner: string;
  readonly brief: string;
  readonly option: string;
  readonly markets: string;
  readonly period: string;
  readonly support: string;
  readonly market: string;
  readonly quantity: string;
  readonly billedTotal: string;
  readonly optionTotal: string;
  readonly cost: string;
  readonly margin: string;
  readonly marginRate: string;
  readonly marginNotApplicable: string;
  readonly reach: string;
  readonly acceptance: string;
  readonly legalName: string;
  readonly billingAddress: string;
  readonly vatNumber: string;
  readonly purchaseOrderReference: string;
  readonly vatRegime: string;
  readonly vatRegimeFr: string;
  readonly vatRegimeReverseCharge: string;
  readonly acceptedAt: string;
  readonly footer: string;
  readonly weeks: string;
  readonly months: string;
}

const es: PdfInternalLabels = {
  title: 'Presupuesto',
  proposalNumber: 'N.º de presupuesto',
  advertiser: 'Anunciante',
  contact: 'Contacto',
  owner: 'Advertising manager',
  brief: 'Brief de campaña',
  option: 'Opción',
  markets: 'Mercados',
  period: 'Periodo',
  support: 'Soporte',
  market: 'Mercado',
  quantity: 'Cantidad',
  billedTotal: 'Importe',
  optionTotal: 'Total de la opción',
  cost: 'Coste',
  margin: 'Margen',
  marginRate: 'Margen %',
  marginNotApplicable: 'Sin margen aplicable (media buy)',
  reach: 'Alcance',
  acceptance: 'Datos de aceptación',
  legalName: 'Razón social',
  billingAddress: 'Dirección de facturación',
  vatNumber: 'N.º de IVA intracomunitario',
  purchaseOrderReference: 'Referencia de pedido',
  vatRegime: 'Régimen de IVA',
  vatRegimeFr: 'IVA francés 20 %',
  vatRegimeReverseCharge: 'Autoliquidación (sin IVA)',
  acceptedAt: 'Aceptado el',
  footer: 'Weekendesk SAS · 28 rue de Londres, 75009 Paris',
  weeks: 'semanas',
  months: 'meses',
};

const fr: PdfInternalLabels = {
  title: 'Devis',
  proposalNumber: 'N° de devis',
  advertiser: 'Annonceur',
  contact: 'Contact',
  owner: 'Advertising manager',
  brief: 'Brief de campagne',
  option: 'Option',
  markets: 'Marchés',
  period: 'Période',
  support: 'Support',
  market: 'Marché',
  quantity: 'Quantité',
  billedTotal: 'Montant',
  optionTotal: "Total de l'option",
  cost: 'Coût',
  margin: 'Marge',
  marginRate: 'Marge %',
  marginNotApplicable: 'Marge non applicable (media buy)',
  reach: 'Portée',
  acceptance: "Données d'acceptation",
  legalName: 'Raison sociale',
  billingAddress: 'Adresse de facturation',
  vatNumber: 'N° de TVA intracommunautaire',
  purchaseOrderReference: 'Référence de commande',
  vatRegime: 'Régime de TVA',
  vatRegimeFr: 'TVA française 20 %',
  vatRegimeReverseCharge: 'Autoliquidation (sans TVA)',
  acceptedAt: 'Accepté le',
  footer: 'Weekendesk SAS · 28 rue de Londres, 75009 Paris',
  weeks: 'semaines',
  months: 'mois',
};

const en: PdfInternalLabels = {
  title: 'Proposal',
  proposalNumber: 'Proposal number',
  advertiser: 'Advertiser',
  contact: 'Contact',
  owner: 'Advertising manager',
  brief: 'Campaign brief',
  option: 'Option',
  markets: 'Markets',
  period: 'Period',
  support: 'Placement',
  market: 'Market',
  quantity: 'Quantity',
  billedTotal: 'Amount',
  optionTotal: 'Option total',
  cost: 'Cost',
  margin: 'Margin',
  marginRate: 'Margin %',
  marginNotApplicable: 'No margin applicable (media buy)',
  reach: 'Reach',
  acceptance: 'Acceptance details',
  legalName: 'Legal name',
  billingAddress: 'Billing address',
  vatNumber: 'Intra-EU VAT number',
  purchaseOrderReference: 'Order reference',
  vatRegime: 'VAT regime',
  vatRegimeFr: 'French VAT 20%',
  vatRegimeReverseCharge: 'Reverse charge (no VAT)',
  acceptedAt: 'Accepted on',
  footer: 'Weekendesk SAS · 28 rue de Londres, 75009 Paris',
  weeks: 'weeks',
  months: 'months',
};

const LABELS: Record<string, PdfInternalLabels> = { ES: es, FR: fr, EN: en };

export function getPdfInternalLabels(language: string): PdfInternalLabels {
  return LABELS[language] ?? es;
}
