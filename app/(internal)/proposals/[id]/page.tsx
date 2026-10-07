import { notFound } from 'next/navigation';

import { loadPricingContext } from '@/lib/pricing-context';
import { createClient } from '@/lib/supabase/server';
import { reviewCounterProposalLines, type CounterProposalLineInput, type Market } from '@/src/pricing/index.js';
import { ProposalDetailClient } from './ProposalDetailClient';
import type { CounterProposalReviewData } from './CounterProposalReview';

export const dynamic = 'force-dynamic';

/**
 * Detalle de un presupuesto (CLAUDE.md §10.1.1, ronda 7). Dos vistas según
 * el estado:
 *   - DRAFT: el cálculo ya está congelado (frozen_snapshot, opciones y
 *     líneas persistidas por create_and_send_proposal) pero el email nunca
 *     salió — vista de solo lectura + botón "Enviar" (ronda 23, antes
 *     "Reintentar envío": el mismo paso, tanto si es el primer intento tras
 *     un "Guardar" explícito como si es un reintento tras un fallo de email)
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
      'id, proposal_number, status, language, brief, sent_at, decided_at, expires_at, public_token, owner_id, created_at, updated_at, accounts(legal_name), contacts(full_name, email), profiles(full_name), proposal_options(id, code, name, pitch, markets, campaign_start, campaign_end, campaign_duration_count, campaign_duration_unit, billed_total_cents, net_revenue_cents, media_budget_cents, cost_cents, margin_cents, margin_rate, sort_order, proposal_option_lines(support_id, market, quantity, net_price_cents, billed_total_cents, is_lead_market, lead_time_forced, lead_time_force_reason, sort_order))',
    )
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(`No se pudo cargar el presupuesto: ${error.message}`);
  if (!proposal) notFound();

  const options = [...proposal.proposal_options].sort((a, b) => a.sort_order - b.sort_order);
  for (const option of options) {
    option.proposal_option_lines.sort((a, b) => a.sort_order - b.sort_order);
  }

  // Nombre completo de cada soporte, para mostrar "Nombre (CÓDIGO)" en vez
  // del código a secas (CLAUDE.md §10.3 ter decies, ronda 13) — solo `id` +
  // `name`, no hace falta el catálogo de precios completo aquí.
  const { data: supportRows } = await supabase.from('supports').select('id, name');
  const supportNames: Record<string, string> = Object.fromEntries(
    (supportRows ?? []).map((s) => [s.id, s.name]),
  );

  // Contrapropuesta del cliente (CLAUDE.md, ronda 16): a lo sumo una por
  // presupuesto (`counter_proposals.proposal_id` es UNIQUE). Se busca
  // siempre, no solo en status COUNTERED — tras decidirla, el presupuesto
  // original pasa a REJECTED (si se rechaza) y ya no está en COUNTERED,
  // pero la contrapropuesta sigue siendo un registro histórico que vale la
  // pena mostrar en el detalle.
  const { data: counterProposalRow } = await supabase
    .from('counter_proposals')
    .select(
      'id, status, option_code, option_name, lines, submitted_at, reviewed_at, rejection_reason, resulting_proposal_id',
    )
    .eq('proposal_id', id)
    .maybeSingle();

  let counterProposal: CounterProposalReviewData | null = null;
  let canDecideCounterProposal = false;
  let currentUserName: string | null = null;

  if (counterProposalRow) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin, full_name')
        .eq('id', user.id)
        .maybeSingle();
      canDecideCounterProposal = Boolean(profile?.is_admin) || user.id === proposal.owner_id;
      currentUserName = profile?.full_name ?? user.email ?? null;
    }

    const matchingOption = options.find((o) => o.code === counterProposalRow.option_code);
    const leadMarketBySupport = new Map<string, boolean>(
      (matchingOption?.proposal_option_lines ?? []).map((l) => [l.support_id, Boolean(l.is_lead_market)]),
    );

    const rawLines = (counterProposalRow.lines ?? []) as unknown as ReadonlyArray<{
      support_id: string;
      market: string;
      deleted: boolean;
      original_price_cents: number;
      original_quantity: number;
      client_price_cents: number;
      client_quantity: number;
    }>;

    let ctx;
    try {
      ctx = await loadPricingContext(supabase);
    } catch {
      ctx = null;
    }

    const lineInputs: CounterProposalLineInput[] = rawLines.map((l) => ({
      supportId: l.support_id,
      market: l.market as Market,
      deleted: l.deleted,
      clientPriceCents: l.client_price_cents,
      clientQuantity: l.client_quantity,
      isLeadMarket: leadMarketBySupport.get(l.support_id) ?? false,
    }));

    const reviewed = ctx ? reviewCounterProposalLines(lineInputs, ctx.catalog, ctx.parameters) : null;

    counterProposal = {
      id: counterProposalRow.id,
      status: counterProposalRow.status,
      optionCode: counterProposalRow.option_code,
      optionName: counterProposalRow.option_name,
      submittedAt: counterProposalRow.submitted_at,
      reviewedAt: counterProposalRow.reviewed_at,
      rejectionReason: counterProposalRow.rejection_reason,
      resultingProposalId: counterProposalRow.resulting_proposal_id,
      lines: rawLines.map((l, idx) => ({
        supportId: l.support_id,
        supportName: supportNames[l.support_id] ?? l.support_id,
        market: l.market,
        deleted: l.deleted,
        originalPriceCents: l.original_price_cents,
        originalQuantity: l.original_quantity,
        clientPriceCents: l.client_price_cents,
        clientQuantity: l.client_quantity,
        margin: reviewed ? reviewed[idx]!.margin : null,
      })),
    };
  }

  return (
    <ProposalDetailClient
      proposal={proposal}
      options={options}
      supportNames={supportNames}
      counterProposal={counterProposal}
      canDecideCounterProposal={canDecideCounterProposal}
      currentUserName={currentUserName}
    />
  );
}
