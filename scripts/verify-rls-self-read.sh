#!/usr/bin/env bash
# Reproduce y verifica la dependencia circular de RLS descrita en CLAUDE.md
# §10.3, contra un PostgreSQL 16 real (no un mock): un usuario recién creado
# en Supabase Auth, sin fila todavía en `profiles`, no puede leer su propia
# fila de `allowed_emails` con su propia sesión, porque la política
# `team_all` exige `is_team_member()`, y esa función da `false` hasta que la
# fila de `profiles` exista. La clave de servicio (`lib/supabase/team-access.ts`,
# usada por `app/login/actions.ts`) ya evita este problema por completo,
# bypasseando RLS — este script lo demuestra y demuestra también que, tras
# `20260919110000_self_read_policies.sql`, la propia sesión del usuario
# también puede verse a sí misma, como defensa en profundidad.
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

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;
-- Supabase concede esto por defecto al aprovisionar el proyecto (ver
-- supabase/migrations/20260918140100_grants.sql); se replica aquí para que
-- el service_role de esta prueba se comporte como el real.
grant all privileges on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
SQL

cp "$MIGRATIONS_DIR"/*.sql "$WORKDIR/"
chmod a+rX "$WORKDIR"/*.sql

$PSQL -c "drop database if exists $DB;" -c "create database $DB;" > /dev/null

apply_migrations() {
  $PSQL -d "$DB" -f "$WORKDIR/00_supabase_shim.sql" > /dev/null
  for f in "$WORKDIR"/2026*.sql; do
    if [[ "$(basename "$f")" == "$1" ]]; then
      break
    fi
    $PSQL -d "$DB" -f "$f" > /dev/null
  done
}

seed_and_query() {
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

echo "=== Paso 1: sin la migración self_read_policies (estado de create_and_send_proposal en adelante) ==="
apply_migrations "20260919110000_self_read_policies.sql"
NEW_USER_COUNT_BEFORE="$(seed_and_query | tail -1)"
if [[ "$NEW_USER_COUNT_BEFORE" == "0" ]]; then
  pass "reproducido: un usuario recién creado (sin fila en profiles) NO puede leer su propia fila de allowed_emails con su propia sesión (0 filas)"
else
  fail "se esperaba 0 filas para el usuario nuevo con su propia sesión antes de la migración, salió $NEW_USER_COUNT_BEFORE"
fi

echo "=== Paso 2: con la migración self_read_policies aplicada ==="
$PSQL -c "drop database if exists $DB;" -c "create database $DB;" > /dev/null
apply_migrations ""  # aplica TODAS, incluida self_read_policies
NEW_USER_COUNT_AFTER="$(seed_and_query | tail -1)"
if [[ "$NEW_USER_COUNT_AFTER" == "1" ]]; then
  pass "arreglado: el mismo usuario nuevo ya lee su propia fila de allowed_emails con su propia sesión (1 fila)"
else
  fail "se esperaba 1 fila para el usuario nuevo con su propia sesión después de la migración, salió $NEW_USER_COUNT_AFTER"
fi

echo "=== Paso 3: la política nueva no filtra las filas de otras personas ==="
$PSQL -c "drop database if exists $DB;" -c "create database $DB;" > /dev/null
apply_migrations ""  # aplica TODAS, incluida self_read_policies
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
echo "Todo OK: la dependencia circular para un usuario nuevo está reproducida y arreglada por 20260919110000_self_read_policies.sql."
