-- =============================================================================
-- Privilegios de tabla para el rol `service_role`.
--
-- Bug real en producción: `createServiceClient()` (lib/supabase/service.ts,
-- usado por `resolveTeamAccess` en `app/login/actions.ts`) ya usaba la clave
-- `service_role` correcta, pero las lecturas fallaban con
-- "permission denied for table allowed_emails" — un error de GRANT de
-- PostgreSQL, no de política RLS. `20260918140100_grants.sql` concede
-- privilegios de tabla a `authenticated` explícitamente ("para no depender
-- del bootstrapping implícito de Supabase", dice su propio comentario), pero
-- nunca hizo lo mismo para `service_role`, asumiendo que Supabase se lo
-- concede solo. En este proyecto real, ese supuesto era falso: `service_role`
-- se quedó sin privilegios de tabla sobre lo creado por las migraciones de
-- este repo.
--
-- `service_role` tiene `BYPASSRLS`, así que las políticas de RLS nunca son
-- el problema para este rol — pero el privilegio de tabla (GRANT) es una
-- capa aparte, por debajo de RLS, y sin él PostgreSQL deniega el acceso
-- antes de que RLS llegue a evaluarse. Reproducido y verificado el arreglo
-- contra un PostgreSQL 16 real: sin este grant, `set role service_role;
-- select * from allowed_emails` da `permission denied for table
-- allowed_emails`, carácter por carácter el mismo error de los logs de
-- Vercel; con este grant, la misma consulta funciona.
-- =============================================================================

grant usage on schema public to service_role;

do $$
declare t text;
begin
  foreach t in array array[
    'allowed_emails', 'profiles', 'quarterly_targets',
    'pricing_parameter_sets', 'market_coefficients', 'volume_discount_tiers',
    'multimarket_discount_guidance', 'supports', 'support_market_availability',
    'market_holidays', 'reach_measurements', 'accounts', 'contacts', 'vies_checks',
    'proposals', 'proposal_options', 'proposal_option_lines', 'option_discounts',
    'availability_checks', 'overrides', 'proposal_events',
    'acceptances', 'rejections'
  ] loop
    execute format('grant select, insert, update, delete on table %I to service_role', t);
  end loop;
end $$;
