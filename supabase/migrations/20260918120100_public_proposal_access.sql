-- =============================================================================
-- Acceso de la pantalla pública (CLAUDE.md §6)
--
-- El cliente no toca ninguna tabla. Entra con un token largo y recibe solo lo
-- publicable, a través de una función SECURITY DEFINER:
--   * precios siempre HT;
--   * reach SOLO donde hay dato medido con fuente — si no, la fila no aparece;
--   * caduca a los 14 días: después deja de mostrar precios.
-- =============================================================================

create or replace function get_public_proposal(token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  p         proposals%rowtype;
  is_live   boolean;
begin
  select * into p from proposals where public_token = token;

  if not found or p.status = 'DRAFT' then
    return null;
  end if;

  -- Caducada: se devuelve la cabecera, nunca los precios.
  is_live := p.expires_at is null or p.expires_at > now();

  return jsonb_build_object(
    'status',         p.status,
    'language',       p.language,
    'expires_at',     p.expires_at,
    'expired',        not is_live,
    'campaign_start', p.campaign_start,
    'campaign_end',   p.campaign_end,
    'advertiser',     (select a.legal_name
                         from accounts a where a.id = p.account_id),
    'brief',          case when is_live then p.brief end,
    'options',        case when is_live then (
      select coalesce(jsonb_agg(o order by o.sort_order, o.code), '[]'::jsonb)
      from (
        select jsonb_build_object(
                 'code',               po.code,
                 'name',               po.name,
                 'pitch',              po.pitch,
                 'net_revenue_cents',  po.net_revenue_cents,
                 'media_budget_cents', po.media_budget_cents,
                 'billed_total_cents', po.billed_total_cents,
                 'lines', (
                   select coalesce(jsonb_agg(jsonb_build_object(
                            'support_id',   l.support_id,
                            'support_name', s.name,
                            'channel',      s.channel,
                            'unit',         s.unit,
                            'market',       l.market,
                            'quantity',     l.quantity,
                            -- Sin dato medido → NULL. La interfaz omite la fila.
                            'reach', (
                              select jsonb_build_object(
                                       'value',       r.value,
                                       'metric',      r.metric,
                                       'period_unit', r.period_unit,
                                       'source',      r.source,
                                       'measured_at', r.measured_at)
                              from reach_measurements r
                              where r.support_id = l.support_id
                                and r.market     = l.market
                                and r.value is not null
                              order by r.measured_at desc
                              limit 1)
                          ) order by l.sort_order), '[]'::jsonb)
                   from proposal_option_lines l
                   join supports s on s.id = l.support_id
                   where l.option_id = po.id)
               ) as o, po.sort_order, po.code
        from proposal_options po
        where po.proposal_id = p.id
      ) o
    ) end
  );
end;
$$;

revoke all on function get_public_proposal(text) from public;
grant execute on function get_public_proposal(text) to anon, authenticated;

-- Marca la primera apertura. El seguimiento lo captura la página, no el email.
create or replace function mark_public_proposal_viewed(token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  p_id uuid;
begin
  update proposals
     set first_viewed_at = now(),
         status = 'VIEWED'
   where public_token = token
     and status = 'SENT'
  returning id into p_id;

  if p_id is not null then
    insert into proposal_events (proposal_id, event_type)
    values (p_id, 'viewed');
  end if;
end;
$$;

revoke all on function mark_public_proposal_viewed(text) from public;
grant execute on function mark_public_proposal_viewed(text) to anon, authenticated;
