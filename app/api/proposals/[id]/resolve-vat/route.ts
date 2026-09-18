import { NextResponse } from 'next/server';

import { checkVies } from '@/lib/vies';
import { createClient } from '@/lib/supabase/server';
import type { Json } from '@/lib/supabase/database.types.js';

/**
 * Reintento de verificación VIES sobre una aceptación con régimen PENDING
 * (CLAUDE.md §7). Uso interno: quien lo llama debe estar autenticado y ser
 * miembro de equipo — resolve_vat_regime es SECURITY INVOKER, RLS lo exige.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: proposalId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const { data: acceptance, error: fetchError } = await supabase
    .from('acceptances')
    .select('id, vat_number, vat_regime_applied')
    .eq('proposal_id', proposalId)
    .maybeSingle();

  if (fetchError || !acceptance) {
    return NextResponse.json({ error: 'No hay aceptación para este presupuesto' }, { status: 404 });
  }

  const vies = acceptance.vat_number?.trim()
    ? await checkVies(acceptance.vat_number)
    : { result: 'INVALID' as const, raw: { note: 'Sin número de IVA registrado' } };

  const { data, error } = await supabase.rpc('resolve_vat_regime', {
    p_acceptance_id: acceptance.id,
    p_vies_result: vies.result,
    p_vies_raw: vies.raw as Json,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data);
}
