import { createClient } from '@/lib/supabase/server';
import { DEFAULT_CATALOG } from '@/src/pricing/catalog.js';
import {
  currentFiscalYear,
  fiscalPeriodOf,
  filterDashboardProposals,
  isExpiringSoon,
  type DashboardFilters,
  type DashboardProposalInput,
  type DashboardProposalStatus,
  type Market,
} from '@/src/pricing/index.js';
import { DashboardClient, type AttentionItem, type DashboardData } from './DashboardClient';

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

const STALE_DRAFT_DAYS = 7;

function isStatus(value: string): value is DashboardProposalStatus {
  return (STATUSES as readonly string[]).includes(value);
}

function headlineAmountCents(options: readonly { readonly billed_total_cents: number | null }[]): number | null {
  const amounts = options.map((o) => o.billed_total_cents).filter((c): c is number => c !== null);
  return amounts.length > 0 ? Math.max(...amounts) : null;
}

/**
 * Dashboard de seguimiento (CLAUDE.md §1, ronda 18, bloque 4; rediseño
 * visual ronda 24). Visibilidad total del equipo por defecto (ningún
 * scoping por `owner_id`, mismo criterio que `/proposals` desde la ronda 7
 * — "creador" es un filtro, no una restricción de acceso), con KPIs sobre
 * el objetivo (`quarterly_targets`, confirmado por Vincent que sirve tal
 * cual) y un listado filtrable.
 *
 * **Decisión de diseño, documentada**: solo los filtros de columna directa
 * y bien probados (estado, creador, `created_at` entre fechas) se aplican
 * en la consulta a Supabase — el resto (mercado, importe, soporte,
 * búsqueda, contrapropuesta pendiente, vence pronto) se calculan en memoria
 * sobre ese resultado ya traído, con `filterDashboardProposals`
 * (`src/pricing/dashboard.ts`, puro y testeado). A la escala de este
 * negocio (150-200 presupuestos/año, CLAUDE.md §0) esto es simple y
 * correcto, y evita la sintaxis de filtro sobre recursos embebidos de
 * PostgREST, frágil de verificar sin un proyecto Supabase real conectado a
 * este entorno de desarrollo (CLAUDE.md §10.1.2).
 *
 * **El objetivo (año/quarter fiscal + AM) es un selector APARTE del
 * listado**: mide `importe_neto_de_medios` (CLAUDE.md §4.4) sobre
 * `acceptances`, que ya imputa cada aceptación a su quarter fiscal por la
 * fecha de FIRMA (§0, trigger `set_acceptance_fiscal_period`) — nunca se
 * deriva de `created_at` del listado, que es una fecha distinta y no tiene
 * por qué coincidir. El desglose por trimestre (ronda 24) se calcula sobre
 * el AÑO FISCAL completo, sin importar si hay un quarter concreto
 * seleccionado — el selector de quarter solo acota las cifras de cabecera
 * (facturado/objetivo/progreso), nunca el propio desglose de los 4
 * trimestres, que siempre muestra los cuatro para dar contexto.
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
  const { quarter: currentQuarter } = fiscalPeriodOf(new Date());

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

  // --- Objetivo: todo el año fiscal, sin filtrar por quarter en la propia
  // consulta — el desglose por trimestre (más abajo) necesita los 4 a la
  // vez; el recorte a un quarter concreto, si lo hay, se hace en memoria.
  let acceptancesQuery = supabase
    .from('acceptances')
    .select(
      'fiscal_quarter, proposals!inner(owner_id), proposal_options!inner(net_revenue_cents, margin_rate, markets)',
    )
    .eq('fiscal_year', fiscalYear);
  if (params.owner) acceptancesQuery = acceptancesQuery.eq('proposals.owner_id', params.owner);

  let targetsQuery = supabase
    .from('quarterly_targets')
    .select('target_cents, profile_id, fiscal_quarter')
    .eq('fiscal_year', fiscalYear);
  if (params.owner) targetsQuery = targetsQuery.eq('profile_id', params.owner);

  // --- "Requieren tu atención" (ronda 24): cuatro categorías con datos
  // reales, independientes de los filtros del listado de abajo — es un
  // resumen global, no una vista filtrada. Ver CLAUDE.md para el porqué de
  // cada consulta.
  const now = new Date();
  const soonLimitIso = new Date(now.getTime() + 4 * 86_400_000).toISOString();
  const staleDraftLimitIso = new Date(now.getTime() - STALE_DRAFT_DAYS * 86_400_000).toISOString();

  const [
    { data: proposalsRaw, error: proposalsError },
    { data: pendingCounterProposals, error: cpError },
    { data: acceptedOptions, error: acceptancesError },
    { data: targets, error: targetsError },
    { data: profiles, error: profilesError },
    { data: pendingCpAttentionRows, error: pendingCpAttentionError },
    { data: expiringAttentionRows, error: expiringAttentionError },
    { data: marginOverrideRows, error: marginOverrideError },
    { data: staleDraftRows, error: staleDraftError },
  ] = await Promise.all([
    proposalsQuery,
    supabase.from('counter_proposals').select('proposal_id').eq('status', 'PENDING'),
    acceptancesQuery,
    targetsQuery,
    supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name'),
    supabase
      .from('counter_proposals')
      .select('proposal_id, submitted_at, proposals!inner(proposal_number, accounts(legal_name))')
      .eq('status', 'PENDING'),
    supabase
      .from('proposals')
      .select('id, proposal_number, expires_at, accounts(legal_name), proposal_options(billed_total_cents)')
      .in('status', ['SENT', 'VIEWED'])
      .not('expires_at', 'is', null)
      .gte('expires_at', now.toISOString())
      .lte('expires_at', soonLimitIso),
    supabase
      .from('overrides')
      .select('proposal_id, reason, created_at, proposals!inner(proposal_number, status, accounts(legal_name))')
      .eq('kind', 'MARGIN_BELOW_FLOOR'),
    supabase
      .from('proposals')
      .select('id, proposal_number, created_at, accounts(legal_name), proposal_options(billed_total_cents)')
      .eq('status', 'DRAFT')
      .lte('created_at', staleDraftLimitIso),
  ]);

  if (proposalsError) throw new Error(`No se pudo cargar el listado: ${proposalsError.message}`);
  if (cpError) throw new Error(`No se pudieron cargar las contrapropuestas: ${cpError.message}`);
  if (acceptancesError) throw new Error(`No se pudo cargar el objetivo: ${acceptancesError.message}`);
  if (targetsError) throw new Error(`No se pudieron cargar los objetivos: ${targetsError.message}`);
  if (profilesError) throw new Error(`No se pudieron cargar los advertising managers: ${profilesError.message}`);
  if (pendingCpAttentionError || expiringAttentionError || marginOverrideError || staleDraftError) {
    throw new Error('No se pudo cargar el bloque de atención.');
  }

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
    searchQuery: params.q || null,
    amountMinCents: params.amountMin ? Math.round(Number(params.amountMin) * 100) : null,
    amountMaxCents: params.amountMax ? Math.round(Number(params.amountMax) * 100) : null,
    supportId: params.supportId || null,
    onlyPendingCounterProposal: params.pendingCp === '1',
    onlyExpiringSoon: params.expiringSoon === '1',
  };

  const filtered = filterDashboardProposals(allProposals, filters);

  // --- Recuento por estado, independiente del pill activo (ronda 24): se
  // calcula sobre el listado ya filtrado por TODO lo demás (búsqueda,
  // mercado, AM, fechas, importe, soporte, toggles) salvo el propio estado,
  // para que cambiar de pill no cambie el propio recuento de cada pill.
  const withoutStatusFilter = filterDashboardProposals(allProposals, { ...filters, status: null });
  const statusCounts = new Map<DashboardProposalStatus, number>();
  for (const p of withoutStatusFilter) {
    statusCounts.set(p.status, (statusCounts.get(p.status) ?? 0) + 1);
  }

  // --- KPIs del objetivo: siempre sobre ACEPTADO, nunca sobre el listado filtrado ---
  const inSelectedQuarter = (row: { readonly fiscal_quarter: number }) =>
    fiscalQuarter === null || row.fiscal_quarter === fiscalQuarter;
  const selectedAcceptedOptions = (acceptedOptions ?? []).filter(inSelectedQuarter);

  const billedNetOfMediaCents = selectedAcceptedOptions.reduce(
    (sum, row) => sum + (row.proposal_options?.net_revenue_cents ?? 0),
    0,
  );
  const marginRates = selectedAcceptedOptions
    .map((row) => row.proposal_options?.margin_rate)
    .filter((r): r is number => r !== null && r !== undefined);
  const avgMarginRate = marginRates.length > 0 ? marginRates.reduce((a, b) => a + b, 0) / marginRates.length : null;
  const optionsWithoutMargin = selectedAcceptedOptions.length - marginRates.length;

  const selectedTargets = (targets ?? []).filter((t) => fiscalQuarter === null || t.fiscal_quarter === fiscalQuarter);
  const targetCents = selectedTargets.reduce((sum, t) => sum + t.target_cents, 0);

  const byAmCents = new Map<string, number>();
  for (const row of selectedAcceptedOptions) {
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
  for (const row of selectedAcceptedOptions) {
    const markets: readonly Market[] = row.proposal_options?.markets ?? [];
    const cents = row.proposal_options?.net_revenue_cents ?? 0;
    for (const m of markets) {
      byMarket.set(m, (byMarket.get(m) ?? 0) + cents);
    }
  }

  // --- Desglose por trimestre fiscal (ronda 24): SIEMPRE los 4, sobre el
  // año fiscal completo (acceptedOptions sin recortar por quarter) — el
  // selector de quarter de arriba no afecta a este desglose, solo a las
  // cifras de cabecera calculadas más arriba.
  const quarterBreakdown = ([1, 2, 3, 4] as const).map((q) => {
    const rowsInQuarter = (acceptedOptions ?? []).filter((r) => r.fiscal_quarter === q);
    const cents = rowsInQuarter.reduce((sum, row) => sum + (row.proposal_options?.net_revenue_cents ?? 0), 0);
    const quarterTargetCents = (targets ?? [])
      .filter((t) => t.fiscal_quarter === q)
      .reduce((sum, t) => sum + t.target_cents, 0);
    return { quarter: q, cents, targetCents: quarterTargetCents, isCurrent: q === currentQuarter };
  });

  // --- "Requieren tu atención": construcción de las 4 categorías --------
  const attentionItems: AttentionItem[] = [];

  const pendingCpSorted = [...(pendingCpAttentionRows ?? [])].sort(
    (a, b) => new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime(),
  );
  for (const row of pendingCpSorted) {
    attentionItems.push({
      kind: 'counterProposal',
      proposalId: row.proposal_id,
      proposalNumber: row.proposals?.proposal_number ?? null,
      accountLegalName: row.proposals?.accounts?.legal_name ?? '',
      days: null,
      amountCents: null,
      reason: null,
    });
  }

  const expiringSorted = [...(expiringAttentionRows ?? [])].sort(
    (a, b) => new Date(a.expires_at ?? 0).getTime() - new Date(b.expires_at ?? 0).getTime(),
  );
  for (const row of expiringSorted) {
    const daysLeft = row.expires_at
      ? Math.max(0, Math.ceil((new Date(row.expires_at).getTime() - now.getTime()) / 86_400_000))
      : null;
    attentionItems.push({
      kind: 'expiringSoon',
      proposalId: row.id,
      proposalNumber: row.proposal_number,
      accountLegalName: row.accounts?.legal_name ?? '',
      days: daysLeft,
      amountCents: headlineAmountCents(row.proposal_options ?? []),
      reason: null,
    });
  }

  // Un override por línea forzada (CLAUDE.md §4.3, ronda 16): se dedupe por
  // presupuesto, quedándose con el más reciente — varias líneas forzadas en
  // el mismo presupuesto no deben generar varias filas de atención.
  // "Aún abiertos": se excluyen los presupuestos que ya cerraron en negativo
  // (rechazado/caducado) — en la práctica, un override de este tipo siempre
  // nace ya ACEPTADO (`accept_counter_proposal`, CLAUDE.md ronda 16), pero
  // la comprobación queda aquí por si ese presupuesto se rechazara más
  // adelante por otra vía.
  const marginByProposal = new Map<string, { reason: string; createdAt: string; proposalNumber: string | null; accountLegalName: string }>();
  for (const row of marginOverrideRows ?? []) {
    const status = row.proposals?.status;
    if (status === 'REJECTED' || status === 'EXPIRED') continue;
    const existing = marginByProposal.get(row.proposal_id);
    if (existing && new Date(existing.createdAt).getTime() >= new Date(row.created_at).getTime()) continue;
    marginByProposal.set(row.proposal_id, {
      reason: row.reason,
      createdAt: row.created_at,
      proposalNumber: row.proposals?.proposal_number ?? null,
      accountLegalName: row.proposals?.accounts?.legal_name ?? '',
    });
  }
  const marginSorted = Array.from(marginByProposal.entries()).sort(
    (a, b) => new Date(b[1].createdAt).getTime() - new Date(a[1].createdAt).getTime(),
  );
  for (const [proposalId, info] of marginSorted) {
    attentionItems.push({
      kind: 'marginBelowFloor',
      proposalId,
      proposalNumber: info.proposalNumber,
      accountLegalName: info.accountLegalName,
      days: null,
      amountCents: null,
      reason: info.reason,
    });
  }

  const staleDraftsSorted = [...(staleDraftRows ?? [])].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  for (const row of staleDraftsSorted) {
    const daysOld = Math.floor((now.getTime() - new Date(row.created_at).getTime()) / 86_400_000);
    attentionItems.push({
      kind: 'staleDraft',
      proposalId: row.id,
      proposalNumber: row.proposal_number,
      accountLegalName: row.accounts?.legal_name ?? '',
      days: daysOld,
      amountCents: headlineAmountCents(row.proposal_options ?? []),
      reason: null,
    });
  }

  const expiringSoonCount = allProposals.filter((p) => isExpiringSoon(p, now)).length;

  const data: DashboardData = {
    fiscalYear,
    fiscalQuarter,
    currentFiscalQuarter: currentQuarter,
    proposals: filtered,
    totalProposalsBeforeFilters: allProposals.length,
    statusCounts: Object.fromEntries(statusCounts) as Partial<Record<DashboardProposalStatus, number>>,
    quarterBreakdown,
    attentionItems: attentionItems.slice(0, 20),
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

  return <DashboardClient data={data} />;
}
