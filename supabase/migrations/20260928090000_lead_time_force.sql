-- =============================================================================
-- Ronda 11 (CLAUDE.md §5.3, §10.3 undecies): de los cuatro bloqueos duros
-- previos al envío, solo la antelación insuficiente (LEAD_TIME_INSUFFICIENT)
-- se puede forzar a mano — una decisión de negocio legítima (p. ej. un
-- cliente grande acepta el riesgo de un plazo ajustado). Los otros tres
-- (fechas de campaña invertidas, presupuesto de medios vacío, conflicto de
-- disponibilidad con un presupuesto ya ACEPTADO) son errores de datos o
-- compromisos ya cerrados con otro cliente, no decisiones de negocio: no
-- tienen ni han tenido nunca ningún mecanismo de forzado, ni aquí ni en
-- `checks.ts`, y esta migración no les añade ninguno.
--
-- `override_kind.LEAD_TIME_FORCED` ya existe en el enum desde la primera
-- migración (`20260918120000_initial_schema.sql`) — nadie lo usaba todavía.
-- Esta es su primera implementación real.
-- =============================================================================

alter table overrides
  add column market market;

comment on column overrides.market is
  'Solo para LEAD_TIME_FORCED (CLAUDE.md §5.3, ronda 11): la antelación '
  'insuficiente es por soporte+mercado, no por soporte entero (el calendario '
  'de festivos es por mercado, §5.3) — a diferencia de MEDIA_FEE_FORCED '
  '(ronda 10), que se aplica igual en todos los mercados de la opción. NULL '
  'en el resto de kinds.';

alter table proposal_option_lines
  add column lead_time_forced boolean not null default false,
  add column lead_time_force_reason text;

comment on column proposal_option_lines.lead_time_forced is
  'CLAUDE.md §5.3, ronda 11: constancia visible, en el detalle interno del '
  'presupuesto, de que la antelación insuficiente de esta línea se forzó a '
  'mano. El registro de auditoría (autor, marca de tiempo) vive en '
  '`overrides` (kind LEAD_TIME_FORCED); esta columna es la denormalización '
  'de lectura, mismo patrón que manual_fee_cents (ronda 10).';

-- =============================================================================
-- create_and_send_proposal, ronda 11: igual que la versión anterior
-- (20260927090000_media_fee_split.sql), con `lead_time_forced`/
-- `lead_time_force_reason` persistidos por línea y, por cada entrada de
-- `lead_time_overrides` en el payload de la opción, una fila en `overrides`
-- (kind LEAD_TIME_FORCED, soporte, mercado, motivo del comercial, autor,
-- marca de tiempo). El control de antelación en sí NO se revalida aquí —
-- sigue siendo, como antes de esta ronda, solo un control de la interfaz
-- (CLAUDE.md §5.3, ronda 9): esta función solo dEJA CONSTANCIA de que el
-- comercial lo forzó, no decide si hacía falta forzarlo.
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
  v_lead_override  jsonb;
  v_markets        market[];
  v_campaign_start date;
  v_campaign_end   date;
  v_volume_disabled boolean;
  v_manual_fee_cents bigint;
  v_lead_time_forced boolean;
  v_lead_time_reason text;
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
    -- presupuesto ya aceptado de otro cliente (CLAUDE.md §3, §5.3). Bloqueo
    -- duro: no forzable, ni aquí ni en ningún otro sitio (ronda 11).
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
      v_lead_time_forced := coalesce((v_line->>'lead_time_forced')::boolean, false);
      v_lead_time_reason := nullif(v_line->>'lead_time_force_reason', '');

      insert into proposal_option_lines (
        option_id, support_id, market, quantity, media_budget_cents, media_months,
        is_lead_market, unit_cost_cents, cost_cents, gross_price_cents,
        margin_floor_cents, floor_applied, list_price_cents, discount_cents,
        net_price_cents, manual_fee_cents, manual_fee_reason, media_real_spend_cents,
        lead_time_forced, lead_time_force_reason,
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
        v_lead_time_forced,
        v_lead_time_reason,
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

    -- Antelación insuficiente forzada a mano (CLAUDE.md §5.3, ronda 11): una
    -- fila en overrides por cada soporte+mercado forzado — a diferencia del
    -- reparto de medios (ronda 10), aquí SÍ varía por mercado (el calendario
    -- de festivos es por mercado), así que no se deduplica por soporte.
    for v_lead_override in select * from jsonb_array_elements(coalesce(v_option->'lead_time_overrides', '[]'::jsonb))
    loop
      insert into overrides (proposal_id, option_id, support_id, market, kind, reason, created_by)
      values (
        v_proposal_id, v_option_id,
        v_lead_override->>'support_id', (v_lead_override->>'market')::market,
        'LEAD_TIME_FORCED', v_lead_override->>'reason', v_owner_id
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
    'proposal_number', v_number,
    'public_token', v_token,
    'contact_email', (select email from contacts where id = v_contact_id),
    'contact_full_name', (select full_name from contacts where id = v_contact_id),
    'contact_language', (select language from contacts where id = v_contact_id),
    'account_legal_name', (select legal_name from accounts where id = v_account_id)
  );
end;
$$;
