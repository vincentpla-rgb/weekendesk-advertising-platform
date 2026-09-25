#!/usr/bin/env bash
# Reproduce y verifica, contra un PostgreSQL 16 real, el forzado a mano de
# la antelación insuficiente (CLAUDE.md §5.3, §10.3 undecies, ronda 11) — el
# ÚNICO de los cuatro bloqueos duros previos al envío que se puede forzar:
#
#   - LEAD_TIME_INSUFFICIENT: forzable, con motivo obligatorio, registrado en
#     `overrides` (kind LEAD_TIME_FORCED) con autor y marca de tiempo, y
#     denormalizado en `proposal_option_lines.lead_time_forced` para el
#     detalle interno del presupuesto (§10.1.1).
#   - CAMPAIGN_DATES_INVALID, MEDIA_BUDGET_MISSING: solo se evalúan en la
#     interfaz (CLAUDE.md §5.3, ronda 9) — no llegan a create_and_send_proposal
#     como un bloqueo que forzar, así que no hay nada que verificar aquí más
#     allá de que la migración no les añade ningún camino.
#   - Conflicto de disponibilidad (`has_accepted_availability_conflict`): el
#     único de los cuatro que SÍ se revalida en el servidor — sigue
#     bloqueando incondicionalmente, sin ningún parámetro de payload que lo
#     esquive, ni siquiera con ruido adicional en el JSON.
#
# Casos:
#   1. Forzar antelación en un soporte+mercado: se persiste
#      lead_time_forced/lead_time_force_reason en la línea y se registra
#      EXACTAMENTE una fila en overrides (kind, soporte, mercado, motivo,
#      autor, marca de tiempo).
#   2. Sin forzado: ninguna fila en overrides, lead_time_forced en false.
#   3. El mismo soporte forzado en dos mercados: DOS filas en overrides (a
#      diferencia de MEDIA_FEE_FORCED, ronda 10, que se deduplica por
#      soporte — aquí la antelación varía por mercado, así que no se
#      deduplica).
#   4. El conflicto de disponibilidad sigue bloqueando incondicionalmente,
#      incluso con `lead_time_overrides` en el payload (ruido irrelevante:
#      no hay ningún parámetro que lo esquive).
#
# Uso: scripts/verify-lead-time-force.sh [nombre_de_base_de_datos]
set -euo pipefail

DB="${1:-wk_lead_time_force_verify}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATIONS_DIR="$REPO_ROOT/supabase/migrations"
WORKDIR="$(mktemp -d)"
chmod a+rx "$WORKDIR"
trap 'rm -rf "$WORKDIR"' EXIT

PSQL="sudo -u postgres psql -v ON_ERROR_STOP=1 -X -q"

pass() { echo "  OK   $1"; }
fail() { echo "  FAIL $1"; exit 1; }

# pgcrypto en un esquema `extensions` aparte, como Supabase de fábrica
# (CLAUDE.md §10.3 quinquies) — no en `public`.
cat > "$WORKDIR/00_supabase_shim.sql" <<'SQL'
create schema if not exists extensions;
create extension if not exists "pgcrypto" schema extensions;
create schema if not exists auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text);
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create or replace function auth.jwt() returns jsonb
language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true), '')::jsonb
$$;
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;
SQL

cp "$MIGRATIONS_DIR"/*.sql "$WORKDIR/"
chmod a+rX "$WORKDIR"/*.sql

$PSQL -c "drop database if exists $DB;" -c "create database $DB;" > /dev/null
$PSQL -d "$DB" -f "$WORKDIR/00_supabase_shim.sql" > /dev/null
for f in "$WORKDIR"/2026*.sql; do
  $PSQL -d "$DB" -f "$f" > /dev/null
done

VINCENT=11111111-1111-1111-1111-111111111111
VINCENT_EMAIL=vincent.pla@weekendesk.fr

$PSQL -d "$DB" -At <<SQL > /dev/null
insert into auth.users (id, email) values ('$VINCENT', '$VINCENT_EMAIL');
insert into allowed_emails (email) values ('$VINCENT_EMAIL');
insert into profiles (id, email, full_name, is_active) values ('$VINCENT', '$VINCENT_EMAIL', 'Vincent Pla', true);
SQL

as_team() {
  $PSQL -d "$DB" -At <<SQL
set role authenticated;
set request.jwt.claim.sub = '$VINCENT';
set request.jwt.claims = '{"sub":"$VINCENT","email":"$VINCENT_EMAIL","role":"authenticated"}';
$1
reset role;
SQL
}

# CRM-03 (no es media buy), en los mercados dados, con los lead_time_overrides
# dados (jsonb array literal, ya formado por el llamador).
payload() {
  local legal_name="$1" contact_email="$2" markets_json="$3" lead_overrides_json="$4"
  cat <<JSON
select create_and_send_proposal(jsonb_build_object(
  'account', jsonb_build_object('legal_name','$legal_name','country_code','FR'),
  'contact', jsonb_build_object('full_name','Contacto','email','$contact_email','language','FR'),
  'language','FR','brief','b',
  'options', jsonb_build_array(
    jsonb_build_object('code','A','name','Unica','pitch','p','sort_order',0,'markets',('$markets_json')::jsonb,
      'campaign_start','2027-05-01','campaign_end','2027-05-31',
      'gross_net_of_media_cents',40000,'effective_discount_cents',0,'net_revenue_cents',40000,
      'media_budget_cents',0,'billed_total_cents',40000,'cost_cents',14000,'margin_cents',26000,
      'margin_rate',0.65,'max_lead_time_business_days',10,'volume_discount_disabled',false,
      'lines', (
        select jsonb_agg(jsonb_build_object(
          'support_id','CRM-03','market',m,'quantity',1,'is_lead_market',(m = (('$markets_json')::jsonb->>0)),
          'unit_cost_cents',14000,'cost_cents',14000,'gross_price_cents',40000,'margin_floor_cents',28000,
          'floor_applied',false,'list_price_cents',40000,'discount_cents',0,'net_price_cents',40000,
          'lead_time_forced', coalesce((
            select true from jsonb_array_elements('$lead_overrides_json'::jsonb) o
            where o->>'support_id' = 'CRM-03' and o->>'market' = m
            limit 1
          ), false),
          'lead_time_force_reason', (
            select o->>'reason' from jsonb_array_elements('$lead_overrides_json'::jsonb) o
            where o->>'support_id' = 'CRM-03' and o->>'market' = m
            limit 1
          ),
          'billed_total_cents',40000,'sort_order',0))
        from jsonb_array_elements_text(('$markets_json')::jsonb) as m
      ),
      'discounts', '[]'::jsonb,
      'lead_time_overrides', ('$lead_overrides_json')::jsonb)
  )
));
JSON
}

echo "=== Caso 1: forzar antelación en un soporte+mercado ==="
R1="$(as_team "$(payload 'Office Uno' u1@example.com '["FR"]' '[{"support_id":"CRM-03","market":"FR","reason":"Cliente grande, acepta el riesgo del plazo."}]')")"
PID1="$(echo "$R1" | sed -n "s/.*\"proposal_id\": \"\([^\"]*\)\".*/\1/p")"

ROW1="$(as_team "
  select l.lead_time_forced, l.lead_time_force_reason
  from proposal_option_lines l
  join proposal_options po on po.id = l.option_id
  where po.proposal_id = '$PID1'::uuid;
")"
if [[ "$ROW1" == "t|Cliente grande, acepta el riesgo del plazo." ]]; then
  pass "lead_time_forced=true y el motivo se persisten en la línea"
else
  fail "se esperaba 't|Cliente grande, acepta el riesgo del plazo.', salió: $ROW1"
fi

OVERRIDES_1="$(as_team "select count(*) from overrides where proposal_id = '$PID1'::uuid;")"
if [[ "$OVERRIDES_1" == "1" ]]; then
  pass "exactamente una fila en overrides para el forzado"
else
  fail "se esperaba 1 fila en overrides, salieron $OVERRIDES_1"
fi

OVERRIDE_ROW="$(as_team "
  select kind, support_id, market, reason, created_by, (created_at is not null)
  from overrides where proposal_id = '$PID1'::uuid;
")"
if [[ "$OVERRIDE_ROW" == "LEAD_TIME_FORCED|CRM-03|FR|Cliente grande, acepta el riesgo del plazo.|$VINCENT|t" ]]; then
  pass "la fila de overrides tiene el kind, soporte, mercado, motivo, autor y marca de tiempo correctos"
else
  fail "se esperaba 'LEAD_TIME_FORCED|CRM-03|FR|Cliente grande, acepta el riesgo del plazo.|$VINCENT|t', salió: $OVERRIDE_ROW"
fi

echo "=== Caso 2: sin forzado, ninguna fila en overrides ==="
R2="$(as_team "$(payload 'Office Dos' u2@example.com '["FR"]' '[]')")"
PID2="$(echo "$R2" | sed -n "s/.*\"proposal_id\": \"\([^\"]*\)\".*/\1/p")"

ROW2="$(as_team "select l.lead_time_forced from proposal_option_lines l join proposal_options po on po.id = l.option_id where po.proposal_id = '$PID2'::uuid;")"
if [[ "$ROW2" == "f" ]]; then
  pass "lead_time_forced queda en false por defecto"
else
  fail "se esperaba false, salió $ROW2"
fi

OVERRIDES_2="$(as_team "select count(*) from overrides where proposal_id = '$PID2'::uuid;")"
if [[ "$OVERRIDES_2" == "0" ]]; then
  pass "sin forzado, no se escribe ninguna fila en overrides"
else
  fail "se esperaban 0 filas en overrides, salieron $OVERRIDES_2"
fi

echo "=== Caso 3: el mismo soporte forzado en dos mercados -> dos filas en overrides (no se deduplica por soporte) ==="
R3="$(as_team "$(payload 'Office Tres' u3@example.com '["FR","ES"]' '[{"support_id":"CRM-03","market":"FR","reason":"motivo FR"},{"support_id":"CRM-03","market":"ES","reason":"motivo ES"}]')")"
PID3="$(echo "$R3" | sed -n "s/.*\"proposal_id\": \"\([^\"]*\)\".*/\1/p")"

OVERRIDES_3="$(as_team "select count(*) from overrides where proposal_id = '$PID3'::uuid;")"
if [[ "$OVERRIDES_3" == "2" ]]; then
  pass "dos filas en overrides, una por mercado forzado — no se deduplica por soporte"
else
  fail "se esperaban 2 filas en overrides, salieron $OVERRIDES_3"
fi

MARKETS_3="$(as_team "select string_agg(market::text, ',' order by market::text) from overrides where proposal_id = '$PID3'::uuid;")"
if [[ "$MARKETS_3" == "ES,FR" ]]; then
  pass "cada fila lleva su propio mercado (ES y FR)"
else
  fail "se esperaba 'ES,FR', salió: $MARKETS_3"
fi

LINES_FORCED_3="$(as_team "select count(*) from proposal_option_lines l join proposal_options po on po.id = l.option_id where po.proposal_id = '$PID3'::uuid and l.lead_time_forced;")"
if [[ "$LINES_FORCED_3" == "2" ]]; then
  pass "las dos líneas (una por mercado) quedan marcadas como forzadas"
else
  fail "se esperaban 2 líneas forzadas, salieron $LINES_FORCED_3"
fi

echo "=== Caso 4: el conflicto de disponibilidad sigue bloqueando incondicionalmente, ronda 11 no le añade ningún forzado ==="
# Envía y ACEPTA un primer presupuesto de otra cuenta para el mismo
# soporte/mercado/fechas, luego intenta enviar un segundo que choca —
# incluso con lead_time_overrides en el payload (ruido irrelevante: no hay
# ningún parámetro que esquive has_accepted_availability_conflict).
R4A="$(as_team "$(payload 'Office Cuatro (ya aceptado)' u4a@example.com '["FR"]' '[]')")"
PID4A="$(echo "$R4A" | sed -n "s/.*\"proposal_id\": \"\([^\"]*\)\".*/\1/p")"
TOKEN4A="$(echo "$R4A" | sed -n "s/.*\"public_token\": \"\([^\"]*\)\".*/\1/p")"
as_team "select mark_proposal_sent('$PID4A'::uuid, '{}'::jsonb);" > /dev/null
$PSQL -d "$DB" -At <<SQL > /dev/null
set role anon;
select accept_public_proposal('$TOKEN4A', 'A', 'Office Cuatro SAS', 'Dir', 'FR11111111111', 'Fact', 'fact@cuatro.com', 'Firmante', 'Dir', 'PO-4', 'VALID', '{}'::jsonb);
reset role;
SQL

set +e
R4B_ERR="$(as_team "$(payload 'Office Cinco (choca)' u4b@example.com '["FR"]' '[{"support_id":"CRM-03","market":"FR","reason":"intento de esquivar el choque"}]')" 2>&1)"
R4B_STATUS=$?
set -e

if [[ $R4B_STATUS -ne 0 ]] && echo "$R4B_ERR" | grep -q "ya está aceptado por otro cliente"; then
  pass "el conflicto de disponibilidad sigue bloqueando el envío pese a llevar lead_time_overrides en el payload"
else
  fail "se esperaba que el envío fallara por conflicto de disponibilidad; salida: $R4B_ERR"
fi

$PSQL -c "drop database if exists $DB;" > /dev/null

echo
echo "Todo OK: la antelación insuficiente forzada a mano se persiste en la línea y se registra en overrides con autor, motivo y marca de tiempo (sin deduplicar por mercado), y el conflicto de disponibilidad sigue bloqueando de forma incondicional — verificado contra un PostgreSQL 16 real."
