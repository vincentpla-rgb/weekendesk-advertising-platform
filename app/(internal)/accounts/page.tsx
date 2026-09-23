import { createClient } from '@/lib/supabase/server';
import { AccountsListClient, type AccountListRow } from './AccountsListClient';

export const dynamic = 'force-dynamic';

/**
 * Listado de cuentas (CLAUDE.md §10.1.1, ronda 7). El recuento de
 * presupuestos se calcula en JS a partir de una segunda consulta, no con un
 * embed `proposals(count)`: mismo patrón que `admin/users/page.tsx`
 * (join en memoria con un Map), más simple que depender de la sintaxis de
 * agregación de postgrest para un caso tan pequeño (límite de 200 cuentas).
 */
export default async function AccountsListPage() {
  const supabase = await createClient();

  const [{ data: accounts, error }, { data: proposals, error: proposalsError }] = await Promise.all([
    supabase
      .from('accounts')
      .select('id, legal_name, country_code, contacts(id)')
      .order('legal_name')
      .limit(200),
    supabase.from('proposals').select('account_id'),
  ]);

  if (error) throw new Error(`No se pudieron cargar las cuentas: ${error.message}`);
  if (proposalsError) throw new Error(`No se pudo cargar el recuento de presupuestos: ${proposalsError.message}`);

  const proposalCountByAccount = new Map<string, number>();
  for (const p of proposals ?? []) {
    proposalCountByAccount.set(p.account_id, (proposalCountByAccount.get(p.account_id) ?? 0) + 1);
  }

  const rows: AccountListRow[] = (accounts ?? []).map((a) => ({
    id: a.id,
    legal_name: a.legal_name,
    country_code: a.country_code,
    contactsCount: a.contacts.length,
    proposalsCount: proposalCountByAccount.get(a.id) ?? 0,
  }));

  return (
    <div className="wk-shell">
      <AccountsListClient accounts={rows} />
    </div>
  );
}
