#!/usr/bin/env bash
# Reproduce y verifica, contra un PostgreSQL 16 real, el bug reportado por
# Vincent al enviar un presupuesto: "function gen_random_bytes(integer) does
# not exist" (CLAUDE.md §10.3 quinquies).
#
# La causa: en un proyecto Supabase real, pgcrypto vive en el esquema
# "extensions" (Supabase la instala ahí de fábrica, antes de que ninguna
# migración de este repo se aplique) — no en "public". Las funciones
# SECURITY DEFINER/INVOKER de este esquema fijan `set search_path = public`
# a propósito (para no depender de un search_path mutable en funciones
# privilegiadas), así que una llamada sin cualificar a gen_random_bytes()
# nunca la encuentra ahí. `create extension if not exists "pgcrypto"` (en
# 20260918120000_initial_schema.sql) es un no-op silencioso cuando la
# extensión ya existe en OTRO esquema — así que en el proyecto real nunca
# llega a crear una copia en "public": simplemente no hace nada.
#
# Este script:
#   1. Monta el esquema "extensions" con pgcrypto ANTES de aplicar ninguna
#      migración del repo — igual que hace Supabase de fábrica — a
#      diferencia de scripts/verify-*.sh existentes, que dejan que la propia
#      migración inicial cree pgcrypto en "public" (por eso nunca
#      reprodujeron este bug).
#   2. Aplica las migraciones SOLO hasta la ronda 3 (20260923100000) y
#      demuestra que create_and_send_proposal falla con exactamente el
#      error de Vincent.
#   3. Aplica la migración del arreglo (20260924090000) y demuestra que la
#      MISMA llamada, con el MISMO estado de "extensions", ahora funciona.
#
# Uso: scripts/verify-pgcrypto-schema.sh [nombre_de_base_de_datos]
set -euo pipefail

DB="${1:-wk_pgcrypto_verify}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATIONS_DIR="$REPO_ROOT/supabase/migrations"
WORKDIR="$(mktemp -d)"
chmod a+rx "$WORKDIR"
trap 'rm -rf "$WORKDIR"' EXIT

PSQL="sudo -u postgres psql -v ON_ERROR_STOP=1 -X -q"

pass() { echo "  OK   $1"; }
fail() { echo "  FAIL $1"; exit 1; }

# Igual que Supabase de fábrica: pgcrypto instalada en "extensions" ANTES de
# que corra ninguna migración de este repo. A propósito, NO se instala nada
# en "public" aquí — es justo lo que hace que este script reproduzca el bug,
# a diferencia de los demás scripts/verify-*.sh de este repo.
cat > "$WORKDIR/00_supabase_shim.sql" <<'SQL'
create schema extensions;
create extension "pgcrypto" schema extensions;
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
grant usage on schema extensions to anon, authenticated, service_role;
SQL

cp "$MIGRATIONS_DIR"/*.sql "$WORKDIR/"
chmod a+rX "$WORKDIR"/*.sql

as_team() {
  $PSQL -d "$DB" -At <<SQL
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","email":"vincent.pla@weekendesk.fr","role":"authenticated"}';
$1
reset role;
SQL
}

minimal_proposal_payload() {
  cat <<'JSON'
select create_and_send_proposal(jsonb_build_object(
  'account', jsonb_build_object('legal_name','Office Pgcrypto Test','country_code','FR'),
  'contact', jsonb_build_object('full_name','Contacto','email','pgcrypto-test@example.com','language','FR'),
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
JSON
}

$PSQL -c "drop database if exists $DB;" -c "create database $DB;" > /dev/null
$PSQL -d "$DB" -f "$WORKDIR/00_supabase_shim.sql" > /dev/null

echo "=== Paso 1: aplicar las migraciones SOLO hasta la ronda 3 (sin el arreglo) ==="
FIX_MIGRATION="20260924090000_qualify_pgcrypto_schema.sql"
for f in "$WORKDIR"/2026*.sql; do
  base="$(basename "$f")"
  if [[ "$base" == "$FIX_MIGRATION" ]]; then
    continue
  fi
  $PSQL -d "$DB" -f "$f" > /dev/null
done

$PSQL -d "$DB" -At <<'SQL' > /dev/null
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'vincent.pla@weekendesk.fr');
insert into allowed_emails (email) values ('vincent.pla@weekendesk.fr');
insert into profiles (id, email, full_name, is_active) values
  ('11111111-1111-1111-1111-111111111111', 'vincent.pla@weekendesk.fr', 'Vincent Pla', true);
SQL

echo "=== Paso 2: reproducir el fallo — pgcrypto en 'extensions', igual que en el proyecto Supabase real ==="
REPRO_ERROR="$(as_team "$(minimal_proposal_payload)" 2>&1 || true)"
if echo "$REPRO_ERROR" | grep -q "gen_random_bytes(integer) does not exist"; then
  pass "reproducido: create_and_send_proposal falla con 'function gen_random_bytes(integer) does not exist', exactamente el error de Vincent"
else
  fail "se esperaba el error de gen_random_bytes, salió:
$REPRO_ERROR"
fi

# Ningún dato debe haber quedado a medias: la sentencia entera falla y la
# transacción implícita de la función se deshace.
LEFTOVER="$($PSQL -d "$DB" -At -c "select count(*) from accounts where legal_name = 'Office Pgcrypto Test'")"
if [[ "$LEFTOVER" == "0" ]]; then
  pass "el fallo no deja una cuenta a medias (la transacción se deshizo entera)"
else
  fail "se esperaba 0 cuentas tras el fallo, había $LEFTOVER"
fi

echo "=== Paso 3: aplicar la migración del arreglo (20260924090000) ==="
$PSQL -d "$DB" -f "$WORKDIR/20260924090000_qualify_pgcrypto_schema.sql" > /dev/null

echo "=== Paso 4: repetir la MISMA llamada — ahora debe funcionar ==="
FIXED_RESULT="$(as_team "$(minimal_proposal_payload)")"
if echo "$FIXED_RESULT" | grep -q "proposal_id"; then
  pass "tras el arreglo, create_and_send_proposal funciona con pgcrypto en 'extensions'"
else
  fail "se esperaba un proposal_id tras el arreglo, salió:
$FIXED_RESULT"
fi

TOKEN="$(echo "$FIXED_RESULT" | sed -n "s/.*\"public_token\": \"\([^\"]*\)\".*/\1/p")"
if [[ "${#TOKEN}" == "48" ]]; then
  pass "el token público sigue teniendo 48 caracteres hex (24 bytes), sin cambiar su formato"
else
  fail "se esperaba un token de 48 caracteres, midió ${#TOKEN}: '$TOKEN'"
fi

echo "=== Paso 5: confirmar que 'extensions' sigue teniendo una única copia de pgcrypto (la migración no duplicó nada) ==="
EXT_COUNT="$($PSQL -d "$DB" -At -c "select count(*) from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pgcrypto' and n.nspname = 'extensions'")"
if [[ "$EXT_COUNT" == "1" ]]; then
  pass "pgcrypto sigue teniendo una única instalación, en 'extensions'"
else
  fail "se esperaba 1 copia de pgcrypto en 'extensions', había $EXT_COUNT"
fi

$PSQL -c "drop database if exists $DB;" > /dev/null

echo
echo "Todo OK: el bug de gen_random_bytes (CLAUDE.md §10.3 quinquies) está reproducido contra pgcrypto en 'extensions' (como en el proyecto Supabase real) y el arreglo lo corrige sin tocar el formato del token ni duplicar la extensión."
