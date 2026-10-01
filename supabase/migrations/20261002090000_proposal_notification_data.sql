-- =============================================================================
-- Ronda 18, bloque 2 (CLAUDE.md §9/§10.3): datos de notificación para los
-- emails nuevos de esta ronda (accepted_client/3, accepted_am/4, rejected_am/8,
-- opened_am/14). Las tres funciones ya existían (ronda 1 y ronda 3) y ya
-- tenían acceso a todo lo que hace falta — esta migración solo amplía lo que
-- DEVUELVEN, mismo patrón que `submit_counter_proposal` en la ronda 17
-- (`20261001091500_counter_proposal_notification_data.sql`): la capa de
-- aplicación nunca vuelve a consultar por su cuenta con la clave de servicio
-- solo para construir un email, todo sale de la misma transacción que ya
-- hizo el trabajo real.
-- =============================================================================

-- `mark_public_proposal_viewed` cambia de `void` a `jsonb`: Postgres no deja
-- cambiar el tipo de retorno con `create or replace function`, hace falta
-- borrarla y crearla de nuevo.
drop function if exists mark_public_proposal_viewed(text);

create function mark_public_proposal_viewed(token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proposal proposals%rowtype;
begin
  update proposals
     set first_viewed_at = now(),
         status = 'VIEWED'
   where public_token = token
     and status = 'SENT'
  returning * into v_proposal;

  if v_proposal.id is null then
    return null;
  end if;

  insert into proposal_events (proposal_id, event_type)
  values (v_proposal.id, 'viewed');

  -- Email 14, "opened_am": solo se dispara la PRIMERA vez (el `update`
  -- de arriba solo encuentra fila si el estado todavía era SENT) — un
  -- segundo intento con el mismo token no vuelve a entrar aquí, y
  -- devuelve null sin más.
  return jsonb_build_object(
    'proposal_id', v_proposal.id,
    'proposal_number', v_proposal.proposal_number,
    'advertiser_name', (select legal_name from accounts where id = v_proposal.account_id),
    'owner_email', (select email from profiles where id = v_proposal.owner_id),
    'owner_full_name', (select full_name from profiles where id = v_proposal.owner_id),
    'owner_language', (select preferred_language from profiles where id = v_proposal.owner_id),
    'expires_at', v_proposal.expires_at
  );
end;
$$;

revoke all on function mark_public_proposal_viewed(text) from public;
grant execute on function mark_public_proposal_viewed(text) to anon, authenticated;

-- ── reject_public_proposal: añade los datos para el email 8 (rejected_am) ──
create or replace function reject_public_proposal(p_token text, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proposal      proposals%rowtype;
  v_rejection_id  uuid;
begin
  select * into v_proposal from proposals where public_token = p_token;
  if not found then
    raise exception 'Enlace no válido';
  end if;
  if v_proposal.status not in ('SENT', 'VIEWED') then
    raise exception 'Este envío ya no admite respuesta (%)', v_proposal.status;
  end if;

  insert into rejections (proposal_id, reason) values (v_proposal.id, p_reason)
  returning id into v_rejection_id;

  update proposals set status = 'REJECTED', decided_at = now() where id = v_proposal.id;

  insert into proposal_events (proposal_id, event_type, payload)
  values (v_proposal.id, 'rejected', jsonb_build_object('reason', p_reason));

  return jsonb_build_object(
    'rejection_id', v_rejection_id,
    'proposal_id', v_proposal.id,
    'proposal_number', v_proposal.proposal_number,
    'advertiser_name', (select legal_name from accounts where id = v_proposal.account_id),
    'owner_email', (select email from profiles where id = v_proposal.owner_id),
    'owner_full_name', (select full_name from profiles where id = v_proposal.owner_id),
    'owner_language', (select preferred_language from profiles where id = v_proposal.owner_id)
  );
end;
$$;

revoke all on function reject_public_proposal(text, text) from public;
grant execute on function reject_public_proposal(text, text) to anon, authenticated;

-- ── accept_public_proposal: añade los datos para los emails 3 y 4 ──
create or replace function accept_public_proposal(
  p_token                      text,
  p_option_code                text,
  p_legal_name                text,
  p_billing_address           text,
  p_vat_number                text,
  p_billing_contact_name      text,
  p_billing_contact_email      text,
  p_signer_name                text,
  p_signer_role                text,
  p_purchase_order_reference  text,
  p_vies_result                vies_result,
  p_vies_raw                  jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proposal        proposals%rowtype;
  v_option_id        uuid;
  v_campaign_start   date;
  v_campaign_end     date;
  v_conflict_line    record;
  v_account_country  text;
  v_vies_id          uuid;
  v_regime           vat_regime;
  v_acceptance_id    uuid;
begin
  select * into v_proposal from proposals where public_token = p_token;
  if not found then
    raise exception 'Enlace no válido';
  end if;
  if v_proposal.status not in ('SENT', 'VIEWED') then
    raise exception 'Este envío ya no admite respuesta (%)', v_proposal.status;
  end if;
  if v_proposal.expires_at is not null and v_proposal.expires_at <= now() then
    raise exception 'La oferta ha caducado';
  end if;

  select id, campaign_start, campaign_end into v_option_id, v_campaign_start, v_campaign_end
  from proposal_options
  where proposal_id = v_proposal.id and code = p_option_code;
  if v_option_id is null then
    raise exception 'Opción desconocida: %', p_option_code;
  end if;

  for v_conflict_line in
    select support_id, market from proposal_option_lines where option_id = v_option_id
  loop
    if has_accepted_availability_conflict(
         v_conflict_line.support_id, v_conflict_line.market,
         v_campaign_start, v_campaign_end, v_proposal.account_id, v_proposal.id
       ) then
      raise exception
        'No se puede aceptar: % en % ya lo aceptó otro cliente en fechas solapadas.',
        v_conflict_line.support_id, v_conflict_line.market;
    end if;
  end loop;

  select country_code into v_account_country from accounts where id = v_proposal.account_id;

  insert into vies_checks (account_id, vat_number, result, raw_response)
  values (v_proposal.account_id, coalesce(p_vat_number, ''), p_vies_result, p_vies_raw)
  returning id into v_vies_id;

  -- Régimen de IVA (CLAUDE.md §7): francés siempre 20 %; UE con VIES válido,
  -- autoliquidación; UE sin VIES válido, 20 % francés.
  v_regime := case
    when upper(coalesce(v_account_country, '')) = 'FR' then 'FR_VAT_20'
    when p_vies_result = 'VALID' then 'REVERSE_CHARGE'
    else 'FR_VAT_20'
  end;

  insert into acceptances (
    proposal_id, option_id, legal_name, billing_address, vat_number,
    billing_contact_name, billing_contact_email, signer_name, signer_role,
    purchase_order_reference, vies_check_id, vat_regime_applied
  ) values (
    v_proposal.id, v_option_id, p_legal_name, p_billing_address, p_vat_number,
    p_billing_contact_name, p_billing_contact_email, p_signer_name, p_signer_role,
    p_purchase_order_reference, v_vies_id, v_regime
  )
  returning id into v_acceptance_id;

  update proposals set status = 'ACCEPTED', decided_at = now() where id = v_proposal.id;

  insert into proposal_events (proposal_id, event_type, payload)
  values (v_proposal.id, 'accepted', jsonb_build_object('option_code', p_option_code));

  return jsonb_build_object(
    'acceptance_id', v_acceptance_id,
    'vat_regime', v_regime,
    'proposal_id', v_proposal.id,
    'proposal_number', v_proposal.proposal_number,
    'proposal_language', v_proposal.language,
    'option_name', (select name from proposal_options where id = v_option_id),
    'markets', (select markets from proposal_options where id = v_option_id),
    'sale_cents', (select billed_total_cents from proposal_options where id = v_option_id),
    'cost_cents', (select cost_cents from proposal_options where id = v_option_id),
    'margin_cents', (select margin_cents from proposal_options where id = v_option_id),
    'margin_rate', (select margin_rate from proposal_options where id = v_option_id),
    'advertiser_name', (select legal_name from accounts where id = v_proposal.account_id),
    'contact_full_name', (select full_name from contacts where id = v_proposal.contact_id),
    'contact_email', (select email from contacts where id = v_proposal.contact_id),
    'owner_email', (select email from profiles where id = v_proposal.owner_id),
    'owner_full_name', (select full_name from profiles where id = v_proposal.owner_id),
    'owner_language', (select preferred_language from profiles where id = v_proposal.owner_id)
  );
end;
$$;

revoke all on function accept_public_proposal(text, text, text, text, text, text, text, text, text, text, vies_result, jsonb) from public;
grant execute on function accept_public_proposal(text, text, text, text, text, text, text, text, text, text, vies_result, jsonb) to anon, authenticated;
