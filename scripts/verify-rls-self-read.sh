#!/usr/bin/env bash
# Reproduce y verifica, contra un PostgreSQL 16 real (no un mock), los dos
# bugs de acceso de CLAUDE.md §10.3:
#
#   A. `service_role` sin privilegio de tabla (GRANT, no RLS) sobre
#      `allowed_emails`/`profiles`/etc. — el error real de producción:
#      "permission denied for table allowed_emails". `20260918140100_grants.sql`
#      concedía privilegios a `authenticated` explícitamente pero nunca a
#      `service_role`, asumiendo que Supabase se lo daba solo — falso en el
#      proyecto real. `20260919120000_service_role_grants.sql` lo arregla.
#
#   B. La dependencia circular de RLS para un usuario recién creado en
#      Supabase Auth, sin fila todavía en `profiles`: no puede leer su propia
#      fila de `allowed_emails` con su propia sesión, porque `team_all` exige
#      `is_team_member()`, y esa función da `false` hasta que la fila de
#      `profiles` exista. `resolveTeamAccess` (usada por
#      `app/login/actions.ts`) ya evita esto con la clave de servicio;
#      `20260919110000_self_read_policies.sql` lo arregla también para
#      cualquier código que use la sesión del usuario.
#
# A propósito, el shim de este script NO concede privilegios de tabla a
# `service_role` por su cuenta — antes lo hacía ("Supabase lo concede por
# defecto"), y ese supuesto ocultó el bug A durante una ronda entera. Ahora
# el script depende enteramente de las migraciones reales del repo, igual
# que Supabase en producción.
#
# Uso: scripts/verify-rls-self-read.sh [nombre_de_base_de_datos]
# Requiere psql y permiso para crear/borrar esa base de datos (por defecto
# se ejecuta todo con `sudo -u postgres`, como el resto de este script).
set -euo pipefail

DB="${1:-wk_rls_verify}"
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
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end
$$;

-- Deliberadamente NO se concede nada más a service_role aquí: los
-- privilegios de tabla tienen que salir de las migraciones reales
-- (20260919120000_service_role_grants.sql), igual que en producción. Dar
-- por hecho el bootstrapping implícito de Supabase es justo lo que ocultó
-- el bug A durante una ronda entera.
grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;
SQL

cp "$MIGRATIONS_DIR"/*.sql "$WORKDIR/"
chmod a+rX "$WORKDIR"/*.sql

$PSQL -c "drop database if exists $DB;" -c "create database $DB;" > /dev/null

apply_migrations() {
  $PSQL -d "$DB" -f "$WORKDIR/00_supabase_shim.sql" > /dev/null
  for f in "$WORKDIR"/2026*.sql; do
    if [[ -n "${1:-}" && "$(basename "$f")" == "$1" ]]; then
      break
    fi
    $PSQL -d "$DB" -f "$f" > /dev/null
  done
}

reset_db() {
  $PSQL -c "drop database if exists $DB;" -c "create database $DB;" > /dev/null
}

seed_and_query_new_user() {
  $PSQL -d "$DB" -At <<'SQL'
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'vincent.pla@weekendesk.fr'),
  ('22222222-2222-2222-2222-222222222222', 'nuevo@weekendesk.fr');
insert into allowed_emails (email) values ('vincent.pla@weekendesk.fr'), ('nuevo@weekendesk.fr');
insert into profiles (id, email, full_name, is_active)
  values ('11111111-1111-1111-1111-111111111111', 'vincent.pla@weekendesk.fr', 'Vincent Pla', true);

set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","email":"nuevo@weekendesk.fr","role":"authenticated"}';
select count(*) from allowed_emails where email = 'nuevo@weekendesk.fr';
reset role;
SQL
}

echo "=== Bug A, paso 1: sin service_role_grants, service_role NO puede leer allowed_emails (permission denied) ==="
reset_db
apply_migrations "20260919120000_service_role_grants.sql"
$PSQL -d "$DB" -c "insert into allowed_emails (email) values ('vincent.pla@weekendesk.fr');" > /dev/null
SERVICE_ROLE_ERROR="$(
  $PSQL -d "$DB" <<'SQL' 2>&1 || true
set role service_role;
select email from allowed_emails where email = 'vincent.pla@weekendesk.fr';
reset role;
SQL
)"
if echo "$SERVICE_ROLE_ERROR" | grep -q "permission denied for table allowed_emails"; then
  pass "reproducido: service_role sin el grant nuevo da \"permission denied for table allowed_emails\" — el mismo error de los logs de Vercel"
else
  fail "se esperaba \"permission denied for table allowed_emails\" para service_role antes del grant nuevo, salió:
$SERVICE_ROLE_ERROR"
fi

echo "=== Bug A, paso 2: con service_role_grants aplicada, service_role SÍ puede leer allowed_emails ==="
reset_db
apply_migrations ""  # todas, incluida service_role_grants
$PSQL -d "$DB" -c "insert into allowed_emails (email) values ('vincent.pla@weekendesk.fr');" > /dev/null
SERVICE_ROLE_EMAIL="$(
  $PSQL -d "$DB" -At <<'SQL'
set role service_role;
select email from allowed_emails where email = 'vincent.pla@weekendesk.fr';
reset role;
SQL
)"
if [[ "$SERVICE_ROLE_EMAIL" == "vincent.pla@weekendesk.fr" ]]; then
  pass "arreglado: service_role ya lee allowed_emails sin error"
else
  fail "se esperaba que service_role leyera la fila tras el grant nuevo, salió \"$SERVICE_ROLE_EMAIL\""
fi

echo "=== Bug B, paso 1: sin self_read_policies, un usuario nuevo (sin profiles) NO lee su propia fila con su sesión ==="
reset_db
apply_migrations "20260919110000_self_read_policies.sql"
NEW_USER_COUNT_BEFORE="$(seed_and_query_new_user | tail -1)"
if [[ "$NEW_USER_COUNT_BEFORE" == "0" ]]; then
  pass "reproducido: un usuario recién creado (sin fila en profiles) NO puede leer su propia fila de allowed_emails con su propia sesión (0 filas)"
else
  fail "se esperaba 0 filas para el usuario nuevo con su propia sesión antes de la migración, salió $NEW_USER_COUNT_BEFORE"
fi

echo "=== Bug B, paso 2: con self_read_policies aplicada, el mismo usuario nuevo SÍ lee su propia fila ==="
reset_db
apply_migrations ""  # todas, incluida self_read_policies
NEW_USER_COUNT_AFTER="$(seed_and_query_new_user | tail -1)"
if [[ "$NEW_USER_COUNT_AFTER" == "1" ]]; then
  pass "arreglado: el mismo usuario nuevo ya lee su propia fila de allowed_emails con su propia sesión (1 fila)"
else
  fail "se esperaba 1 fila para el usuario nuevo con su propia sesión después de la migración, salió $NEW_USER_COUNT_AFTER"
fi

echo "=== Bug B, paso 3: la política nueva no filtra las filas de otras personas ==="
reset_db
apply_migrations ""  # todas
LEAK_CHECK="$($PSQL -d "$DB" -At <<'SQL'
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'vincent.pla@weekendesk.fr'),
  ('22222222-2222-2222-2222-222222222222', 'nuevo@weekendesk.fr');
insert into allowed_emails (email) values ('vincent.pla@weekendesk.fr'), ('nuevo@weekendesk.fr');
insert into profiles (id, email, full_name, is_active)
  values ('11111111-1111-1111-1111-111111111111', 'vincent.pla@weekendesk.fr', 'Vincent Pla', true);

set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","email":"nuevo@weekendesk.fr","role":"authenticated"}';
select count(*) from allowed_emails where email = 'vincent.pla@weekendesk.fr';
select count(*) from profiles where id = '11111111-1111-1111-1111-111111111111';
select count(*) from allowed_emails;
reset role;
SQL
)"
VINCENT_EMAIL_VISIBLE="$(echo "$LEAK_CHECK" | sed -n '1p')"
VINCENT_PROFILE_VISIBLE="$(echo "$LEAK_CHECK" | sed -n '2p')"
TOTAL_VISIBLE="$(echo "$LEAK_CHECK" | sed -n '3p')"
if [[ "$VINCENT_EMAIL_VISIBLE" == "0" && "$VINCENT_PROFILE_VISIBLE" == "0" && "$TOTAL_VISIBLE" == "1" ]]; then
  pass "el usuario nuevo solo ve su propia fila (0 de la de Vincent, 1 de 2 filas totales) — self_read no amplía el acceso a nadie más"
else
  fail "self_read_* está filtrando filas ajenas: fila de Vincent visible=$VINCENT_EMAIL_VISIBLE, profile de Vincent visible=$VINCENT_PROFILE_VISIBLE, total visible=$TOTAL_VISIBLE"
fi

$PSQL -c "drop database if exists $DB;" > /dev/null

echo
echo "Todo OK: los dos bugs de acceso (grant de service_role, dependencia circular de RLS) están reproducidos y arreglados."
