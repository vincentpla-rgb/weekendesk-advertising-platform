-- =============================================================================
-- Envío de email real por Resend (CLAUDE.md §2).
--
-- Hasta ahora `create_and_send_proposal` marcaba el envío como SENT en el
-- mismo paso que lo creaba: el "envío" era solo persistir, porque el email lo
-- abría el propio comercial como borrador en su cliente de correo (nunca
-- podía "fallar" desde el punto de vista de la aplicación).
--
-- Ahora la aplicación manda el email ella misma (Resend), y si ese envío
-- falla el presupuesto NO debe quedar marcado como enviado. Eso exige separar
-- dos pasos que antes eran uno:
--
--   1. create_and_send_proposal: sigue calculando y persistiendo todo
--      (opciones, líneas, descuentos, checks de disponibilidad) en una única
--      transacción, pero ahora dentro deja el envío en DRAFT — sin sent_at,
--      sin expires_at. El cálculo queda igual de congelado que antes
--      (frozen_snapshot se fija aquí y no se vuelve a tocar); lo único que
--      cambia es que la parte pública (get_public_proposal) sigue sin verlo,
--      porque ya descartaba DRAFT.
--   2. mark_proposal_sent: la llama la ruta de servidor de Next.js SOLO si
--      Resend confirma el envío. Aquí es donde de verdad se pone SENT,
--      sent_at y expires_at, y se registra el evento 'sent' con destinatarios
--      y resultado.
--
-- Si Resend falla, la ruta de servidor llama a log_proposal_send_failure en
-- su lugar: registra el intento fallido y dEja el envío en DRAFT. No hay UI
-- de reintento en esta pasada (ver CLAUDE.md §10.1.2) — es una limitación
-- conocida, no un descuido.
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
    campaign_start, campaign_end, public_token, status, frozen_snapshot
  ) values (
    v_proposal_id, v_account_id, v_contact_id, v_owner_id, v_param_set,
    (payload->>'language')::content_language, payload->>'brief',
    nullif(payload->>'campaign_start', '')::date,
    nullif(payload->>'campaign_end', '')::date,
    v_token, 'DRAFT', payload
  );

  for v_option in select * from jsonb_array_elements(payload->'options')
  loop
    v_option_id := gen_random_uuid();

    insert into proposal_options (
      id, proposal_id, code, name, pitch, sort_order,
      gross_net_of_media_cents, discount_cents, net_revenue_cents,
      media_budget_cents, billed_total_cents, cost_cents, margin_cents,
      margin_rate, max_lead_time_days, calculated_at
    ) values (
      v_option_id, v_proposal_id, v_option->>'code', v_option->>'name',
      v_option->>'pitch', coalesce((v_option->>'sort_order')::int, 0),
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

      if (v_line->>'availability_confirmed_with') is not null
         and btrim(v_line->>'availability_confirmed_with') <> '' then
        insert into availability_checks (
          option_id, support_id, market, confirmed_with, confirmed_at, created_by
        ) values (
          v_option_id, v_line->>'support_id', (v_line->>'market')::market,
          v_line->>'availability_confirmed_with',
          coalesce(nullif(v_line->>'availability_confirmed_at', '')::timestamptz, now()),
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
    'public_token', v_token,
    'contact_email', (select email from contacts where id = v_contact_id),
    'contact_language', (select language from contacts where id = v_contact_id),
    'account_legal_name', (select legal_name from accounts where id = v_account_id)
  );
end;
$$;

-- =============================================================================
-- Confirma el envío tras un email de Resend enviado con éxito. Idempotente
-- por status: solo actúa sobre un envío todavía en DRAFT, así que llamarla dos
-- veces con el mismo proposal_id la segunda vez no hace nada (no hay doble
-- sent_at ni doble evento).
-- =============================================================================

create or replace function mark_proposal_sent(p_proposal_id uuid, p_email jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_validity integer;
  v_token    text;
  v_expires  timestamptz;
begin
  select pps.offer_validity_days, p.public_token
    into v_validity, v_token
  from proposals p
  join pricing_parameter_sets pps on pps.id = p.parameter_set_id
  where p.id = p_proposal_id and p.status = 'DRAFT';

  if v_token is null then
    raise exception 'El envío % no está pendiente de confirmación de email (ya enviado o no existe)', p_proposal_id;
  end if;

  v_expires := now() + (v_validity || ' days')::interval;

  update proposals
     set status = 'SENT', sent_at = now(), expires_at = v_expires
   where id = p_proposal_id;

  insert into proposal_events (proposal_id, event_type, payload, actor_id)
  values (p_proposal_id, 'sent', p_email, auth.uid());

  return jsonb_build_object('expires_at', v_expires, 'public_token', v_token);
end;
$$;

grant execute on function mark_proposal_sent(uuid, jsonb) to authenticated;

-- =============================================================================
-- Registra un intento de email fallido. NO toca el estado: el envío se queda
-- en DRAFT, que es exactamente el efecto que pide CLAUDE.md ("si el envío
-- falla, el presupuesto no debe quedar marcado como enviado").
-- =============================================================================

create or replace function log_proposal_send_failure(p_proposal_id uuid, p_email jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  insert into proposal_events (proposal_id, event_type, payload, actor_id)
  select p_proposal_id, 'send_failed', p_email, auth.uid()
  from proposals where id = p_proposal_id and status = 'DRAFT';
end;
$$;

grant execute on function log_proposal_send_failure(uuid, jsonb) to authenticated;
