#!/usr/bin/env bash
# Reproduce y verifica, contra un PostgreSQL 16 real, el cambio de modelo de
# facturación de los soportes de media buy (CLAUDE.md §4.4, §10.3 decies,
# ronda 10): el fee de gestión se resta del presupuesto de medios del
# cliente, no se suma encima — el cliente factura EXACTAMENTE su
# presupuesto.
#
# Casos:
#   1. Reparto automático (ADS-01, 2.000 € de medios, mínimo mensual
#      1.200 €): net_price_cents = 1.200 € (el fee), billed_total_cents =
#      2.000 € (el presupuesto íntegro, NO 3.200 €), media_real_spend_cents
#      = 800 €, manual_fee_cents queda NULL, y no se escribe ninguna fila en
#      overrides.
#   2. Reparto forzado a mano: manual_fee_cents/manual_fee_reason se
#      persisten tal cual, billed_total_cents sigue siendo el presupuesto
#      íntegro, y se escribe EXACTAMENTE una fila en overrides
#      (MEDIA_FEE_FORCED) con support_id, autor y marca de tiempo.
#   3. El reparto forzado se registra una sola vez por soporte, no por
#      mercado (is_lead_market): una opción con el mismo soporte en dos
#      mercados no duplica la fila de overrides.
#   4. get_public_proposal nunca devuelve el desglose (ni net_revenue_cents,
#      ni el fee, ni el importe real al medio) — solo billed_total_cents y
#      media_budget_cents, el presupuesto que dio el cliente.
#
# Uso: scripts/verify-media-fee-split.sh [nombre_de_base_de_datos]
set -euo pipefail

DB="${1:-wk_media_fee_split_verify}"
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

# Un solo soporte ADS-01, 2.000 € de medios a 1 mes: fee automático 1.200 €
# (mínimo mensual, mayor que el 40 % de 800 €); si se pasa manual_fee_cents,
# lo sustituye. mercados: un solo mercado por defecto, o dos (FR+ES) para el
# caso 3 (dedup por is_lead_market).
payload() {
  local legal_name="$1" contact_email="$2" manual_fee_json="$3" markets_json="$4"
  cat <<JSON
select create_and_send_proposal(jsonb_build_object(
  'account', jsonb_build_object('legal_name','$legal_name','country_code','FR'),
  'contact', jsonb_build_object('full_name','Contacto','email','$contact_email','language','FR'),
  'language','FR','brief','b',
  'options', jsonb_build_array(
    jsonb_build_object('code','A','name','Unica','pitch','p','sort_order',0,'markets',('$markets_json')::jsonb,
      'campaign_start','2027-05-01','campaign_end','2027-05-31',
      'gross_net_of_media_cents',120000,'effective_discount_cents',0,'net_revenue_cents',120000,
      'media_budget_cents',200000,'billed_total_cents',200000,'cost_cents',35000,'margin_cents',85000,
      'margin_rate',0.708,'max_lead_time_business_days',15,'volume_discount_disabled',false,
      'lines', (
        select jsonb_agg(jsonb_build_object(
          'support_id','ADS-01','market',m,'quantity',1,'is_lead_market',(m = (('$markets_json')::jsonb->>0)),
          'unit_cost_cents',35000,'cost_cents',35000,'gross_price_cents',0,'margin_floor_cents',0,
          'floor_applied',true,'list_price_cents', coalesce(nullif('$manual_fee_json','null')::bigint, 120000),
          'discount_cents',0,'net_price_cents', coalesce(nullif('$manual_fee_json','null')::bigint, 120000),
          'manual_fee_cents', nullif('$manual_fee_json','null')::bigint,
          'manual_fee_reason', case when '$manual_fee_json' <> 'null' then 'Fee negociado con el cliente.' else null end,
          'media_budget_cents',200000,'media_months',1,
          'media_real_spend_cents', 200000 - coalesce(nullif('$manual_fee_json','null')::bigint, 120000),
          'billed_total_cents',200000,'sort_order',0))
        from jsonb_array_elements_text(('$markets_json')::jsonb) as m
      ),
      'discounts', '[]'::jsonb)
  )
));
JSON
}

echo "=== Caso 1: reparto automático — billed_total_cents es el presupuesto íntegro, no fee + medios ==="
R1="$(as_team "$(payload 'Office Uno' u1@example.com null '["FR"]')")"
PID1="$(echo "$R1" | sed -n "s/.*\"proposal_id\": \"\([^\"]*\)\".*/\1/p")"

ROW1="$(as_team "
  select l.net_price_cents, l.billed_total_cents, l.media_real_spend_cents, l.manual_fee_cents
  from proposal_option_lines l
  join proposal_options po on po.id = l.option_id
  where po.proposal_id = '$PID1'::uuid;
")"
if [[ "$ROW1" == "120000|200000|80000|" ]]; then
  pass "fee automático 1.200 € (net_price_cents), facturado 2.000 € (billed_total_cents), real al medio 800 €, sin fee forzado"
else
  fail "se esperaba '120000|200000|80000|', salió: $ROW1"
fi

OVERRIDES_1="$(as_team "select count(*) from overrides where proposal_id = '$PID1'::uuid;")"
if [[ "$OVERRIDES_1" == "0" ]]; then
  pass "sin reparto forzado, no se escribe ninguna fila en overrides"
else
  fail "se esperaban 0 filas en overrides, salieron $OVERRIDES_1"
fi

echo "=== Caso 2: reparto forzado a mano — se persiste tal cual y se registra en overrides ==="
R2="$(as_team "$(payload 'Office Dos' u2@example.com 90000 '["FR"]')")"
PID2="$(echo "$R2" | sed -n "s/.*\"proposal_id\": \"\([^\"]*\)\".*/\1/p")"

ROW2="$(as_team "
  select l.net_price_cents, l.billed_total_cents, l.media_real_spend_cents, l.manual_fee_cents, l.manual_fee_reason
  from proposal_option_lines l
  join proposal_options po on po.id = l.option_id
  where po.proposal_id = '$PID2'::uuid;
")"
if [[ "$ROW2" == "90000|200000|110000|90000|Fee negociado con el cliente." ]]; then
  pass "fee forzado a 900 € persistido tal cual, facturado sigue siendo 2.000 €, real al medio 1.100 €"
else
  fail "se esperaba '90000|200000|110000|90000|Fee negociado con el cliente.', salió: $ROW2"
fi

OVERRIDES_2="$(as_team "select count(*) from overrides where proposal_id = '$PID2'::uuid;")"
if [[ "$OVERRIDES_2" == "1" ]]; then
  pass "exactamente una fila en overrides para el reparto forzado a mano"
else
  fail "se esperaba 1 fila en overrides, salieron $OVERRIDES_2"
fi

OVERRIDE_ROW="$(as_team "
  select o.kind, o.support_id, o.created_by, (o.created_at is not null), o.reason
  from overrides o where o.proposal_id = '$PID2'::uuid;
")"
if [[ "$OVERRIDE_ROW" == "MEDIA_FEE_FORCED|ADS-01|$VINCENT|t|Fee negociado con el cliente." ]]; then
  pass "la fila de overrides tiene el kind, el soporte, el autor, marca de tiempo y el motivo del comercial"
else
  fail "se esperaba 'MEDIA_FEE_FORCED|ADS-01|$VINCENT|t|Fee negociado con el cliente.', salió: $OVERRIDE_ROW"
fi

echo "=== Caso 3: el reparto forzado se registra una sola vez por soporte, no por mercado ==="
R3="$(as_team "$(payload 'Office Tres' u3@example.com 90000 '["FR","ES"]')")"
PID3="$(echo "$R3" | sed -n "s/.*\"proposal_id\": \"\([^\"]*\)\".*/\1/p")"

LINES_3="$(as_team "select count(*) from proposal_option_lines l join proposal_options po on po.id = l.option_id where po.proposal_id = '$PID3'::uuid;")"
if [[ "$LINES_3" == "2" ]]; then
  pass "dos líneas persistidas (una por mercado), como siempre"
else
  fail "se esperaban 2 líneas, salieron $LINES_3"
fi

OVERRIDES_3="$(as_team "select count(*) from overrides where proposal_id = '$PID3'::uuid;")"
if [[ "$OVERRIDES_3" == "1" ]]; then
  pass "una sola fila en overrides pese a que el soporte se vende en dos mercados (dedup por is_lead_market)"
else
  fail "se esperaba 1 fila en overrides, salieron $OVERRIDES_3"
fi

echo "=== Caso 4: get_public_proposal nunca revela el desglose ==="
# Marca PID2 como SENT para que get_public_proposal lo muestre.
TOKEN2="$(as_team "select public_token from proposals where id = '$PID2'::uuid;")"
as_team "select mark_proposal_sent('$PID2'::uuid, '{}'::jsonb);" > /dev/null

PUBLIC_JSON="$(as_team "select get_public_proposal('$TOKEN2');")"
if echo "$PUBLIC_JSON" | grep -q "net_revenue_cents"; then
  fail "get_public_proposal sigue devolviendo net_revenue_cents: revela el fee de una opción con una sola línea de media buy"
else
  pass "get_public_proposal ya no incluye net_revenue_cents"
fi
if echo "$PUBLIC_JSON" | grep -qE "manual_fee|media_real_spend"; then
  fail "get_public_proposal revela el desglose interno del reparto de medios"
else
  pass "get_public_proposal no incluye ningún campo del desglose interno (fee, real al medio, forzado)"
fi
if echo "$PUBLIC_JSON" | grep -q '"billed_total_cents": 200000' && echo "$PUBLIC_JSON" | grep -q '"media_budget_cents": 200000'; then
  pass "el cliente sigue viendo el importe facturado y su propio presupuesto de medios (2.000 €), sin el desglose"
else
  fail "no se encontraron billed_total_cents/media_budget_cents = 200000 en la respuesta pública: $PUBLIC_JSON"
fi

$PSQL -c "drop database if exists $DB;" > /dev/null

echo
echo "Todo OK: el fee de gestión de media buy se resta del presupuesto de medios (nunca se suma), el reparto forzado a mano se registra en overrides con autor y motivo, y el desglose nunca llega a la pantalla pública — verificado contra un PostgreSQL 16 real."
