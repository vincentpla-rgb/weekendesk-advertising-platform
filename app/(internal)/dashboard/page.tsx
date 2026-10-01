import { createClient } from '@/lib/supabase/server';
import { DEFAULT_CATALOG } from '@/src/pricing/catalog.js';
import {
  currentFiscalYear,
  filterDashboardProposals,
  isExpiringSoon,
  type DashboardFilters,
  type DashboardProposalInput,
  type DashboardProposalStatus,
  type Market,
} from '@/src/pricing/index.js';
import { DashboardClient, type DashboardData } from './DashboardClient';

export const dynamic = 'force-dynamic';

const STATUSES: readonly DashboardProposalStatus[] = [
  'DRAFT',
  'SENT',
  'VIEWED',
  'ACCEPTED',
  'REJECTED',
  'EXPIRED',
  'COUNTERED',
];

function isStatus(value: string): value is DashboardProposalStatus {
  return (STATUSES as readonly string[]).includes(value);
}

/**
 * Dashboard de seguimiento (CLAUDE.md §1, ronda 18, bloque 4): visibilidad
 * total del equipo por defecto (ningún scoping por `owner_id`, mismo
 * criterio que `/proposals` desde la ronda 7 — "creador" es un filtro, no
 * una restricción de acceso), con KPIs sobre el objetivo (`quarterly_targets`,
 * confirmado por Vincent que sirve tal cual) y un listado filtrable.
 *
 * **Decisión de diseño, documentada**: solo los filtros de columna directa
 * y bien probados (estado, creador, `created_at` entre fechas) se aplican
 * en la consulta a Supabase — el resto (mercado, importe, soporte,
 * contrapropuesta pendiente, vence pronto) se calculan en memoria sobre ese
 * resultado ya traído, con `filterDashboardProposals` (`src/pricing/dashboard.ts`,
 * puro y testeado). A la escala de este negocio (150-200 presupuestos/año,
 * CLAUDE.md §0) esto es simple y correcto, y evita la sintaxis de filtro
 * sobre recursos embebidos de PostgREST, frágil de verificar sin un proyecto
 * Supabase real conectado a este entorno de desarrollo (CLAUDE.md §10.1.2).
 *
 * **El objetivo (año/quarter fiscal + AM) es un selector APARTE del listado**:
 * mide `importe_neto_de_medios` (CLAUDE.md §4.4) sobre `acceptances`, que ya
 * imputa cada aceptación a su quarter fiscal por la fecha de FIRMA (§0,
 * trigger `set_acceptance_fiscal_period`) — nunca se deriva de `created_at`
 * del listado, que es una fecha distinta y no tiene por qué coincidir.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    market?: string;
    owner?: string;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
    q?: string;
    number?: string;
    amountMin?: string;
    amountMax?: string;
    supportId?: string;
    pendingCp?: string;
    expiringSoon?: string;
    year?: string;
    quarter?: string;
  }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const fiscalYear = params.year && /^\d{4}$/.test(params.year) ? Number(params.year) : currentFiscalYear();
  const fiscalQuarter =
    params.quarter && ['1', '2', '3', '4'].includes(params.quarter) ? (Number(params.quarter) as 1 | 2 | 3 | 4) : null;

  // --- Query 1: listado base, filtros de columna directa únicamente -------
  let proposalsQuery = supabase
    .from('proposals')
    .select(
      'id, proposal_number, status, owner_id, account_id, created_at, expires_at, accounts(legal_name), profiles(full_name), proposal_options(billed_total_cents, markets, proposal_option_lines(support_id))',
    )
    .order('created_at', { ascending: false })
    .limit(300);

  if (params.status && isStatus(params.status)) proposalsQuery = proposalsQuery.eq('status', params.status);
  if (params.owner) proposalsQuery = proposalsQuery.eq('owner_id', params.owner);
  if (params.dateFrom) proposalsQuery = proposalsQuery.gte('created_at', params.dateFrom);
  if (params.dateTo) proposalsQuery = proposalsQuery.lte('created_at', `${params.dateTo}T23:59:59`);

  // --- Resto de consultas, en paralelo -------------------------------------
  let acceptancesQuery = supabase
    .from('acceptances')
    .select('fiscal_year, fiscal_quarter, proposals!inner(owner_id), proposal_options!inner(net_revenue_cents, margin_rate, markets)')
    .eq('fiscal_year', fiscalYear);
  if (fiscalQuarter) acceptancesQuery = acceptancesQuery.eq('fiscal_quarter', fiscalQuarter);
  if (params.owner) acceptancesQuery = acceptancesQuery.eq('proposals.owner_id', params.owner);

  let targetsQuery = supabase.from('quarterly_targets').select('target_cents, profile_id, fiscal_quarter').eq('fiscal_year', fiscalYear);
  if (fiscalQuarter) targetsQuery = targetsQuery.eq('fiscal_quarter', fiscalQuarter);
  if (params.owner) targetsQuery = targetsQuery.eq('profile_id', params.owner);

  const [
    { data: proposalsRaw, error: proposalsError },
    { data: pendingCounterProposals, error: cpError },
    { data: acceptedOptions, error: acceptancesError },
    { data: targets, error: targetsError },
    { data: profiles, error: profilesError },
  ] = await Promise.all([
    proposalsQuery,
    supabase.from('counter_proposals').select('proposal_id').eq('status', 'PENDING'),
    acceptancesQuery,
    targetsQuery,
    supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name'),
  ]);

  if (proposalsError) throw new Error(`No se pudo cargar el listado: ${proposalsError.message}`);
  if (cpError) throw new Error(`No se pudieron cargar las contrapropuestas: ${cpError.message}`);
  if (acceptancesError) throw new Error(`No se pudo cargar el objetivo: ${acceptancesError.message}`);
  if (targetsError) throw new Error(`No se pudieron cargar los objetivos: ${targetsError.message}`);
  if (profilesError) throw new Error(`No se pudieron cargar los advertising managers: ${profilesError.message}`);

  const pendingProposalIds = new Set((pendingCounterProposals ?? []).map((c) => c.proposal_id));

  const allProposals: DashboardProposalInput[] = (proposalsRaw ?? []).map((p) => ({
    id: p.id,
    proposalNumber: p.proposal_number,
    status: p.status,
    ownerId: p.owner_id,
    accountId: p.account_id,
    accountLegalName: p.accounts?.legal_name ?? '',
    createdAt: p.created_at,
    expiresAt: p.expires_at,
    hasPendingCounterProposal: pendingProposalIds.has(p.id),
    options: (p.proposal_options ?? []).map((o) => ({
      billedTotalCents: o.billed_total_cents,
      markets: o.markets,
      supportIds: (o.proposal_option_lines ?? []).map((l) => l.support_id),
    })),
  }));

  const filters: DashboardFilters = {
    market: (params.market as Market) || null,
    ownerId: params.owner || null,
    status: params.status && isStatus(params.status) ? params.status : null,
    accountQuery: params.q || null,
    proposalNumberQuery: params.number || null,
    amountMinCents: params.amountMin ? Math.round(Number(params.amountMin) * 100) : null,
    amountMaxCents: params.amountMax ? Math.round(Number(params.amountMax) * 100) : null,
    supportId: params.supportId || null,
    onlyPendingCounterProposal: params.pendingCp === '1',
    onlyExpiringSoon: params.expiringSoon === '1',
  };

  const filtered = filterDashboardProposals(allProposals, filters);
  const now = new Date();
  const expiringSoonCount = allProposals.filter((p) => isExpiringSoon(p, now)).length;

  // --- KPIs del objetivo: siempre sobre ACEPTADO, nunca sobre el listado filtrado ---
  const billedNetOfMediaCents = (acceptedOptions ?? []).reduce(
    (sum, row) => sum + (row.proposal_options?.net_revenue_cents ?? 0),
    0,
  );
  const marginRates = (acceptedOptions ?? [])
    .map((row) => row.proposal_options?.margin_rate)
    .filter((r): r is number => r !== null && r !== undefined);
  const avgMarginRate = marginRates.length > 0 ? marginRates.reduce((a, b) => a + b, 0) / marginRates.length : null;
  const optionsWithoutMargin = (acceptedOptions ?? []).length - marginRates.length;

  const targetCents = (targets ?? []).reduce((sum, t) => sum + t.target_cents, 0);

  const byAmCents = new Map<string, number>();
  for (const row of acceptedOptions ?? []) {
    const ownerId = row.proposals?.owner_id;
    if (!ownerId) continue;
    byAmCents.set(ownerId, (byAmCents.get(ownerId) ?? 0) + (row.proposal_options?.net_revenue_cents ?? 0));
  }
  const profileNameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
  const byAm = Array.from(byAmCents.entries()).map(([profileId, cents]) => ({
    profileId,
    fullName: profileNameById.get(profileId) ?? profileId,
    cents,
  }));

  const byMarket = new Map<Market, number>();
  for (const row of acceptedOptions ?? []) {
    const markets: readonly Market[] = row.proposal_options?.markets ?? [];
    const cents = row.proposal_options?.net_revenue_cents ?? 0;
    for (const m of markets) {
      byMarket.set(m, (byMarket.get(m) ?? 0) + cents);
    }
  }

  const data: DashboardData = {
    fiscalYear,
    fiscalQuarter,
    proposals: filtered,
    totalProposalsBeforeFilters: allProposals.length,
    kpis: {
      billedNetOfMediaCents,
      targetCents,
      pendingCounterProposalsCount: pendingProposalIds.size,
      expiringSoonCount,
      avgMarginRate,
      optionsWithoutMargin,
      byMarket: Array.from(byMarket.entries()).map(([market, cents]) => ({ market, cents })),
      byAm,
    },
    profiles: (profiles ?? []).map((p) => ({ id: p.id, fullName: p.full_name })),
    supports: Array.from(DEFAULT_CATALOG.values()).map((s) => ({ id: s.id, name: s.name })),
  };

  return (
    <div className="wk-shell">
      <DashboardClient data={data} />
    </div>
  );
}
