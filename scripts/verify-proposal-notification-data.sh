#!/usr/bin/env bash
# Reproduce y verifica, contra un PostgreSQL 16 real, los datos de
# notificación que esta ronda añade a tres funciones ya existentes
# (CLAUDE.md §9/§10.3, ronda 18, bloque 2): `accept_public_proposal`,
# `reject_public_proposal` y `mark_public_proposal_viewed` — ninguna
# cambia de comportamiento, solo DEVUELVEN más datos (mismo patrón que
# `submit_counter_proposal` en la ronda 17).
#
# Casos:
#   1. `accept_public_proposal` devuelve proposal_number, option_name,
#      markets, sale/cost/margin_cents, margin_rate, advertiser_name,
#      contact_full_name/email, owner_email/full_name/language — nada de
#      esto estaba antes en el jsonb de retorno.
#   2. `reject_public_proposal` devuelve proposal_number, advertiser_name,
#      owner_email/full_name/language.
#   3. `mark_public_proposal_viewed` cambia de `void` a `jsonb`: la primera
#      apertura (SENT -> VIEWED) devuelve los datos de notificación; una
#      segunda llamada con el mismo token (ya VIEWED) devuelve NULL, sin
#      mandar un segundo aviso — el email 14 es "solo la primera vez".
set -euo pipefail

DB="${1:-wk_proposal_notification_data_verify}"
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
insert into profiles (id, email, full_name, is_active, preferred_language)
  values ('$VINCENT', '$VINCENT_EMAIL', 'Vincent Pla', true, 'FR');
SQL

# Monta un presupuesto SENT a mano (más directo que pasar por
# create_and_send_proposal para este propósito): una cuenta, un contacto, un
# envío con una opción ya calculada (sale/cost/margin) y su línea.
PARAM_SET="$($PSQL -d "$DB" -At -c "select id from pricing_parameter_sets where is_active;")"
ACCOUNT_ID="$($PSQL -d "$DB" -At -c "insert into accounts (legal_name, country_code) values ('Destination Exemple', 'FR') returning id;")"
CONTACT_ID="$($PSQL -d "$DB" -At -c "insert into contacts (account_id, full_name, email, language) values ('$ACCOUNT_ID', 'Camille Dupont', 'camille@example.com', 'FR') returning id;")"
PROPOSAL_ID="$($PSQL -d "$DB" -At -c "
  insert into proposals (account_id, contact_id, owner_id, parameter_set_id, status, language, public_token, sent_at, expires_at, frozen_snapshot, proposal_number)
  values ('$ACCOUNT_ID', '$CONTACT_ID', '$VINCENT', '$PARAM_SET', 'SENT', 'FR', 'tok_$(date +%s%N)', now(), now() + interval '14 days', '{}'::jsonb, '2026-099')
  returning id;
")"
OPTION_ID="$($PSQL -d "$DB" -At -c "
  insert into proposal_options (proposal_id, code, name, markets, billed_total_cents, cost_cents, margin_cents, margin_rate)
  values ('$PROPOSAL_ID', 'A', 'Pack Premium', array['FR','ES']::market[], 600000, 252000, 348000, 0.58)
  returning id;
")"
$PSQL -d "$DB" -At -c "
  insert into proposal_option_lines (option_id, support_id, market, quantity, is_lead_market)
  values ('$OPTION_ID', 'ON-01', 'FR', 4, true);
" > /dev/null

echo "=== Caso 3: mark_public_proposal_viewed — primera apertura devuelve datos, la segunda NULL ==="
FIRST_VIEW="$($PSQL -d "$DB" -At -c "select mark_public_proposal_viewed((select public_token from proposals where id = '$PROPOSAL_ID'));")"
if [[ "$FIRST_VIEW" == *"2026-099"* && "$FIRST_VIEW" == *"Destination Exemple"* && "$FIRST_VIEW" == *"vincent.pla@weekendesk.fr"* ]]; then
  pass "la primera apertura devuelve proposal_number/advertiser_name/owner_email"
else
  fail "faltan campos en la primera apertura: $FIRST_VIEW"
fi
SECOND_VIEW="$($PSQL -d "$DB" -At -c "select mark_public_proposal_viewed((select public_token from proposals where id = '$PROPOSAL_ID'));")"
if [[ -z "$SECOND_VIEW" ]]; then
  pass "una segunda apertura (ya VIEWED) devuelve NULL — solo se avisa la primera vez"
else
  fail "se esperaba NULL en la segunda apertura, salió: $SECOND_VIEW"
fi

echo "=== Caso 1: accept_public_proposal devuelve margen, cliente, opción y datos del AM ==="
ACCEPT_RESULT="$($PSQL -d "$DB" -At -c "
  select accept_public_proposal(
    (select public_token from proposals where id = '$PROPOSAL_ID'),
    'A', 'Destination Exemple SAS', '1 rue Exemple', null,
    'Camille Dupont', 'camille@example.com', 'Camille Dupont', 'Directrice',
    null, 'UNAVAILABLE', '{}'::jsonb
  );
")"
for needle in '"proposal_number": "2026-099"' '"option_name": "Pack Premium"' '"sale_cents": 600000' '"margin_rate": 0.58' '"advertiser_name": "Destination Exemple"' '"contact_full_name": "Camille Dupont"' '"owner_full_name": "Vincent Pla"' '"owner_language": "FR"'; do
  if [[ "$ACCEPT_RESULT" == *"$needle"* ]]; then
    pass "accept_public_proposal devuelve $needle"
  else
    fail "falta '$needle' en accept_public_proposal: $ACCEPT_RESULT"
  fi
done

echo "=== Caso 2: reject_public_proposal devuelve cliente y datos del AM (sin opción/importe) ==="
PROPOSAL_ID_2="$($PSQL -d "$DB" -At -c "
  insert into proposals (account_id, contact_id, owner_id, parameter_set_id, status, language, public_token, sent_at, expires_at, frozen_snapshot, proposal_number)
  values ('$ACCOUNT_ID', '$CONTACT_ID', '$VINCENT', '$PARAM_SET', 'SENT', 'FR', 'tok2_$(date +%s%N)', now(), now() + interval '14 days', '{}'::jsonb, '2026-100')
  returning id;
")"
REJECT_RESULT="$($PSQL -d "$DB" -At -c "
  select reject_public_proposal((select public_token from proposals where id = '$PROPOSAL_ID_2'), 'El importe supera lo previsto.');
")"
for needle in '"proposal_number": "2026-100"' '"advertiser_name": "Destination Exemple"' '"owner_email": "vincent.pla@weekendesk.fr"' '"owner_language": "FR"'; do
  if [[ "$REJECT_RESULT" == *"$needle"* ]]; then
    pass "reject_public_proposal devuelve $needle"
  else
    fail "falta '$needle' en reject_public_proposal: $REJECT_RESULT"
  fi
done

echo
echo "Todos los casos pasaron."
