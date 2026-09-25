import { buildCatalog } from '@/src/pricing/index.js';

import { loadPricingContext } from '@/lib/pricing-context';
import { createClient } from '@/lib/supabase/server';
import { ProposalBuilder } from '@/components/ProposalBuilder';

export const dynamic = 'force-dynamic';

export default async function NewProposalPage() {
  const supabase = await createClient();

  const [{ parameters, catalog, holidays, offerValidityDays }, accountsRes, userRes] =
    await Promise.all([
      loadPricingContext(supabase),
      supabase
        .from('accounts')
        .select('id, legal_name, country_code, contacts(id, full_name, email, language)')
        .order('legal_name')
        .limit(200),
      supabase.auth.getUser(),
    ]);

  // Se recompone el catálogo como array plano (serializable de servidor a
  // cliente sin ambigüedad) y se reconstruye como Map en el cliente con la
  // misma función que usa el motor.
  const supports = [...buildCatalog([...catalog.values()]).values()];

  // Nombre del comercial para la firma de la vista previa del email (CLAUDE.md
  // §10.3 duodecies, ronda 12) — el mismo dato que usa el envío real
  // (`profiles.full_name` del creador, CLAUDE.md §5.6). `InternalLayout` ya
  // exige sesión antes de renderizar esta página, así que `user` siempre
  // existe aquí; el `?? user.email` de respaldo sigue el mismo patrón que
  // `InternalHeader` para un perfil sin nombre todavía aprovisionado.
  const user = userRes.data.user;
  const { data: profile } = user
    ? await supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle()
    : { data: null };
  const salesName = profile?.full_name ?? user?.email ?? '';

  return (
    <div className="wk-shell">
      <ProposalBuilder
        parameters={parameters}
        supports={supports}
        holidays={holidays}
        accounts={accountsRes.data ?? []}
        offerValidityDays={offerValidityDays}
        salesName={salesName}
      />
    </div>
  );
}
