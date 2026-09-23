#!/usr/bin/env bash
# Reproduce y verifica, contra un PostgreSQL 16 real, el número de
# presupuesto corto y legible (CLAUDE.md §10.3 octies, ronda 8):
# secuencial por año natural, asignado dentro de create_and_send_proposal
# al crear el BORRADOR, único, nunca reutilizado aunque desaparezca la fila
# que lo usó (el contador de proposal_number_counters solo avanza).
#
# Casos:
#   1. Dos presupuestos creados en el mismo año reciben números distintos,
#      consecutivos, con el formato <año>-NNN (p. ej. 2026-001, 2026-002).
#   2. El número se asigna al CREAR el borrador, no al enviar: un DRAFT que
#      nunca llega a SENT ya tiene su número.
#   3. El número no se reutiliza aunque se borre la fila que lo usó: borrar
#      un presupuesto y crear uno nuevo no repite el secuencial perdido.
#   4. La columna es UNIQUE de verdad: un intento de forzar el mismo número
#      en dos filas falla.
#
# Uso: scripts/verify-proposal-numbering.sh [nombre_de_base_de_datos]
set -euo pipefail

DB="${1:-wk_proposal_numbering_verify}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATIONS_DIR="$REPO_ROOT/supabase/migrations"
WORKDIR="$(mktemp -d)"
chmod a+rx "$WORKDIR"
trap 'rm -rf "$WORKDIR"' EXIT

PSQL="sudo -u postgres psql -v ON_ERROR_STOP=1 -X -q"

pass() { echo "  OK   $1"; }
fail() { echo "  FAIL $1"; exit 1; }

# Igual que el resto de scripts/verify-*.sh: pgcrypto se instala en un
# esquema `extensions` aparte, como hace Supabase de fábrica (CLAUDE.md
# §10.3 quinquies) — no en `public`, para no esconder una regresión de
# search_path/GRANT en create_and_send_proposal.
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

$PSQL -d "$DB" -At <<'SQL' > /dev/null
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'vincent.pla@weekendesk.fr'),
  ('22222222-2222-2222-2222-222222222222', 'remi.challal@weekendesk.fr');
insert into allowed_emails (email) values
  ('vincent.pla@weekendesk.fr'), ('remi.challal@weekendesk.fr');
insert into profiles (id, email, full_name, is_active) values
  ('11111111-1111-1111-1111-111111111111', 'vincent.pla@weekendesk.fr', 'Vincent Pla', true),
  ('22222222-2222-2222-2222-222222222222', 'remi.challal@weekendesk.fr', 'Rémi Challal', true);
SQL

as_user() {
  local uid="$1" email="$2" sql="$3"
  $PSQL -d "$DB" -At <<SQL
set role authenticated;
set request.jwt.claim.sub = '$uid';
set request.jwt.claims = '{"sub":"$uid","email":"$email","role":"authenticated"}';
$sql
reset role;
SQL
}

proposal_payload() {
  local legal_name="$1" contact_email="$2"
  cat <<JSON
select create_and_send_proposal(jsonb_build_object(
  'account', jsonb_build_object('legal_name','$legal_name','country_code','FR'),
  'contact', jsonb_build_object('full_name','Contacto','email','$contact_email','language','FR'),
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
      'discounts', '[]'::jsonb)
  )
));
JSON
}

VINCENT=11111111-1111-1111-1111-111111111111
VINCENT_EMAIL=vincent.pla@weekendesk.fr
REMI=22222222-2222-2222-2222-222222222222
REMI_EMAIL=remi.challal@weekendesk.fr
YEAR="$(date +%Y)"

echo "=== Caso 1+2: dos presupuestos consecutivos (de dos comerciales distintos) reciben números distintos, con formato <año>-NNN, ya en DRAFT ==="
R1="$(as_user "$VINCENT" "$VINCENT_EMAIL" "$(proposal_payload 'Office Uno' u1@example.com)")"
NUM1="$(echo "$R1" | sed -n "s/.*\"proposal_number\": \"\([^\"]*\)\".*/\1/p")"
PID1="$(echo "$R1" | sed -n "s/.*\"proposal_id\": \"\([^\"]*\)\".*/\1/p")"

R2="$(as_user "$REMI" "$REMI_EMAIL" "$(proposal_payload 'Office Dos' u2@example.com)")"
NUM2="$(echo "$R2" | sed -n "s/.*\"proposal_number\": \"\([^\"]*\)\".*/\1/p")"

if [[ "$NUM1" =~ ^${YEAR}-[0-9]{3}$ && "$NUM2" =~ ^${YEAR}-[0-9]{3}$ && "$NUM1" != "$NUM2" ]]; then
  pass "números distintos con formato correcto: $NUM1, $NUM2"
else
  fail "se esperaban dos números distintos con formato ${YEAR}-NNN, salió: $NUM1, $NUM2"
fi

SEQ1="${NUM1##*-}"
SEQ2="${NUM2##*-}"
if (( 10#$SEQ2 == 10#$SEQ1 + 1 )); then
  pass "el segundo es exactamente el secuencial siguiente al primero ($SEQ1 -> $SEQ2)"
else
  fail "se esperaba que el secuencial avanzara en 1, salió $SEQ1 -> $SEQ2"
fi

STORED_NUM1="$(as_user "$VINCENT" "$VINCENT_EMAIL" "select proposal_number from proposals where id = '$PID1'::uuid;")"
STORED_STATUS1="$(as_user "$VINCENT" "$VINCENT_EMAIL" "select status from proposals where id = '$PID1'::uuid;")"
if [[ "$STORED_NUM1" == "$NUM1" && "$STORED_STATUS1" == "DRAFT" ]]; then
  pass "el número ya está en la fila DRAFT ($STORED_NUM1) — asignado al crear el borrador, no al enviar"
else
  fail "se esperaba proposal_number=$NUM1 y status=DRAFT, salió proposal_number=$STORED_NUM1 status=$STORED_STATUS1"
fi

echo "=== Caso 3: el número no se reutiliza al borrar la fila que lo usó ==="
as_user "$VINCENT" "$VINCENT_EMAIL" "delete from proposals where id = '$PID1'::uuid;" > /dev/null
R3="$(as_user "$VINCENT" "$VINCENT_EMAIL" "$(proposal_payload 'Office Tres' u3@example.com)")"
NUM3="$(echo "$R3" | sed -n "s/.*\"proposal_number\": \"\([^\"]*\)\".*/\1/p")"
SEQ3="${NUM3##*-}"
if (( 10#$SEQ3 == 10#$SEQ2 + 1 )); then
  pass "tras borrar el presupuesto #$SEQ1, el siguiente número es $NUM3 (continúa después de #$SEQ2, no repite #$SEQ1)"
else
  fail "se esperaba que el número siguiera avanzando tras el borrado, salió $NUM3 (secuencial anterior: $SEQ2)"
fi

echo "=== Caso 4: proposal_number es UNIQUE de verdad ==="
DUP_ERROR="$(as_user "$VINCENT" "$VINCENT_EMAIL" "update proposals set proposal_number = '$NUM2' where id != (select id from proposals where proposal_number = '$NUM2');" 2>&1 || true)"
if echo "$DUP_ERROR" | grep -qi "proposals_number_unique\|duplicate key"; then
  pass "forzar un número duplicado falla por la restricción UNIQUE"
else
  fail "se esperaba un error de restricción UNIQUE, salió: $DUP_ERROR"
fi

$PSQL -c "drop database if exists $DB;" > /dev/null

echo
echo "Todo OK: la numeración de presupuestos (secuencial por año, asignada al crear el borrador, nunca reutilizada, única) está verificada contra un PostgreSQL 16 real."
