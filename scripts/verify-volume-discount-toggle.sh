#!/usr/bin/env bash
# Reproduce y verifica, contra un PostgreSQL 16 real, el interruptor por
# opción "desactivar descuento por volumen" (CLAUDE.md §4.5, §10.3 novies,
# ronda 9): create_and_send_proposal guarda `volume_discount_disabled` en
# `proposal_options` y, cuando está activado, registra la excepción en
# `overrides` con autor y marca de tiempo (CLAUDE.md §8) — la primera vez
# que algo escribe en esa tabla (§10.1.2: existía en el esquema desde la
# primera migración, pero ningún flujo la usaba todavía).
#
# Casos:
#   1. Una opción con el interruptor desactivado (por defecto / false) no
#      genera ninguna fila en `overrides`.
#   2. Una opción con el interruptor activado guarda `volume_discount_disabled
#      = true` en `proposal_options` y genera exactamente una fila en
#      `overrides` (kind, option_id, proposal_id, autor, marca de tiempo).
#   3. Una segunda opción del mismo envío, sin el interruptor, no genera una
#      fila de más — el override es por opción, no por presupuesto entero.
#
# Uso: scripts/verify-volume-discount-toggle.sh [nombre_de_base_de_datos]
set -euo pipefail

DB="${1:-wk_volume_discount_toggle_verify}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATIONS_DIR="$REPO_ROOT/supabase/migrations"
WORKDIR="$(mktemp -d)"
chmod a+rx "$WORKDIR"
trap 'rm -rf "$WORKDIR"' EXIT

PSQL="sudo -u postgres psql -v ON_ERROR_STOP=1 -X -q"

pass() { echo "  OK   $1"; }
fail() { echo "  FAIL $1"; exit 1; }

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

payload() {
  local legal_name="$1" contact_email="$2" opt_a_disabled="$3" opt_b_disabled="$4"
  cat <<JSON
select create_and_send_proposal(jsonb_build_object(
  'account', jsonb_build_object('legal_name','$legal_name','country_code','FR'),
  'contact', jsonb_build_object('full_name','Contacto','email','$contact_email','language','FR'),
  'language','FR','brief','b',
  'options', jsonb_build_array(
    jsonb_build_object('code','A','name','Unica','pitch','p','sort_order',0,'markets',jsonb_build_array('FR'),
      'campaign_start','2027-05-01','campaign_end','2027-05-31',
      'gross_net_of_media_cents',400000,'effective_discount_cents',0,'net_revenue_cents',400000,
      'media_budget_cents',0,'billed_total_cents',400000,'cost_cents',140000,'margin_cents',260000,
      'margin_rate',0.65,'max_lead_time_business_days',15,'volume_discount_disabled',$opt_a_disabled,
      'lines', jsonb_build_array(jsonb_build_object('support_id','CRM-01','market','FR','quantity',2,'is_lead_market',true,
        'unit_cost_cents',70000,'cost_cents',140000,'gross_price_cents',400000,'margin_floor_cents',280000,
        'floor_applied',false,'list_price_cents',400000,'discount_cents',0,'net_price_cents',400000,
        'billed_total_cents',400000,'sort_order',0)),
      'discounts', '[]'::jsonb),
    jsonb_build_object('code','B','name','Unica2','pitch','p','sort_order',1,'markets',jsonb_build_array('FR'),
      'campaign_start','2027-05-01','campaign_end','2027-05-31',
      'gross_net_of_media_cents',86000,'effective_discount_cents',0,'net_revenue_cents',86000,
      'media_budget_cents',0,'billed_total_cents',86000,'cost_cents',28000,'margin_cents',58000,
      'margin_rate',0.674,'max_lead_time_business_days',15,'volume_discount_disabled',$opt_b_disabled,
      'lines', jsonb_build_array(jsonb_build_object('support_id','CRM-03','market','FR','quantity',2,'is_lead_market',true,
        'unit_cost_cents',14000,'cost_cents',28000,'gross_price_cents',86000,'margin_floor_cents',56000,
        'floor_applied',false,'list_price_cents',86000,'discount_cents',0,'net_price_cents',86000,
        'billed_total_cents',86000,'sort_order',0)),
      'discounts', '[]'::jsonb)
  )
));
JSON
}

echo "=== Caso 1: ambas opciones con el interruptor desactivado (false) -> ninguna fila en overrides ==="
R1="$(as_team "$(payload 'Office Uno' u1@example.com false false)")"
PID1="$(echo "$R1" | sed -n "s/.*\"proposal_id\": \"\([^\"]*\)\".*/\1/p")"
OVERRIDES_1="$(as_team "select count(*) from overrides where proposal_id = '$PID1'::uuid;")"
if [[ "$OVERRIDES_1" == "0" ]]; then
  pass "sin interruptor activado, no se escribe ninguna fila en overrides"
else
  fail "se esperaban 0 filas en overrides, salieron $OVERRIDES_1"
fi
DISABLED_A1="$(as_team "select volume_discount_disabled from proposal_options where proposal_id = '$PID1'::uuid and code = 'A';")"
if [[ "$DISABLED_A1" == "f" ]]; then
  pass "proposal_options.volume_discount_disabled queda en false por defecto"
else
  fail "se esperaba false, salió $DISABLED_A1"
fi

echo "=== Caso 2: la opción A con el interruptor activado (true) -> exactamente una fila en overrides, con autor y fecha ==="
R2="$(as_team "$(payload 'Office Dos' u2@example.com true false)")"
PID2="$(echo "$R2" | sed -n "s/.*\"proposal_id\": \"\([^\"]*\)\".*/\1/p")"

DISABLED_A2="$(as_team "select volume_discount_disabled from proposal_options where proposal_id = '$PID2'::uuid and code = 'A';")"
if [[ "$DISABLED_A2" == "t" ]]; then
  pass "proposal_options.volume_discount_disabled queda en true para la opción A"
else
  fail "se esperaba true, salió $DISABLED_A2"
fi

OVERRIDES_2="$(as_team "select count(*) from overrides where proposal_id = '$PID2'::uuid;")"
if [[ "$OVERRIDES_2" == "1" ]]; then
  pass "exactamente una fila en overrides para el presupuesto con una opción activada"
else
  fail "se esperaba 1 fila en overrides, salieron $OVERRIDES_2"
fi

OVERRIDE_ROW="$(as_team "
  select o.kind, o.created_by, (o.created_at is not null), (o.option_id = po.id)
  from overrides o
  join proposal_options po on po.id = o.option_id
  where o.proposal_id = '$PID2'::uuid;
")"
if echo "$OVERRIDE_ROW" | grep -q "VOLUME_DISCOUNT_DISABLED|$VINCENT|t|t"; then
  pass "la fila de overrides tiene el kind correcto, el autor (created_by = Vincent), marca de tiempo y apunta a la opción A"
else
  fail "se esperaba 'VOLUME_DISCOUNT_DISABLED|$VINCENT|t|t', salió: $OVERRIDE_ROW"
fi

echo "=== Caso 3: la opción B, sin el interruptor, no genera una fila de más (es por opción, no por presupuesto) ==="
DISABLED_B2="$(as_team "select volume_discount_disabled from proposal_options where proposal_id = '$PID2'::uuid and code = 'B';")"
if [[ "$DISABLED_B2" == "f" ]]; then
  pass "la opción B del mismo envío queda en false, sin contagiarse de la A"
else
  fail "se esperaba false para la opción B, salió $DISABLED_B2"
fi

$PSQL -c "drop database if exists $DB;" > /dev/null

echo
echo "Todo OK: el interruptor 'desactivar descuento por volumen' se persiste por opción y se registra en overrides con autor y marca de tiempo, verificado contra un PostgreSQL 16 real."
