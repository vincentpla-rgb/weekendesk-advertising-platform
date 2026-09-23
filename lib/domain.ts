/**
 * Tipos de dominio que solo existen en la capa de aplicación (no en el
 * motor puro de src/pricing): idioma del cliente, estructura de cuentas y
 * contactos tal como llegan de Supabase.
 */
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
 */
export type ProposalStatus = 'DRAFT' | 'SENT' | 'VIEWED' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';

export const PROPOSAL_STATUSES: readonly ProposalStatus[] = [
  'DRAFT',
  'SENT',
  'VIEWED',
  'ACCEPTED',
  'REJECTED',
  'EXPIRED',
];

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
