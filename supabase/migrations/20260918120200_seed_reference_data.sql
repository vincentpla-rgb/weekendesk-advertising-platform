-- =============================================================================
-- Datos de referencia iniciales (CLAUDE.md §3)
--
-- ESTADO INICIAL, no constantes. Todo lo de aquí es editable desde admin.
-- El fichero original (ADVERTISING DEALS — GLOBAL OVERVIEW) usa 50 €/h y 45 %
-- de margen: obsoletos. Aquí van 35 €/h y 50 %.
-- =============================================================================

insert into pricing_parameter_sets
  (id, label, effective_from, is_active, hourly_rate_cents, min_margin_rate,
   media_fee_rate, offer_validity_days)
values
  ('00000000-0000-0000-0000-000000000001', 'Tarifa inicial MVP', date '2026-05-01', true,
   3500,      -- 35 €/h interna cargada — validado por Quentin Heliot (CFO)
   0.5000,    -- suelo duro de margen bruto
   0.4000,    -- fee de gestión sobre media buy
   14);       -- validez de la oferta

insert into market_coefficients (parameter_set_id, market, coefficient) values
  ('00000000-0000-0000-0000-000000000001', 'FR',    1.0000),
  ('00000000-0000-0000-0000-000000000001', 'ES',    0.8800),
  ('00000000-0000-0000-0000-000000000001', 'BE_FR', 0.7900),
  ('00000000-0000-0000-0000-000000000001', 'BE_NL', 0.7500),
  ('00000000-0000-0000-0000-000000000001', 'IT',    0.7400);

-- Base = tarifa neta de medios (CLAUDE.md §4.5). Umbrales inclusivos.
insert into volume_discount_tiers (parameter_set_id, from_cents, discount_rate) values
  ('00000000-0000-0000-0000-000000000001',       0, 0.0000),
  ('00000000-0000-0000-0000-000000000001',  300000, 0.0500),
  ('00000000-0000-0000-0000-000000000001',  600000, 0.1000),
  ('00000000-0000-0000-0000-000000000001', 1000000, 0.1500),
  ('00000000-0000-0000-0000-000000000001', 1500000, 0.2000);

-- Orientativo. NUNCA automático.
insert into multimarket_discount_guidance (parameter_set_id, market_count, discount_rate) values
  ('00000000-0000-0000-0000-000000000001', 2, 0.1000),
  ('00000000-0000-0000-0000-000000000001', 3, 0.1500),
  ('00000000-0000-0000-0000-000000000001', 4, 0.2000),
  ('00000000-0000-0000-0000-000000000001', 5, 0.2000);

-- -----------------------------------------------------------------------------
-- Catálogo: 19 soportes
-- -----------------------------------------------------------------------------

insert into supports
  (id, name, channel, unit, business_hours, design_hours, external_cost_cents,
   lead_time_business_days, base_price_cents, is_media_buy, min_monthly_fee_cents,
   requires_availability_check, sort_order)
values
  ('ON-01',  'Marketing Block',                     'ONSITE',      'WEEK',           2.0, 2.0,     0, 15,  43000, false,   null, true,   1),
  ('ON-02',  'Targeted Banner',                     'ONSITE',      'WEEK',           1.5, 1.5,     0, 15,  25000, false,   null, true,   2),
  ('ON-03',  'Ribbon (todas las SERP)',             'ONSITE',      'WEEK',           1.5, 1.5,     0, 15,  50000, false,   null, true,   3),
  ('ON-04',  'Landing page dedicada',               'ONSITE',      'CAMPAIGN',       5.0, 3.0,     0, 20,  80000, false,   null, false,  4),
  ('CRM-01', 'Newsletter exclusiva',                'CRM',         'SEND',           3.0, 3.0,     0, 15, 200000, false,   null, false,  5),
  ('CRM-02', 'Newsletter segmentada / geolocalizada','CRM',        'SEND',           4.0, 2.0,     0, 15,  95000, false,   null, false,  6),
  ('CRM-03', 'Banner insertado en newsletter',      'CRM',         'INSERTION_WEEK', 1.0, 1.0,     0, 10,  40000, false,   null, true,   7),
  ('CRM-04', 'Push notification',                   'CRM',         'SEND',           1.5, 0.0,     0, 10,  43000, false,   null, false,  8),
  ('CRM-05', 'Emails de ciclo de vida',             'CRM',         'MONTH',          1.5, 1.5,     0, 20,  45000, false,   null, false,  9),
  ('SOC-01', 'Reel Instagram',                      'SOCIAL',      'UNIT',           2.0, 4.0, 10000, 15,  80000, false,   null, false, 10),
  ('SOC-02', 'Story Instagram',                     'SOCIAL',      'UNIT',           0.5, 1.0, 10000, 10,  30000, false,   null, false, 11),
  ('SOC-03', 'Post o carrusel',                     'SOCIAL',      'UNIT',           1.0, 2.0, 10000, 10,  43000, false,   null, false, 12),
  ('SOC-04', 'Concurso o sorteo',                   'SOCIAL',      'UNIT',           5.0, 3.0, 10000, 20,  95000, false,   null, false, 13),
  ('SOC-05', 'Video TikTok',                        'SOCIAL',      'UNIT',           2.0, 4.0, 10000, 15,  85000, false,   null, false, 14),
  ('ADS-01', 'Campaña Meta patrocinada',            'SOCIAL_ADS',  'MONTH',          7.0, 3.0,     0, 15, 185000, true,  120000, true,  15),
  ('ADS-02', 'Google Performance Max',              'DISPLAY_SEA', 'MONTH',         10.0, 0.0,     0, 15, 225000, true,  150000, false, 16),
  ('ADS-03', 'Display ads',                         'DISPLAY_SEA', 'MONTH',          7.0, 3.0,     0, 15, 150000, true,    null, false, 17),
  ('CON-01', 'Artículo de blog dedicado',           'CONTENT',     'UNIT',           8.0, 0.0,     0, 20,  85000, false,   null, false, 18),
  ('INF-01', 'Colaboración con influencer',         'INFLUENCER',  'COLLABORATION',  8.0, 2.0,     0, 30, 225000, true,    null, false, 19);

-- ADS-03 e INF-01 con min_monthly_fee_cents = NULL a propósito: no hay cifra
-- confirmada. El motor calcula fee = medios × 40 % sin suelo y avisa. No se
-- deduce del precio base: para ADS-01/ADS-02 el precio base (1.850 / 2.250 €)
-- no coincide con el mínimo real (1.200 / 1.500 €). Ver CLAUDE.md §4.4 y §9.

-- -----------------------------------------------------------------------------
-- Vendibilidad por mercado
-- -----------------------------------------------------------------------------

insert into support_market_availability (support_id, market, is_sellable)
select s.id, m.market, true
from supports s
cross join (select unnest(enum_range(null::market)) as market) m;

-- SOC-05 (TikTok) solo está confirmado en FR.
update support_market_availability
   set is_sellable = false,
       note = 'No vendible hasta confirmación: TikTok solo confirmado en FR (CLAUDE.md §3).'
 where support_id = 'SOC-05' and market <> 'FR';

-- -----------------------------------------------------------------------------
-- Audiencia
-- -----------------------------------------------------------------------------
-- No se carga NINGÚN dato de reach. Las dos únicas cifras onsite conocidas
-- (BE-FR: ON-01 15.841/semana, ON-02 36.200/semana) llegan sin métrica, sin
-- fuente y sin fecha de medición, y la restricción measured_value_requires_provenance
-- las rechaza — correctamente.
--
-- Petición pendiente a Marketing (Pauline Rabaux, Erika Odena). Cuando lleguen
-- métrica, fuente y fecha, descomentar y completar:
--
-- insert into reach_measurements
--   (support_id, market, value, metric, period_unit, source, measured_at)
-- values
--   ('ON-01', 'BE_FR', 15841, '<PAGE_VIEWS|SESSIONS|UNIQUE_USERS>', 'WEEK', '<fuente>', '<fecha>'),
--   ('ON-02', 'BE_FR', 36200, '<PAGE_VIEWS|SESSIONS|UNIQUE_USERS>', 'WEEK', '<fuente>', '<fecha>');
--
-- ADS-01: los 35.000/mes del fichero son dudosos (incoherentes con un CPM de
-- 4-6 €). Sin dato hasta aclaración con Francesco Dellaca.
