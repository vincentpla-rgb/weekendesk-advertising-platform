#!/usr/bin/env bash
# Reproduce y verifica, contra un PostgreSQL 16 real, el sexto mercado de
# venta (CLAUDE.md §0, §3, §10.3 — ronda 14): Países Bajos (NL), distinto de
# BE_NL (Bélgica de habla neerlandesa, ya existente).
#
# Casos:
#   1. El enum `market` gana el valor 'NL' y se puede usar en la misma
#      migración que lo añade (autocommit por sentencia, sin transacción
#      envolvente) — mismo patrón ya probado en volume_discount_toggle.sql
#      y media_fee_split.sql.
#   2. `market_coefficients` tiene una fila NL = 0,73 (provisional) para cada
#      juego de parámetros ya existente, y `multimarket_discount_guidance`
#      gana la fila market_count=6, rate=0,20 (mismo plateau que 4-5).
#   3. `support_market_availability` siembra NL para los 19 soportes,
#      sellable=true salvo SOC-05 (TikTok, solo confirmado en FR) — misma
#      excepción que ya se aplica al resto de mercados no-FR.
#   4. `create_and_send_proposal`/`get_public_proposal`/`accept_public_proposal`
#      funcionan con NL sin ningún cambio de función: ningún flujo SQL
#      hardcodea la lista de mercados. Se envía un presupuesto con una línea
#      en mercado NL, se lee en la pantalla pública, y se acepta con un
#      régimen de IVA correcto (cuenta de Países Bajos, VIES inválido → IVA
#      francés 20 %, igual que cualquier otro mercado UE sin VIES válido).
#
# Uso: scripts/verify-netherlands-market.sh [nombre_de_base_de_datos]
set -euo pipefail

DB="${1:-wk_netherlands_market_verify}"
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
  $PSQL -d "$DB" -At -q <<SQL
set role authenticated;
set request.jwt.claim.sub = '$VINCENT';
set request.jwt.claims = '{"sub":"$VINCENT","email":"$VINCENT_EMAIL","role":"authenticated"}';
$1
reset role;
SQL
}

echo "=== Caso 1: el enum market gana NL, usable en la misma migración que lo añade ==="
ENUM_LABELS="$($PSQL -d "$DB" -At -c "select enum_range(null::market)::text;")"
if [[ "$ENUM_LABELS" == "{FR,ES,IT,BE_FR,BE_NL,NL}" ]]; then
  pass "enum market = {FR,ES,IT,BE_FR,BE_NL,NL}, en ese orden (NL al final, no reemplaza a BE_NL)"
else
  fail "se esperaba '{FR,ES,IT,BE_FR,BE_NL,NL}', salió: $ENUM_LABELS"
fi

echo "=== Caso 2: coeficiente NL provisional + guía multimercado a 6 ==="
COEF_NL="$($PSQL -d "$DB" -At -c "select coefficient from market_coefficients where market = 'NL';")"
if [[ "$COEF_NL" == "0.7300" ]]; then
  pass "market_coefficients.NL = 0,7300 (provisional, ver CLAUDE.md §3/§9)"
else
  fail "se esperaba 0,7300, salió: $COEF_NL"
fi

GUIDANCE_6="$($PSQL -d "$DB" -At -c "select discount_rate from multimarket_discount_guidance where market_count = 6;")"
if [[ "$GUIDANCE_6" == "0.2000" ]]; then
  pass "multimarket_discount_guidance para 6 mercados = 0,20 (mismo plateau que 4-5)"
else
  fail "se esperaba 0,2000, salió: $GUIDANCE_6"
fi

echo "=== Caso 3: vendibilidad NL — 19 soportes sellable=true salvo SOC-05 ==="
SELLABLE_COUNT="$($PSQL -d "$DB" -At -c "select count(*) from support_market_availability where market = 'NL' and is_sellable;")"
if [[ "$SELLABLE_COUNT" == "18" ]]; then
  pass "18 de 19 soportes vendibles en NL"
else
  fail "se esperaban 18 soportes vendibles, salieron: $SELLABLE_COUNT"
fi

SOC05_NL="$($PSQL -d "$DB" -At -c "select is_sellable from support_market_availability where support_id = 'SOC-05' and market = 'NL';")"
if [[ "$SOC05_NL" == "f" ]]; then
  pass "SOC-05 (TikTok) no vendible en NL, misma excepción que en ES/IT/BE_FR/BE_NL"
else
  fail "se esperaba 'f' para SOC-05 en NL, salió: $SOC05_NL"
fi

echo "=== Caso 4: envío, pantalla pública y aceptación con una línea en mercado NL ==="
R="$(as_team "
select create_and_send_proposal(jsonb_build_object(
  'account', jsonb_build_object('legal_name','Gemeente Voorbeeld','country_code','NL'),
  'contact', jsonb_build_object('full_name','Jan de Vries','email','jan@example.nl','language','NL'),
  'language','NL','brief','Campagne test NL',
  'options', jsonb_build_array(
    jsonb_build_object('code','A','name','Enige','pitch','p','sort_order',0,'markets','[\"NL\"]'::jsonb,
      'campaign_start','2027-06-01','campaign_end','2027-06-07',
      'gross_net_of_media_cents',31390,'effective_discount_cents',0,'net_revenue_cents',31390,
      'media_budget_cents',0,'billed_total_cents',31390,'cost_cents',14000,'margin_cents',17390,
      'margin_rate',0.554,'max_lead_time_business_days',15,'volume_discount_disabled',false,
      'lines', jsonb_build_array(jsonb_build_object(
        'support_id','ON-01','market','NL','quantity',1,'is_lead_market',true,
        'unit_cost_cents',14000,'cost_cents',14000,'gross_price_cents',31390,'margin_floor_cents',28000,
        'floor_applied',false,'list_price_cents',31390,'discount_cents',0,'net_price_cents',31390,
        'billed_total_cents',31390,'sort_order',0)),
      'discounts', '[]'::jsonb)
  )
));
")"
PID="$(echo "$R" | sed -n 's/.*\"proposal_id\": \"\([^\"]*\)\".*/\1/p')"
if [[ -n "$PID" ]]; then
  pass "create_and_send_proposal acepta una línea en mercado NL sin ningún cambio de función"
else
  fail "no se pudo crear el presupuesto con una línea NL: $R"
fi

LINE_ROW="$(as_team "select l.support_id, l.market, l.net_price_cents from proposal_option_lines l join proposal_options po on po.id=l.option_id where po.proposal_id='$PID'::uuid;")"
if [[ "$LINE_ROW" == "ON-01|NL|31390" ]]; then
  pass "línea persistida con market=NL y el precio calculado"
else
  fail "se esperaba 'ON-01|NL|31390', salió: $LINE_ROW"
fi

TOKEN="$(as_team "select public_token from proposals where id = '$PID'::uuid;")"
as_team "select mark_proposal_sent('$PID'::uuid, '{}'::jsonb);" > /dev/null

PUBLIC_JSON="$(as_team "select get_public_proposal('$TOKEN');")"
if echo "$PUBLIC_JSON" | grep -q '"market": "NL"'; then
  pass "get_public_proposal devuelve la línea con market=NL, pantalla pública correcta"
else
  fail "get_public_proposal no muestra market=NL: $PUBLIC_JSON"
fi

ACCEPT_JSON="$(as_team "select accept_public_proposal('$TOKEN', 'A', 'Gemeente Voorbeeld', 'Kalverstraat 1, Amsterdam', 'NL123456789B01', 'Jan de Vries', 'jan@example.nl', 'Jan de Vries', 'Directeur', 'PO-2027-01', 'INVALID', '{}'::jsonb);")"
if echo "$ACCEPT_JSON" | grep -q '"vat_regime": "FR_VAT_20"'; then
  pass "aceptación de una cuenta NL con VIES inválido aplica IVA francés 20 %, igual que cualquier mercado UE (CLAUDE.md §7, sin excepción para NL)"
else
  fail "se esperaba vat_regime FR_VAT_20, salió: $ACCEPT_JSON"
fi

$PSQL -c "drop database if exists $DB;" > /dev/null

echo
echo "Todo OK: el mercado NL (Países Bajos) funciona en el enum, los parámetros de referencia y el pipeline completo de envío/pantalla pública/aceptación, sin tocar ninguna función SQL — verificado contra un PostgreSQL 16 real."
