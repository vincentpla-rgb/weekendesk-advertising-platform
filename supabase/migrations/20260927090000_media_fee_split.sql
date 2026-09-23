-- =============================================================================
-- Ronda 10 (CLAUDE.md §4.4, §10.3 decies): cambio de modelo de facturación de
-- los soportes de media buy (ADS-01, ADS-02, ADS-03, INF-01).
--
-- ANTES: el fee de gestión se sumaba ENCIMA del presupuesto de medios del
-- cliente (`billed_total_cents = net_price_cents + media_budget_cents`, donde
-- `net_price_cents` es el fee). Si el cliente daba 2.000 €, se facturaban
-- 2.000 € + fee, aparte.
--
-- AHORA: el cliente factura EXACTAMENTE su presupuesto de medios, nunca más.
-- El fee se reparte POR DENTRO de ese importe (`billed_total_cents =
-- media_budget_cents`), restado en vez de sumado. Para ADS-01/02/03 el
-- reparto sigue siendo automático por defecto (40 % del presupuesto, o el
-- mínimo mensual × meses, el que sea mayor) — la fórmula de
-- `mediaManagementFee` en `src/pricing/engine.ts` no cambia, solo cómo se
-- usa su resultado para facturar. Para INF-01 el reparto SIEMPRE es manual:
-- nuevo `supports.always_manual_media_split`, `true` únicamente en INF-01.
--
-- Nuevo: el reparto se puede FORZAR a mano (`manual_fee_cents` +
-- `manual_fee_reason`) para un caso negociado — fijo, inmune a descuentos
-- posteriores (suelo y techo a la vez, ver `engine.ts`). Como el resto de
-- excepciones del proyecto (CLAUDE.md §8), se registra en `overrides` con
-- autor, motivo y marca de tiempo — nuevo valor de `override_kind`
-- (`MEDIA_FEE_FORCED`) y nueva columna `overrides.support_id` (precedente:
-- `availability_checks`, que ya referencia option_id+support_id+market).
--
-- Caso límite: si el presupuesto del cliente no cubre el fee mínimo, el
-- reparto automático dejaría el importe real al medio en negativo — se
-- calcula igual (`media_real_spend_cents`, nueva columna) y se bloquea el
-- envío en `checks.ts` (`MEDIA_FEE_EXCEEDS_BUDGET`), no aquí: la base de
-- datos solo persiste lo que ya pasó los controles previos al envío.
-- =============================================================================

alter table supports
  add column always_manual_media_split boolean not null default false;

comment on column supports.always_manual_media_split is
  'CLAUDE.md §4.4, ronda 10: true SOLO en INF-01. El reparto entre el importe '
  'real al medio y el fee de gestión nunca es automático para este soporte — '
  'cada colaboración con un influencer se negocia caso por caso. checks.ts '
  'bloquea el envío (MEDIA_SPLIT_REQUIRED) mientras no se fuerce a mano.';

update supports set always_manual_media_split = true where id = 'INF-01';

alter table proposal_option_lines
  add column manual_fee_cents bigint check (manual_fee_cents is null or manual_fee_cents >= 0),
  add column manual_fee_reason text,
  add column media_real_spend_cents bigint;

comment on column proposal_option_lines.manual_fee_cents is
  'CLAUDE.md §4.4, ronda 10. Solo media buy. NULL = reparto automático. '
  'Fijo cuando se rellena: suelo y techo del fee a la vez, inmune a '
  'descuentos posteriores — es un importe ya negociado con el cliente.';

comment on column proposal_option_lines.media_real_spend_cents is
  'CLAUDE.md §4.4, ronda 10. Solo media buy: media_budget_cents - fee (net_price_cents). '
  'Interno, nunca de cara al cliente (§6). Puede ser negativo si el '
  'presupuesto no cubre el fee mínimo — checks.ts bloquea el envío en ese caso.';

alter type override_kind add value 'MEDIA_FEE_FORCED';

alter table overrides
  add column support_id text references supports (id);

comment on column overrides.support_id is
  'Solo para MEDIA_FEE_FORCED (CLAUDE.md §4.4, ronda 10): qué soporte de la '
  'opción tuvo su fee de gestión forzado a mano. NULL en el resto de kinds, '
  'que ya son por opción entera (p. ej. VOLUME_DISCOUNT_DISABLED).';

-- =============================================================================
-- create_and_send_proposal, ronda 10: igual que la versión anterior
-- (20260926090000_volume_discount_toggle.sql), con las columnas nuevas de
-- proposal_option_lines persistidas y, cuando manual_fee_cents no es null,
-- una fila en overrides (MEDIA_FEE_FORCED) con el motivo del comercial —
-- una vez por soporte, no por mercado (is_lead_market, mismo patrón que
-- MEDIA_BUDGET_MISSING en checks.ts: el reparto forzado es el mismo en
-- todos los mercados de la opción, CLAUDE.md §4.2).
-- =============================================================================

create or replace function create_and_send_proposal(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_account_id     uuid;
  v_contact_id     uuid;
  v_owner_id       uuid := auth.uid();
  v_proposal_id    uuid := gen_random_uuid();
  v_token          text := encode(extensions.gen_random_bytes(24), 'hex');
  v_year           integer := extract(year from now())::int;
  v_seq            integer;
  v_number         text;
  v_param_set      uuid;
  v_option         jsonb;
  v_option_id      uuid;
  v_line           jsonb;
  v_discount       jsonb;
  v_markets        market[];
  v_campaign_start date;
  v_campaign_end   date;
  v_volume_disabled boolean;
  v_manual_fee_cents bigint;
begin
  if v_owner_id is null then
    raise exception 'No autenticado';
  end if;

  insert into proposal_number_counters (year, last_seq)
  values (v_year, 1)
  on conflict (year) do update set last_seq = proposal_number_counters.last_seq + 1
  returning last_seq into v_seq;
  v_number := v_year || '-' || lpad(v_seq::text, 3, '0');

  if payload ? 'account_id' then
    v_account_id := (payload->>'account_id')::uuid;
  else
    insert into accounts (legal_name, country_code, primary_market, owner_id)
    values (
      payload->'account'->>'legal_name',
      payload->'account'->>'country_code',
      nullif(payload->'account'->>'primary_market', '')::market,
      v_owner_id
    )
    returning id into v_account_id;
  end if;

  if payload ? 'contact_id' then
    v_contact_id := (payload->>'contact_id')::uuid;
  else
    insert into contacts (account_id, full_name, email, language)
    values (
      v_account_id,
      payload->'contact'->>'full_name',
      payload->'contact'->>'email',
      (payload->'contact'->>'language')::content_language
    )
    returning id into v_contact_id;
  end if;

  select id into v_param_set
  from pricing_parameter_sets where is_active limit 1;

  if v_param_set is null then
    raise exception 'No hay un juego de parámetros de precios activo';
  end if;

  -- DRAFT, no SENT: el envío de verdad (email) todavía no ha ocurrido.
  -- sent_at/expires_at se fijan en mark_proposal_sent, cuando Resend confirma.
  insert into proposals (
    id, account_id, contact_id, owner_id, parameter_set_id, proposal_number,
    language, brief, public_token, status, frozen_snapshot
  ) values (
    v_proposal_id, v_account_id, v_contact_id, v_owner_id, v_param_set, v_number,
    (payload->>'language')::content_language, payload->>'brief',
    v_token, 'DRAFT', payload
  );

  for v_option in select * from jsonb_array_elements(payload->'options')
  loop
    v_option_id := gen_random_uuid();

    select array_agg(value::text::market) into v_markets
    from jsonb_array_elements_text(coalesce(v_option->'markets', '[]'::jsonb));

    v_campaign_start := nullif(v_option->>'campaign_start', '')::date;
    v_campaign_end   := nullif(v_option->>'campaign_end', '')::date;
    v_volume_disabled := coalesce((v_option->>'volume_discount_disabled')::boolean, false);

    -- Bloquea el envío entero si algún soporte de esta opción choca con un
    -- presupuesto ya aceptado de otro cliente (CLAUDE.md §3, §5.3).
    for v_line in select * from jsonb_array_elements(v_option->'lines')
    loop
      if has_accepted_availability_conflict(
           v_line->>'support_id', (v_line->>'market')::market,
           v_campaign_start, v_campaign_end, v_account_id
         ) then
        raise exception
          '% en % ya está aceptado por otro cliente en fechas solapadas: no se puede enviar este presupuesto para esas fechas.',
          v_line->>'support_id', v_line->>'market';
      end if;
    end loop;

    insert into proposal_options (
      id, proposal_id, code, name, pitch, sort_order, markets,
      campaign_start, campaign_end, campaign_duration_count, campaign_duration_unit,
      gross_net_of_media_cents, discount_cents, net_revenue_cents,
      media_budget_cents, billed_total_cents, cost_cents, margin_cents,
      margin_rate, max_lead_time_days, volume_discount_disabled, calculated_at
    ) values (
      v_option_id, v_proposal_id, v_option->>'code', v_option->>'name',
      v_option->>'pitch', coalesce((v_option->>'sort_order')::int, 0),
      coalesce(v_markets, '{}'),
      v_campaign_start, v_campaign_end,
      nullif(v_option->>'campaign_duration_count', '')::int,
      nullif(v_option->>'campaign_duration_unit', ''),
      (v_option->>'gross_net_of_media_cents')::bigint,
      (v_option->>'effective_discount_cents')::bigint,
      (v_option->>'net_revenue_cents')::bigint,
      (v_option->>'media_budget_cents')::bigint,
      (v_option->>'billed_total_cents')::bigint,
      (v_option->>'cost_cents')::bigint,
      (v_option->>'margin_cents')::bigint,
      nullif(v_option->>'margin_rate', '')::numeric,
      (v_option->>'max_lead_time_business_days')::int,
      v_volume_disabled,
      now()
    );

    if v_volume_disabled then
      insert into overrides (proposal_id, option_id, kind, reason, created_by)
      values (
        v_proposal_id, v_option_id, 'VOLUME_DISCOUNT_DISABLED',
        'Descuento automático por volumen desactivado para esta opción.', v_owner_id
      );
    end if;

    for v_line in select * from jsonb_array_elements(v_option->'lines')
    loop
      insert into proposal_option_lines (
        option_id, support_id, market, quantity, media_budget_cents, media_months,
        is_lead_market, unit_cost_cents, cost_cents, gross_price_cents,
        margin_floor_cents, floor_applied, list_price_cents, discount_cents,
        net_price_cents, manual_fee_cents, manual_fee_reason, media_real_spend_cents,
        billed_total_cents, sort_order
      ) values (
        v_option_id, v_line->>'support_id', (v_line->>'market')::market,
        (v_line->>'quantity')::numeric,
        nullif(v_line->>'media_budget_cents', '')::bigint,
        nullif(v_line->>'media_months', '')::int,
        (v_line->>'is_lead_market')::boolean,
        (v_line->>'unit_cost_cents')::bigint,
        (v_line->>'cost_cents')::bigint,
        (v_line->>'gross_price_cents')::bigint,
        (v_line->>'margin_floor_cents')::bigint,
        (v_line->>'floor_applied')::boolean,
        (v_line->>'list_price_cents')::bigint,
        (v_line->>'discount_cents')::bigint,
        (v_line->>'net_price_cents')::bigint,
        nullif(v_line->>'manual_fee_cents', '')::bigint,
        nullif(v_line->>'manual_fee_reason', ''),
        nullif(v_line->>'media_real_spend_cents', '')::bigint,
        (v_line->>'billed_total_cents')::bigint,
        coalesce((v_line->>'sort_order')::int, 0)
      );

      -- Reparto forzado a mano (CLAUDE.md §4.4, ronda 10): registrado una
      -- vez por soporte, no por mercado — el mismo reparto se aplica igual
      -- en cada mercado de la opción (§4.2), así que la fila del mercado
      -- líder basta como origen y evita repetir el mismo override.
      v_manual_fee_cents := nullif(v_line->>'manual_fee_cents', '')::bigint;
      if v_manual_fee_cents is not null and (v_line->>'is_lead_market')::boolean then
        insert into overrides (proposal_id, option_id, support_id, kind, reason, created_by)
        values (
          v_proposal_id, v_option_id, v_line->>'support_id', 'MEDIA_FEE_FORCED',
          coalesce(nullif(v_line->>'manual_fee_reason', ''), 'Reparto de medios forzado a mano.'),
          v_owner_id
        );
      end if;
    end loop;

    for v_discount in select * from jsonb_array_elements(coalesce(v_option->'discounts', '[]'::jsonb))
    loop
      insert into option_discounts (option_id, kind, rate, reason, created_by)
      values (
        v_option_id, (v_discount->>'kind')::discount_kind,
        (v_discount->>'rate')::numeric, v_discount->>'reason', v_owner_id
      );
    end loop;
  end loop;

  insert into proposal_events (proposal_id, event_type, actor_id)
  values (v_proposal_id, 'draft_created', v_owner_id);

  return jsonb_build_object(
    'proposal_id', v_proposal_id,
    'proposal_number', v_number,
    'public_token', v_token,
    'contact_email', (select email from contacts where id = v_contact_id),
    'contact_full_name', (select full_name from contacts where id = v_contact_id),
    'contact_language', (select language from contacts where id = v_contact_id),
    'account_legal_name', (select legal_name from accounts where id = v_account_id)
  );
end;
$$;

-- =============================================================================
-- get_public_proposal, ronda 10: se retira `net_revenue_cents` del JSON
-- público. La interfaz (app/p/[token]/page.tsx, PublicProposalClient.tsx)
-- nunca lo usó — solo `billed_total_cents` (§5.6, §6) — pero seguía viajando
-- en la respuesta y era inspeccionable por la pestaña de red del navegador.
-- En una opción con una sola línea de media buy, `net_revenue_cents` de la
-- opción coincide exactamente con el fee de esa línea: exactamente el
-- desglose que CLAUDE.md §4.4 (ronda 10) prohíbe mostrar de cara al
-- cliente. Cierre defensivo, ahora que "nunca se muestra el desglose" es
-- una regla explícita y no solo un hueco incidental.
-- =============================================================================

create or replace function get_public_proposal(token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  p         proposals%rowtype;
  is_live   boolean;
begin
  select * into p from proposals where public_token = token;

  if not found or p.status = 'DRAFT' then
    return null;
  end if;

  -- Caducada: se devuelve la cabecera, nunca los precios.
  is_live := p.expires_at is null or p.expires_at > now();

  return jsonb_build_object(
    'status',         p.status,
    'language',       p.language,
    'expires_at',     p.expires_at,
    'expired',        not is_live,
    'advertiser',     (select a.legal_name
                         from accounts a where a.id = p.account_id),
    'brief',          case when is_live then p.brief end,
    'options',        case when is_live then (
      select coalesce(jsonb_agg(o order by o.sort_order, o.code), '[]'::jsonb)
      from (
        select jsonb_build_object(
                 'code',                     po.code,
                 'name',                     po.name,
                 'pitch',                    po.pitch,
                 'markets',                  po.markets,
                 'campaign_start',           po.campaign_start,
                 'campaign_end',             po.campaign_end,
                 'campaign_duration_count',  po.campaign_duration_count,
                 'campaign_duration_unit',   po.campaign_duration_unit,
                 'media_budget_cents',       po.media_budget_cents,
                 'billed_total_cents',       po.billed_total_cents,
                 'lines', (
                   select coalesce(jsonb_agg(jsonb_build_object(
                            'support_id',   l.support_id,
                            'support_name', s.name,
                            'channel',      s.channel,
                            'unit',         s.unit,
                            'market',       l.market,
                            'quantity',     l.quantity,
                            -- Sin dato medido → NULL. La interfaz omite la fila.
                            'reach', (
                              select jsonb_build_object(
                                       'value',       r.value,
                                       'metric',      r.metric,
                                       'period_unit', r.period_unit,
                                       'source',      r.source,
                                       'measured_at', r.measured_at)
                              from reach_measurements r
                              where r.support_id = l.support_id
                                and r.market     = l.market
                                and r.value is not null
                              order by r.measured_at desc
                              limit 1)
                          ) order by l.sort_order), '[]'::jsonb)
                   from proposal_option_lines l
                   join supports s on s.id = l.support_id
                   where l.option_id = po.id)
               ) as o, po.sort_order, po.code
        from proposal_options po
        where po.proposal_id = p.id
      ) o
    ) end
  );
end;
$$;
