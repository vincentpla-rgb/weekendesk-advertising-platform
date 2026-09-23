import type { ProposalListItem, ProposalStatus } from '@/lib/domain';
import { PROPOSAL_STATUSES } from '@/lib/domain';
import { createClient } from '@/lib/supabase/server';
import { ProposalsListClient } from './ProposalsListClient';

export const dynamic = 'force-dynamic';

function isProposalStatus(value: string): value is ProposalStatus {
  return (PROPOSAL_STATUSES as readonly string[]).includes(value);
}

/**
 * Listado de presupuestos (CLAUDE.md §10.1.1, ronda 7): antes solo existía
 * la pantalla de crear uno — al enviarlo no había manera de volver a verlo.
 * Cualquier miembro de equipo ve TODOS los presupuestos, no solo los suyos
 * (RLS `team_all`, sin scoping por owner_id — CLAUDE.md §10.3 septies);
 * "creador" es un filtro, no una restricción de acceso.
 */
export default async function ProposalsListPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; owner?: string }>;
}) {
  const { status, owner } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from('proposals')
    .select(
      'id, proposal_number, status, created_at, updated_at, sent_at, decided_at, accounts(legal_name), contacts(full_name), profiles(full_name)',
    )
    .order('updated_at', { ascending: false })
    .limit(200);

  if (status && isProposalStatus(status)) {
    query = query.eq('status', status);
  }
  if (owner) {
    query = query.eq('owner_id', owner);
  }

  const [{ data: rows, error }, { data: owners, error: ownersError }] = await Promise.all([
    query,
    supabase.from('profiles').select('id, full_name').order('full_name'),
  ]);

  if (error) throw new Error(`No se pudieron cargar los presupuestos: ${error.message}`);
  if (ownersError) throw new Error(`No se pudo cargar la lista de creadores: ${ownersError.message}`);

  const items: ProposalListItem[] = (rows ?? []).map((r) => ({
    id: r.id,
    proposal_number: r.proposal_number,
    status: r.status,
    created_at: r.created_at,
    updated_at: r.updated_at,
    sent_at: r.sent_at,
    decided_at: r.decided_at,
    account: r.accounts,
    contact: r.contacts,
    owner: r.profiles,
  }));

  return (
    <div className="wk-shell">
      <ProposalsListClient items={items} owners={owners ?? []} />
    </div>
  );
}
