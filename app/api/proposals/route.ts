import { NextResponse } from 'next/server';

import { euros, priceOption, type OptionInput, type OptionLineInput, type PricedOption } from '@/src/pricing/index.js';

import { loadPricingContext } from '@/lib/pricing-context';
import { createClient } from '@/lib/supabase/server';
import type { Json } from '@/lib/supabase/database.types.js';
import type { ContentLanguage } from '@/lib/domain';
import { buildProposalEmailContent } from '@/lib/email/proposal-email';
import { sendEmail } from '@/lib/email/resend-client';

/** Weekendesk SAS, 28 rue de Londres, 75009 Paris (CLAUDE.md §7) — CCO fija de todo envío. */
const CONTRACTING_BCC = 'contracting@weekendesk.fr';

interface RawLine {
  supportId: string;
  quantity: number;
  mediaBudgetEuros: number | null;
  mediaMonths: number | null;
}

interface RawDiscount {
  ratePercent: number;
  reason: string;
}

interface RawOption {
  code: 'A' | 'B' | 'C';
  name: string;
  pitch: string;
  /** Mercados elegidos UNA VEZ para la opción entera (CLAUDE.md §4.2, ronda 2). */
  markets: string[];
  campaignStart: string | null;
  campaignEnd: string | null;
  /** Modo "solo duración, sin fecha de inicio" (CLAUDE.md §5.3 bis). */
  campaignDurationCount: number | null;
  campaignDurationUnit: 'WEEK' | 'MONTH' | null;
  lines: RawLine[];
  discounts: RawDiscount[];
}

interface RawBody {
  accountId: string | null;
  newAccount: { legal_name: string; country_code: string } | null;
  contactId: string | null;
  newContact: { full_name: string; email: string; language: string } | null;
  language: string;
  brief: string;
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
  if (!user || !user.email) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }
  const ownerEmail = user.email;

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
    if (!Array.isArray(raw.markets) || raw.markets.length === 0) {
      return NextResponse.json(
        { error: `Opción ${raw.code}: elige al menos un mercado` },
        { status: 400 },
      );
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
    options: optionsJson,
  };

  // Crea el envío en DRAFT (congelado, con enlace público ya generado, pero
  // todavía invisible: get_public_proposal descarta DRAFT). Solo se marca
  // SENT más abajo, si Resend confirma el email — así, si el email falla, el
  // presupuesto no queda marcado como enviado (ver la migración
  // 20260919100000_email_send.sql).
  //
  // Esto pasa ANTES de comprobar la configuración de Resend, a propósito
  // (CLAUDE.md §10.3, ronda 4): la cuenta, el contacto y el cálculo no
  // dependen de que el email pueda salir — persistirlos es una cosa,
  // mandarlos por correo es otra. Antes esta ruta comprobaba
  // RESEND_API_KEY/RESEND_FROM_EMAIL primero y abortaba sin llamar aquí si
  // faltaban: sin esas variables en Vercel, NINGÚN presupuesto se llegaba a
  // crear nunca — ni la cuenta ni el contacto, aunque el comercial hubiera
  // rellenado el formulario bien. Verificado que create_and_send_proposal en
  // sí siempre ha funcionado (contra un PostgreSQL 16 real, varias rondas);
  // el bug estaba en que esta ruta no la llegaba a llamar.
  const { data, error } = await supabase.rpc('create_and_send_proposal', {
    payload: payload as unknown as Json,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const fromAddress = process.env.RESEND_FROM_EMAIL;

  const created = data as {
    proposal_id: string;
    public_token: string;
    contact_email: string;
    contact_full_name: string;
    account_legal_name: string;
  };

  // Falta configuración de Resend: se trata igual que un envío de email
  // fallido (log_proposal_send_failure, el presupuesto se queda en DRAFT) —
  // nunca como un motivo para no haber persistido nada, que es lo que hacía
  // antes de moverse este chequeo (ver el comentario más arriba).
  if (!apiKey || !fromAddress) {
    await supabase.rpc('log_proposal_send_failure', {
      p_proposal_id: created.proposal_id,
      p_email: { error: 'Falta configuración de email (RESEND_API_KEY / RESEND_FROM_EMAIL)' } as unknown as Json,
    });
    return NextResponse.json(
      {
        error:
          'El presupuesto se ha calculado y guardado, pero falta la configuración de email ' +
          '(RESEND_API_KEY / RESEND_FROM_EMAIL) para mandarlo. El envío queda en borrador, sin ' +
          'marcar como enviado.',
      },
      { status: 500 },
    );
  }

  const publicUrl = `${new URL(request.url).origin}/p/${created.public_token}`;
  const expiresAtIso = new Date(Date.now() + ctx.offerValidityDays * 86_400_000).toISOString();

  const { data: ownerProfile, error: ownerProfileError } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single();
  if (ownerProfileError) {
    return NextResponse.json({ error: ownerProfileError.message }, { status: 500 });
  }

  const { subject, html, text } = buildProposalEmailContent({
    advertiserName: created.account_legal_name,
    contactFullName: created.contact_full_name,
    brief: body.brief || null,
    numberOfOptions: body.options.length,
    publicUrl,
    expiresAtIso,
    salesName: ownerProfile.full_name,
    // El idioma del EMAIL es el mismo que el de la pantalla pública: el que
    // el comercial elige para ESTE envío en "Idioma del cliente"
    // (CLAUDE.md §5.6, ronda 2), no `contacts.language` — ese es un dato
    // persistente del contacto que puede venir de un envío anterior en otro
    // idioma y desincronizarse de lo elegido aquí.
    language: body.language as ContentLanguage,
  });

  const recipients = {
    to: [created.contact_email],
    cc: [ownerEmail],
    bcc: [CONTRACTING_BCC],
    replyTo: ownerEmail,
    from: fromAddress,
  };

  const sendResult = await sendEmail(
    { ...recipients, subject, html, text },
    apiKey,
  );

  if (!sendResult.ok) {
    await supabase.rpc('log_proposal_send_failure', {
      p_proposal_id: created.proposal_id,
      p_email: { ...recipients, error: sendResult.error } as unknown as Json,
    });
    return NextResponse.json(
      {
        error: `El envío no se pudo mandar por email (${sendResult.error}). El presupuesto no queda marcado como enviado.`,
      },
      { status: 502 },
    );
  }

  const { error: markError } = await supabase.rpc('mark_proposal_sent', {
    p_proposal_id: created.proposal_id,
    p_email: { ...recipients, resendMessageId: sendResult.id } as unknown as Json,
  });
  if (markError) {
    return NextResponse.json({ error: markError.message }, { status: 500 });
  }

  return NextResponse.json({
    proposalId: created.proposal_id,
    publicToken: created.public_token,
  });
}
