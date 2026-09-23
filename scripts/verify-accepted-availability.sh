#!/usr/bin/env bash
# Reproduce y verifica, contra un PostgreSQL 16 real, la regla de
# disponibilidad de CLAUDE.md §3 (ronda 3): ningún soporte puede tener dos
# campañas de CLIENTES DISTINTOS aceptadas y activas a la vez, en el mismo
# mercado — para los 19 soportes, no solo Meta.
#
# El control solo mira presupuestos ya ACEPTADOS:
#   1. Dos presupuestos SENT (no aceptados) de cuentas distintas, mismo
#      soporte/mercado/fechas solapadas -> AMBOS deben poder enviarse.
#   2. Un presupuesto nuevo de una cuenta DISTINTA que choca con un
#      presupuesto ya ACEPTADO -> el envío (create_and_send_proposal) debe
#      bloquearse.
#   3. La MISMA cuenta que el aceptado, mismo soporte/fechas -> debe poder
#      enviarse (la regla es "clientes distintos", no "el mismo soporte
#      nunca se repite").
#   4. Carrera entre dos presupuestos SENT que compiten por el mismo hueco:
#      el primero en ACEPTAR se lo lleva; el segundo intento de aceptación
#      debe bloquearse en accept_public_proposal.
#
# Uso: scripts/verify-accepted-availability.sh [nombre_de_base_de_datos]
set -euo pipefail

DB="${1:-wk_availability_verify}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATIONS_DIR="$REPO_ROOT/supabase/migrations"
WORKDIR="$(mktemp -d)"
chmod a+rx "$WORKDIR"
trap 'rm -rf "$WORKDIR"' EXIT

PSQL="sudo -u postgres psql -v ON_ERROR_STOP=1 -X -q"

pass() { echo "  OK   $1"; }
fail() { echo "  FAIL $1"; exit 1; }

cat > "$WORKDIR/00_supabase_shim.sql" <<'SQL'
create extension if not exists "pgcrypto";
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

# Un único comercial de equipo (Vincent) crea y envía todos los presupuestos.
$PSQL -d "$DB" -At <<'SQL' > /dev/null
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'vincent.pla@weekendesk.fr');
insert into allowed_emails (email) values ('vincent.pla@weekendesk.fr');
insert into profiles (id, email, full_name, is_active) values
  ('11111111-1111-1111-1111-111111111111', 'vincent.pla@weekendesk.fr', 'Vincent Pla', true);
SQL

as_team() {
  $PSQL -d "$DB" -At <<SQL
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","email":"vincent.pla@weekendesk.fr","role":"authenticated"}';
$1
reset role;
SQL
}

# Un solo linea/opción, para no repetir el payload completo en cada caso.
proposal_payload() {
  local legal_name="$1" contact_email="$2" support="$3" market="$4" start="$5" end_="$6"
  cat <<JSON
select create_and_send_proposal(jsonb_build_object(
  'account', jsonb_build_object('legal_name','$legal_name','country_code','FR'),
  'contact', jsonb_build_object('full_name','Contacto','email','$contact_email','language','FR'),
  'language','FR','brief','b',
  'options', jsonb_build_array(
    jsonb_build_object('code','A','name','Unica','pitch','p','sort_order',0,'markets',jsonb_build_array('$market'),
      'campaign_start','$start','campaign_end','$end_',
      'gross_net_of_media_cents',43000,'effective_discount_cents',0,'net_revenue_cents',43000,
      'media_budget_cents',0,'billed_total_cents',43000,'cost_cents',14000,'margin_cents',29000,
      'margin_rate',0.674,'max_lead_time_business_days',15,
      'lines', jsonb_build_array(jsonb_build_object('support_id','$support','market','$market','quantity',1,'is_lead_market',true,
        'unit_cost_cents',14000,'cost_cents',14000,'gross_price_cents',43000,'margin_floor_cents',28000,
        'floor_applied',false,'list_price_cents',43000,'discount_cents',0,'net_price_cents',43000,
        'billed_total_cents',43000,'sort_order',0)),
      'discounts', '[]'::jsonb),
    jsonb_build_object('code','B','name','Unica2','pitch','p','sort_order',1,'markets',jsonb_build_array('$market'),
      'campaign_start','$start','campaign_end','$end_',
      'gross_net_of_media_cents',86000,'effective_discount_cents',0,'net_revenue_cents',86000,
      'media_budget_cents',0,'billed_total_cents',86000,'cost_cents',28000,'margin_cents',58000,
      'margin_rate',0.674,'max_lead_time_business_days',15,
      'lines', jsonb_build_array(jsonb_build_object('support_id','$support','market','$market','quantity',2,'is_lead_market',true,
        'unit_cost_cents',14000,'cost_cents',28000,'gross_price_cents',86000,'margin_floor_cents',56000,
        'floor_applied',false,'list_price_cents',86000,'discount_cents',0,'net_price_cents',86000,
        'billed_total_cents',86000,'sort_order',0)),
      'discounts', '[]'::jsonb)
  )
));
JSON
}

echo "=== Caso 1: dos SENT de cuentas distintas, mismo soporte/mercado/fechas solapadas -> AMBOS deben poder enviarse ==="
R1="$(as_team "$(proposal_payload 'Office One' one@example.com CRM-03 FR 2027-05-01 2027-05-31)")"
TOKEN1="$(echo "$R1" | sed -n "s/.*\"public_token\": \"\([^\"]*\)\".*/\1/p")"
PID1="$(echo "$R1" | sed -n "s/.*\"proposal_id\": \"\([^\"]*\)\".*/\1/p")"
as_team "select mark_proposal_sent('$PID1'::uuid, '{}'::jsonb);" > /dev/null

R2="$(as_team "$(proposal_payload 'Office Two' two@example.com CRM-03 FR 2027-05-01 2027-05-31)")"
TOKEN2="$(echo "$R2" | sed -n "s/.*\"public_token\": \"\([^\"]*\)\".*/\1/p")"
PID2="$(echo "$R2" | sed -n "s/.*\"proposal_id\": \"\([^\"]*\)\".*/\1/p")"
as_team "select mark_proposal_sent('$PID2'::uuid, '{}'::jsonb);" > /dev/null

if [[ -n "$TOKEN1" && -n "$TOKEN2" ]]; then
  pass "dos presupuestos SENT de cuentas distintas, mismo soporte/fechas, coexisten sin bloqueo"
else
  fail "se esperaba que ambos envíos se crearan sin error"
fi

echo "=== Caso 2: presupuesto nuevo de cuenta distinta choca con un YA ACEPTADO -> el envío debe bloquearse ==="
$PSQL -d "$DB" -At <<SQL > /dev/null
set role anon;
select accept_public_proposal('$TOKEN1', 'A', 'Office One SAS', 'Dir', 'FR11111111111', 'Fact', 'fact@one.com', 'Firmante', 'Dir', 'PO-1', 'VALID', '{}'::jsonb);
reset role;
SQL

BLOCKED_SEND_ERROR="$(
  as_team "$(proposal_payload 'Office Three' three@example.com CRM-03 FR 2027-05-15 2027-06-15)" 2>&1 || true
)"
if echo "$BLOCKED_SEND_ERROR" | grep -q "ya está aceptado por otro cliente en fechas solapadas"; then
  pass "el envío de un presupuesto que choca con uno ya ACEPTADO de otro cliente se bloquea"
else
  fail "se esperaba el error de solapamiento con un aceptado, salió:
$BLOCKED_SEND_ERROR"
fi

echo "=== Caso 3: la MISMA cuenta que el aceptado, mismo soporte/fechas -> debe poder enviarse (regla es 'clientes distintos') ==="
ACCOUNT_ONE_ID="$($PSQL -d "$DB" -At -c "select id from accounts where legal_name = 'Office One'")"
SAME_ACCOUNT_RESULT="$(as_team "
select create_and_send_proposal(jsonb_build_object(
  'account_id', '$ACCOUNT_ONE_ID',
  'contact', jsonb_build_object('full_name','Contacto2','email','one2@example.com','language','FR'),
  'language','FR','brief','b',
  'options', jsonb_build_array(
    jsonb_build_object('code','A','name','Unica','pitch','p','sort_order',0,'markets',jsonb_build_array('FR'),
      'campaign_start','2027-05-01','campaign_end','2027-05-31',
      'gross_net_of_media_cents',43000,'effective_discount_cents',0,'net_revenue_cents',43000,
      'media_budget_cents',0,'billed_total_cents',43000,'cost_cents',14000,'margin_cents',29000,
      'margin_rate',0.674,'max_lead_time_business_days',15,
      'lines', jsonb_build_array(jsonb_build_object('support_id','CRM-03','market','FR','quantity',1,'is_lead_market',true,
        'unit_cost_cents',14000,'cost_cents',14000,'gross_price_cents',43000,'margin_floor_cents',28000,
        'floor_applied',false,'list_price_cents',43000,'discount_cents',0,'net_price_cents',43000,
        'billed_total_cents',43000,'sort_order',0)),
      'discounts', '[]'::jsonb),
    jsonb_build_object('code','B','name','Unica2','pitch','p','sort_order',1,'markets',jsonb_build_array('FR'),
      'campaign_start','2027-05-01','campaign_end','2027-05-31',
      'gross_net_of_media_cents',86000,'effective_discount_cents',0,'net_revenue_cents',86000,
      'media_budget_cents',0,'billed_total_cents',86000,'cost_cents',28000,'margin_cents',58000,
      'margin_rate',0.674,'max_lead_time_business_days',15,
      'lines', jsonb_build_array(jsonb_build_object('support_id','CRM-03','market','FR','quantity',2,'is_lead_market',true,
        'unit_cost_cents',14000,'cost_cents',28000,'gross_price_cents',86000,'margin_floor_cents',56000,
        'floor_applied',false,'list_price_cents',86000,'discount_cents',0,'net_price_cents',86000,
        'billed_total_cents',86000,'sort_order',0)),
      'discounts', '[]'::jsonb)
  )
));
")"
if echo "$SAME_ACCOUNT_RESULT" | grep -q "proposal_id"; then
  pass "un presupuesto nuevo de la MISMA cuenta que el aceptado, mismo soporte/fechas, se envía sin bloqueo"
else
  fail "se esperaba que el envío de la misma cuenta se creara sin error, salió:
$SAME_ACCOUNT_RESULT"
fi

echo "=== Caso 4: carrera entre dos SENT que compiten por el mismo hueco -> el primero en aceptar se lo lleva, el segundo se bloquea ==="
$PSQL -d "$DB" -At <<SQL > /dev/null
set role anon;
\set ON_ERROR_STOP off
select accept_public_proposal('$TOKEN2', 'A', 'Office Two SAS', 'Dir', 'FR22222222222', 'Fact', 'fact@two.com', 'Firmante', 'Dir', 'PO-2', 'VALID', '{}'::jsonb);
\set ON_ERROR_STOP on
reset role;
SQL
RACE_ERROR="$(
  $PSQL -d "$DB" -At <<SQL 2>&1 || true
set role anon;
select accept_public_proposal('$TOKEN2', 'A', 'Office Two SAS', 'Dir', 'FR22222222222', 'Fact', 'fact@two.com', 'Firmante', 'Dir', 'PO-2', 'VALID', '{}'::jsonb);
reset role;
SQL
)"
if echo "$RACE_ERROR" | grep -q "ya lo aceptó otro cliente en fechas solapadas"; then
  pass "el segundo presupuesto que compite por el mismo hueco no se puede aceptar tras perder la carrera"
else
  fail "se esperaba el error de aceptación bloqueada por carrera, salió:
$RACE_ERROR"
fi

$PSQL -c "drop database if exists $DB;" > /dev/null

echo
echo "Todo OK: la regla de disponibilidad (CLAUDE.md §3, ronda 3) está reproducida y verificada — solo bloquea contra lo ya ACEPTADO, nunca contra borradores o envíos sin respuesta."
