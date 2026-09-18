-- =============================================================================
-- Plataforma Publicitaria Weekendesk — esquema inicial
-- PostgreSQL / Supabase. Ver CLAUDE.md.
--
-- Convenciones:
--   * Todo importe monetario en CÉNTIMOS enteros (bigint, sufijo _cents).
--     Nunca float: el suelo de margen y el prorrateo de descuentos exigen
--     aritmética exacta.
--   * Los porcentajes son fracciones en numeric: 0.5000 = 50 %.
--   * Los parámetros económicos viven en tablas, nunca en constantes.
--   * Una cifra de audiencia sin fuente y fecha no se guarda (ver reach_measurements).
-- =============================================================================

create extension if not exists "pgcrypto";

-- =============================================================================
-- 1. Tipos
-- =============================================================================

create type market as enum ('FR', 'ES', 'IT', 'BE_FR', 'BE_NL');

create type channel as enum (
  'ONSITE', 'CRM', 'SOCIAL', 'SOCIAL_ADS', 'DISPLAY_SEA', 'CONTENT', 'INFLUENCER'
);

create type support_unit as enum (
  'WEEK',            -- semana
  'CAMPAIGN',        -- campaña
  'SEND',            -- envío
  'INSERTION_WEEK',  -- semana de inserción
  'MONTH',           -- mes
  'UNIT',            -- unidad
  'COLLABORATION'    -- colaboración
);

-- Las tres métricas NO son comparables ni sumables entre sí (CLAUDE.md §3).
create type reach_metric as enum ('PAGE_VIEWS', 'SESSIONS', 'UNIQUE_USERS');

create type content_language as enum ('FR', 'ES', 'IT', 'NL', 'EN');

create type proposal_status as enum (
  'DRAFT', 'SENT', 'VIEWED', 'ACCEPTED', 'REJECTED', 'EXPIRED'
);

create type vat_regime as enum (
  'FR_VAT_20',      -- IVA francés 20 %
  'REVERSE_CHARGE'  -- autoliquidación por el cliente
);

create type vies_result as enum ('VALID', 'INVALID', 'UNAVAILABLE');

create type discount_kind as enum ('VOLUME', 'MULTIMARKET', 'MANUAL');

create type override_kind as enum (
  'MARGIN_BELOW_FLOOR', 'MANUAL_DISCOUNT', 'LEAD_TIME_FORCED', 'AVAILABILITY_FORCED'
);

create type payment_terms as enum ('SPLIT_30_70', 'FULL_ON_SIGNATURE');

-- =============================================================================
-- 2. Usuarios y objetivos
-- =============================================================================

-- Lista blanca de emails. Auth = Supabase magic link (sin Google SSO en el MVP).
create table allowed_emails (
  email       text primary key check (email = lower(email)),
  note        text,
  added_at    timestamptz not null default now(),
  added_by    uuid references auth.users (id)
);

create table profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text not null unique check (email = lower(email)),
  full_name  text not null,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

-- Objetivo por advertising manager y por quarter fiscal. Varía cada quarter.
create table quarterly_targets (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references profiles (id) on delete cascade,
  fiscal_year     integer not null,  -- año de INICIO del año fiscal: FY2026 = 01/05/2026 → 30/04/2027
  fiscal_quarter  smallint not null check (fiscal_quarter between 1 and 4),
  target_cents    bigint not null check (target_cents >= 0),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references profiles (id),
  unique (profile_id, fiscal_year, fiscal_quarter)
);

comment on column quarterly_targets.target_cents is
  'Objetivo medido sobre el importe NETO DE MEDIOS, no sobre el facturado (CLAUDE.md §4.4).';

-- =============================================================================
-- 3. Parámetros económicos (editables en admin)
-- =============================================================================

create table pricing_parameter_sets (
  id                     uuid primary key default gen_random_uuid(),
  label                  text not null,
  effective_from         date not null,
  is_active              boolean not null default false,
  hourly_rate_cents      bigint  not null check (hourly_rate_cents > 0),
  min_margin_rate        numeric(5,4) not null check (min_margin_rate > 0 and min_margin_rate < 1),
  media_fee_rate         numeric(5,4) not null check (media_fee_rate >= 0),
  offer_validity_days    integer not null default 14 check (offer_validity_days > 0),
  created_at             timestamptz not null default now(),
  created_by             uuid references profiles (id)
);

-- Un único juego activo a la vez.
create unique index pricing_parameter_sets_single_active
  on pricing_parameter_sets ((true)) where is_active;

create table market_coefficients (
  parameter_set_id uuid not null references pricing_parameter_sets (id) on delete cascade,
  market           market not null,
  coefficient      numeric(6,4) not null check (coefficient > 0),
  primary key (parameter_set_id, market)
);

-- Escala por volumen. Base = tarifa neta de medios (CLAUDE.md §4.5).
create table volume_discount_tiers (
  parameter_set_id uuid not null references pricing_parameter_sets (id) on delete cascade,
  from_cents       bigint not null check (from_cents >= 0),
  discount_rate    numeric(5,4) not null check (discount_rate >= 0 and discount_rate < 1),
  primary key (parameter_set_id, from_cents)
);

-- Referencia para el comercial. NUNCA se aplica automáticamente (CLAUDE.md §4.5).
create table multimarket_discount_guidance (
  parameter_set_id uuid not null references pricing_parameter_sets (id) on delete cascade,
  market_count     smallint not null check (market_count between 2 and 5),
  discount_rate    numeric(5,4) not null check (discount_rate >= 0 and discount_rate < 1),
  primary key (parameter_set_id, market_count)
);

-- =============================================================================
-- 4. Catálogo (rate card)
-- =============================================================================

create table supports (
  id                          text primary key,          -- ON-01, CRM-03, ADS-02…
  name                        text not null,
  channel                     channel not null,
  unit                        support_unit not null,
  business_hours              numeric(5,2) not null check (business_hours >= 0),
  design_hours                numeric(5,2) not null check (design_hours >= 0),
  external_cost_cents         bigint  not null default 0 check (external_cost_cents >= 0),
  lead_time_business_days     integer not null check (lead_time_business_days >= 0),
  base_price_cents            bigint  not null check (base_price_cents >= 0),
  is_media_buy                boolean not null default false,
  min_monthly_fee_cents       bigint check (min_monthly_fee_cents >= 0),
  requires_availability_check boolean not null default false,
  is_active                   boolean not null default true,
  sort_order                  integer not null default 0,
  -- El fee mínimo mensual solo tiene sentido en soportes de media buy.
  constraint min_fee_only_for_media_buy
    check (min_monthly_fee_cents is null or is_media_buy)
);

comment on column supports.external_cost_cents is
  'Coste externo directo. Para SOC-01..SOC-05 es el boost social. Pendiente confirmar si varía '
  'por mercado: mientras tanto se puede sobreescribir en support_market_availability.';

comment on column supports.min_monthly_fee_cents is
  'NULL = sin dato confirmado. El motor calcula entonces fee = medios × media_fee_rate sin suelo '
  'y marca la línea con un aviso. NO rellenar con el precio base del catálogo (CLAUDE.md §4.4).';

comment on column supports.base_price_cents is
  'Precio base recomendado en índice FR. En soportes de media buy es informativo: el precio real '
  'se calcula con la fórmula de fee de CLAUDE.md §4.4.';

-- Vendibilidad y coste externo por mercado.
create table support_market_availability (
  support_id                   text not null references supports (id) on delete cascade,
  market                       market not null,
  is_sellable                  boolean not null default true,
  external_cost_cents_override bigint check (external_cost_cents_override >= 0),
  note                         text,
  primary key (support_id, market)
);

-- =============================================================================
-- 5. Audiencia
-- =============================================================================
-- REGLA ABSOLUTA (CLAUDE.md §3): si no hay dato medido, el valor es NULO.
-- Nunca cero, nunca estimado. Una fila con valor exige métrica, fuente y fecha.

create table reach_measurements (
  id          uuid primary key default gen_random_uuid(),
  support_id  text   not null references supports (id) on delete cascade,
  market      market not null,
  value       numeric check (value >= 0),
  metric      reach_metric,
  period_unit support_unit,          -- 15.841 por SEMANA, 35.000 por MES…
  source      text,
  measured_at date,
  note        text,
  created_at  timestamptz not null default now(),
  unique (support_id, market, metric),
  constraint measured_value_requires_provenance check (
    value is null
    or (metric is not null and period_unit is not null
        and source is not null and length(btrim(source)) > 0
        and measured_at is not null)
  )
);

comment on table reach_measurements is
  'La ausencia de fila y una fila con value NULL significan lo mismo: sin dato. La pantalla '
  'pública omite la fila en ambos casos. Métricas distintas NO son sumables entre sí.';

-- =============================================================================
-- 6. Anunciantes
-- =============================================================================

create table accounts (
  id              uuid primary key default gen_random_uuid(),
  legal_name      text not null,
  country_code    char(2) not null,
  primary_market  market,
  vat_number      text,
  billing_address text,
  owner_id        uuid references profiles (id),
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table contacts (
  id         uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts (id) on delete cascade,
  full_name  text not null,
  email      text not null,
  phone      text,
  role       text,
  language   content_language not null,
  created_at timestamptz not null default now()
);

create index contacts_account_idx on contacts (account_id);

-- Verificación VIES. Guardar siempre número, fecha y resultado (CLAUDE.md §7).
create table vies_checks (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references accounts (id) on delete cascade,
  vat_number   text not null,
  result       vies_result not null,
  checked_at   timestamptz not null default now(),
  raw_response jsonb
);

create index vies_checks_account_idx on vies_checks (account_id, checked_at desc);

-- =============================================================================
-- 7. Envíos, opciones y líneas
-- =============================================================================

create table proposals (
  id                 uuid primary key default gen_random_uuid(),
  account_id         uuid not null references accounts (id) on delete restrict,
  contact_id         uuid not null references contacts (id) on delete restrict,
  owner_id           uuid not null references profiles (id) on delete restrict,
  parameter_set_id   uuid not null references pricing_parameter_sets (id) on delete restrict,

  version            integer not null default 1 check (version >= 1),
  supersedes_id      uuid references proposals (id) on delete set null,

  status             proposal_status not null default 'DRAFT',
  language           content_language not null,
  brief              text,                        -- texto enriquecido básico
  campaign_start     date,
  campaign_end       date,

  public_token       text not null unique,        -- token largo, no adivinable
  sent_at            timestamptz,
  first_viewed_at    timestamptz,
  decided_at         timestamptz,
  expires_at         timestamptz,                 -- sent_at + offer_validity_days

  vat_regime         vat_regime,
  payment_terms      payment_terms,

  -- Inmutabilidad: al enviar se congela el cálculo completo (CLAUDE.md §5.4).
  frozen_snapshot    jsonb,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint campaign_dates_ordered
    check (campaign_end is null or campaign_start is null or campaign_end >= campaign_start),
  constraint sent_proposal_is_frozen
    check (status = 'DRAFT' or (sent_at is not null and frozen_snapshot is not null))
);

create index proposals_account_idx on proposals (account_id);
create index proposals_owner_idx on proposals (owner_id, status);
create index proposals_decided_idx on proposals (decided_at) where decided_at is not null;

create table proposal_options (
  id          uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references proposals (id) on delete cascade,
  code        text not null check (code in ('A', 'B', 'C')),
  name        text not null,
  pitch       text,                              -- frase de opción, 1-2 líneas
  sort_order  integer not null default 0,

  -- Resultado del motor. Se recalcula en borrador; se congela al enviar.
  gross_net_of_media_cents bigint,               -- base del descuento
  discount_cents           bigint,               -- descuento efectivo concedido
  net_revenue_cents        bigint,               -- importe_neto_de_medios
  media_budget_cents       bigint,
  billed_total_cents       bigint,               -- importe_facturado
  cost_cents               bigint,
  margin_cents             bigint,
  margin_rate              numeric(6,4),         -- sobre net_revenue_cents
  max_lead_time_days       integer,
  calculated_at            timestamptz,

  unique (proposal_id, code)
);

create table proposal_option_lines (
  id                 uuid primary key default gen_random_uuid(),
  option_id          uuid not null references proposal_options (id) on delete cascade,
  support_id         text not null references supports (id) on delete restrict,
  market             market not null,

  quantity           numeric(10,2) not null default 1 check (quantity > 0),

  -- Solo para soportes de media buy (CLAUDE.md §4.4).
  media_budget_cents bigint check (media_budget_cents >= 0),
  media_months       integer check (media_months >= 1),

  -- Resultado del motor.
  is_lead_market     boolean,                    -- paga el diseño
  unit_cost_cents    bigint,
  cost_cents         bigint,
  gross_price_cents  bigint,
  margin_floor_cents bigint,
  floor_applied      boolean,
  list_price_cents   bigint,
  discount_cents     bigint,
  net_price_cents    bigint,                     -- neto de medios
  billed_total_cents bigint,

  sort_order         integer not null default 0,

  -- Un soporte no puede aparecer dos veces en el mismo mercado dentro de una opción:
  -- rompería el cálculo de mercado líder y duplicaría el diseño.
  unique (option_id, support_id, market)
);

create index proposal_option_lines_option_idx on proposal_option_lines (option_id);

-- Descuentos aplicados a una opción. VOLUME lo calcula el motor; el resto es manual
-- y exige motivo (CLAUDE.md §4.5).
create table option_discounts (
  id         uuid primary key default gen_random_uuid(),
  option_id  uuid not null references proposal_options (id) on delete cascade,
  kind       discount_kind not null,
  rate       numeric(5,4) not null check (rate >= 0 and rate < 1),
  reason     text,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  constraint manual_discount_requires_reason
    check (kind = 'VOLUME' or (reason is not null and length(btrim(reason)) > 0))
);

-- =============================================================================
-- 8. Controles previos al envío y trazabilidad
-- =============================================================================

-- Check manual de disponibilidad con Marketing. Obligatorio para los soportes
-- con requires_availability_check (CLAUDE.md §5.3).
create table availability_checks (
  id           uuid primary key default gen_random_uuid(),
  option_id    uuid not null references proposal_options (id) on delete cascade,
  support_id   text not null references supports (id) on delete restrict,
  market       market not null,
  confirmed_with text not null,
  confirmed_at   timestamptz not null,
  created_by   uuid references profiles (id),
  created_at   timestamptz not null default now(),
  unique (option_id, support_id, market)
);

-- Toda excepción se registra con autor, motivo y marca de tiempo (CLAUDE.md §8).
create table overrides (
  id          uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references proposals (id) on delete cascade,
  option_id   uuid references proposal_options (id) on delete cascade,
  kind        override_kind not null,
  reason      text not null check (length(btrim(reason)) > 0),
  created_by  uuid not null references profiles (id),
  created_at  timestamptz not null default now()
);

create index overrides_proposal_idx on overrides (proposal_id);

-- Bitácora de estados y eventos (envío, apertura, aceptación, rechazo).
create table proposal_events (
  id          uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references proposals (id) on delete cascade,
  event_type  text not null,
  payload     jsonb,
  actor_id    uuid references profiles (id),   -- NULL = el cliente, desde la página pública
  created_at  timestamptz not null default now()
);

create index proposal_events_proposal_idx on proposal_events (proposal_id, created_at);

-- =============================================================================
-- 9. Aceptación
-- =============================================================================

create table acceptances (
  id                       uuid primary key default gen_random_uuid(),
  proposal_id              uuid not null unique references proposals (id) on delete cascade,
  option_id                uuid not null references proposal_options (id) on delete restrict,

  legal_name               text not null,
  billing_address          text not null,
  vat_number               text,
  billing_contact_name     text not null,
  billing_contact_email    text not null,
  signer_name              text not null,
  signer_role              text not null,
  purchase_order_reference text,               -- muchos organismos públicos no pagan sin ella

  vies_check_id            uuid references vies_checks (id),
  vat_regime_applied       vat_regime not null,

  accepted_at              timestamptz not null default now(),
  -- Quarter fiscal de imputación: fecha de firma, no de ejecución (CLAUDE.md §0).
  fiscal_year              integer not null,
  fiscal_quarter           smallint not null check (fiscal_quarter between 1 and 4)
);

create table rejections (
  id                 uuid primary key default gen_random_uuid(),
  proposal_id        uuid not null unique references proposals (id) on delete cascade,
  reason             text,
  counter_proposal_id uuid references proposals (id) on delete set null,
  rejected_at        timestamptz not null default now()
);

-- =============================================================================
-- 10. Funciones
-- =============================================================================

-- Año fiscal: 1 de mayo – 30 de abril. Se etiqueta por el año de INICIO.
create or replace function fiscal_year_of(d date) returns integer
language sql immutable strict as $$
  select case when extract(month from d) >= 5
              then extract(year from d)::integer
              else extract(year from d)::integer - 1 end;
$$;

-- Q1 = mayo-julio · Q2 = agosto-octubre · Q3 = noviembre-enero · Q4 = febrero-abril
create or replace function fiscal_quarter_of(d date) returns smallint
language sql immutable strict as $$
  select (((extract(month from d)::integer - 5 + 12) % 12) / 3 + 1)::smallint;
$$;

-- Días laborables (lunes a viernes) estrictamente entre dos fechas.
-- Sin calendario de festivos: pendiente de decisión (CLAUDE.md §9).
create or replace function business_days_between(from_date date, to_date date)
returns integer language sql immutable strict as $$
  select coalesce(count(*), 0)::integer
  from generate_series(from_date + 1, to_date, interval '1 day') g(d)
  where extract(isodow from g.d) < 6;
$$;

create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger accounts_updated_at  before update on accounts
  for each row execute function set_updated_at();
create trigger proposals_updated_at before update on proposals
  for each row execute function set_updated_at();

-- Imputa la aceptación al quarter fiscal de su fecha de firma.
create or replace function set_acceptance_fiscal_period() returns trigger
language plpgsql as $$
begin
  new.fiscal_year    := fiscal_year_of(new.accepted_at::date);
  new.fiscal_quarter := fiscal_quarter_of(new.accepted_at::date);
  return new;
end;
$$;

create trigger acceptances_fiscal_period before insert or update of accepted_at on acceptances
  for each row execute function set_acceptance_fiscal_period();

-- =============================================================================
-- 11. RLS
-- =============================================================================
-- El equipo (lista blanca, perfil activo) ve y edita todo. El cliente NO toca
-- estas tablas: la página pública pasa por una función SECURITY DEFINER que
-- recibe el token y devuelve solo lo publicable.

create or replace function is_team_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p where p.id = auth.uid() and p.is_active
  );
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'allowed_emails', 'profiles', 'quarterly_targets',
    'pricing_parameter_sets', 'market_coefficients', 'volume_discount_tiers',
    'multimarket_discount_guidance', 'supports', 'support_market_availability',
    'reach_measurements', 'accounts', 'contacts', 'vies_checks',
    'proposals', 'proposal_options', 'proposal_option_lines', 'option_discounts',
    'availability_checks', 'overrides', 'proposal_events',
    'acceptances', 'rejections'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy team_all on %I for all to authenticated '
      'using (is_team_member()) with check (is_team_member())', t);
  end loop;
end $$;
