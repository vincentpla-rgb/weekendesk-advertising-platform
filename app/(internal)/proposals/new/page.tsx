import { buildCatalog, optionDraftFromSnapshot, type OptionDraft, type SnapshotOptionInput } from '@/src/pricing/index.js';

import { loadPricingContext } from '@/lib/pricing-context';
import { createClient } from '@/lib/supabase/server';
import type { AccountRow } from '@/lib/domain';
import { ProposalBuilder } from '@/components/ProposalBuilder';

export const dynamic = 'force-dynamic';

let editKeySeq = 0;
function nextEditKey() {
  editKeySeq += 1;
  return `edit${editKeySeq}`;
}

/**
 * Creador de presupuesto — también sirve de editor (CLAUDE.md §10.3 ter
 * decies, ronda 13): con `?editFrom=<id>`, precarga el formulario a partir
 * de un presupuesto en `DRAFT` que nunca llegó a enviarse con éxito
 * (borrador o con envío fallido — el mismo estado, ver §5.5). La
 * inmutabilidad de §5.4 se bloquea desde el primer envío EXITOSO, no antes:
 * un `DRAFT` no se ha mostrado nunca a ningún cliente, así que no hay nada
 * que "congelar" todavía.
 */
export default async function NewProposalPage({
  searchParams,
}: {
  searchParams: Promise<{ editFrom?: string }>;
}) {
  const { editFrom } = await searchParams;
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

  let accounts: readonly AccountRow[] = accountsRes.data ?? [];
  let editingProposalId: string | undefined;
  let editingProposalNumber: string | undefined;
  let initialData:
    | {
        readonly accountId: string;
        readonly contactId: string;
        readonly language: string;
        readonly brief: string;
        readonly options: readonly OptionDraft[];
      }
    | undefined;
  let editUnavailable = false;

  if (editFrom) {
    const { data: draft } = await supabase
      .from('proposals')
      .select('id, status, proposal_number, account_id, contact_id, language, brief, frozen_snapshot')
      .eq('id', editFrom)
      .maybeSingle();

    if (draft && draft.status === 'DRAFT') {
      editingProposalId = draft.id;
      editingProposalNumber = draft.proposal_number;

      // El comercial elegido puede estar fuera de los primeros 200 por
      // razón social — se añade explícitamente para que el desplegable de
      // cuenta/contacto lo encuentre (sin esto, `selectedAccount` no
      // resolvería y el formulario se vería vacío pese a que el borrador sí
      // tiene una cuenta real).
      if (!accounts.some((a) => a.id === draft.account_id)) {
        const { data: editedAccount } = await supabase
          .from('accounts')
          .select('id, legal_name, country_code, contacts(id, full_name, email, language)')
          .eq('id', draft.account_id)
          .maybeSingle();
        if (editedAccount) accounts = [editedAccount, ...accounts];
      }

      const snapshot = draft.frozen_snapshot as unknown as { options?: readonly SnapshotOptionInput[] } | null;
      if (snapshot && Array.isArray(snapshot.options) && snapshot.options.length > 0) {
        const codes = ['A', 'B', 'C'] as const;
        initialData = {
          accountId: draft.account_id,
          contactId: draft.contact_id,
          language: draft.language,
          brief: draft.brief ?? '',
          options: snapshot.options.map((opt, idx) =>
            optionDraftFromSnapshot(opt, codes[idx] ?? opt.code, nextEditKey),
          ),
        };
      } else {
        editUnavailable = true;
      }
    } else {
      // El id no existe, o el presupuesto ya salió de DRAFT (se envió con
      // éxito entre tanto, o se descartó) — no hay nada que precargar.
      // Nunca se bloquea la pantalla: se cae al formulario vacío de "nuevo
      // presupuesto" con un aviso, en vez de un error duro.
      editUnavailable = true;
    }
  }

  return (
    <div className="wk-shell">
      <ProposalBuilder
        parameters={parameters}
        supports={supports}
        holidays={holidays}
        accounts={accounts}
        offerValidityDays={offerValidityDays}
        salesName={salesName}
        initialData={initialData}
        editingProposalId={editingProposalId}
        editingProposalNumber={editingProposalNumber}
        editUnavailable={editUnavailable}
      />
    </div>
  );
}
