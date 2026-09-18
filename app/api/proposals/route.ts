import { NextResponse } from 'next/server';

import { euros, priceOption, type OptionInput, type OptionLineInput, type PricedOption } from '@/src/pricing/index.js';

import { loadPricingContext } from '@/lib/pricing-context';
import { createClient } from '@/lib/supabase/server';
import type { Json } from '@/lib/supabase/database.types.js';

interface RawLine {
  supportId: string;
  market: string;
  quantity: number;
  mediaBudgetEuros: number | null;
  mediaMonths: number | null;
  availabilityConfirmedWith: string | null;
}

interface RawDiscount {
  ratePercent: number;
  reason: string;
}

interface RawOption {
  code: 'A' | 'B' | 'C';
  name: string;
  pitch: string;
  lines: RawLine[];
  discounts: RawDiscount[];
}

interface RawBody {
  accountId: string | null;
  newAccount: { legal_name: string; country_code: string; primary_market: string } | null;
  contactId: string | null;
  newContact: { full_name: string; email: string; language: string } | null;
  language: string;
  brief: string;
  campaignStart: string | null;
  campaignEnd: string | null;
  options: RawOption[];
}

/**
 * Crea y envía un presupuesto. El motor puro (src/pricing) recalcula aquí,
 * en el servidor, a partir de los datos crudos que manda el navegador — los
 * números que ya venían calculados en el cliente son solo una vista previa y
 * NUNCA se confían. La persistencia atómica la hace create_and_send_proposal
 * (SECURITY INVOKER: exige ser miembro de equipo vía RLS).
 */
export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  let body: RawBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  if (!Array.isArray(body.options) || body.options.length < 2 || body.options.length > 3) {
    return NextResponse.json({ error: 'Un envío necesita entre 2 y 3 opciones' }, { status: 400 });
  }

  let ctx;
  try {
    ctx = await loadPricingContext(supabase);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'No se pudieron cargar los parámetros' },
      { status: 500 },
    );
  }

  const optionsJson: unknown[] = [];
  for (const raw of body.options) {
    const input: OptionInput = {
      id: raw.code,
      name: raw.name,
      lines: raw.lines.map((l): OptionLineInput => {
        const support = ctx.catalog.get(l.supportId);
        return {
          supportId: l.supportId,
          market: l.market as OptionLineInput['market'],
          quantity: l.quantity,
          ...(support?.isMediaBuy
            ? {
                mediaBudgetCents: l.mediaBudgetEuros ? euros(l.mediaBudgetEuros) : 0,
                mediaMonths: l.mediaMonths ?? 1,
              }
            : {}),
        };
      }),
      manualDiscounts: raw.discounts.map((d) => ({ rate: d.ratePercent / 100, reason: d.reason })),
    };

    let priced: PricedOption;
    try {
      priced = priceOption(input, ctx);
    } catch (err) {
      return NextResponse.json(
        { error: `Opción ${raw.code}: ${err instanceof Error ? err.message : 'error de cálculo'}` },
        { status: 400 },
      );
    }

    if (!priced.meetsMarginFloor) {
      return NextResponse.json(
        { error: `Opción ${raw.code}: por debajo del suelo de margen. Revisa antes de enviar.` },
        { status: 400 },
      );
    }

    const availabilityByKey = new Map(
      raw.lines.map((l) => [`${l.supportId}|${l.market}`, l.availabilityConfirmedWith]),
    );

    optionsJson.push({
      code: raw.code,
      name: priced.name ?? raw.code,
      pitch: raw.pitch,
      sort_order: optionsJson.length,
      gross_net_of_media_cents: priced.grossNetOfMediaCents,
      effective_discount_cents: priced.effectiveDiscountCents,
      net_revenue_cents: priced.netRevenueCents,
      media_budget_cents: priced.mediaBudgetCents,
      billed_total_cents: priced.billedTotalCents,
      cost_cents: priced.costCents,
      margin_cents: priced.marginCents,
      margin_rate: priced.marginRate,
      max_lead_time_business_days: priced.maxLeadTimeBusinessDays,
      lines: priced.lines.map((l, idx) => ({
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
        billed_total_cents: l.billedTotalCents,
        sort_order: idx,
        availability_confirmed_with: availabilityByKey.get(`${l.supportId}|${l.market}`) ?? null,
        availability_confirmed_at: availabilityByKey.get(`${l.supportId}|${l.market}`) ? new Date().toISOString() : null,
      })),
      discounts: priced.discounts.map((d) => ({
        kind: d.kind,
        rate: d.rate,
        reason: d.reason,
      })),
    });
  }

  const payload = {
    ...(body.accountId ? { account_id: body.accountId } : { account: body.newAccount }),
    ...(body.contactId ? { contact_id: body.contactId } : { contact: body.newContact }),
    language: body.language,
    brief: body.brief,
    campaign_start: body.campaignStart,
    campaign_end: body.campaignEnd,
    options: optionsJson,
  };

  const { data, error } = await supabase.rpc('create_and_send_proposal', {
    payload: payload as unknown as Json,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({
    proposalId: (data as { proposal_id: string }).proposal_id,
    publicToken: (data as { public_token: string }).public_token,
  });
}
