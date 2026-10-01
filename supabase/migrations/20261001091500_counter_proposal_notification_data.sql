-- =============================================================================
-- Ronda 17 (CLAUDE.md, bloque 1, punto 1): `submit_counter_proposal` devuelve
-- ahora los datos que necesitan los emails 5 (AM: contrapropuesta recibida) y
-- 9 (cliente: confirmación de envío), para que la ruta que la llama
-- (`app/api/public/proposals/[token]/counter/route.ts`) pueda construir y
-- mandar ambos sin una segunda ida y vuelta a la base de datos.
--
-- Solo se AÑADEN claves al jsonb de retorno — la firma de la función no
-- cambia (mismos parámetros), así que no hace falta tocar ningún `grant`.
-- Depende de `profiles.preferred_language` (migración anterior de esta misma
-- ronda, `20261001090000_preferred_language.sql`): por eso esta migración va
-- DESPUÉS, no fusionada con la extensión de `submit_counter_proposal` en la
-- misma sentencia que la crea.
-- =============================================================================

create or replace function submit_counter_proposal(
  p_token                     text,
  p_option_code               text,
  p_lines                     jsonb,
  p_campaign_start            date,
  p_campaign_end              date,
  p_campaign_duration_count   integer,
  p_campaign_duration_unit    text,
  p_legal_name                text,
  p_billing_address           text,
  p_vat_number                text,
  p_billing_contact_name      text,
  p_billing_contact_email     text,
  p_signer_name               text,
  p_signer_role               text,
  p_purchase_order_reference  text,
  p_vies_result               vies_result,
  p_vies_raw                  jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proposal        proposals%rowtype;
  v_option          proposal_options%rowtype;
  v_line            jsonb;
  v_existing_count  integer;
  v_vies_id         uuid;
  v_counter_id      uuid;
  v_advertiser_name text;
  v_owner_email     text;
  v_owner_full_name text;
  v_owner_language  text;
  v_contact_name    text;
  v_contact_email   text;
begin
  select * into v_proposal from proposals where public_token = p_token;
  if not found then
    raise exception 'Enlace no válido';
  end if;
  if v_proposal.status not in ('SENT', 'VIEWED') then
    raise exception 'Este envío ya no admite respuesta (%)', v_proposal.status;
  end if;

  select * into v_option
  from proposal_options
  where proposal_id = v_proposal.id and code = p_option_code;
  if not found then
    raise exception 'Opción % no encontrada en este envío', p_option_code;
  end if;

  -- Ningún support_id+market de p_lines puede ser ajeno a esta opción.
  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    select count(*) into v_existing_count
    from proposal_option_lines
    where option_id = v_option.id
      and support_id = (v_line->>'support_id')
      and market = (v_line->>'market')::market;
    if v_existing_count = 0 then
      raise exception 'La línea % / % no forma parte de la opción enviada', v_line->>'support_id', v_line->>'market';
    end if;
  end loop;

  insert into vies_checks (account_id, vat_number, result, raw_response)
  values (v_proposal.account_id, coalesce(p_vat_number, ''), p_vies_result, p_vies_raw)
  returning id into v_vies_id;

  insert into counter_proposals (
    proposal_id, option_code, option_name, lines,
    campaign_start, campaign_end, campaign_duration_count, campaign_duration_unit,
    legal_name, billing_address, vat_number, billing_contact_name, billing_contact_email,
    signer_name, signer_role, purchase_order_reference, vies_check_id
  ) values (
    v_proposal.id, p_option_code, v_option.name, p_lines,
    p_campaign_start, p_campaign_end, p_campaign_duration_count, p_campaign_duration_unit,
    p_legal_name, p_billing_address, nullif(p_vat_number, ''), p_billing_contact_name, p_billing_contact_email,
    p_signer_name, p_signer_role, nullif(p_purchase_order_reference, ''), v_vies_id
  )
  returning id into v_counter_id;

  update proposals set status = 'COUNTERED', decided_at = now() where id = v_proposal.id;

  insert into proposal_events (proposal_id, event_type, payload)
  values (v_proposal.id, 'countered', jsonb_build_object('option_code', p_option_code, 'counter_proposal_id', v_counter_id));

  select legal_name into v_advertiser_name from accounts where id = v_proposal.account_id;
  select full_name, email into v_contact_name, v_contact_email from contacts where id = v_proposal.contact_id;
  select email, full_name, preferred_language
    into v_owner_email, v_owner_full_name, v_owner_language
    from profiles where id = v_proposal.owner_id;

  return jsonb_build_object(
    'counter_proposal_id', v_counter_id,
    'proposal_id',         v_proposal.id,
    'proposal_number',     v_proposal.proposal_number,
    'proposal_language',   v_proposal.language,
    'option_code',         p_option_code,
    'option_name',         v_option.name,
    'advertiser_name',     v_advertiser_name,
    'contact_full_name',   v_contact_name,
    'contact_email',       v_contact_email,
    'owner_email',         v_owner_email,
    'owner_full_name',     v_owner_full_name,
    'owner_language',      v_owner_language
  );
end;
$$;
