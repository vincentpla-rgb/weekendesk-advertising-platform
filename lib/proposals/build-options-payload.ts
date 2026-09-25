import { euros, priceOption, type OptionInput, type OptionLineInput, type PricedOption } from '@/src/pricing/index.js';

import type { LoadedPricingContext } from '@/lib/pricing-context';

export interface RawLine {
  readonly supportId: string;
  readonly quantity: number;
  readonly mediaBudgetEuros: number | null;
  readonly mediaMonths: number | null;
  /** Reparto forzado a mano (CLAUDE.md §4.4, ronda 10). `null` = automático. */
  readonly manualFeeEuros: number | null;
  readonly manualFeeReason: string | null;
}

export interface RawDiscount {
  readonly ratePercent: number;
  readonly reason: string;
}

/**
 * Antelación insuficiente forzada a mano para un soporte+mercado concretos
 * (CLAUDE.md §5.3, ronda 11) — el único bloqueo duro forzable. `reason`
 * nunca vacío: lo exige tanto `runPreSendChecks` como, aquí, la restricción
 * `check` de `overrides.reason`.
 */
export interface RawLeadTimeOverride {
  readonly supportId: string;
  readonly market: string;
  readonly reason: string;
}

export interface RawOption {
  readonly code: 'A' | 'B' | 'C';
  readonly name: string;
  readonly pitch: string;
  /** Mercados elegidos UNA VEZ para la opción entera (CLAUDE.md §4.2, ronda 2). */
  readonly markets: readonly string[];
  readonly campaignStart: string | null;
  readonly campaignEnd: string | null;
  /** Modo "solo duración, sin fecha de inicio" (CLAUDE.md §5.3 bis). */
  readonly campaignDurationCount: number | null;
  readonly campaignDurationUnit: 'WEEK' | 'MONTH' | null;
  readonly lines: readonly RawLine[];
  readonly discounts: readonly RawDiscount[];
  /** Interruptor por opción (CLAUDE.md §4.5, ronda 9): ver `OptionInput.volumeDiscountDisabled`. */
  readonly volumeDiscountDisabled: boolean;
  /** Antelaciones insuficientes forzadas a mano, por soporte+mercado (CLAUDE.md §5.3, ronda 11). */
  readonly leadTimeOverrides: readonly RawLeadTimeOverride[];
}

export type BuildOptionsPayloadResult =
  | { readonly ok: true; readonly optionsJson: readonly unknown[] }
  | { readonly ok: false; readonly error: string };

/**
 * Recalcula con el motor puro (src/pricing) el juego de opciones crudo que
 * manda el navegador (o que se reconstruye a partir de `frozen_snapshot` al
 * duplicar un presupuesto, `duplicateProposal` en
 * `app/(internal)/proposals/[id]/actions.ts`) y lo convierte al formato
 * snake_case que espera `create_and_send_proposal`.
 *
 * Extraído de `app/api/proposals/route.ts` (ronda 8, CLAUDE.md §10.3
 * octies) para que el envío normal y la duplicación compartan EXACTAMENTE
 * la misma lógica de cálculo — nunca se confían los números que ya venían
 * calculados de fuera, en ninguno de los dos casos.
 */
export function buildProposalOptionsPayload(
  rawOptions: readonly RawOption[],
  ctx: LoadedPricingContext,
): BuildOptionsPayloadResult {
  const optionsJson: unknown[] = [];

  for (const raw of rawOptions) {
    if (!Array.isArray(raw.markets) || raw.markets.length === 0) {
      return { ok: false, error: `Opción ${raw.code}: elige al menos un mercado` };
    }

    const input: OptionInput = {
      id: raw.code,
      name: raw.name,
      markets: raw.markets as OptionInput['markets'],
      lines: raw.lines.map((l): OptionLineInput => {
        const support = ctx.catalog.get(l.supportId);
        return {
          supportId: l.supportId,
          quantity: l.quantity,
          ...(support?.isMediaBuy
            ? {
                mediaBudgetCents: l.mediaBudgetEuros ? euros(l.mediaBudgetEuros) : 0,
                mediaMonths: l.mediaMonths ?? 1,
                ...(l.manualFeeEuros !== null
                  ? { manualFeeCents: euros(l.manualFeeEuros), manualFeeReason: l.manualFeeReason ?? '' }
                  : {}),
              }
            : {}),
        };
      }),
      manualDiscounts: raw.discounts.map((d) => ({ rate: d.ratePercent / 100, reason: d.reason })),
      volumeDiscountDisabled: raw.volumeDiscountDisabled,
    };

    let priced: PricedOption;
    try {
      priced = priceOption(input, ctx);
    } catch (err) {
      return { ok: false, error: `Opción ${raw.code}: ${err instanceof Error ? err.message : 'error de cálculo'}` };
    }

    if (!priced.meetsMarginFloor) {
      return { ok: false, error: `Opción ${raw.code}: por debajo del suelo de margen. Revisa antes de enviar.` };
    }

    optionsJson.push({
      code: raw.code,
      name: priced.name ?? raw.code,
      pitch: raw.pitch,
      sort_order: optionsJson.length,
      markets: raw.markets,
      campaign_start: raw.campaignStart,
      campaign_end: raw.campaignEnd,
      campaign_duration_count: raw.campaignDurationCount,
      campaign_duration_unit: raw.campaignDurationUnit,
      gross_net_of_media_cents: priced.grossNetOfMediaCents,
      effective_discount_cents: priced.effectiveDiscountCents,
      net_revenue_cents: priced.netRevenueCents,
      media_budget_cents: priced.mediaBudgetCents,
      billed_total_cents: priced.billedTotalCents,
      cost_cents: priced.costCents,
      margin_cents: priced.marginCents,
      margin_rate: priced.marginRate,
      max_lead_time_business_days: priced.maxLeadTimeBusinessDays,
      volume_discount_disabled: raw.volumeDiscountDisabled,
      lines: priced.lines.map((l, idx) => {
        const leadTimeOverride = raw.leadTimeOverrides.find(
          (o) => o.supportId === l.supportId && o.market === l.market,
        );
        return {
          support_id: l.supportId,
          market: l.market,
          quantity: l.quantity,
          media_budget_cents: l.isMediaBuy ? l.mediaBudgetCents : null,
          media_months: l.mediaMonths,
          is_lead_market: l.isLeadMarket,
          unit_cost_cents: l.unitCostCents,
          cost_cents: l.costCents,
          gross_price_cents: l.grossPriceCents,
          margin_floor_cents: l.marginFloorCents,
          floor_applied: l.floorApplied,
          list_price_cents: l.listPriceCents,
          discount_cents: l.discountCents,
          net_price_cents: l.netPriceCents,
          // Reparto forzado a mano (CLAUDE.md §4.4, ronda 10): fijo, registrado
          // en `overrides` por `create_and_send_proposal` cuando no es null.
          manual_fee_cents: l.isMediaBuy && l.feeForced ? l.netPriceCents : null,
          manual_fee_reason:
            l.isMediaBuy && l.feeForced
              ? (raw.lines.find((rl) => rl.supportId === l.supportId)?.manualFeeReason ?? '')
              : null,
          media_real_spend_cents: l.isMediaBuy ? l.mediaRealSpendCents : null,
          // Antelación insuficiente forzada a mano (CLAUDE.md §5.3, ronda
          // 11): constancia visible en el detalle interno del presupuesto,
          // por soporte+mercado — el único bloqueo duro forzable.
          lead_time_forced: leadTimeOverride !== undefined,
          lead_time_force_reason: leadTimeOverride?.reason ?? null,
          billed_total_cents: l.billedTotalCents,
          sort_order: idx,
        };
      }),
      discounts: priced.discounts.map((d) => ({
        kind: d.kind,
        rate: d.rate,
        reason: d.reason,
      })),
      // El registro en `overrides` (autor, motivo, marca de tiempo) lo hace
      // `create_and_send_proposal`, que lee este array — nunca se calcula ni
      // se valida aquí, igual que el resto de la persistencia (§10.1.1).
      lead_time_overrides: raw.leadTimeOverrides.map((o) => ({
        support_id: o.supportId,
        market: o.market,
        reason: o.reason,
      })),
    });
  }

  return { ok: true, optionsJson };
}
