import type { TypedSupabaseClient } from '@/lib/pricing-context';
import type { AttentionItem, AttentionItemKind } from './DashboardClient';

const STALE_DRAFT_DAYS = 7;
const EXPIRING_SOON_DAYS = 4;

/**
 * Carga del bloque "Requieren tu atención" (CLAUDE.md, ronda 24; ronda 25
 * para el arreglo de resiliencia/causa raíz). Separado de `page.tsx` para
 * poder testearlo con un cliente Supabase simulado, sin montar la página
 * entera — mismo criterio que `filterDashboardProposals` o
 * `buildProposalOptionsPayload` en otras pantallas.
 *
 * **Nunca tumba el panel.** Cada una de las cuatro categorías se calcula
 * por separado, con su propio `try/catch`: si una falla, las otras tres
 * siguen contribuyendo con sus propios elementos, y `failedCategories`
 * recoge cuál(es) fallaron para que la interfaz muestre un aviso discreto
 * dentro del propio bloque — nunca un 500 de toda la pantalla. El error
 * original completo (`message`, `code`, `details`, `hint` de PostgREST) se
 * registra con `console.error`, identificado por categoría, para que el
 * log de Vercel diga la causa exacta la próxima vez.
 *
 * **Sin joins embebidos de PostgREST** (ronda 25, causa raíz real,
 * CLAUDE.md §10.3): la ronda 24 usaba `tabla!inner(...)` para anidar
 * `proposals`/`accounts` desde `counter_proposals`/`overrides` — funciona
 * contra los mocks de los tests, pero `counter_proposals` tiene DOS
 * foreign keys hacia `proposals` (`proposal_id` y `resulting_proposal_id`,
 * confirmado contra un PostgreSQL 16 real con las migraciones aplicadas:
 * `select ... from information_schema.table_constraints ...`), así que
 * PostgREST no puede resolver `proposals!inner(...)` sin ambigüedad y
 * responde con un error de relación (PGRST201, "more than one relationship
 * was found") — invisible con un cliente simulado, real contra PostgREST.
 * Esta versión sustituye los cuatro embeds por consultas PLANAS
 * (`select` sin relaciones anidadas) que se combinan aquí, en memoria, con
 * `Map`s — mismo patrón ya establecido en el resto de este módulo
 * (`page.tsx`: "evita la sintaxis de filtro sobre recursos embebidos de
 * PostgREST, frágil de verificar sin un proyecto Supabase real").
 */

interface ProposalLookupRow {
  readonly id: string;
  readonly proposal_number: string | null;
  readonly status: string;
  readonly account_id: string;
}

async function fetchAccountNames(supabase: TypedSupabaseClient, accountIds: readonly string[]): Promise<Map<string, string>> {
  const uniqueIds = Array.from(new Set(accountIds));
  if (uniqueIds.length === 0) return new Map();
  const { data, error } = await supabase.from('accounts').select('id, legal_name').in('id', uniqueIds);
  if (error) throw error;
  return new Map((data ?? []).map((a: { id: string; legal_name: string }) => [a.id, a.legal_name]));
}

async function fetchProposalsByIds(
  supabase: TypedSupabaseClient,
  proposalIds: readonly string[],
): Promise<Map<string, ProposalLookupRow>> {
  const uniqueIds = Array.from(new Set(proposalIds));
  if (uniqueIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from('proposals')
    .select('id, proposal_number, status, account_id')
    .in('id', uniqueIds);
  if (error) throw error;
  return new Map((data ?? []).map((p: ProposalLookupRow) => [p.id, p]));
}

/** El mayor `billed_total_cents` entre las 1-3 opciones de cada presupuesto — mismo criterio que `headlineAmountCents` de `page.tsx`. */
async function fetchHeadlineAmounts(
  supabase: TypedSupabaseClient,
  proposalIds: readonly string[],
): Promise<Map<string, number | null>> {
  const uniqueIds = Array.from(new Set(proposalIds));
  const result = new Map<string, number | null>(uniqueIds.map((id) => [id, null]));
  if (uniqueIds.length === 0) return result;
  const { data, error } = await supabase
    .from('proposal_options')
    .select('proposal_id, billed_total_cents')
    .in('proposal_id', uniqueIds);
  if (error) throw error;
  for (const row of (data ?? []) as { proposal_id: string; billed_total_cents: number | null }[]) {
    if (row.billed_total_cents === null) continue;
    const current = result.get(row.proposal_id) ?? null;
    if (current === null || row.billed_total_cents > current) {
      result.set(row.proposal_id, row.billed_total_cents);
    }
  }
  return result;
}

function logAttentionQueryFailure(category: AttentionItemKind, error: unknown): void {
  const pgError = error as { message?: string; code?: string; details?: string; hint?: string } | null;
  console.error(
    `[dashboard attention] falló la consulta "${category}":`,
    {
      message: pgError?.message ?? String(error),
      code: pgError?.code ?? null,
      details: pgError?.details ?? null,
      hint: pgError?.hint ?? null,
    },
  );
}

async function loadPendingCounterProposalItems(supabase: TypedSupabaseClient): Promise<AttentionItem[]> {
  const { data, error } = await supabase
    .from('counter_proposals')
    .select('proposal_id, submitted_at')
    .eq('status', 'PENDING');
  if (error) throw error;
  const rows = (data ?? []) as { proposal_id: string; submitted_at: string }[];
  const proposalIds = rows.map((r) => r.proposal_id);
  const proposalsById = await fetchProposalsByIds(supabase, proposalIds);
  const accountsById = await fetchAccountNames(
    supabase,
    Array.from(proposalsById.values()).map((p) => p.account_id),
  );

  const sorted = [...rows].sort((a, b) => new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime());
  return sorted.map((row) => {
    const proposal = proposalsById.get(row.proposal_id);
    return {
      kind: 'counterProposal',
      proposalId: row.proposal_id,
      proposalNumber: proposal?.proposal_number ?? null,
      accountLegalName: proposal ? (accountsById.get(proposal.account_id) ?? '') : '',
      days: null,
      amountCents: null,
      reason: null,
    };
  });
}

async function loadExpiringSoonItems(supabase: TypedSupabaseClient, now: Date): Promise<AttentionItem[]> {
  const soonLimitIso = new Date(now.getTime() + EXPIRING_SOON_DAYS * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from('proposals')
    .select('id, proposal_number, account_id, expires_at')
    .in('status', ['SENT', 'VIEWED'])
    .not('expires_at', 'is', null)
    .gte('expires_at', now.toISOString())
    .lte('expires_at', soonLimitIso);
  if (error) throw error;
  const rows = (data ?? []) as { id: string; proposal_number: string | null; account_id: string; expires_at: string | null }[];
  const accountsById = await fetchAccountNames(supabase, rows.map((r) => r.account_id));
  const amountsById = await fetchHeadlineAmounts(supabase, rows.map((r) => r.id));

  const sorted = [...rows].sort((a, b) => new Date(a.expires_at ?? 0).getTime() - new Date(b.expires_at ?? 0).getTime());
  return sorted.map((row) => {
    const daysLeft = row.expires_at
      ? Math.max(0, Math.ceil((new Date(row.expires_at).getTime() - now.getTime()) / 86_400_000))
      : null;
    return {
      kind: 'expiringSoon',
      proposalId: row.id,
      proposalNumber: row.proposal_number,
      accountLegalName: accountsById.get(row.account_id) ?? '',
      days: daysLeft,
      amountCents: amountsById.get(row.id) ?? null,
      reason: null,
    };
  });
}

async function loadMarginBelowFloorItems(supabase: TypedSupabaseClient): Promise<AttentionItem[]> {
  const { data, error } = await supabase
    .from('overrides')
    .select('proposal_id, reason, created_at')
    .eq('kind', 'MARGIN_BELOW_FLOOR');
  if (error) throw error;
  const rows = (data ?? []) as { proposal_id: string; reason: string; created_at: string }[];
  const proposalsById = await fetchProposalsByIds(supabase, rows.map((r) => r.proposal_id));
  const accountsById = await fetchAccountNames(
    supabase,
    Array.from(proposalsById.values()).map((p) => p.account_id),
  );

  // Un override por línea forzada (CLAUDE.md §4.3, ronda 16): se dedupe por
  // presupuesto, quedándose con el más reciente. "Aún abiertos": se
  // excluyen los presupuestos que ya cerraron en negativo (rechazado/
  // caducado) — en la práctica, un override de este tipo siempre nace ya
  // ACEPTADO (`accept_counter_proposal`), pero la comprobación queda aquí
  // por si ese presupuesto se rechazara más adelante por otra vía.
  const byProposal = new Map<string, { reason: string; createdAt: string }>();
  for (const row of rows) {
    const proposal = proposalsById.get(row.proposal_id);
    if (!proposal) continue;
    if (proposal.status === 'REJECTED' || proposal.status === 'EXPIRED') continue;
    const existing = byProposal.get(row.proposal_id);
    if (existing && new Date(existing.createdAt).getTime() >= new Date(row.created_at).getTime()) continue;
    byProposal.set(row.proposal_id, { reason: row.reason, createdAt: row.created_at });
  }

  const sorted = Array.from(byProposal.entries()).sort(
    (a, b) => new Date(b[1].createdAt).getTime() - new Date(a[1].createdAt).getTime(),
  );
  return sorted.map(([proposalId, info]) => {
    const proposal = proposalsById.get(proposalId);
    return {
      kind: 'marginBelowFloor',
      proposalId,
      proposalNumber: proposal?.proposal_number ?? null,
      accountLegalName: proposal ? (accountsById.get(proposal.account_id) ?? '') : '',
      days: null,
      amountCents: null,
      reason: info.reason,
    };
  });
}

async function loadStaleDraftItems(supabase: TypedSupabaseClient, now: Date): Promise<AttentionItem[]> {
  const staleLimitIso = new Date(now.getTime() - STALE_DRAFT_DAYS * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from('proposals')
    .select('id, proposal_number, account_id, created_at')
    .eq('status', 'DRAFT')
    .lte('created_at', staleLimitIso);
  if (error) throw error;
  const rows = (data ?? []) as { id: string; proposal_number: string | null; account_id: string; created_at: string }[];
  const accountsById = await fetchAccountNames(supabase, rows.map((r) => r.account_id));
  const amountsById = await fetchHeadlineAmounts(supabase, rows.map((r) => r.id));

  const sorted = [...rows].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  return sorted.map((row) => ({
    kind: 'staleDraft',
    proposalId: row.id,
    proposalNumber: row.proposal_number,
    accountLegalName: accountsById.get(row.account_id) ?? '',
    days: Math.floor((now.getTime() - new Date(row.created_at).getTime()) / 86_400_000),
    amountCents: amountsById.get(row.id) ?? null,
    reason: null,
  }));
}

export interface AttentionResult {
  readonly items: readonly AttentionItem[];
  /** `true` si alguna de las cuatro categorías falló — la interfaz muestra un aviso discreto, nunca un error de página. */
  readonly failed: boolean;
}

/**
 * Carga las cuatro categorías de "Requieren tu atención", cada una
 * aislada: si una falla, las demás se siguen mostrando con normalidad.
 * Nunca lanza — es responsabilidad de esta función absorber cualquier
 * fallo de consulta, registrarlo con detalle y devolver lo que sí se pudo
 * calcular.
 */
export async function loadAttentionItems(supabase: TypedSupabaseClient, now: Date): Promise<AttentionResult> {
  const categories: readonly [AttentionItemKind, () => Promise<AttentionItem[]>][] = [
    ['counterProposal', () => loadPendingCounterProposalItems(supabase)],
    ['expiringSoon', () => loadExpiringSoonItems(supabase, now)],
    ['marginBelowFloor', () => loadMarginBelowFloorItems(supabase)],
    ['staleDraft', () => loadStaleDraftItems(supabase, now)],
  ];

  let failed = false;
  const items: AttentionItem[] = [];
  for (const [kind, load] of categories) {
    try {
      items.push(...(await load()));
    } catch (error) {
      failed = true;
      logAttentionQueryFailure(kind, error);
    }
  }

  return { items, failed };
}
