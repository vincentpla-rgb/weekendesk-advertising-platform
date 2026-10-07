/**
 * Filtrado puro del listado del dashboard (CLAUDE.md §1/§0, ronda 18,
 * bloque 4). La consulta al servidor (`app/(internal)/dashboard/page.tsx`)
 * solo aplica los filtros de columna directa que ya usa `/proposals`
 * (estado, creador, rango de fechas por `created_at`) para mantener el
 * resultado razonable — el resto de filtros (mercado, importe, soporte,
 * contrapropuesta pendiente, vence pronto) se aplican aquí, en memoria,
 * sobre ese resultado ya traído. A la escala de este negocio (CLAUDE.md §0:
 * 150-200 presupuestos/año objetivo), filtrar en memoria sobre un listado ya
 * acotado por fecha/estado es simple y correcto — no hace falta la sintaxis
 * de filtro sobre recursos embebidos de PostgREST, frágil de verificar sin
 * un proyecto Supabase real conectado a este entorno de desarrollo.
 */
import type { Market } from './types.js';

/** Duplica el enum de `proposals.status` (CLAUDE.md §5.5) — `src/pricing/`
 * nunca importa de `lib/domain.ts` (el motor es independiente de la capa de
 * aplicación), así que se repite aquí el mismo literal, igual que
 * `ProposalStatusEnum` ya se repite en `database.types.ts`. */
export type DashboardProposalStatus =
  | 'DRAFT'
  | 'SENT'
  | 'VIEWED'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'COUNTERED';

export interface DashboardOptionInput {
  readonly billedTotalCents: number | null;
  readonly markets: readonly Market[];
  readonly supportIds: readonly string[];
}

export interface DashboardProposalInput {
  readonly id: string;
  readonly proposalNumber: string | null;
  readonly status: DashboardProposalStatus;
  readonly ownerId: string;
  /** Para enlazar a la ficha de cuenta (`/accounts/[id]`, ronda 21) — distinto del enlace al presupuesto. */
  readonly accountId: string;
  readonly accountLegalName: string;
  readonly createdAt: string;
  readonly expiresAt: string | null;
  readonly options: readonly DashboardOptionInput[];
  readonly hasPendingCounterProposal: boolean;
}

export interface DashboardFilters {
  readonly market: Market | null;
  readonly ownerId: string | null;
  readonly status: DashboardProposalStatus | null;
  /**
   * Buscador único (CLAUDE.md, ronda 24): coincide por número de
   * presupuesto O por cuenta (subcadena, sin distinguir mayúsculas) — un
   * presupuesto pasa si CUALQUIERA de los dos coincide, nunca si hace falta
   * que coincidan los dos a la vez. Sustituye a los antiguos `accountQuery`
   * y `proposalNumberQuery` (ronda 20), que se combinaban con Y.
   */
  readonly searchQuery: string | null;
  readonly amountMinCents: number | null;
  readonly amountMaxCents: number | null;
  readonly supportId: string | null;
  readonly onlyPendingCounterProposal: boolean;
  readonly onlyExpiringSoon: boolean;
}

export const EMPTY_DASHBOARD_FILTERS: DashboardFilters = {
  market: null,
  ownerId: null,
  status: null,
  searchQuery: null,
  amountMinCents: null,
  amountMaxCents: null,
  supportId: null,
  onlyPendingCounterProposal: false,
  onlyExpiringSoon: false,
};

/** "Vence pronto" (CLAUDE.md, ronda 18): SENT/VIEWED con menos de 4 días para caducar. */
export function isExpiringSoon(proposal: DashboardProposalInput, now: Date): boolean {
  if (proposal.status !== 'SENT' && proposal.status !== 'VIEWED') return false;
  if (!proposal.expiresAt) return false;
  const msLeft = new Date(proposal.expiresAt).getTime() - now.getTime();
  return msLeft >= 0 && msLeft <= 4 * 86_400_000;
}

/** El importe "de cabecera" de un presupuesto: el mayor billed_total_cents entre sus 1-3 opciones. */
function headlineAmountCents(proposal: DashboardProposalInput): number | null {
  const amounts = proposal.options
    .map((o) => o.billedTotalCents)
    .filter((c): c is number => c !== null);
  return amounts.length > 0 ? Math.max(...amounts) : null;
}

export function filterDashboardProposals(
  proposals: readonly DashboardProposalInput[],
  filters: DashboardFilters,
  now: Date = new Date(),
): readonly DashboardProposalInput[] {
  return proposals.filter((p) => {
    if (filters.market && !p.options.some((o) => o.markets.includes(filters.market!))) return false;
    if (filters.ownerId && p.ownerId !== filters.ownerId) return false;
    if (filters.status && p.status !== filters.status) return false;
    if (filters.searchQuery) {
      const needle = filters.searchQuery.trim().toLowerCase();
      if (needle) {
        const matchesAccount = p.accountLegalName.toLowerCase().includes(needle);
        const matchesNumber = (p.proposalNumber ?? '').toLowerCase().includes(needle);
        if (!matchesAccount && !matchesNumber) return false;
      }
    }
    if (filters.supportId && !p.options.some((o) => o.supportIds.includes(filters.supportId!))) return false;
    if (filters.amountMinCents !== null || filters.amountMaxCents !== null) {
      const amount = headlineAmountCents(p);
      if (amount === null) return false;
      if (filters.amountMinCents !== null && amount < filters.amountMinCents) return false;
      if (filters.amountMaxCents !== null && amount > filters.amountMaxCents) return false;
    }
    if (filters.onlyPendingCounterProposal && !p.hasPendingCounterProposal) return false;
    if (filters.onlyExpiringSoon && !isExpiringSoon(p, now)) return false;
    return true;
  });
}
