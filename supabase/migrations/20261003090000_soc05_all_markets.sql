-- =============================================================================
-- Ronda 21: SOC-05 (Video TikTok) deja de estar restringido a Francia.
--
-- Hasta ahora era el ÚNICO soporte del catálogo con una restricción de
-- mercado (CLAUDE.md §3, §9: "SOC-05 solo confirmado en FR"). Vincent
-- confirma que el contenido ahora se produce en inglés, así que pasa a ser
-- vendible en los 6 mercados — igual que el resto de soportes sociales
-- (SOC-01 a SOC-04), sin ninguna excepción.
--
-- `support_market_availability` ya tiene una fila por soporte y mercado
-- (sembrada en `20260918120200_seed_reference_data.sql` y, para NL, en
-- `20260929090000_netherlands_market.sql`) — basta con poner `is_sellable`
-- a `true` en las filas de SOC-05 fuera de FR y limpiar la nota que
-- explicaba la restricción. No hace falta tocar ninguna función SQL: ninguna
-- de ellas hardcodea SOC-05 ni esta regla, la vendibilidad se lee siempre de
-- esta tabla.
-- =============================================================================

update support_market_availability
   set is_sellable = true,
       note = null
 where support_id = 'SOC-05' and market <> 'FR';
