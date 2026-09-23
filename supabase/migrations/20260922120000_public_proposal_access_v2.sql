-- =============================================================================
-- get_public_proposal, ronda 2: las fechas de campaña y los mercados son de
-- cada opción, no del envío entero (CLAUDE.md §5, §6, ronda 2). La cabecera
-- de la pantalla pública ya no puede mostrar un único periodo: cada columna
-- de opción lleva el suyo (o, en modo duración, "N semanas/meses" sin fecha).
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
    'advertiser',     (select a.legal_name
                         from accounts a where a.id = p.account_id),
    'brief',          case when is_live then p.brief end,
    'options',        case when is_live then (
      select coalesce(jsonb_agg(o order by o.sort_order, o.code), '[]'::jsonb)
      from (
        select jsonb_build_object(
                 'code',                     po.code,
                 'name',                     po.name,
                 'pitch',                    po.pitch,
                 'markets',                  po.markets,
                 'campaign_start',           po.campaign_start,
                 'campaign_end',             po.campaign_end,
                 'campaign_duration_count',  po.campaign_duration_count,
                 'campaign_duration_unit',   po.campaign_duration_unit,
                 'net_revenue_cents',        po.net_revenue_cents,
                 'media_budget_cents',       po.media_budget_cents,
                 'billed_total_cents',       po.billed_total_cents,
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
