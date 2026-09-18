import { buildCatalog } from '@/src/pricing/index.js';

import { loadPricingContext } from '@/lib/pricing-context';
import { createClient } from '@/lib/supabase/server';
import { ProposalBuilder } from '@/components/ProposalBuilder';

export const dynamic = 'force-dynamic';

export default async function NewProposalPage() {
  const supabase = await createClient();

  const [{ parameters, catalog, holidays }, accountsRes] = await Promise.all([
    loadPricingContext(supabase),
    supabase
      .from('accounts')
      .select('id, legal_name, country_code, contacts(id, full_name, email, language)')
      .order('legal_name')
      .limit(200),
  ]);

  // Se recompone el catálogo como array plano (serializable de servidor a
  // cliente sin ambigüedad) y se reconstruye como Map en el cliente con la
  // misma función que usa el motor.
  const supports = [...buildCatalog([...catalog.values()]).values()];

  return (
    <div className="wk-shell">
      <ProposalBuilder
        parameters={parameters}
        supports={supports}
        holidays={holidays}
        accounts={accountsRes.data ?? []}
      />
    </div>
  );
}
