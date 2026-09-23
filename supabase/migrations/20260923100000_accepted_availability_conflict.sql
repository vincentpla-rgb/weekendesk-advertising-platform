-- =============================================================================
-- Disponibilidad real: ningún soporte puede tener dos campañas de CLIENTES
-- DISTINTOS aceptadas y activas a la vez, en el mismo mercado (CLAUDE.md §3,
-- ronda 3 — sustituye a la restricción anterior, que solo hablaba de Meta por
-- país). Aplica a los 19 soportes, incluidos CRM y Social, mientras no haya
-- inventario real (ver §9 para la revisión pendiente de si CRM/Social
-- necesitan otra regla en v2).
--
-- El control se comprueba SOLO contra presupuestos YA ACEPTADOS:
--   * Se pueden crear y enviar cuantos presupuestos se quiera con el mismo
--     soporte y las mismas fechas, a distintos prospectos — compiten por el
--     mismo hueco, y el primero en aceptar se lo lleva. Un choque entre dos
--     envíos sin aceptar NO bloquea nada y no genera aviso.
--   * El control se activa en dos momentos: (1) al construir/enviar un
--     presupuesto nuevo, si ya existe un ACEPTADO que choca — bloquea el
--     envío entero (create_and_send_proposal); (2) al aceptar un
--     presupuesto, si para entonces ya existe otro ACEPTADO que choca —
--     bloquea la aceptación (accept_public_proposal). El caso (2) cubre la
--     carrera: dos comerciales envían presupuestos que compiten por el mismo
--     hueco: el primero en aceptar se lo lleva, el segundo intento de
--     aceptación choca contra el primero y se bloquea aquí.
--
-- Límite conocido, documentado en vez de ignorado: una opción cotizada solo
-- por duración, sin fecha de inicio concreta (§5.3 bis), no tiene fechas con
-- las que comprobar solapamiento — el control no puede evaluarse para ella
-- y NO bloquea (ver CLAUDE.md §9 para la nota de v2). Igual que ADS-03/INF-01
-- sin fee mínimo (§4.4), es preferible avisar de que no se puede comprobar
-- que dar por buena una comparación con datos que no existen.
-- =============================================================================

create or replace function has_accepted_availability_conflict(
  p_support_id      text,
  p_market          market,
  p_campaign_start  date,
  p_campaign_end    date,
  p_account_id      uuid,
  p_exclude_proposal_id uuid default null
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from proposals p
    join acceptances acc on acc.proposal_id = p.id
    join proposal_options po on po.id = acc.option_id
    join proposal_option_lines l on l.option_id = po.id
    where p.status = 'ACCEPTED'
      and l.support_id = p_support_id
      and l.market = p_market
      and p.account_id <> p_account_id                 -- solo "clientes distintos"
      and (p_exclude_proposal_id is null or p.id <> p_exclude_proposal_id)
      -- Sin fechas concretas en cualquiera de los dos lados, el solapamiento
      -- no se puede determinar: no se bloquea (ver nota de arriba).
      and po.campaign_start is not null and po.campaign_end is not null
      and p_campaign_start is not null and p_campaign_end is not null
      and po.campaign_start <= p_campaign_end
      and p_campaign_start <= po.campaign_end
  );
$$;

grant execute on function has_accepted_availability_conflict(text, market, date, date, uuid, uuid) to authenticated;

-- =============================================================================
-- create_and_send_proposal, ronda 3: bloquea el envío si algún soporte de
-- alguna opción choca, en su mercado y fechas, con un presupuesto ya
-- ACEPTADO de otro cliente.
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
  v_token          text := encode(gen_random_bytes(24), 'hex');
  v_param_set      uuid;
  v_option         jsonb;
  v_option_id      uuid;
  v_line           jsonb;
  v_discount       jsonb;
  v_markets        market[];
  v_campaign_start date;
  v_campaign_end   date;
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

    v_campaign_start := nullif(v_option->>'campaign_start', '')::date;
    v_campaign_end   := nullif(v_option->>'campaign_end', '')::date;

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
      margin_rate, max_lead_time_days, calculated_at
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

-- =============================================================================
-- accept_public_proposal, ronda 3: bloquea la aceptación si, para cuando se
-- acepta, otro presupuesto de otro cliente ya se aceptó para el mismo
-- soporte, mercado y fechas solapadas. Cubre la carrera entre dos
-- presupuestos que compiten por el mismo hueco: el primero en aceptar se lo
-- lleva, el segundo choca aquí.
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
  p_signer_role                text,
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
  v_campaign_start   date;
  v_campaign_end     date;
  v_conflict_line    record;
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

  select id, campaign_start, campaign_end into v_option_id, v_campaign_start, v_campaign_end
  from proposal_options
  where proposal_id = v_proposal.id and code = p_option_code;
  if v_option_id is null then
    raise exception 'Opción desconocida: %', p_option_code;
  end if;

  for v_conflict_line in
    select support_id, market from proposal_option_lines where option_id = v_option_id
  loop
    if has_accepted_availability_conflict(
         v_conflict_line.support_id, v_conflict_line.market,
         v_campaign_start, v_campaign_end, v_proposal.account_id, v_proposal.id
       ) then
      raise exception
        'No se puede aceptar: % en % ya lo aceptó otro cliente en fechas solapadas.',
        v_conflict_line.support_id, v_conflict_line.market;
    end if;
  end loop;

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
