/**
 * Tipos de dominio que solo existen en la capa de aplicación (no en el
 * motor puro de src/pricing): idioma del cliente, estructura de cuentas y
 * contactos tal como llegan de Supabase.
 */
import type { Market } from '@/src/pricing/index.js';

export type ContentLanguage = 'FR' | 'ES' | 'IT' | 'NL' | 'EN';

export const CONTENT_LANGUAGES: readonly ContentLanguage[] = ['FR', 'ES', 'IT', 'NL', 'EN'];

export const LANGUAGE_LABELS: Record<ContentLanguage, string> = {
  FR: 'Francés',
  ES: 'Español',
  IT: 'Italiano',
  NL: 'Neerlandés',
  EN: 'Inglés',
};

export interface ContactRow {
  readonly id: string;
  readonly full_name: string;
  readonly email: string;
  readonly language: ContentLanguage;
}

export interface AccountRow {
  readonly id: string;
  readonly legal_name: string;
  readonly country_code: string;
  readonly contacts: readonly ContactRow[];
}

/**
 * Estados de un envío (CLAUDE.md §5.5). `borrador` cubre dos casos bien
 * distintos que la interfaz distingue (ronda 7): un envío recién creado que
 * todavía no ha intentado mandar el email, y uno cuyo email falló
 * (`log_proposal_send_failure`) — el único caso con un botón de reintento.
 * `COUNTERED` (ronda 16): el cliente propuso cambios en vez de aceptar o
 * rechazar sin más — congelado para siempre, igual que ACCEPTED/REJECTED,
 * en cuanto el AM decide sobre la contrapropuesta pasa a REJECTED (si la
 * rechaza) o el ORIGINAL se queda en COUNTERED mientras nace un presupuesto
 * nuevo en ACCEPTED (si la acepta) — ver `counter_proposals`.
 */
export type ProposalStatus =
  | 'DRAFT'
  | 'SENT'
  | 'VIEWED'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'COUNTERED';

export const PROPOSAL_STATUSES: readonly ProposalStatus[] = [
  'DRAFT',
  'SENT',
  'VIEWED',
  'ACCEPTED',
  'REJECTED',
  'EXPIRED',
  'COUNTERED',
];

/**
 * Contrapropuesta editable del cliente (CLAUDE.md, ronda 16): lo que
 * `submit_counter_proposal` persiste al pulsar "Proponer cambios" en vez de
 * "Rechazar". Nunca pasa por el motor de precios — son números tecleados
 * por el cliente, sin coeficientes ni descuentos (CLAUDE.md §8).
 */
export type CounterProposalStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED';

/**
 * Una línea de la contrapropuesta: original Y editado por el cliente,
 * incluidas las líneas que el cliente eliminó (`deleted: true`, nunca
 * quitadas del array — la revisión interna necesita ver qué se quitó, no
 * que desaparezca sin rastro).
 */
export interface CounterProposalLine {
  readonly support_id: string;
  readonly market: Market;
  readonly deleted: boolean;
  readonly original_price_cents: number;
  readonly original_quantity: number;
  readonly client_price_cents: number;
  readonly client_quantity: number;
}

export interface CounterProposalRow {
  readonly id: string;
  readonly proposal_id: string;
  readonly option_code: string;
  readonly option_name: string | null;
  readonly status: CounterProposalStatus;
  readonly lines: readonly CounterProposalLine[];
  readonly campaign_start: string | null;
  readonly campaign_end: string | null;
  readonly campaign_duration_count: number | null;
  readonly campaign_duration_unit: 'WEEK' | 'MONTH' | null;
  readonly legal_name: string;
  readonly billing_address: string;
  readonly vat_number: string | null;
  readonly billing_contact_name: string;
  readonly billing_contact_email: string;
  readonly signer_name: string;
  readonly signer_role: string;
  readonly purchase_order_reference: string | null;
  readonly submitted_at: string;
  readonly reviewed_at: string | null;
  readonly reviewed_by: string | null;
  readonly rejection_reason: string | null;
  readonly resulting_proposal_id: string | null;
}

/** Fila mínima para listar presupuestos (CLAUDE.md §10.1.1, ronda 7): `/proposals`, `/accounts/[id]`. */
export interface ProposalListItem {
  readonly id: string;
  /** Número corto y legible (CLAUDE.md §10.3 octies, ronda 8), p. ej. "2026-014". */
  readonly proposal_number: string;
  readonly status: ProposalStatus;
  readonly created_at: string;
  readonly updated_at: string;
  readonly sent_at: string | null;
  readonly decided_at: string | null;
  readonly account: { readonly legal_name: string } | null;
  readonly contact: { readonly full_name: string } | null;
  readonly owner: { readonly full_name: string } | null;
}
