#!/usr/bin/env bash
# Reproduce y verifica, contra un PostgreSQL 16 real, el flujo de
# contrapropuesta editable del cliente + revisión interna (CLAUDE.md,
# ronda 16): rol de administrador, submit_counter_proposal,
# accept_counter_proposal, reject_counter_proposal, y la restricción de
# quién puede decidir (solo el propietario del presupuesto o un admin).
#
# Casos:
#   1. profiles.is_admin: la migración marca a Vincent SOLO si su fila de
#      profiles ya existía al aplicarse (CLAUDE.md §9) — reproducido
#      aplicando el resto de migraciones primero, insertando su perfil, y
#      SOLO ENTONCES aplicando esta. El trigger de protección bloquea a
#      `authenticated` (incluso sobre su propia fila) y solo deja pasar a
#      `service_role`.
#   2. Un cliente envía una contrapropuesta (edita el precio de una línea,
#      borra otra) -> proposals.status pasa a COUNTERED. Un soporte ajeno a
#      la opción enviada (no en la opción original) se rechaza.
#   3. Un miembro de equipo que NO es ni propietario ni admin (Rémi, antes
#      de promoverlo) no puede aceptar ni rechazar la contrapropuesta.
#   4. El propietario (Vincent) SÍ puede — motivo vacío o solo espacios al
#      rechazar se rechaza; con motivo, la contrapropuesta y el presupuesto
#      original quedan REJECTED, y un segundo intento de decidir sobre la
#      misma contrapropuesta ya decidida se bloquea.
#   5. Aceptar una contrapropuesta: crea un presupuesto ACCEPTED nuevo con
#      version+1/supersedes_id, solo con las líneas NO eliminadas, con los
#      precios/cantidades tal como los tecleó el cliente (nunca
#      recalculados), un override MARGIN_BELOW_FLOOR si se fuerza, y una
#      fila en acceptances con el régimen de IVA correcto (FR_VAT_20 para
#      cuenta francesa, REVERSE_CHARGE para cuenta UE con VIES válido).
#   6. Un admin que NO es el propietario (Rémi, promovido con service_role)
#      también puede decidir sobre una contrapropuesta ajena.
#   7. El conflicto de disponibilidad (soporte/mercado ya ACEPTADO por otra
#      cuenta, fechas solapadas) sigue bloqueando accept_counter_proposal,
#      sin ninguna excepción.
#
# Uso: scripts/verify-counter-proposals.sh [nombre_de_base_de_datos]
set -euo pipefail

DB="${1:-wk_counter_proposals_verify}"
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

VINCENT=11111111-1111-1111-1111-111111111111
VINCENT_EMAIL=vincent.pla@weekendesk.fr
REMI=22222222-2222-2222-2222-222222222222
REMI_EMAIL=remi.challal@weekendesk.fr

$PSQL -c "drop database if exists $DB;" -c "create database $DB;" > /dev/null
$PSQL -d "$DB" -f "$WORKDIR/00_supabase_shim.sql" > /dev/null

echo "=== Caso 1: profiles.is_admin — el seed solo marca a Vincent si su perfil ya existía ==="
COUNTER_MIGRATION="20260930090000_counter_proposals.sql"
for f in "$WORKDIR"/2026*.sql; do
  if [[ "$(basename "$f")" == "$COUNTER_MIGRATION" ]]; then
    continue
  fi
  $PSQL -d "$DB" -f "$f" > /dev/null
done

# Vincent ya tiene su perfil ANTES de aplicar la migración de esta ronda —
# reproduce el caso real: alguien que ya hizo su primer login.
$PSQL -d "$DB" -At <<SQL > /dev/null
insert into auth.users (id, email) values ('$VINCENT', '$VINCENT_EMAIL');
insert into allowed_emails (email) values ('$VINCENT_EMAIL');
insert into profiles (id, email, full_name, is_active) values ('$VINCENT', '$VINCENT_EMAIL', 'Vincent Pla', true);
SQL

$PSQL -d "$DB" -f "$WORKDIR/$COUNTER_MIGRATION" > /dev/null

VINCENT_IS_ADMIN="$($PSQL -d "$DB" -At -c "select is_admin from profiles where id = '$VINCENT'::uuid;")"
if [[ "$VINCENT_IS_ADMIN" == "t" ]]; then
  pass "el seed marca a Vincent como admin porque su perfil ya existía al aplicar la migración"
else
  fail "se esperaba is_admin=true para Vincent, salió: $VINCENT_IS_ADMIN"
fi

# Rémi entra DESPUÉS de la migración — perfil nuevo, is_admin por defecto false.
$PSQL -d "$DB" -At <<SQL > /dev/null
insert into auth.users (id, email) values ('$REMI', '$REMI_EMAIL');
insert into allowed_emails (email) values ('$REMI_EMAIL');
insert into profiles (id, email, full_name, is_active) values ('$REMI', '$REMI_EMAIL', 'Rémi Challal', true);
SQL

REMI_IS_ADMIN="$($PSQL -d "$DB" -At -c "select is_admin from profiles where id = '$REMI'::uuid;")"
if [[ "$REMI_IS_ADMIN" == "f" ]]; then
  pass "Rémi, sin marcar explícitamente, arranca con is_admin=false"
else
  fail "se esperaba is_admin=false para Rémi, salió: $REMI_IS_ADMIN"
fi

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
as_vincent() { as_user "$VINCENT" "$VINCENT_EMAIL" "$1"; }
as_remi() { as_user "$REMI" "$REMI_EMAIL" "$1"; }
as_anon() {
  $PSQL -d "$DB" -At <<SQL
set role anon;
$1
reset role;
SQL
}
as_service() {
  $PSQL -d "$DB" -At <<SQL
set role service_role;
$1
reset role;
SQL
}

echo "=== Caso 1 (cont.): el trigger de protección bloquea a authenticated, incluso sobre la propia fila ==="
set +e
SELF_PROMOTE_ERR="$(as_remi "update profiles set is_admin = true where id = '$REMI'::uuid;" 2>&1)"
SELF_PROMOTE_STATUS=$?
set -e
if [[ $SELF_PROMOTE_STATUS -ne 0 ]] && echo "$SELF_PROMOTE_ERR" | grep -q "Solo la clave de servicio puede cambiar profiles.is_admin"; then
  pass "Rémi no puede auto-promoverse a admin con su propia sesión"
else
  fail "se esperaba que el auto-ascenso fallara, salió: $SELF_PROMOTE_ERR"
fi

SERVICE_PROMOTE="$(as_service "update profiles set is_admin = true where id = '$REMI'::uuid returning is_admin;" || true)"
# Se revierte de inmediato: Rémi debe seguir sin ser admin hasta el caso 6.
as_service "update profiles set is_admin = false where id = '$REMI'::uuid;" > /dev/null
if [[ "$SERVICE_PROMOTE" == "t" ]]; then
  pass "service_role sí puede cambiar is_admin (revertido de inmediato para el resto de casos)"
else
  fail "se esperaba que service_role pudiera promoverlo, salió: $SERVICE_PROMOTE"
fi

# ------------------------------------------------------------------------
# Helpers de presupuesto: una opción con dos líneas normales (ON-01, CRM-01).
# ------------------------------------------------------------------------
send_two_line_proposal() {
  local legal_name="$1" contact_email="$2" country="$3" market="$4" start="$5" end_="$6"
  as_vincent "
select create_and_send_proposal(jsonb_build_object(
  'account', jsonb_build_object('legal_name','$legal_name','country_code','$country'),
  'contact', jsonb_build_object('full_name','Contacto','email','$contact_email','language','FR'),
  'language','FR','brief','b',
  'options', jsonb_build_array(
    jsonb_build_object('code','A','name','Unica','pitch','p','sort_order',0,'markets',jsonb_build_array('$market'),
      'campaign_start','$start','campaign_end','$end_',
      'gross_net_of_media_cents',140000,'effective_discount_cents',0,'net_revenue_cents',140000,
      'media_budget_cents',0,'billed_total_cents',140000,'cost_cents',56000,'margin_cents',84000,
      'margin_rate',0.6,'max_lead_time_business_days',15,'volume_discount_disabled',false,
      'lines', jsonb_build_array(
        jsonb_build_object('support_id','ON-01','market','$market','quantity',1,'is_lead_market',true,
          'unit_cost_cents',14000,'cost_cents',14000,'gross_price_cents',43000,'margin_floor_cents',28000,
          'floor_applied',false,'list_price_cents',43000,'discount_cents',0,'net_price_cents',43000,
          'billed_total_cents',43000,'sort_order',0),
        jsonb_build_object('support_id','CRM-01','market','$market','quantity',1,'is_lead_market',true,
          'unit_cost_cents',42000,'cost_cents',42000,'gross_price_cents',97000,'margin_floor_cents',84000,
          'floor_applied',false,'list_price_cents',97000,'discount_cents',0,'net_price_cents',97000,
          'billed_total_cents',97000,'sort_order',1)
      ),
      'discounts', '[]'::jsonb)
  )
));
"
}

extract() { echo "$1" | sed -n "s/.*\"$2\": \"\([^\"]*\)\".*/\1/p"; }

echo "=== Caso 2: el cliente envía una contrapropuesta (edita ON-01, borra CRM-01) -> proposals.status = COUNTERED ==="
R1="$(send_two_line_proposal 'Office Uno' u1@example.com FR FR 2027-06-01 2027-06-28)"
PID1="$(extract "$R1" proposal_id)"
TOKEN1="$(extract "$R1" public_token)"
as_vincent "select mark_proposal_sent('$PID1'::uuid, '{}'::jsonb);" > /dev/null

echo "=== Caso 2 (previo): get_public_proposal expone billed_total_cents por línea (ronda 16, para el formulario editable) ==="
PUBLIC_JSON_1="$($PSQL -d "$DB" -At -c "select get_public_proposal('$TOKEN1');")"
if echo "$PUBLIC_JSON_1" | grep -q '"support_id": "ON-01".*"billed_total_cents": 43000' \
  || (echo "$PUBLIC_JSON_1" | grep -q '"billed_total_cents": 43000' && echo "$PUBLIC_JSON_1" | grep -q '"billed_total_cents": 97000'); then
  pass "get_public_proposal expone billed_total_cents por línea (43000/97000), no solo por opción"
else
  fail "no se encontró billed_total_cents por línea en la respuesta pública: $PUBLIC_JSON_1"
fi

CP1_LINES='[
  {"support_id":"ON-01","market":"FR","deleted":false,"original_price_cents":43000,"original_quantity":1,"client_price_cents":35000,"client_quantity":1},
  {"support_id":"CRM-01","market":"FR","deleted":true,"original_price_cents":97000,"original_quantity":1,"client_price_cents":0,"client_quantity":0}
]'

submit_cp() {
  local token="$1" lines="$2" start="$3" end_="$4" vat="$5" vies="$6"
  as_anon "
select submit_counter_proposal(
  '$token', 'A', '$lines'::jsonb,
  '$start'::date, '$end_'::date, null, null,
  'Office Contrapropuesta SL', 'Calle Test 1', '$vat',
  'Contable', 'contable@example.com', 'Firmante', 'Director', 'PO-CP-1',
  '$vies'::vies_result, '{}'::jsonb
);
"
}

echo "=== Caso 2 (cont.): un soporte ajeno a la opción enviada se rechaza (el envío sigue SENT, sin consumir el intento) ==="
BAD_LINES='[{"support_id":"SOC-01","market":"FR","deleted":false,"original_price_cents":80000,"original_quantity":1,"client_price_cents":50000,"client_quantity":1}]'
set +e
BAD_SUPPORT_ERR="$(submit_cp "$TOKEN1" "$BAD_LINES" 2027-06-01 2027-06-28 ES00000000 INVALID 2>&1)"
BAD_SUPPORT_STATUS=$?
set -e
if [[ $BAD_SUPPORT_STATUS -ne 0 ]] && echo "$BAD_SUPPORT_ERR" | grep -q "no forma parte de la opción enviada"; then
  pass "un soporte que no estaba en la opción original se rechaza"
else
  fail "se esperaba el error de soporte ajeno, salió: $BAD_SUPPORT_ERR"
fi

R_CP1="$(submit_cp "$TOKEN1" "$CP1_LINES" 2027-06-01 2027-06-28 ES00000000 INVALID)"
CP1_ID="$(extract "$R_CP1" counter_proposal_id)"
if [[ -n "$CP1_ID" ]]; then
  pass "submit_counter_proposal devuelve un counter_proposal_id"
else
  fail "no se recibió counter_proposal_id, salió: $R_CP1"
fi

STATUS_AFTER_COUNTER="$($PSQL -d "$DB" -At -c "select status from proposals where id = '$PID1'::uuid;")"
if [[ "$STATUS_AFTER_COUNTER" == "COUNTERED" ]]; then
  pass "proposals.status pasa a COUNTERED tras la contrapropuesta"
else
  fail "se esperaba COUNTERED, salió: $STATUS_AFTER_COUNTER"
fi

echo "=== Caso 2 (cont.): un envío que ya no está en SENT/VIEWED no admite nueva contrapropuesta ==="
set +e
ALREADY_COUNTERED_ERR="$(submit_cp "$TOKEN1" "$CP1_LINES" 2027-06-01 2027-06-28 ES00000000 INVALID 2>&1)"
ALREADY_COUNTERED_STATUS=$?
set -e
if [[ $ALREADY_COUNTERED_STATUS -ne 0 ]] && echo "$ALREADY_COUNTERED_ERR" | grep -q "ya no admite respuesta"; then
  pass "un envío ya COUNTERED no admite una segunda contrapropuesta"
else
  fail "se esperaba el error de estado, salió: $ALREADY_COUNTERED_ERR"
fi

echo "=== Caso 3: Rémi (ni propietario ni admin) no puede decidir sobre la contrapropuesta de Vincent ==="
set +e
REMI_REJECT_ERR="$(as_remi "select reject_counter_proposal('$CP1_ID'::uuid, 'motivo de Rémi');" 2>&1)"
REMI_REJECT_STATUS=$?
set -e
if [[ $REMI_REJECT_STATUS -ne 0 ]] && echo "$REMI_REJECT_ERR" | grep -q "Solo el creador de este presupuesto o un administrador"; then
  pass "Rémi no puede rechazar la contrapropuesta (ni propietario ni admin)"
else
  fail "se esperaba el bloqueo por permisos, salió: $REMI_REJECT_ERR"
fi

set +e
REMI_ACCEPT_ERR="$(as_remi "select accept_counter_proposal('$CP1_ID'::uuid, '[]'::jsonb);" 2>&1)"
REMI_ACCEPT_STATUS=$?
set -e
if [[ $REMI_ACCEPT_STATUS -ne 0 ]] && echo "$REMI_ACCEPT_ERR" | grep -q "Solo el creador de este presupuesto o un administrador"; then
  pass "Rémi tampoco puede aceptar la contrapropuesta"
else
  fail "se esperaba el bloqueo por permisos, salió: $REMI_ACCEPT_ERR"
fi

echo "=== Caso 4: Vincent (propietario) rechaza — motivo vacío o solo espacios no tiene efecto ==="
set +e
BLANK_REASON_ERR="$(as_vincent "select reject_counter_proposal('$CP1_ID'::uuid, '   ');" 2>&1)"
BLANK_REASON_STATUS=$?
set -e
if [[ $BLANK_REASON_STATUS -ne 0 ]] && echo "$BLANK_REASON_ERR" | grep -q "motivo de rechazo es obligatorio"; then
  pass "un motivo vacío/solo espacios bloquea el rechazo"
else
  fail "se esperaba el bloqueo por motivo vacío, salió: $BLANK_REASON_ERR"
fi

as_vincent "select reject_counter_proposal('$CP1_ID'::uuid, 'Precio demasiado bajo, no cubre costes.');" > /dev/null

CP1_STATUS_ROW="$($PSQL -d "$DB" -At -c "select status, rejection_reason, reviewed_by, (reviewed_at is not null) from counter_proposals where id = '$CP1_ID'::uuid;")"
if [[ "$CP1_STATUS_ROW" == "REJECTED|Precio demasiado bajo, no cubre costes.|$VINCENT|t" ]]; then
  pass "counter_proposals queda REJECTED con motivo, revisor y marca de tiempo correctos"
else
  fail "se esperaba 'REJECTED|Precio demasiado bajo, no cubre costes.|$VINCENT|t', salió: $CP1_STATUS_ROW"
fi

PID1_STATUS="$($PSQL -d "$DB" -At -c "select status from proposals where id = '$PID1'::uuid;")"
if [[ "$PID1_STATUS" == "REJECTED" ]]; then
  pass "el presupuesto original pasa a REJECTED"
else
  fail "se esperaba REJECTED, salió: $PID1_STATUS"
fi

echo "=== Caso 4 (cont.): una contrapropuesta ya decidida no se puede volver a decidir ==="
set +e
ALREADY_DECIDED_ERR="$(as_vincent "select accept_counter_proposal('$CP1_ID'::uuid, '[]'::jsonb);" 2>&1)"
ALREADY_DECIDED_STATUS=$?
set -e
if [[ $ALREADY_DECIDED_STATUS -ne 0 ]] && echo "$ALREADY_DECIDED_ERR" | grep -q "ya se decidió"; then
  pass "una contrapropuesta ya REJECTED no se puede volver a aceptar/rechazar"
else
  fail "se esperaba el bloqueo por estado ya decidido, salió: $ALREADY_DECIDED_ERR"
fi

echo "=== Caso 5: aceptar una contrapropuesta — nuevo presupuesto ACCEPTED, version+1, solo líneas no eliminadas, override de margen ==="
R2="$(send_two_line_proposal 'Office Dos' u2@example.com FR FR 2027-07-01 2027-07-28)"
PID2="$(extract "$R2" proposal_id)"
TOKEN2="$(extract "$R2" public_token)"
as_vincent "select mark_proposal_sent('$PID2'::uuid, '{}'::jsonb);" > /dev/null

CP2_LINES='[
  {"support_id":"ON-01","market":"FR","deleted":false,"original_price_cents":43000,"original_quantity":1,"client_price_cents":20000,"client_quantity":1},
  {"support_id":"CRM-01","market":"FR","deleted":true,"original_price_cents":97000,"original_quantity":1,"client_price_cents":0,"client_quantity":0}
]'
R_CP2="$(submit_cp "$TOKEN2" "$CP2_LINES" 2027-07-01 2027-07-28 FR00000000 INVALID)"
CP2_ID="$(extract "$R_CP2" counter_proposal_id)"

set +e
REMI_ACCEPT_CP2_ERR="$(as_remi "select accept_counter_proposal('$CP2_ID'::uuid, '[]'::jsonb);" 2>&1)"
REMI_ACCEPT_CP2_STATUS=$?
set -e
if [[ $REMI_ACCEPT_CP2_STATUS -ne 0 ]] && echo "$REMI_ACCEPT_CP2_ERR" | grep -q "Solo el creador de este presupuesto o un administrador"; then
  pass "Rémi sigue sin poder aceptar esta segunda contrapropuesta (no es propietario ni admin)"
else
  fail "se esperaba el bloqueo por permisos, salió: $REMI_ACCEPT_CP2_ERR"
fi

MARGIN_OVERRIDES='[{"support_id":"ON-01","market":"FR","reason":"Cliente estrategico, margen bajo aceptado por Vincent."}]'
R_ACCEPT="$(as_vincent "select accept_counter_proposal('$CP2_ID'::uuid, '$MARGIN_OVERRIDES'::jsonb);")"
NEW_PID="$(extract "$R_ACCEPT" new_proposal_id)"
ACCEPTANCE_ID="$(extract "$R_ACCEPT" acceptance_id)"
if [[ -n "$NEW_PID" && -n "$ACCEPTANCE_ID" ]]; then
  pass "accept_counter_proposal devuelve new_proposal_id y acceptance_id"
else
  fail "no se recibieron ambos ids, salió: $R_ACCEPT"
fi

NEW_PROPOSAL_ROW="$($PSQL -d "$DB" -At -c "
  select version, supersedes_id, status, owner_id, account_id, contact_id, (public_token is not null and public_token <> '')
  from proposals where id = '$NEW_PID'::uuid;
")"
if [[ "$NEW_PROPOSAL_ROW" == "2|$PID2|ACCEPTED|$VINCENT"*"|t" ]]; then
  pass "el presupuesto nuevo es version=2, supersedes_id=original, status=ACCEPTED, con owner y token propios"
else
  fail "fila de presupuesto nuevo inesperada: $NEW_PROPOSAL_ROW"
fi

NEW_OPTION_ROW="$($PSQL -d "$DB" -At -c "
  select markets, campaign_start, campaign_end, billed_total_cents
  from proposal_options where proposal_id = '$NEW_PID'::uuid;
")"
if [[ "$NEW_OPTION_ROW" == "{FR}|2027-07-01|2027-07-28|20000" ]]; then
  pass "la opción nueva lleva los mercados/fechas de la contrapropuesta y el total facturado es solo la línea NO eliminada"
else
  fail "se esperaba '{FR}|2027-07-01|2027-07-28|20000', salió: $NEW_OPTION_ROW"
fi

NEW_LINES_COUNT="$($PSQL -d "$DB" -At -c "
  select count(*) from proposal_option_lines l
  join proposal_options po on po.id = l.option_id
  where po.proposal_id = '$NEW_PID'::uuid;
")"
if [[ "$NEW_LINES_COUNT" == "1" ]]; then
  pass "solo una línea sobrevive (CRM-01, eliminada por el cliente, no se persiste)"
else
  fail "se esperaba 1 línea, salieron $NEW_LINES_COUNT"
fi

NEW_LINE_ROW="$($PSQL -d "$DB" -At -c "
  select l.support_id, l.quantity, l.net_price_cents, l.billed_total_cents
  from proposal_option_lines l
  join proposal_options po on po.id = l.option_id
  where po.proposal_id = '$NEW_PID'::uuid;
")"
if [[ "$NEW_LINE_ROW" == "ON-01|1.00|20000|20000" ]]; then
  pass "la línea que sobrevive lleva exactamente el precio/cantidad tecleados por el cliente (20000, no 43000)"
else
  fail "se esperaba 'ON-01|1.00|20000|20000', salió: $NEW_LINE_ROW"
fi

OVERRIDE_ROW="$($PSQL -d "$DB" -At -c "
  select kind, support_id, reason, created_by
  from overrides where proposal_id = '$NEW_PID'::uuid;
")"
if [[ "$OVERRIDE_ROW" == "MARGIN_BELOW_FLOOR|ON-01|Cliente estrategico, margen bajo aceptado por Vincent.|$VINCENT" ]]; then
  pass "el margen forzado se registra en overrides (MARGIN_BELOW_FLOOR), primer uso real de este kind"
else
  fail "fila de overrides inesperada: $OVERRIDE_ROW"
fi

ACCEPTANCE_ROW="$($PSQL -d "$DB" -At -c "
  select proposal_id, vat_regime_applied, legal_name
  from acceptances where id = '$ACCEPTANCE_ID'::uuid;
")"
if [[ "$ACCEPTANCE_ROW" == "$NEW_PID|FR_VAT_20|Office Contrapropuesta SL" ]]; then
  pass "acceptances: régimen FR_VAT_20 para cuenta francesa, con los datos fiscales tecleados por el cliente"
else
  fail "fila de acceptances inesperada: $ACCEPTANCE_ROW"
fi

CP2_STATUS_ROW="$($PSQL -d "$DB" -At -c "
  select status, resulting_proposal_id, reviewed_by from counter_proposals where id = '$CP2_ID'::uuid;
")"
if [[ "$CP2_STATUS_ROW" == "ACCEPTED|$NEW_PID|$VINCENT" ]]; then
  pass "counter_proposals queda ACCEPTED, con resulting_proposal_id y revisor correctos"
else
  fail "se esperaba 'ACCEPTED|$NEW_PID|$VINCENT', salió: $CP2_STATUS_ROW"
fi

echo "=== Caso 5 (cont.): régimen REVERSE_CHARGE para cuenta UE con VIES válido ==="
R3="$(send_two_line_proposal 'Office Tres NL' u3@example.com NL NL 2027-08-01 2027-08-28)"
PID3="$(extract "$R3" proposal_id)"
TOKEN3="$(extract "$R3" public_token)"
as_vincent "select mark_proposal_sent('$PID3'::uuid, '{}'::jsonb);" > /dev/null

CP3_LINES='[
  {"support_id":"ON-01","market":"NL","deleted":false,"original_price_cents":43000,"original_quantity":1,"client_price_cents":43000,"client_quantity":1},
  {"support_id":"CRM-01","market":"NL","deleted":true,"original_price_cents":97000,"original_quantity":1,"client_price_cents":0,"client_quantity":0}
]'
R_CP3="$(submit_cp "$TOKEN3" "$CP3_LINES" 2027-08-01 2027-08-28 NL123456789B01 VALID)"
CP3_ID="$(extract "$R_CP3" counter_proposal_id)"

R3_ACCEPT="$(as_vincent "select accept_counter_proposal('$CP3_ID'::uuid, '[]'::jsonb);")"
NEW_PID3="$(extract "$R3_ACCEPT" new_proposal_id)"
ACCEPTANCE_ID3="$(extract "$R3_ACCEPT" acceptance_id)"

VAT_REGIME_3="$($PSQL -d "$DB" -At -c "select vat_regime_applied from acceptances where id = '$ACCEPTANCE_ID3'::uuid;")"
if [[ "$VAT_REGIME_3" == "REVERSE_CHARGE" ]]; then
  pass "cuenta neerlandesa con VIES válido -> REVERSE_CHARGE, sin ninguna excepción por mercado (CLAUDE.md ronda 14, confirmado también aquí)"
else
  fail "se esperaba REVERSE_CHARGE, salió: $VAT_REGIME_3"
fi

echo "=== Caso 6: un admin que NO es el propietario (Rémi, promovido) también puede decidir ==="
as_service "update profiles set is_admin = true where id = '$REMI'::uuid;" > /dev/null

R4="$(send_two_line_proposal 'Office Cuatro' u4@example.com FR FR 2027-09-01 2027-09-28)"
PID4="$(extract "$R4" proposal_id)"
TOKEN4="$(extract "$R4" public_token)"
as_vincent "select mark_proposal_sent('$PID4'::uuid, '{}'::jsonb);" > /dev/null

CP4_LINES='[
  {"support_id":"ON-01","market":"FR","deleted":false,"original_price_cents":43000,"original_quantity":1,"client_price_cents":43000,"client_quantity":1},
  {"support_id":"CRM-01","market":"FR","deleted":true,"original_price_cents":97000,"original_quantity":1,"client_price_cents":0,"client_quantity":0}
]'
R_CP4="$(submit_cp "$TOKEN4" "$CP4_LINES" 2027-09-01 2027-09-28 FR00000000 INVALID)"
CP4_ID="$(extract "$R_CP4" counter_proposal_id)"

as_remi "select reject_counter_proposal('$CP4_ID'::uuid, 'Motivo de un admin no propietario.');" > /dev/null

CP4_STATUS_ROW="$($PSQL -d "$DB" -At -c "select status, reviewed_by from counter_proposals where id = '$CP4_ID'::uuid;")"
if [[ "$CP4_STATUS_ROW" == "REJECTED|$REMI" ]]; then
  pass "Rémi, como admin (no propietario), rechaza correctamente la contrapropuesta de un presupuesto de Vincent"
else
  fail "se esperaba 'REJECTED|$REMI', salió: $CP4_STATUS_ROW"
fi

echo "=== Caso 7: el conflicto de disponibilidad sigue bloqueando accept_counter_proposal, sin excepción ==="
# Carrera real: los dos presupuestos se envían y se contrapropone ANTES de
# que nadie acepte nada (si no, create_and_send_proposal ya bloquearía el
# segundo envío por sí solo, ver §3 — eso probaría el control equivocado).
# Solo DESPUÉS se acepta el primero, y entonces se intenta aceptar la
# contrapropuesta del segundo, que ahora sí choca.
R5A="$(send_two_line_proposal 'Office Ya Aceptado' u5a@example.com FR FR 2027-10-01 2027-10-31)"
PID5A="$(extract "$R5A" proposal_id)"
TOKEN5A="$(extract "$R5A" public_token)"
as_vincent "select mark_proposal_sent('$PID5A'::uuid, '{}'::jsonb);" > /dev/null

R5B="$(send_two_line_proposal 'Office Choca' u5b@example.com FR FR 2027-10-15 2027-11-15)"
PID5B="$(extract "$R5B" proposal_id)"
TOKEN5B="$(extract "$R5B" public_token)"
as_vincent "select mark_proposal_sent('$PID5B'::uuid, '{}'::jsonb);" > /dev/null

CP5B_LINES='[
  {"support_id":"ON-01","market":"FR","deleted":false,"original_price_cents":43000,"original_quantity":1,"client_price_cents":43000,"client_quantity":1},
  {"support_id":"CRM-01","market":"FR","deleted":true,"original_price_cents":97000,"original_quantity":1,"client_price_cents":0,"client_quantity":0}
]'
R_CP5B="$(submit_cp "$TOKEN5B" "$CP5B_LINES" 2027-10-15 2027-11-15 FR00000000 INVALID)"
CP5B_ID="$(extract "$R_CP5B" counter_proposal_id)"

as_anon "select accept_public_proposal('$TOKEN5A', 'A', 'Office Ya Aceptado SAS', 'Dir', 'FR11111111111', 'Fact', 'fact@yaaceptado.com', 'Firmante', 'Dir', 'PO-5A', 'VALID', '{}'::jsonb);" > /dev/null

set +e
CONFLICT_ERR="$(as_vincent "select accept_counter_proposal('$CP5B_ID'::uuid, '[]'::jsonb);" 2>&1)"
CONFLICT_STATUS=$?
set -e
if [[ $CONFLICT_STATUS -ne 0 ]] && echo "$CONFLICT_ERR" | grep -q "ya lo aceptó otro cliente en fechas solapadas"; then
  pass "aceptar una contrapropuesta que choca con un ya ACEPTADO de otra cuenta se bloquea, sin excepción"
else
  fail "se esperaba el bloqueo por conflicto de disponibilidad, salió: $CONFLICT_ERR"
fi

$PSQL -c "drop database if exists $DB;" > /dev/null

echo
echo "Todo OK: el flujo de contrapropuesta editable del cliente + revisión interna (CLAUDE.md, ronda 16) — rol de administrador, envío, restricción de propietario/admin, aceptar (nuevo presupuesto version+1, override de margen, régimen de IVA correcto) y rechazar (motivo obligatorio) — está verificado contra un PostgreSQL 16 real."
