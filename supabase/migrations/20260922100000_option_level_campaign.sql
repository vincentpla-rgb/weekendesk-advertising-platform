-- =============================================================================
-- Ronda 2 de correcciones (CLAUDE.md §10.3): mercados y fechas de campaña por
-- OPCIÓN, no por envío.
--
--   * `proposals.campaign_start`/`campaign_end` se sustituyen por las mismas
--     columnas en `proposal_options`: cada opción tiene su propio periodo.
--   * Se añade el modo "solo duración, sin fecha de inicio concreta" (§5.3
--     bis): `campaign_duration_count` + `campaign_duration_unit`, para poder
--     cotizar "una campaña de 1 mes" sin comprometerse a una fecha. Cuando se
--     usa este modo, la antelación no se puede comprobar — el motor (§5.3
--     bis, `checks.ts`) lo marca con un aviso, no con un bloqueo.
--   * Se añade `markets market[]`: los mercados elegidos UNA VEZ para la
--     opción entera (CLAUDE.md §4.2, ronda 2). Se podría derivar de
--     `proposal_option_lines.market`, pero guardarlo explícito evita
--     recalcularlo para mostrarlo (cabecera de la opción, email, dashboard) y
--     deja constancia de la elección tal cual se hizo, no de lo que hoy
--     calcula el motor a partir de las líneas.
-- =============================================================================

alter table proposal_options
  add column markets                  market[] not null default '{}',
  add column campaign_start           date,
  add column campaign_end             date,
  add column campaign_duration_count  integer check (campaign_duration_count is null or campaign_duration_count > 0),
  add column campaign_duration_unit   text check (campaign_duration_unit is null or campaign_duration_unit in ('WEEK', 'MONTH')),
  add constraint proposal_options_campaign_dates_ordered
    check (campaign_end is null or campaign_start is null or campaign_end >= campaign_start),
  add constraint proposal_options_duration_pair
    check (
      (campaign_duration_count is null) = (campaign_duration_unit is null)
    );

alter table proposal_options alter column markets drop default;

alter table proposals
  drop constraint if exists campaign_dates_ordered,
  drop column if exists campaign_start,
  drop column if exists campaign_end;

comment on column proposal_options.markets is
  'Mercados elegidos UNA VEZ para la opción entera (CLAUDE.md §4.2, ronda 2). Todo soporte de la opción se vende en todos ellos.';
comment on column proposal_options.campaign_duration_count is
  'Modo "solo duración, sin fecha de inicio" (CLAUDE.md §5.3 bis): p.ej. 4 con campaign_duration_unit = WEEK = "4 semanas". NULL cuando la opción tiene fechas concretas.';
