-- =============================================================================
-- Festivos por mercado (CLAUDE.md §9, resuelto)
--
-- El cálculo de antelación de 5.3 compara días laborables entre hoy y el
-- inicio de campaña contra la antelación del soporte más lento. Hasta ahora
-- solo excluía sábados y domingos: la primera campaña real es Navidad, y 15
-- días laborables desde diciembre cruzan el 25 de diciembre y el 1 de enero.
-- Sin festivos la calculadora decía que se llegaba a tiempo cuando no era así.
-- =============================================================================

create table market_holidays (
  market       market not null,
  holiday_date date   not null,
  name         text   not null,
  primary key (market, holiday_date)
);

comment on table market_holidays is
  'Festivos nacionales por mercado, editables desde admin. BE-NL es la edición '
  'neerlandófona de Bélgica (Flandes), no los Países Bajos: comparte el mismo '
  'calendario de festivos nacionales belgas que BE-FR (son festivos federales, '
  'no de comunidad lingüística).';

-- Reemplaza la función anterior: ahora excluye también los festivos del
-- mercado. El signature cambia (se añade p_market) porque el resultado ya no
-- es el mismo para todos los mercados en la misma fecha.
drop function if exists business_days_between(date, date);

create or replace function business_days_between(from_date date, to_date date, p_market market)
returns integer language sql immutable as $$
  select coalesce(count(*), 0)::integer
  from generate_series(from_date + 1, to_date, interval '1 day') g(d)
  where extract(isodow from g.d) < 6
    and not exists (
      select 1 from market_holidays h
      where h.market = p_market and h.holiday_date = g.d::date
    );
$$;
