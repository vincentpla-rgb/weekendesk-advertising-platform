import { notFound } from 'next/navigation';

import type { ProposalListItem } from '@/lib/domain';
import { createClient } from '@/lib/supabase/server';
import { AccountDetailClient } from './AccountDetailClient';

export const dynamic = 'force-dynamic';

/**
 * Ficha de cuenta (CLAUDE.md §10.1.1, ronda 7): contactos e historial
 * completo de presupuestos de esa cuenta, cada uno abriendo
 * `/proposals/[id]`. Reutiliza `ProposalsTable` (vía `AccountDetailClient`)
 * — la misma tabla del listado general, sin repetir la columna de cuenta.
 */
export default async function AccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: account, error }, { data: proposalRows, error: proposalsError }] = await Promise.all([
    supabase
      .from('accounts')
      .select('id, legal_name, country_code, contacts(id, full_name, email, language)')
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('proposals')
      .select('id, status, created_at, updated_at, sent_at, decided_at, contacts(full_name), profiles(full_name)')
      .eq('account_id', id)
      .order('updated_at', { ascending: false }),
  ]);

  if (error) throw new Error(`No se pudo cargar la cuenta: ${error.message}`);
  if (!account) notFound();
  if (proposalsError) throw new Error(`No se pudieron cargar los presupuestos de la cuenta: ${proposalsError.message}`);

  const proposals: ProposalListItem[] = (proposalRows ?? []).map((r) => ({
    id: r.id,
    status: r.status,
    created_at: r.created_at,
    updated_at: r.updated_at,
    sent_at: r.sent_at,
    decided_at: r.decided_at,
    account: null,
    contact: r.contacts,
    owner: r.profiles,
  }));

  return (
    <div className="wk-shell">
      <AccountDetailClient account={account} proposals={proposals} />
    </div>
  );
}
