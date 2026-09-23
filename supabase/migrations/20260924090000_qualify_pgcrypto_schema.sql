-- =============================================================================
-- Bug real en producción: "function gen_random_bytes(integer) does not exist"
-- al enviar un presupuesto (CLAUDE.md §10.3 quinquies).
--
-- Causa: create_and_send_proposal genera el token público con
-- encode(gen_random_bytes(24), 'hex'), sin cualificar el esquema. En un
-- proyecto Supabase real la extensión pgcrypto vive en el esquema
-- "extensions" (confirmado por Vincent: `select extname from pg_extension
-- where extname = 'pgcrypto'` sí devuelve una fila — la extensión SÍ está
-- instalada), no en "public". Todas las funciones SECURITY DEFINER/INVOKER
-- de este esquema fijan `set search_path = public` a propósito (buena
-- práctica de seguridad, evita el secuestro de search_path en funciones
-- privilegiadas) — pero eso significa que ninguna de ellas ve "extensions"
-- en su search_path, así que gen_random_bytes (sin cualificar) no se
-- encuentra fuera de un entorno donde alguien haya creado pgcrypto en
-- "public" a mano.
--
-- El entorno de desarrollo de este repo (sin proyecto Supabase real, ver
-- CLAUDE.md §10.1.2) siempre ha creado pgcrypto con
-- `create extension if not exists "pgcrypto"` (20260918120000_initial_schema
-- .sql) sobre una base de datos nueva, donde el esquema por defecto es
-- "public" — así que la extensión SÍ acababa en "public" localmente, y
-- ningún script de verificación (contra Postgres real) reprodujo nunca este
-- fallo. En el proyecto Supabase real, pgcrypto YA estaba instalada en
-- "extensions" antes de aplicar ninguna migración de este repo, así que ese
-- mismo `create extension if not exists` no hizo nada — la extensión nunca
-- llegó a existir en "public" ahí.
--
-- Arreglo, robusto y no un search_path frágil (no se añade "extensions" al
-- search_path de la función, que reabriría el problema que ese search_path
-- fijo evita): cualificar la llamada explícitamente como
-- extensions.gen_random_bytes(...). Una referencia cualificada por esquema
-- ignora el search_path por completo, así que funciona sea cual sea dónde
-- esté pgcrypto en cada entorno — con tal de que exista alguna copia en el
-- esquema "extensions" (el caso real de Supabase) o, en un entorno que solo
-- la tenga en "public", con un sinónimo — ver más abajo.
--
-- Único sitio afectado en todo el esquema: create_and_send_proposal es la
-- ÚNICA función que llama a una función de pgcrypto (gen_random_bytes, para
-- el token público). Comprobado con un barrido completo de
-- supabase/migrations/*.sql: ninguna otra función (accept_public_proposal,
-- reject_public_proposal, mark_proposal_sent, log_proposal_send_failure,
-- get_public_proposal, mark_public_proposal_viewed,
-- has_accepted_availability_conflict...) usa gen_random_bytes, encode(),
-- digest(), crypt() ni hmac() — todos los demás usos de aleatoriedad son
-- gen_random_uuid(), que es una función nativa de PostgreSQL 13+ (no
-- depende de pgcrypto ni de ningún esquema de extensión: siempre está en
-- pg_catalog, que siempre forma parte del search_path efectivo). No hace
-- falta tocar nada más.
--
-- No se edita la migración original (20260923100000_accepted_availability_
-- conflict.sql, la que definía la versión de create_and_send_proposal que
-- estaba en producción): una migración ya aplicada no se reescribe. Esta
-- migración nueva vuelve a definir la función completa (create or replace),
-- igual salvo esa única línea, y sustituye en el proyecto real cualquiera
-- que sea la versión que esté viva ahí ahora mismo — el nombre y la firma
-- (create_and_send_proposal(jsonb)) son los mismos en todas las versiones.
--
-- Para que esto funcione también en un entorno de desarrollo donde pgcrypto
-- se creó en "public" (como el de este repo hasta ahora, y como el de
-- scripts/verify-*.sh): se crea también un esquema "extensions" si no
-- existe, y se reinstala pgcrypto ahí si hiciera falta. `create extension
-- if not exists "pgcrypto" schema extensions` es un no-op si la extensión
-- ya existe en cualquier esquema (Postgres no permite dos copias de la
-- misma extensión), así que en el proyecto Supabase real (donde ya está en
-- "extensions") esto tampoco hace nada — y en local, la deja exactamente
-- donde este arreglo espera encontrarla.
-- =============================================================================

create schema if not exists extensions;

do $$
begin
  if not exists (
    select 1 from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'pgcrypto' and n.nspname = 'extensions'
  ) then
    -- Si pgcrypto ya existe en OTRO esquema (p. ej. "public", como en este
    -- entorno de desarrollo hasta ahora), hay que moverla: Postgres no deja
    -- crear una segunda copia de la misma extensión en otro esquema.
    if exists (select 1 from pg_extension where extname = 'pgcrypto') then
      alter extension pgcrypto set schema extensions;
    else
      create extension "pgcrypto" schema extensions;
    end if;
  end if;
end $$;

-- No dar por hecho que "extensions" ya trae USAGE concedido a los roles de
-- Supabase (esa misma suposición implícita fue exactamente el Bug A de
-- CLAUDE.md §10.3: un GRANT que Supabase parecía conceder solo y que, en un
-- proyecto real, no estaba). Aquí no es solo cautela: reproducido contra
-- Postgres real (scripts/verify-accepted-availability.sh, que crea
-- pgcrypto en "public" y por tanto obliga a este bloque a mover la
-- extensión a un esquema "extensions" recién creado, SIN grants previos)
-- que sin esta línea la llamada falla con "permission denied for schema
-- extensions" — un error de USAGE de esquema, distinto y anterior al de
-- EXECUTE sobre la función. Se concede explícitamente, igual que
-- 20260918140100_grants.sql ya hace con "public" y
-- 20260919120000_service_role_grants.sql con las tablas de service_role.
grant usage on schema extensions to anon, authenticated, service_role;

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
