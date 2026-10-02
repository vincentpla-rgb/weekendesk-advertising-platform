import type { TypedSupabaseClient } from '@/lib/pricing-context';
import type { ContentLanguage } from '@/lib/domain';
import type { ProposalPdfData, PdfOption, PdfLine, PdfReach } from './proposal-pdf-data';

/**
 * Carga única, compartida por los dos disparadores del PDF (CLAUDE.md §1,
 * propuesta confirmada): el adjunto automático en los emails de aceptación
 * (`app/api/public/proposals/[token]/accept/route.ts`) y la descarga manual
 * (`app/api/proposals/[id]/pdf/route.ts`). Mismo principio que
 * `buildProposalOptionsPayload` (ronda 8): un único punto de lectura para
 * que los dos caminos no puedan divergir en qué ve el PDF.
 *
 * Reutiliza el mismo `select` que ya usa `/proposals/[id]` (CLAUDE.md
 * §10.1.1, ronda 7) para las columnas de opciones/líneas — mismo literal,
 * ninguna reinterpretación de datos nueva.
 */
export async function loadProposalPdfData(
  supabase: TypedSupabaseClient,
  proposalId: string,
): Promise<ProposalPdfData | null> {
  const { data: proposal, error } = await supabase
    .from('proposals')
    .select(
      'id, proposal_number, status, language, brief, sent_at, accounts(legal_name), contacts(full_name), profiles(full_name), proposal_options(id, code, name, pitch, markets, campaign_start, campaign_end, campaign_duration_count, campaign_duration_unit, billed_total_cents, cost_cents, margin_cents, margin_rate, sort_order, proposal_option_lines(support_id, market, quantity, billed_total_cents, sort_order))',
    )
    .eq('id', proposalId)
    .maybeSingle();

  if (error) throw new Error(`No se pudo cargar el presupuesto para el PDF: ${error.message}`);
  if (!proposal) return null;

  const supportNames = await loadSupportNames(supabase);

  const supportMarketPairs = new Set<string>();
  for (const option of proposal.proposal_options) {
    for (const line of option.proposal_option_lines) {
      supportMarketPairs.add(`${line.support_id}::${line.market}`);
    }
  }

  const reachBySupportMarket = await loadReachForSupportMarketPairs(supabase, supportMarketPairs);

  const options: PdfOption[] = [...proposal.proposal_options]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((option) => {
      const lines: PdfLine[] = [...option.proposal_option_lines]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((line) => ({
          supportId: line.support_id,
          supportName: supportNames[line.support_id] ?? line.support_id,
          market: line.market,
          quantity: line.quantity,
          billedTotalCents: line.billed_total_cents ?? 0,
          reach: reachBySupportMarket.get(`${line.support_id}::${line.market}`) ?? null,
        }));

      return {
        code: option.code,
        name: option.name,
        pitch: option.pitch,
        markets: option.markets,
        campaignStart: option.campaign_start,
        campaignEnd: option.campaign_end,
        campaignDurationCount: option.campaign_duration_count,
        campaignDurationUnit: option.campaign_duration_unit as 'WEEK' | 'MONTH' | null,
        billedTotalCents: option.billed_total_cents ?? 0,
        lines,
        costCents: option.cost_cents,
        marginCents: option.margin_cents,
        marginRate: option.margin_rate,
      };
    });

  const { data: acceptanceRow } = await supabase
    .from('acceptances')
    .select('option_id, legal_name, billing_address, vat_number, purchase_order_reference, vat_regime_applied, accepted_at')
    .eq('proposal_id', proposalId)
    .maybeSingle();

  const acceptedOptionCode = acceptanceRow
    ? proposal.proposal_options.find((o) => o.id === acceptanceRow.option_id)?.code ?? null
    : null;

  return {
    proposalId: proposal.id,
    proposalNumber: proposal.proposal_number ?? proposal.id,
    language: proposal.language as ContentLanguage,
    status: proposal.status,
    advertiserLegalName: proposal.accounts?.legal_name ?? '—',
    contactFullName: proposal.contacts?.full_name ?? null,
    brief: proposal.brief,
    sentAt: proposal.sent_at,
    ownerFullName: proposal.profiles?.full_name ?? null,
    options,
    acceptance:
      acceptanceRow && acceptedOptionCode
        ? {
            optionCode: acceptedOptionCode,
            legalName: acceptanceRow.legal_name,
            billingAddress: acceptanceRow.billing_address,
            vatNumber: acceptanceRow.vat_number,
            purchaseOrderReference: acceptanceRow.purchase_order_reference,
            vatRegime: acceptanceRow.vat_regime_applied,
            acceptedAt: acceptanceRow.accepted_at,
          }
        : null,
  };
}

/**
 * Carga de reach compartida (CLAUDE.md §3, ronda 22 — extraída de
 * `loadProposalPdfData` para que la vista previa del PDF sin guardar
 * `lib/pdf/proposal-pdf-draft-preview.ts` use exactamente la misma consulta,
 * no una reimplementación aparte). `pairs` son claves `"supportId::market"` —
 * el reach no depende de ningún presupuesto concreto, solo del soporte y el
 * mercado, así que puede consultarse igual para un borrador sin persistir.
 *
 * Regla absoluta de CLAUDE.md §3: sin dato medido con fuente, la fila no
 * aparece — `not('value', 'is', null)` ya lo garantiza en la consulta, y el
 * filtro de abajo además exige métrica/unidad/fuente, nunca un cero inventado.
 */
export async function loadReachForSupportMarketPairs(
  supabase: TypedSupabaseClient,
  pairs: ReadonlySet<string>,
): Promise<Map<string, PdfReach>> {
  const reachBySupportMarket = new Map<string, PdfReach>();
  if (pairs.size === 0) return reachBySupportMarket;

  const { data: reachRows } = await supabase
    .from('reach_measurements')
    .select('support_id, market, value, metric, period_unit, source, measured_at')
    .not('value', 'is', null);
  for (const row of reachRows ?? []) {
    const key = `${row.support_id}::${row.market}`;
    if (pairs.has(key) && row.value !== null && row.metric && row.period_unit && row.source) {
      reachBySupportMarket.set(key, {
        value: Number(row.value),
        metric: row.metric,
        periodUnit: row.period_unit,
        source: row.source,
        measuredAt: row.measured_at,
      });
    }
  }
  return reachBySupportMarket;
}

/** Carga de nombres de soporte compartida (ronda 22), mismo motivo que la función de arriba. */
export async function loadSupportNames(supabase: TypedSupabaseClient): Promise<Record<string, string>> {
  const { data: supportRows } = await supabase.from('supports').select('id, name');
  return Object.fromEntries((supportRows ?? []).map((s) => [s.id, s.name]));
}
