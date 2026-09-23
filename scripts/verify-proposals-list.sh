#!/usr/bin/env bash
# Reproduce y verifica, contra un PostgreSQL 16 real, las consultas de
# listado de presupuestos (CLAUDE.md §10.1.1, ronda 7 — `/proposals`,
# `/accounts/[id]`): filtro por estado, filtro por creador, y listado por
# cuenta. Las páginas hacen `.from('proposals').select(...).eq(...)` de
# postgrest — equivalente en SQL plano a lo que este script ejercita
# directamente bajo RLS, igual que el resto de scripts/verify-*.sh.
#
# El punto que de verdad puede fallar en silencio es RLS, no el filtro en
# sí (`team_all` no distingue por owner_id — CLAUDE.md §10.3 septies): un
# miembro de equipo tiene que ver los presupuestos de TODOS, no solo los
# suyos. Si alguna vez se añadiera sin querer una política que sí filtrara
# por owner_id, este script lo detectaría.
#
# Casos:
#   1. Filtrar por estado (SENT) devuelve solo las filas de ese estado.
#   2. Filtrar por creador (owner_id) devuelve solo las suyas.
#   3. Un miembro de equipo ve los presupuestos de OTRO miembro también
#      (team_all, sin scoping por owner_id) — sin filtro, cuenta ambos.
#   4. Filtrar por cuenta (account_id) devuelve solo los de esa cuenta.
#
# Uso: scripts/verify-proposals-list.sh [nombre_de_base_de_datos]
set -euo pipefail

DB="${1:-wk_proposals_list_verify}"
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

# Dos comerciales: Vincent y Rémi. Cada uno envía un presupuesto para una
# cuenta distinta; Vincent además tiene uno segundo, en DRAFT (email
# fallido, nunca llegó a SENT).
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

VINCENT=11111111-1111-1111-1111-111111111111
VINCENT_EMAIL=vincent.pla@weekendesk.fr
REMI=22222222-2222-2222-2222-222222222222
REMI_EMAIL=remi.challal@weekendesk.fr

R1="$(as_user "$VINCENT" "$VINCENT_EMAIL" "$(proposal_payload 'Office Vincent' v@example.com)")"
PID1="$(echo "$R1" | sed -n "s/.*\"proposal_id\": \"\([^\"]*\)\".*/\1/p")"
as_user "$VINCENT" "$VINCENT_EMAIL" "select mark_proposal_sent('$PID1'::uuid, '{}'::jsonb);" > /dev/null

R2="$(as_user "$REMI" "$REMI_EMAIL" "$(proposal_payload 'Office Remi' r@example.com)")"
PID2="$(echo "$R2" | sed -n "s/.*\"proposal_id\": \"\([^\"]*\)\".*/\1/p")"
as_user "$REMI" "$REMI_EMAIL" "select mark_proposal_sent('$PID2'::uuid, '{}'::jsonb);" > /dev/null

# Un segundo presupuesto de Vincent, para OTRA cuenta, que se queda en DRAFT
# (el email nunca llegó a intentarse) — exactamente el caso que la pantalla
# de detalle (§10.3 septies) resuelve con "Reintentar envío".
R3="$(as_user "$VINCENT" "$VINCENT_EMAIL" "$(proposal_payload 'Office Vincent Dos' v2@example.com)")"
PID3="$(echo "$R3" | sed -n "s/.*\"proposal_id\": \"\([^\"]*\)\".*/\1/p")"

echo "=== Caso 1: filtrar por estado (SENT) devuelve solo las filas de ese estado ==="
SENT_COUNT="$(as_user "$VINCENT" "$VINCENT_EMAIL" "select count(*) from proposals where status = 'SENT';")"
DRAFT_COUNT="$(as_user "$VINCENT" "$VINCENT_EMAIL" "select count(*) from proposals where status = 'DRAFT';")"
if [[ "$SENT_COUNT" == "2" && "$DRAFT_COUNT" == "1" ]]; then
  pass "2 SENT (Vincent + Rémi) y 1 DRAFT (el de Vincent sin enviar), exactamente"
else
  fail "se esperaban 2 SENT y 1 DRAFT, salió SENT=$SENT_COUNT DRAFT=$DRAFT_COUNT"
fi

echo "=== Caso 2: filtrar por creador (owner_id) devuelve solo las suyas ==="
VINCENT_OWNED="$(as_user "$VINCENT" "$VINCENT_EMAIL" "select count(*) from proposals where owner_id = '$VINCENT'::uuid;")"
REMI_OWNED="$(as_user "$VINCENT" "$VINCENT_EMAIL" "select count(*) from proposals where owner_id = '$REMI'::uuid;")"
if [[ "$VINCENT_OWNED" == "2" && "$REMI_OWNED" == "1" ]]; then
  pass "el filtro por creador separa correctamente 2 de Vincent y 1 de Rémi"
else
  fail "se esperaba 2 de Vincent y 1 de Rémi, salió Vincent=$VINCENT_OWNED Remi=$REMI_OWNED"
fi

echo "=== Caso 3: Vincent ve TAMBIÉN los presupuestos de Rémi (team_all, sin scoping por owner_id) ==="
VINCENT_SEES_ALL="$(as_user "$VINCENT" "$VINCENT_EMAIL" "select count(*) from proposals;")"
REMI_SEES_ALL="$(as_user "$REMI" "$REMI_EMAIL" "select count(*) from proposals;")"
if [[ "$VINCENT_SEES_ALL" == "3" && "$REMI_SEES_ALL" == "3" ]]; then
  pass "sin filtro, cualquier miembro de equipo ve los 3 presupuestos (no solo los suyos)"
else
  fail "se esperaba que ambos vieran 3, salió Vincent=$VINCENT_SEES_ALL Remi=$REMI_SEES_ALL"
fi

echo "=== Caso 4: listado por cuenta devuelve solo los presupuestos de esa cuenta ==="
ACCOUNT_VINCENT_1="$(as_user "$VINCENT" "$VINCENT_EMAIL" "select id from accounts where legal_name = 'Office Vincent';")"
ACCOUNT_PROPOSALS="$(as_user "$VINCENT" "$VINCENT_EMAIL" "select count(*) from proposals where account_id = '$ACCOUNT_VINCENT_1'::uuid;")"
if [[ "$ACCOUNT_PROPOSALS" == "1" ]]; then
  pass "el listado de 'Office Vincent' devuelve exactamente su único presupuesto (el DRAFT es de otra cuenta)"
else
  fail "se esperaba 1 presupuesto para 'Office Vincent', salió $ACCOUNT_PROPOSALS"
fi

echo "=== Caso 5: el join cuenta/contacto/creador que usa el listado resuelve sin error ==="
JOINED="$(as_user "$VINCENT" "$VINCENT_EMAIL" "
  select a.legal_name, c.full_name, p.full_name
  from proposals pr
  join accounts a on a.id = pr.account_id
  join contacts c on c.id = pr.contact_id
  join profiles p on p.id = pr.owner_id
  where pr.id = '$PID3'::uuid;
")"
if echo "$JOINED" | grep -q "Office Vincent Dos|Contacto|Vincent Pla"; then
  pass "el join cuenta+contacto+creador de la línea DRAFT resuelve con los datos correctos"
else
  fail "se esperaba 'Office Vincent Dos|Contacto|Vincent Pla', salió: $JOINED"
fi

$PSQL -c "drop database if exists $DB;" > /dev/null

echo
echo "Todo OK: las consultas de listado de presupuestos (por estado, por creador, por cuenta) están verificadas contra un PostgreSQL 16 real, incluida la visibilidad de equipo completa que exige RLS (team_all)."
