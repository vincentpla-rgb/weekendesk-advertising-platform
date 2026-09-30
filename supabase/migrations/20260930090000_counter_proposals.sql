-- =============================================================================
-- Ronda 16 (CLAUDE.md §5.4/§5.5, §8, §10.3): flujo de contrapropuesta del
-- cliente, con revisión interna. Cuatro bloques:
--   1. Rol de administrador (profiles.is_admin).
--   2. `counter_proposals`: lo que el cliente propone al pulsar "Proponer
--      cambios" en vez de "Rechazar" — nuevo estado COUNTERED del envío.
--   3. `submit_counter_proposal` (pública, anon) y `accept_counter_proposal`/
--      `reject_counter_proposal` (equipo, con comprobación de propietario o
--      administrador).
--   4. Grants.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Bloque 1: rol de administrador
-- -----------------------------------------------------------------------------
-- Booleano, no un enum: solo hay dos estados, igual convención que
-- `profiles.is_active` en la misma tabla. Dar el rol a otra persona en el
-- futuro es un UPDATE de una columna desde el dashboard de Supabase — cero
-- código nuevo (CLAUDE.md, ronda 16, bloque 1: "fácil dar este rol... sin
-- tocar código").
alter table profiles add column is_admin boolean not null default false;

comment on column profiles.is_admin is
  'Administrador/superusuario (ronda 16): puede decidir sobre CUALQUIER '
  'contrapropuesta, no solo las suyas (ver accept_counter_proposal/'
  'reject_counter_proposal). Vincent Pla queda marcado en esta misma '
  'migración; dar el rol a otra persona no necesita código, solo UPDATE.';

-- Vincent Pla, marcado explícitamente (dato de seed, no lógica de permisos —
-- la comprobación en tiempo de ejecución siempre lee `is_admin`, nunca un
-- email). No-op si su fila de `profiles` todavía no existe (no ha hecho su
-- primer login todavía en el proyecto real) — documentado en CLAUDE.md §9
-- como paso manual pendiente en ese caso.
update profiles set is_admin = true where email = 'vincent.pla@weekendesk.fr';

-- Protección: `profiles` tiene la política `team_all` (CLAUDE.md §10.1),
-- que ya deja a CUALQUIER miembro de equipo actualizar CUALQUIER fila de
-- `profiles` — necesario para que, p. ej., alguien pueda desactivar el
-- acceso de otro desde `/admin/users`. Sin esta protección, esa misma
-- política dejaría a cualquiera auto-promoverse escribiendo
-- `is_admin = true` en su propia fila con una llamada directa al SDK,
-- saltándose cualquier interfaz. Mismo principio de seguridad que
-- `app_metadata.must_change_password` (ronda 15, CLAUDE.md §10.3
-- quindecies): el campo sensible solo lo puede escribir la clave de
-- servicio, nunca la sesión de un usuario normal.
-- OJO: nunca SECURITY DEFINER aquí — dentro de una función SECURITY DEFINER,
-- `current_user` pasa a ser el DUEÑO de la función (quien aplicó la
-- migración), no quien de verdad ejecuta el UPDATE. Reproducido contra
-- Postgres real antes de fijar esto: con SECURITY DEFINER, ni siquiera
-- `service_role` conseguía cambiar `is_admin` — el trigger comparaba el
-- current_user EQUIVOCADO. Con la función normal (SECURITY INVOKER, la
-- opción por defecto), `current_user` es el rol que de verdad ejecuta la
-- sentencia, que es justo lo que hay que comprobar.
create or replace function protect_profiles_is_admin() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.is_admin is distinct from old.is_admin and current_user <> 'service_role' then
    raise exception 'Solo la clave de servicio puede cambiar profiles.is_admin.';
  end if;
  return new;
end;
$$;

create trigger profiles_protect_is_admin
  before update on profiles
  for each row execute function protect_profiles_is_admin();

-- El UPDATE de seed de arriba corre con el rol que aplica esta migración
-- (normalmente el superusuario del proyecto, no `service_role`) — se
-- desactiva el trigger solo para esa sentencia, ya aplicada más arriba.
-- (La sentencia UPDATE ya se ejecutó antes de crear el trigger, así que no
-- hace falta desactivar nada aquí: el orden de este fichero ya lo evita.)

-- -----------------------------------------------------------------------------
-- Bloque 2: contrapropuesta del cliente
-- -----------------------------------------------------------------------------
-- Estado nuevo del envío: el cliente propuso cambios en vez de rechazar sin
-- más, o de aceptar tal cual. Se congela igual que REJECTED/ACCEPTED
-- (CLAUDE.md §5.4): nadie vuelve a tocar esta fila.
alter type proposal_status add value 'COUNTERED';

create type counter_proposal_status as enum ('PENDING', 'ACCEPTED', 'REJECTED');

-- No se reutiliza `proposals`/`proposal_option_lines`: esas tablas están
-- acopladas al motor de precios (docenas de columnas calculadas por el
-- motor de coeficientes) que un número tecleado por el cliente no tiene ni
-- debe fingir tener. `rejections.counter_proposal_id` (existente desde la
-- primera migración) tampoco se reutiliza aquí: apunta a `proposals`, y
-- describe un flujo distinto (un comercial construye manualmente un
-- presupuesto nuevo tras un rechazo simple, sin datos del cliente) que
-- sigue sin implementarse — el rechazo simple (CLAUDE.md §5.4, sin
-- contrapropuesta) sigue yendo por ese camino, intacto.
--
-- `lines` guarda un objeto por línea de la opción original — INCLUIDAS las
-- eliminadas (con `deleted: true`, nunca borradas del array): la revisión
-- interna necesita ver qué quitó el cliente, no que desaparezca sin
-- rastro. Cada objeto lleva el valor ORIGINAL y el que tecleó el cliente,
-- para pintar el diff sin volver a consultar `frozen_snapshot` aparte:
--   { "support_id": "ON-01", "market": "FR", "deleted": false,
--     "original_price_cents": 43000, "original_quantity": 4,
--     "client_price_cents": 35000, "client_quantity": 3 }
--
-- Fechas/duración: por OPCIÓN, no por línea — igual que en `proposal_options`
-- (CLAUDE.md §5.1: "las fechas de campaña son de cada opción, no del
-- envío"). El cliente edita el periodo UNA VEZ para toda la contrapropuesta,
-- no línea a línea: introducir fechas por línea sería inventar un concepto
-- que no existe en ningún otro sitio del esquema.
--
-- Captura fiscal: mismos campos que `acceptances` (CLAUDE.md §6), recogidos
-- AL MISMO TIEMPO que la contraoferta — para que "Aceptar" (bloque 3) pueda
-- cerrar el trato en un solo paso, sin pedirle al cliente los datos fiscales
-- una segunda vez.
create table counter_proposals (
  id                        uuid primary key default gen_random_uuid(),
  proposal_id               uuid not null unique references proposals (id) on delete cascade,
  option_code               text not null check (option_code in ('A', 'B', 'C')),
  option_name               text,

  status                    counter_proposal_status not null default 'PENDING',
  lines                     jsonb not null,

  campaign_start            date,
  campaign_end              date,
  campaign_duration_count   integer check (campaign_duration_count is null or campaign_duration_count > 0),
  campaign_duration_unit    text check (campaign_duration_unit is null or campaign_duration_unit in ('WEEK', 'MONTH')),
  constraint counter_proposals_campaign_dates_ordered
    check (campaign_end is null or campaign_start is null or campaign_end >= campaign_start),

  legal_name                text not null,
  billing_address           text not null,
  vat_number                text,
  billing_contact_name      text not null,
  billing_contact_email     text not null,
  signer_name               text not null,
  signer_role               text not null,
  purchase_order_reference  text,
  vies_check_id             uuid references vies_checks (id),

  submitted_at              timestamptz not null default now(),
  reviewed_at               timestamptz,
  reviewed_by               uuid references profiles (id),
  rejection_reason          text,
  -- El presupuesto nuevo (version+1, ACCEPTED) creado al aceptar (bloque 3).
  resulting_proposal_id     uuid references proposals (id),

  constraint counter_proposals_rejection_needs_reason
    check (status <> 'REJECTED' or length(btrim(coalesce(rejection_reason, ''))) > 0)
);

create index counter_proposals_proposal_idx on counter_proposals (proposal_id);

comment on column counter_proposals.lines is
  'Un objeto por línea de la opción contada, original Y editado, incluidas '
  'las líneas eliminadas (deleted: true, nunca borradas del array). Nunca '
  'pasa por el motor de precios (CLAUDE.md §8, ronda 16, bloque 2): son '
  'números tecleados por el cliente, sin coeficientes ni descuentos.';

alter table counter_proposals enable row level security;

-- Solo lectura para el equipo (visibilidad, igual que /proposals hoy). Las
-- mutaciones de estado pasan EXCLUSIVAMENTE por accept_counter_proposal/
-- reject_counter_proposal (bloque 3, SECURITY DEFINER): a propósito no hay
-- ninguna política de escritura aquí, así que ni siquiera una llamada
-- directa al SDK saltándose la interfaz podría cambiar su estado sin pasar
-- por el check de propietario/administrador de esas dos funciones.
create policy team_read on counter_proposals for select to authenticated using (is_team_member());

-- -----------------------------------------------------------------------------
-- Bloque 3a: envío de la contrapropuesta (pública, anon)
-- -----------------------------------------------------------------------------
-- Valida que el envío siga en SENT/VIEWED, que la opción exista, y que
-- ningún soporte+mercado de `p_lines` sea nuevo (CLAUDE.md, ronda 16, bloque
-- 2: "el cliente NO puede añadir soportes nuevos del catálogo") — cada
-- entrada debe corresponder a una línea YA existente en la opción contada.
create or replace function submit_counter_proposal(
  p_token                     text,
  p_option_code               text,
  p_lines                     jsonb,
  p_campaign_start            date,
  p_campaign_end              date,
  p_campaign_duration_count   integer,
  p_campaign_duration_unit    text,
  p_legal_name                text,
  p_billing_address           text,
  p_vat_number                text,
  p_billing_contact_name      text,
  p_billing_contact_email     text,
  p_signer_name               text,
  p_signer_role               text,
  p_purchase_order_reference  text,
  p_vies_result               vies_result,
  p_vies_raw                  jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proposal        proposals%rowtype;
  v_option          proposal_options%rowtype;
  v_line            jsonb;
  v_existing_count  integer;
  v_vies_id         uuid;
  v_counter_id      uuid;
begin
  select * into v_proposal from proposals where public_token = p_token;
  if not found then
    raise exception 'Enlace no válido';
  end if;
  if v_proposal.status not in ('SENT', 'VIEWED') then
    raise exception 'Este envío ya no admite respuesta (%)', v_proposal.status;
  end if;

  select * into v_option
  from proposal_options
  where proposal_id = v_proposal.id and code = p_option_code;
  if not found then
    raise exception 'Opción % no encontrada en este envío', p_option_code;
  end if;

  -- Ningún support_id+market de p_lines puede ser ajeno a esta opción.
  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    select count(*) into v_existing_count
    from proposal_option_lines
    where option_id = v_option.id
      and support_id = (v_line->>'support_id')
      and market = (v_line->>'market')::market;
    if v_existing_count = 0 then
      raise exception 'La línea % / % no forma parte de la opción enviada', v_line->>'support_id', v_line->>'market';
    end if;
  end loop;

  insert into vies_checks (account_id, vat_number, result, raw_response)
  values (v_proposal.account_id, coalesce(p_vat_number, ''), p_vies_result, p_vies_raw)
  returning id into v_vies_id;

  insert into counter_proposals (
    proposal_id, option_code, option_name, lines,
    campaign_start, campaign_end, campaign_duration_count, campaign_duration_unit,
    legal_name, billing_address, vat_number, billing_contact_name, billing_contact_email,
    signer_name, signer_role, purchase_order_reference, vies_check_id
  ) values (
    v_proposal.id, p_option_code, v_option.name, p_lines,
    p_campaign_start, p_campaign_end, p_campaign_duration_count, p_campaign_duration_unit,
    p_legal_name, p_billing_address, nullif(p_vat_number, ''), p_billing_contact_name, p_billing_contact_email,
    p_signer_name, p_signer_role, nullif(p_purchase_order_reference, ''), v_vies_id
  )
  returning id into v_counter_id;

  update proposals set status = 'COUNTERED', decided_at = now() where id = v_proposal.id;

  insert into proposal_events (proposal_id, event_type, payload)
  values (v_proposal.id, 'countered', jsonb_build_object('option_code', p_option_code, 'counter_proposal_id', v_counter_id));

  return jsonb_build_object('counter_proposal_id', v_counter_id);
end;
$$;

revoke all on function submit_counter_proposal(
  text, text, jsonb, date, date, integer, text, text, text, text, text, text, text, text, text, vies_result, jsonb
) from public;
grant execute on function submit_counter_proposal(
  text, text, jsonb, date, date, integer, text, text, text, text, text, text, text, text, text, vies_result, jsonb
) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Bloque 3b: quién puede decidir — solo el propietario del presupuesto o un
-- administrador (CLAUDE.md, ronda 16, bloque 3, punto 9). Acotado a esta
-- funcionalidad: no toca el acceso general de /proposals, intencionalmente
-- abierto a todo el equipo (team_all sigue igual en el resto de tablas).
-- -----------------------------------------------------------------------------
create or replace function is_admin_or_proposal_owner(p_proposal_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and is_admin)
      or exists (select 1 from proposals where id = p_proposal_id and owner_id = auth.uid());
$$;

-- -----------------------------------------------------------------------------
-- Bloque 3c: aceptar la contrapropuesta — cierra el trato en un solo paso
-- (CLAUDE.md, ronda 16, bloque 3, punto 7). Crea un presupuesto NUEVO
-- (version+1, supersedes_id — vestigiales desde la primera migración, su
-- primer uso real), con las líneas tal como las tecleó el cliente (nunca
-- recalculadas por el motor de coeficientes), directamente en ACCEPTED. El
-- original se queda en COUNTERED para siempre, registro histórico.
--
-- El margen por debajo del suelo del 50 % NUNCA es un bloqueo aquí (CLAUDE.md,
-- ronda 16, bloque 3, punto 8): si se fuerza, se registra en `overrides`
-- (kind MARGIN_BELOW_FLOOR, previsto en el enum desde la primera migración,
-- nunca usado hasta esta ronda) con autor, motivo y marca de tiempo — el
-- MISMO patrón que LEAD_TIME_FORCED (ronda 11) y MEDIA_FEE_FORCED (ronda 10).
--
-- Sí se revalida `has_accepted_availability_conflict`: es un compromiso
-- físico con otro cliente, no una regla de precio — no lo derrota una
-- contrapropuesta, igual que no lo derrota forzar la antelación (§5.3).
create or replace function accept_counter_proposal(
  p_counter_proposal_id uuid,
  p_margin_overrides    jsonb  -- [{ "support_id": "ON-01", "market": "FR", "reason": "..." }, ...]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cp              counter_proposals%rowtype;
  v_proposal        proposals%rowtype;
  v_new_proposal_id uuid := gen_random_uuid();
  v_new_option_id   uuid;
  v_line            jsonb;
  v_markets         market[];
  v_override        jsonb;
  v_acceptance_id   uuid;
  v_owner           uuid;
  -- Mismo mecanismo de numeración secuencial que create_and_send_proposal
  -- (CLAUDE.md §10.3 octies, ronda 8): un presupuesto ACEPTADO nuevo
  -- necesita su propio número, `proposals.proposal_number` es NOT NULL.
  v_year            integer := extract(year from now())::int;
  v_seq             integer;
  v_number          text;
begin
  select * into v_cp from counter_proposals where id = p_counter_proposal_id;
  if not found then
    raise exception 'Contrapropuesta no encontrada';
  end if;
  if v_cp.status <> 'PENDING' then
    raise exception 'Esta contrapropuesta ya se decidió (%)', v_cp.status;
  end if;

  select * into v_proposal from proposals where id = v_cp.proposal_id;

  if not is_admin_or_proposal_owner(v_proposal.id) then
    raise exception 'Solo el creador de este presupuesto o un administrador pueden decidir sobre esta contrapropuesta';
  end if;

  -- Disponibilidad: sigue aplicando, sin excepción (CLAUDE.md §3, §5.3).
  for v_line in select * from jsonb_array_elements(v_cp.lines)
  loop
    if not (v_line->>'deleted')::boolean then
      if has_accepted_availability_conflict(
           v_line->>'support_id', (v_line->>'market')::market,
           v_cp.campaign_start, v_cp.campaign_end, v_proposal.account_id, v_proposal.id
         ) then
        raise exception
          '% en % ya lo aceptó otro cliente en fechas solapadas: no se puede aceptar esta contrapropuesta.',
          v_line->>'support_id', v_line->>'market';
      end if;
    end if;
  end loop;

  select array_agg(distinct (elem->>'market')::market) into v_markets
  from jsonb_array_elements(v_cp.lines) elem
  where not (elem->>'deleted')::boolean;

  v_owner := v_proposal.owner_id;

  insert into proposal_number_counters (year, last_seq)
  values (v_year, 1)
  on conflict (year) do update set last_seq = proposal_number_counters.last_seq + 1
  returning last_seq into v_seq;
  v_number := v_year || '-' || lpad(v_seq::text, 3, '0');

  -- sent_proposal_is_frozen (esquema inicial) exige frozen_snapshot no nulo
  -- para cualquier estado que no sea DRAFT: aquí no hay un payload de
  -- create_and_send_proposal que congelar, así que se construye uno propio,
  -- con la contrapropuesta y el forzado de margen como fuente — mismo
  -- espíritu (registro fiel de lo que se congeló), forma distinta porque el
  -- origen es distinto (CLAUDE.md §5.4, ronda 16).
  insert into proposals (
    id, account_id, contact_id, owner_id, parameter_set_id, proposal_number,
    version, supersedes_id, status, language, brief, public_token,
    sent_at, decided_at, frozen_snapshot
  )
  values (
    v_new_proposal_id, v_proposal.account_id, v_proposal.contact_id, v_owner, v_proposal.parameter_set_id, v_number,
    v_proposal.version + 1, v_proposal.id, 'ACCEPTED', v_proposal.language, v_proposal.brief,
    encode(extensions.gen_random_bytes(24), 'hex'),
    now(), now(),
    jsonb_build_object(
      'source', 'counter_proposal',
      'counter_proposal_id', p_counter_proposal_id,
      'option_code', v_cp.option_code,
      'option_name', v_cp.option_name,
      'markets', to_jsonb(coalesce(v_markets, '{}'::market[])),
      'campaign_start', v_cp.campaign_start,
      'campaign_end', v_cp.campaign_end,
      'campaign_duration_count', v_cp.campaign_duration_count,
      'campaign_duration_unit', v_cp.campaign_duration_unit,
      'lines', v_cp.lines,
      'margin_overrides', coalesce(p_margin_overrides, '[]'::jsonb)
    )
  );

  insert into proposal_options (
    id, proposal_id, code, name, pitch, sort_order,
    markets, campaign_start, campaign_end, campaign_duration_count, campaign_duration_unit,
    billed_total_cents, calculated_at
  )
  select
    gen_random_uuid(), v_new_proposal_id, v_cp.option_code, coalesce(v_cp.option_name, v_cp.option_code), null, 0,
    coalesce(v_markets, '{}'), v_cp.campaign_start, v_cp.campaign_end, v_cp.campaign_duration_count, v_cp.campaign_duration_unit,
    (select sum((l->>'client_price_cents')::bigint) from jsonb_array_elements(v_cp.lines) l where not (l->>'deleted')::boolean),
    now()
  returning id into v_new_option_id;

  for v_line in select * from jsonb_array_elements(v_cp.lines)
  loop
    if not (v_line->>'deleted')::boolean then
      insert into proposal_option_lines (
        option_id, support_id, market, quantity,
        net_price_cents, billed_total_cents, sort_order
      ) values (
        v_new_option_id, v_line->>'support_id', (v_line->>'market')::market,
        (v_line->>'client_quantity')::numeric,
        (v_line->>'client_price_cents')::bigint, (v_line->>'client_price_cents')::bigint, 0
      );

      -- Margen forzado por debajo del suelo (bloque 3, punto 8): un aviso,
      -- nunca un bloqueo — se registra si el AM lo fuerza explícitamente.
      for v_override in select * from jsonb_array_elements(coalesce(p_margin_overrides, '[]'::jsonb))
      loop
        if v_override->>'support_id' = v_line->>'support_id' and v_override->>'market' = v_line->>'market' then
          insert into overrides (proposal_id, option_id, support_id, kind, reason, created_by)
          values (v_new_proposal_id, v_new_option_id, v_line->>'support_id', 'MARGIN_BELOW_FLOOR', v_override->>'reason', auth.uid());
        end if;
      end loop;
    end if;
  end loop;

  insert into acceptances (
    proposal_id, option_id, legal_name, billing_address, vat_number,
    billing_contact_name, billing_contact_email, signer_name, signer_role,
    purchase_order_reference, vies_check_id, vat_regime_applied
  )
  select
    v_new_proposal_id, v_new_option_id, v_cp.legal_name, v_cp.billing_address, v_cp.vat_number,
    v_cp.billing_contact_name, v_cp.billing_contact_email, v_cp.signer_name, v_cp.signer_role,
    v_cp.purchase_order_reference, v_cp.vies_check_id,
    (case
      when upper(coalesce((select country_code from accounts where id = v_proposal.account_id), '')) = 'FR' then 'FR_VAT_20'
      when (select result from vies_checks where id = v_cp.vies_check_id) = 'VALID' then 'REVERSE_CHARGE'
      else 'FR_VAT_20'
    end)::vat_regime
  returning id into v_acceptance_id;

  update counter_proposals
     set status = 'ACCEPTED', reviewed_at = now(), reviewed_by = auth.uid(), resulting_proposal_id = v_new_proposal_id
   where id = p_counter_proposal_id;

  insert into proposal_events (proposal_id, event_type, payload)
  values (v_new_proposal_id, 'accepted', jsonb_build_object('from_counter_proposal_id', p_counter_proposal_id));

  return jsonb_build_object('new_proposal_id', v_new_proposal_id, 'acceptance_id', v_acceptance_id);
end;
$$;

revoke all on function accept_counter_proposal(uuid, jsonb) from public;
grant execute on function accept_counter_proposal(uuid, jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- Bloque 3d: rechazar la contrapropuesta — motivo obligatorio (CLAUDE.md,
-- ronda 16, bloque 3, punto 7 y bloque 4). Distinto del motivo que ya
-- escribe el CLIENTE al rechazar sin contrapropuesta (rejections.reason,
-- CLAUDE.md §5.4): son dos campos separados, con propósitos distintos, uno
-- no sustituye al otro. El email al cliente (bloque 4) lo manda la capa de
-- aplicación (Server Action), no esta función — igual que el resto del
-- esquema nunca llama a Resend desde SQL.
create or replace function reject_counter_proposal(p_counter_proposal_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cp       counter_proposals%rowtype;
begin
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'El motivo de rechazo es obligatorio';
  end if;

  select * into v_cp from counter_proposals where id = p_counter_proposal_id;
  if not found then
    raise exception 'Contrapropuesta no encontrada';
  end if;
  if v_cp.status <> 'PENDING' then
    raise exception 'Esta contrapropuesta ya se decidió (%)', v_cp.status;
  end if;

  if not is_admin_or_proposal_owner(v_cp.proposal_id) then
    raise exception 'Solo el creador de este presupuesto o un administrador pueden decidir sobre esta contrapropuesta';
  end if;

  update counter_proposals
     set status = 'REJECTED', rejection_reason = p_reason, reviewed_at = now(), reviewed_by = auth.uid()
   where id = p_counter_proposal_id;

  update proposals set status = 'REJECTED', decided_at = now() where id = v_cp.proposal_id;

  insert into proposal_events (proposal_id, event_type, payload)
  values (v_cp.proposal_id, 'counter_proposal_rejected', jsonb_build_object('reason', p_reason));

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function reject_counter_proposal(uuid, text) from public;
grant execute on function reject_counter_proposal(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Bloque 4: grants de tabla
-- -----------------------------------------------------------------------------
grant select on table counter_proposals to authenticated;

-- -----------------------------------------------------------------------------
-- Bloque 5: get_public_proposal expone el precio POR LÍNEA (ronda 16)
-- -----------------------------------------------------------------------------
-- Hasta ahora solo se exponía `billed_total_cents` a nivel de OPCIÓN — nunca
-- por línea (CLAUDE.md §6: "un único importe por línea de media buy, nunca
-- el desglose", ya cumplido porque no había NINGÚN precio de línea en
-- absoluto). El formulario de "Proponer cambios" (ronda 16, bloque 2, punto
-- 3) necesita mostrar y dejar editar el precio de CADA línea — sin esto no
-- hay nada que editar. Se añade `billed_total_cents` por línea, el mismo
-- campo que ya se exponía a nivel de opción — no el desglose de medios
-- (fee/importe real al medio siguen sin exponerse, la regla de §6 sigue
-- intacta para eso).
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
                            'support_id',         l.support_id,
                            'support_name',       s.name,
                            'channel',            s.channel,
                            'unit',               s.unit,
                            'market',             l.market,
                            'quantity',           l.quantity,
                            'billed_total_cents', l.billed_total_cents,
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
