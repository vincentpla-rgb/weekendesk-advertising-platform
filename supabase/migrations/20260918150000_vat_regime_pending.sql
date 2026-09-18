-- =============================================================================
-- Régimen de IVA pendiente de verificación (CLAUDE.md §7)
--
-- Hasta ahora, un fallo técnico de VIES (servicio caído, timeout) colapsaba
-- al mismo resultado que un número inválido: IVA francés 20 %. Eso fija un
-- régimen sin haberlo verificado. La aceptación es un compromiso comercial y
-- no puede depender de la disponibilidad de un servicio público externo,
-- pero tampoco se puede facturar con un régimen no verificado.
--
-- Tres resultados de VIES, tres regímenes:
--   VALID       -> autoliquidación (REVERSE_CHARGE)
--   INVALID     -> IVA francés 20 % (FR_VAT_20)
--   UNAVAILABLE -> régimen PENDIENTE: se acepta igual, no se fija el régimen,
--                  y debe reintentarse y resolverse antes de facturar.
--
-- Un cliente francés siempre es IVA francés 20 %, se pueda verificar VIES o
-- no: la nacionalidad francesa no depende de VIES (CLAUDE.md §7).
-- =============================================================================

alter type vat_regime add value if not exists 'PENDING';

comment on column acceptances.vat_regime_applied is
  'PENDING = fallo técnico de VIES al aceptar (servicio caído, timeout, error). '
  'No facturar con este estado: reintentar la verificación (resolve_vat_regime) '
  'hasta obtener VALID o INVALID y fijar el régimen definitivo.';

-- -----------------------------------------------------------------------------
-- Reemplaza accept_public_proposal: régimen de tres vías en vez de dos.
-- -----------------------------------------------------------------------------

create or replace function accept_public_proposal(
  p_token                     text,
  p_option_code               text,
  p_legal_name                text,
  p_billing_address           text,
  p_vat_number                text,
  p_billing_contact_name      text,
  p_billing_contact_email     text,
  p_signer_name                text,
  p_signer_role               text,
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

  select id into v_option_id from proposal_options
  where proposal_id = v_proposal.id and code = p_option_code;
  if v_option_id is null then
    raise exception 'Opción desconocida: %', p_option_code;
  end if;

  select country_code into v_account_country from accounts where id = v_proposal.account_id;

  insert into vies_checks (account_id, vat_number, result, raw_response)
  values (v_proposal.account_id, coalesce(p_vat_number, ''), p_vies_result, p_vies_raw)
  returning id into v_vies_id;

  -- Régimen de IVA (CLAUDE.md §7). Francés siempre 20 %, verificable o no:
  -- la nacionalidad francesa no depende de VIES. Fuera de Francia, el
  -- régimen solo se fija con una respuesta de VIES concluyente; un fallo
  -- técnico deja el régimen PENDIENTE — NUNCA se asume ni 20 % ni
  -- autoliquidación sin haberlo verificado. La aceptación no se bloquea por
  -- esto: es un compromiso comercial, no depende de un servicio externo.
  v_regime := case
    when upper(coalesce(v_account_country, '')) = 'FR' then 'FR_VAT_20'
    when p_vies_result = 'VALID' then 'REVERSE_CHARGE'
    when p_vies_result = 'INVALID' then 'FR_VAT_20'
    else 'PENDING' -- p_vies_result = 'UNAVAILABLE'
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
  values (
    v_proposal.id, 'accepted',
    jsonb_build_object('option_code', p_option_code, 'vat_regime', v_regime)
  );

  return jsonb_build_object('acceptance_id', v_acceptance_id, 'vat_regime', v_regime);
end;
$$;

-- -----------------------------------------------------------------------------
-- Reintento de verificación VIES sobre una aceptación ya registrada.
--
-- Uso interno (equipo, vía RLS): la llamada HTTP a VIES la hace la ruta de
-- servidor de Next.js igual que en accept_public_proposal; esta función solo
-- persiste el nuevo resultado y, si es concluyente, fija el régimen.
--
-- Se puede llamar tantas veces como haga falta — cada intento queda en
-- vies_checks para la auditoría (CLAUDE.md §7: "guardar siempre número,
-- fecha de verificación, resultado"), no solo el primero ni el último.
-- -----------------------------------------------------------------------------

create or replace function resolve_vat_regime(
  p_acceptance_id uuid,
  p_vies_result   vies_result,
  p_vies_raw      jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_acceptance       acceptances%rowtype;
  v_proposal_id       uuid;
  v_account_id        uuid;
  v_account_country  text;
  v_vies_id          uuid;
  v_regime           vat_regime;
begin
  select * into v_acceptance from acceptances where id = p_acceptance_id;
  if not found then
    raise exception 'Aceptación desconocida: %', p_acceptance_id;
  end if;

  select account_id into v_account_id from proposals where id = v_acceptance.proposal_id;
  select country_code into v_account_country from accounts where id = v_account_id;

  insert into vies_checks (account_id, vat_number, result, raw_response)
  values (v_account_id, coalesce(v_acceptance.vat_number, ''), p_vies_result, p_vies_raw)
  returning id into v_vies_id;

  v_regime := case
    when upper(coalesce(v_account_country, '')) = 'FR' then 'FR_VAT_20'
    when p_vies_result = 'VALID' then 'REVERSE_CHARGE'
    when p_vies_result = 'INVALID' then 'FR_VAT_20'
    else 'PENDING'
  end;

  update acceptances
     set vies_check_id = v_vies_id,
         vat_regime_applied = v_regime
   where id = p_acceptance_id;

  insert into proposal_events (proposal_id, event_type, payload)
  values (
    v_acceptance.proposal_id, 'vat_regime_resolved',
    jsonb_build_object('acceptance_id', p_acceptance_id, 'vat_regime', v_regime)
  );

  return jsonb_build_object('vat_regime', v_regime, 'resolved', v_regime <> 'PENDING');
end;
$$;

grant execute on function resolve_vat_regime(uuid, vies_result, jsonb) to authenticated;
