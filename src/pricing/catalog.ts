import type { Catalog, SupportDefinition } from './types.js';

/**
 * Rate card: los 19 soportes de CLAUDE.md §3.
 *
 * Igual que los parámetros, esto es estado inicial — en producción el catálogo
 * vive en la tabla `supports`. Se mantiene aquí sincronizado con la migración de
 * seed para poder probar el motor sin base de datos.
 */
const SUPPORTS: readonly SupportDefinition[] = [
  // --- Onsite ---------------------------------------------------------------
  { id: 'ON-01', name: 'Marketing Block', channel: 'ONSITE', unit: 'WEEK',
    businessHours: 2.0, designHours: 2.0, externalCostCents: 0,
    leadTimeBusinessDays: 15, basePriceCents: 43_000,
    isMediaBuy: false, minMonthlyFeeCents: null, alwaysManualMediaSplit: false, requiresAvailabilityCheck: true },
  { id: 'ON-02', name: 'Targeted Banner', channel: 'ONSITE', unit: 'WEEK',
    businessHours: 1.5, designHours: 1.5, externalCostCents: 0,
    leadTimeBusinessDays: 15, basePriceCents: 25_000,
    isMediaBuy: false, minMonthlyFeeCents: null, alwaysManualMediaSplit: false, requiresAvailabilityCheck: true },
  { id: 'ON-03', name: 'Ribbon (todas las SERP)', channel: 'ONSITE', unit: 'WEEK',
    businessHours: 1.5, designHours: 1.5, externalCostCents: 0,
    leadTimeBusinessDays: 15, basePriceCents: 50_000,
    isMediaBuy: false, minMonthlyFeeCents: null, alwaysManualMediaSplit: false, requiresAvailabilityCheck: true },
  { id: 'ON-04', name: 'Landing page dedicada', channel: 'ONSITE', unit: 'CAMPAIGN',
    businessHours: 5.0, designHours: 3.0, externalCostCents: 0,
    leadTimeBusinessDays: 20, basePriceCents: 80_000,
    isMediaBuy: false, minMonthlyFeeCents: null, alwaysManualMediaSplit: false, requiresAvailabilityCheck: false },

  // --- CRM ------------------------------------------------------------------
  { id: 'CRM-01', name: 'Newsletter exclusiva', channel: 'CRM', unit: 'SEND',
    businessHours: 3.0, designHours: 3.0, externalCostCents: 0,
    leadTimeBusinessDays: 15, basePriceCents: 200_000,
    isMediaBuy: false, minMonthlyFeeCents: null, alwaysManualMediaSplit: false, requiresAvailabilityCheck: false },
  { id: 'CRM-02', name: 'Newsletter segmentada / geolocalizada', channel: 'CRM', unit: 'SEND',
    businessHours: 4.0, designHours: 2.0, externalCostCents: 0,
    leadTimeBusinessDays: 15, basePriceCents: 95_000,
    isMediaBuy: false, minMonthlyFeeCents: null, alwaysManualMediaSplit: false, requiresAvailabilityCheck: false },
  { id: 'CRM-03', name: 'Banner insertado en newsletter', channel: 'CRM', unit: 'INSERTION_WEEK',
    businessHours: 1.0, designHours: 1.0, externalCostCents: 0,
    leadTimeBusinessDays: 10, basePriceCents: 40_000,
    isMediaBuy: false, minMonthlyFeeCents: null, alwaysManualMediaSplit: false, requiresAvailabilityCheck: true },
  { id: 'CRM-04', name: 'Push notification', channel: 'CRM', unit: 'SEND',
    businessHours: 1.5, designHours: 0.0, externalCostCents: 0,
    leadTimeBusinessDays: 10, basePriceCents: 43_000,
    isMediaBuy: false, minMonthlyFeeCents: null, alwaysManualMediaSplit: false, requiresAvailabilityCheck: false },
  { id: 'CRM-05', name: 'Emails de ciclo de vida', channel: 'CRM', unit: 'MONTH',
    businessHours: 1.5, designHours: 1.5, externalCostCents: 0,
    leadTimeBusinessDays: 20, basePriceCents: 45_000,
    isMediaBuy: false, minMonthlyFeeCents: null, alwaysManualMediaSplit: false, requiresAvailabilityCheck: false },

  // --- Social (el coste externo es el boost por publicación) -----------------
  { id: 'SOC-01', name: 'Reel Instagram', channel: 'SOCIAL', unit: 'UNIT',
    businessHours: 2.0, designHours: 4.0, externalCostCents: 10_000,
    leadTimeBusinessDays: 15, basePriceCents: 80_000,
    isMediaBuy: false, minMonthlyFeeCents: null, alwaysManualMediaSplit: false, requiresAvailabilityCheck: false },
  { id: 'SOC-02', name: 'Story Instagram', channel: 'SOCIAL', unit: 'UNIT',
    businessHours: 0.5, designHours: 1.0, externalCostCents: 10_000,
    leadTimeBusinessDays: 10, basePriceCents: 30_000,
    isMediaBuy: false, minMonthlyFeeCents: null, alwaysManualMediaSplit: false, requiresAvailabilityCheck: false },
  { id: 'SOC-03', name: 'Post o carrusel', channel: 'SOCIAL', unit: 'UNIT',
    businessHours: 1.0, designHours: 2.0, externalCostCents: 10_000,
    leadTimeBusinessDays: 10, basePriceCents: 43_000,
    isMediaBuy: false, minMonthlyFeeCents: null, alwaysManualMediaSplit: false, requiresAvailabilityCheck: false },
  { id: 'SOC-04', name: 'Concurso o sorteo', channel: 'SOCIAL', unit: 'UNIT',
    businessHours: 5.0, designHours: 3.0, externalCostCents: 10_000,
    leadTimeBusinessDays: 20, basePriceCents: 95_000,
    isMediaBuy: false, minMonthlyFeeCents: null, alwaysManualMediaSplit: false, requiresAvailabilityCheck: false },
  { id: 'SOC-05', name: 'Video TikTok', channel: 'SOCIAL', unit: 'UNIT',
    businessHours: 2.0, designHours: 4.0, externalCostCents: 10_000,
    leadTimeBusinessDays: 15, basePriceCents: 85_000,
    isMediaBuy: false, minMonthlyFeeCents: null, alwaysManualMediaSplit: false, requiresAvailabilityCheck: false,
    // Solo confirmado en FR. El resto no es vendible hasta confirmación.
    markets: {
      ES:    { sellable: false, note: 'TikTok solo confirmado en FR' },
      IT:    { sellable: false, note: 'TikTok solo confirmado en FR' },
      BE_FR: { sellable: false, note: 'TikTok solo confirmado en FR' },
      BE_NL: { sellable: false, note: 'TikTok solo confirmado en FR' },
    } },

  // --- Media buy (CLAUDE.md §4.4) -------------------------------------------
  { id: 'ADS-01', name: 'Campaña Meta patrocinada', channel: 'SOCIAL_ADS', unit: 'MONTH',
    businessHours: 7.0, designHours: 3.0, externalCostCents: 0,
    leadTimeBusinessDays: 15, basePriceCents: 185_000,
    isMediaBuy: true, minMonthlyFeeCents: 120_000, alwaysManualMediaSplit: false, requiresAvailabilityCheck: true },
  { id: 'ADS-02', name: 'Google Performance Max', channel: 'DISPLAY_SEA', unit: 'MONTH',
    businessHours: 10.0, designHours: 0.0, externalCostCents: 0,
    leadTimeBusinessDays: 15, basePriceCents: 225_000,
    isMediaBuy: true, minMonthlyFeeCents: 150_000, alwaysManualMediaSplit: false, requiresAvailabilityCheck: false },
  { id: 'ADS-03', name: 'Display ads', channel: 'DISPLAY_SEA', unit: 'MONTH',
    businessHours: 7.0, designHours: 3.0, externalCostCents: 0,
    leadTimeBusinessDays: 15, basePriceCents: 150_000,
    // SIN DATO: no hay fee mínimo confirmado. No se inventa (CLAUDE.md §4.4, §9).
    isMediaBuy: true, minMonthlyFeeCents: null, alwaysManualMediaSplit: false, requiresAvailabilityCheck: false },

  // --- Content --------------------------------------------------------------
  { id: 'CON-01', name: 'Artículo de blog dedicado', channel: 'CONTENT', unit: 'UNIT',
    businessHours: 8.0, designHours: 0.0, externalCostCents: 0,
    leadTimeBusinessDays: 20, basePriceCents: 85_000,
    isMediaBuy: false, minMonthlyFeeCents: null, alwaysManualMediaSplit: false, requiresAvailabilityCheck: false },

  // --- Influencer -----------------------------------------------------------
  { id: 'INF-01', name: 'Colaboración con influencer', channel: 'INFLUENCER', unit: 'COLLABORATION',
    businessHours: 8.0, designHours: 2.0, externalCostCents: 0,
    leadTimeBusinessDays: 30, basePriceCents: 225_000,
    // SIN DATO: idem ADS-03.
    isMediaBuy: true, minMonthlyFeeCents: null, alwaysManualMediaSplit: true, requiresAvailabilityCheck: false },
];

export const DEFAULT_CATALOG: Catalog = new Map(SUPPORTS.map((s) => [s.id, s]));

export function buildCatalog(supports: readonly SupportDefinition[]): Catalog {
  return new Map(supports.map((s) => [s.id, s]));
}
