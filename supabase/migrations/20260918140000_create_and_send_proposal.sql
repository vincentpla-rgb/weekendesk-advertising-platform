-- =============================================================================
-- Creación y envío atómico de un presupuesto — soporta la pantalla interna.
--
-- El motor de precios (src/pricing/) es puro y corre en el servidor Next.js:
-- calcula coste, suelo, descuentos y totales antes de llamar aquí. Esta
-- función SOLO persiste ese resultado ya calculado, en una única transacción
-- (options + lines + discounts + checks de disponibilidad), y congela el
-- envío en el mismo paso (CLAUDE.md §5.4): no existe un estado DRAFT
-- persistido en base de datos en el MVP — el borrador vive en el navegador
-- del comercial hasta pulsar "Enviar".
--
-- SECURITY INVOKER: respeta RLS. Solo un miembro del equipo (is_team_member())
-- puede llamarla.
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
  v_validity    integer;
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

  select id, offer_validity_days into v_param_set, v_validity
  from pricing_parameter_sets where is_active limit 1;

  if v_param_set is null then
    raise exception 'No hay un juego de parámetros de precios activo';
  end if;

  insert into proposals (
    id, account_id, contact_id, owner_id, parameter_set_id, language, brief,
    campaign_start, campaign_end, public_token, status, sent_at, expires_at,
    frozen_snapshot
  ) values (
    v_proposal_id, v_account_id, v_contact_id, v_owner_id, v_param_set,
    (payload->>'language')::content_language, payload->>'brief',
    nullif(payload->>'campaign_start', '')::date,
    nullif(payload->>'campaign_end', '')::date,
    v_token, 'SENT', now(), now() + (v_validity || ' days')::interval,
    payload
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
  values (v_proposal_id, 'sent', v_owner_id);

  return jsonb_build_object('proposal_id', v_proposal_id, 'public_token', v_token);
end;
$$;

grant execute on function create_and_send_proposal(jsonb) to authenticated;

-- =============================================================================
-- Aceptación pública (CLAUDE.md §6, §7)
--
-- La verificación VIES en sí (llamada HTTP al REST API de la UE) la hace la
-- ruta de servidor de Next.js, que trae aquí el resultado ya obtenido. Esta
-- función solo decide el régimen de IVA con ese resultado y persiste.
-- =============================================================================

create or replace function accept_public_proposal(
  p_token                     text,
  p_option_code               text,
  p_legal_name                text,
  p_billing_address           text,
  p_vat_number                text,
  p_billing_contact_name      text,
  p_billing_contact_email     text,
  p_signer_name                text,
  p_signer_role               text,
  p_purchase_order_reference  text,
  p_vies_result                vies_result,
  p_vies_raw                  jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proposal        proposals%rowtype;
  v_option_id        uuid;
  v_account_country  text;
  v_vies_id          uuid;
  v_regime           vat_regime;
  v_acceptance_id    uuid;
begin
  select * into v_proposal from proposals where public_token = p_token;
  if not found then
    raise exception 'Enlace no válido';
  end if;
  if v_proposal.status not in ('SENT', 'VIEWED') then
    raise exception 'Este envío ya no admite respuesta (%)', v_proposal.status;
  end if;
  if v_proposal.expires_at is not null and v_proposal.expires_at <= now() then
    raise exception 'La oferta ha caducado';
  end if;

  select id into v_option_id from proposal_options
  where proposal_id = v_proposal.id and code = p_option_code;
  if v_option_id is null then
    raise exception 'Opción desconocida: %', p_option_code;
  end if;

  select country_code into v_account_country from accounts where id = v_proposal.account_id;

  insert into vies_checks (account_id, vat_number, result, raw_response)
  values (v_proposal.account_id, coalesce(p_vat_number, ''), p_vies_result, p_vies_raw)
  returning id into v_vies_id;

  -- Régimen de IVA (CLAUDE.md §7): francés siempre 20 %; UE con VIES válido,
  -- autoliquidación; UE sin VIES válido, 20 % francés.
  v_regime := case
    when upper(coalesce(v_account_country, '')) = 'FR' then 'FR_VAT_20'
    when p_vies_result = 'VALID' then 'REVERSE_CHARGE'
    else 'FR_VAT_20'
  end;

  insert into acceptances (
    proposal_id, option_id, legal_name, billing_address, vat_number,
    billing_contact_name, billing_contact_email, signer_name, signer_role,
    purchase_order_reference, vies_check_id, vat_regime_applied
  ) values (
    v_proposal.id, v_option_id, p_legal_name, p_billing_address, p_vat_number,
    p_billing_contact_name, p_billing_contact_email, p_signer_name, p_signer_role,
    p_purchase_order_reference, v_vies_id, v_regime
  )
  returning id into v_acceptance_id;

  update proposals set status = 'ACCEPTED', decided_at = now() where id = v_proposal.id;

  insert into proposal_events (proposal_id, event_type, payload)
  values (v_proposal.id, 'accepted', jsonb_build_object('option_code', p_option_code));

  return jsonb_build_object('acceptance_id', v_acceptance_id, 'vat_regime', v_regime);
end;
$$;

revoke all on function accept_public_proposal(
  text, text, text, text, text, text, text, text, text, text, vies_result, jsonb
) from public;
grant execute on function accept_public_proposal(
  text, text, text, text, text, text, text, text, text, text, vies_result, jsonb
) to anon, authenticated;

-- =============================================================================
-- Rechazo público (CLAUDE.md §5.4, §5.5)
--
-- Solo registra el rechazo y el motivo. La contrapropuesta es una acción
-- interna posterior (crear una versión nueva en borrador) que no forma parte
-- de este flujo público — no está construida en este MVP (ver README).
-- =============================================================================

create or replace function reject_public_proposal(p_token text, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proposal      proposals%rowtype;
  v_rejection_id  uuid;
begin
  select * into v_proposal from proposals where public_token = p_token;
  if not found then
    raise exception 'Enlace no válido';
  end if;
  if v_proposal.status not in ('SENT', 'VIEWED') then
    raise exception 'Este envío ya no admite respuesta (%)', v_proposal.status;
  end if;

  insert into rejections (proposal_id, reason) values (v_proposal.id, p_reason)
  returning id into v_rejection_id;

  update proposals set status = 'REJECTED', decided_at = now() where id = v_proposal.id;

  insert into proposal_events (proposal_id, event_type, payload)
  values (v_proposal.id, 'rejected', jsonb_build_object('reason', p_reason));

  return jsonb_build_object('rejection_id', v_rejection_id);
end;
$$;

revoke all on function reject_public_proposal(text, text) from public;
grant execute on function reject_public_proposal(text, text) to anon, authenticated;
