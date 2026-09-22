-- =============================================================================
-- create_and_send_proposal, ronda 2 (CLAUDE.md §10.3):
--
--   * Las fechas de campaña ya no son del envío: son de CADA OPCIÓN, junto
--     con sus mercados y, en modo "solo duración" (§5.3 bis), su duración sin
--     fecha de inicio concreta.
--   * Se quita la inserción en `availability_checks`: el check manual de
--     disponibilidad con Marketing deja de vivir en la app (CLAUDE.md §5.3,
--     ronda 2) — se hace fuera del sistema, antes de crear el presupuesto. La
--     tabla se queda en el esquema (no se borra, por si hiciera falta
--     recuperar el dato más adelante) pero nada vuelve a escribir en ella
--     desde aquí.
--
-- Construida sobre la versión de 20260919100000_email_send.sql (DRAFT hasta
-- que Resend confirma el envío): esa parte no cambia.
-- =============================================================================

create or replace function create_and_send_proposal(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_account_id  uuid;
  v_contact_id  uuid;
  v_owner_id    uuid := auth.uid();
  v_proposal_id uuid := gen_random_uuid();
  v_token       text := encode(gen_random_bytes(24), 'hex');
  v_param_set   uuid;
  v_option      jsonb;
  v_option_id   uuid;
  v_line        jsonb;
  v_discount    jsonb;
  v_markets     market[];
begin
  if v_owner_id is null then
    raise exception 'No autenticado';
  end if;

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
    id, account_id, contact_id, owner_id, parameter_set_id, language, brief,
    public_token, status, frozen_snapshot
  ) values (
    v_proposal_id, v_account_id, v_contact_id, v_owner_id, v_param_set,
    (payload->>'language')::content_language, payload->>'brief',
    v_token, 'DRAFT', payload
  );

  for v_option in select * from jsonb_array_elements(payload->'options')
  loop
    v_option_id := gen_random_uuid();

    select array_agg(value::text::market) into v_markets
    from jsonb_array_elements_text(coalesce(v_option->'markets', '[]'::jsonb));

    insert into proposal_options (
      id, proposal_id, code, name, pitch, sort_order, markets,
      campaign_start, campaign_end, campaign_duration_count, campaign_duration_unit,
      gross_net_of_media_cents, discount_cents, net_revenue_cents,
      media_budget_cents, billed_total_cents, cost_cents, margin_cents,
      margin_rate, max_lead_time_days, calculated_at
    ) values (
      v_option_id, v_proposal_id, v_option->>'code', v_option->>'name',
      v_option->>'pitch', coalesce((v_option->>'sort_order')::int, 0),
      coalesce(v_markets, '{}'),
      nullif(v_option->>'campaign_start', '')::date,
      nullif(v_option->>'campaign_end', '')::date,
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
      now()
    );

    for v_line in select * from jsonb_array_elements(v_option->'lines')
    loop
      insert into proposal_option_lines (
        option_id, support_id, market, quantity, media_budget_cents, media_months,
        is_lead_market, unit_cost_cents, cost_cents, gross_price_cents,
        margin_floor_cents, floor_applied, list_price_cents, discount_cents,
        net_price_cents, billed_total_cents, sort_order
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
        (v_line->>'billed_total_cents')::bigint,
        coalesce((v_line->>'sort_order')::int, 0)
      );
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
    'public_token', v_token,
    'contact_email', (select email from contacts where id = v_contact_id),
    'contact_full_name', (select full_name from contacts where id = v_contact_id),
    'contact_language', (select language from contacts where id = v_contact_id),
    'account_legal_name', (select legal_name from accounts where id = v_account_id)
  );
end;
$$;
