-- =============================================================================
-- Ronda 14: sexto mercado de venta, Países Bajos (NL) — CLAUDE.md §0, §3.
--
-- Distinto de BE_NL (Bélgica de habla neerlandesa, ya existente): BE_NL sigue
-- siendo Bélgica, con su propio calendario de festivos federales compartido
-- con BE_FR. NL es un mercado nuevo, sin relación con BE_NL salvo el idioma.
--
-- Ningún flujo SQL de este esquema hardcodea la lista de mercados: los
-- `market[]`/`market` de `create_and_send_proposal`, `get_public_proposal` y
-- `has_accepted_availability_conflict` castean el valor que reciben al enum
-- `market` sin enumerar sus miembros — así que añadir un valor al enum basta
-- para que todo el pipeline (envío, pantalla pública, control de
-- disponibilidad) funcione con NL sin tocar ninguna función. Lo único que
-- necesita cambiar aquí es: el enum en sí, la restricción que limita
-- `multimarket_discount_guidance` a 2-5 mercados, y sembrar filas para NL en
-- las tablas de referencia que ya tenían datos para los 5 mercados
-- anteriores (una migración de seed ya aplicada no vuelve a ejecutarse).
--
-- Coeficiente 0,73 — PROVISIONAL, no validado por Quentin Heliot (a
-- diferencia del resto de coeficientes de la tabla). Es una extrapolación
-- lógica de la serie existente: FR 1,00 → ES 0,88 (-0,12) → BE_FR 0,79
-- (-0,09) → BE_NL 0,75 (-0,04) → IT 0,74 (-0,01) → NL 0,73 (-0,01),
-- continuando el último salto decreciente. Ajustable si el negocio lo
-- requiere. Ver CLAUDE.md §3/§9.
-- =============================================================================

alter type market add value 'NL';

alter table multimarket_discount_guidance
  drop constraint multimarket_discount_guidance_market_count_check,
  add constraint multimarket_discount_guidance_market_count_check
    check (market_count between 2 and 6);

-- Coeficiente de NL para cada juego de parámetros ya existente (nunca solo
-- para el activo: un juego de parámetros histórico también debe poder
-- recalcular una opción NL si alguna vez se reactiva o se audita).
insert into market_coefficients (parameter_set_id, market, coefficient)
select id, 'NL', 0.7300
from pricing_parameter_sets
on conflict (parameter_set_id, market) do nothing;

-- Guía orientativa de descuento multimercado a 6 mercados: mismo plateau del
-- 20 % que ya se usa para 4 y 5 (CLAUDE.md §4.5) — nunca automática.
insert into multimarket_discount_guidance (parameter_set_id, market_count, discount_rate)
select id, 6, 0.2000
from pricing_parameter_sets
on conflict (parameter_set_id, market_count) do nothing;

-- Vendibilidad en NL: sellable=true por defecto para los 19 soportes, con la
-- misma excepción de SOC-05 (TikTok, solo confirmado en FR) que ya se aplica
-- al resto de mercados no-FR.
insert into support_market_availability (support_id, market, is_sellable)
select id, 'NL', true
from supports
on conflict (support_id, market) do nothing;

update support_market_availability
   set is_sellable = false,
       note = 'No vendible hasta confirmación: TikTok solo confirmado en FR (CLAUDE.md §3).'
 where support_id = 'SOC-05' and market = 'NL';

-- NL no tiene festivos cargados (CLAUDE.md §9): sin dato, no se inventa
-- (CLAUDE.md §8). El control de antelación (§5.3) sigue funcionando para NL,
-- solo que sin excluir festivos neerlandeses de sus días laborables hasta
-- que se añadan filas a `market_holidays` para este mercado.
