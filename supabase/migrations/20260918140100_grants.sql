-- =============================================================================
-- Privilegios de tabla para el rol `authenticated`.
--
-- RLS restringe FILAS, pero además hace falta el privilegio de tabla (Supabase
-- lo concede por defecto en su bootstrapping de proyecto; se hace explícito
-- aquí para no depender de ese comportamiento implícito y para que el esquema
-- funcione igual en cualquier PostgreSQL). `anon` no recibe privilegios de
-- tabla: solo entra por las funciones SECURITY DEFINER ya concedidas
-- (get_public_proposal, mark_public_proposal_viewed, accept_public_proposal,
-- reject_public_proposal).
-- =============================================================================

grant usage on schema public to authenticated;

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
    execute format('grant select, insert, update, delete on table %I to authenticated', t);
  end loop;
end $$;
