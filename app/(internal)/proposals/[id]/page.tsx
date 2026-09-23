import { notFound } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { ProposalDetailClient } from './ProposalDetailClient';

export const dynamic = 'force-dynamic';

/**
 * Detalle de un presupuesto (CLAUDE.md §10.1.1, ronda 7). Dos vistas según
 * el estado:
 *   - DRAFT: el cálculo ya está congelado (frozen_snapshot, opciones y
 *     líneas persistidas por create_and_send_proposal) pero el email nunca
 *     salió — vista de solo lectura + botón "Reintentar envío"
 *     (`RetrySendButton`, `actions.ts`). No es un editor de campos: eso
 *     reabriría el riesgo de recalcular con parámetros que hayan cambiado
 *     desde la creación, justo lo que la inmutabilidad de §5.4 prohíbe.
 *   - Cualquier otro estado: enlace público, fechas, estado.
 */
export default async function ProposalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // Select en un único literal, no concatenado (mismo aviso de
  // lib/pricing-context.ts): el parser de tipos de postgrest-js necesita un
  // string LITERAL para inferir las columnas de los embeds.
  const { data: proposal, error } = await supabase
    .from('proposals')
    .select(
      'id, status, language, brief, sent_at, decided_at, expires_at, public_token, created_at, updated_at, accounts(legal_name), contacts(full_name, email), profiles(full_name), proposal_options(id, code, name, pitch, markets, campaign_start, campaign_end, campaign_duration_count, campaign_duration_unit, billed_total_cents, net_revenue_cents, media_budget_cents, cost_cents, margin_cents, margin_rate, sort_order, proposal_option_lines(support_id, market, quantity, net_price_cents, billed_total_cents, sort_order))',
    )
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(`No se pudo cargar el presupuesto: ${error.message}`);
  if (!proposal) notFound();

  const options = [...proposal.proposal_options].sort((a, b) => a.sort_order - b.sort_order);
  for (const option of options) {
    option.proposal_option_lines.sort((a, b) => a.sort_order - b.sort_order);
  }

  return (
    <div className="wk-shell">
      <ProposalDetailClient proposal={proposal} options={options} />
    </div>
  );
}
