import type { SupabaseClient } from '@supabase/supabase-js';

import type {
  Catalog,
  Market,
  PricingParameters,
  PublicHoliday,
  SupportDefinition,
} from '@/src/pricing/index.js';
import type { Database } from '@/lib/supabase/database.types.js';

/** Cliente de Supabase, tipado con nuestro esquema, tanto de sesión como público. */
export type TypedSupabaseClient = SupabaseClient<Database>;

/**
 * Carga desde Supabase el juego de parámetros activo, el catálogo y los
 * festivos, y los da en la forma que espera el motor puro de src/pricing.
 *
 * El motor nunca toca la base de datos (CLAUDE.md §10.1): esto es la única
 * frontera entre las dos capas. Se llama en cada request de servidor que
 * necesite precios — nada se cachea en memoria del proceso, porque los
 * parámetros son editables desde admin y deben reflejarse sin desplegar.
 */
export interface LoadedPricingContext {
  readonly parameters: PricingParameters;
  readonly catalog: Catalog;
  readonly holidays: readonly PublicHoliday[];
  /** Validez de la oferta en días (CLAUDE.md §7). No es un parámetro del motor puro: solo lo usa el email de envío. */
  readonly offerValidityDays: number;
}

export async function loadPricingContext(
  supabase: TypedSupabaseClient,
): Promise<LoadedPricingContext> {
  const { data: paramSet, error: paramError } = await supabase
    .from('pricing_parameter_sets')
    .select('id, hourly_rate_cents, min_margin_rate, media_fee_rate, offer_validity_days')
    .eq('is_active', true)
    .maybeSingle();

  if (paramError) throw new Error(`No se pudo cargar el juego de parámetros: ${paramError.message}`);
  if (!paramSet) throw new Error('No hay un juego de parámetros de precios activo en pricing_parameter_sets');

  const [{ data: coefficients, error: coefError }, { data: tiers, error: tierError }] =
    await Promise.all([
      supabase
        .from('market_coefficients')
        .select('market, coefficient')
        .eq('parameter_set_id', paramSet.id),
      supabase
        .from('volume_discount_tiers')
        .select('from_cents, discount_rate')
        .eq('parameter_set_id', paramSet.id)
        .order('from_cents', { ascending: true }),
    ]);

  if (coefError) throw new Error(`No se pudieron cargar los coeficientes de mercado: ${coefError.message}`);
  if (tierError) throw new Error(`No se pudo cargar la escala de descuento: ${tierError.message}`);

  const marketCoefficients = Object.fromEntries(
    (coefficients ?? []).map((c) => [c.market, Number(c.coefficient)]),
  ) as Record<Market, number>;

  const parameters: PricingParameters = {
    hourlyRateCents: paramSet.hourly_rate_cents,
    minMarginRate: Number(paramSet.min_margin_rate),
    mediaFeeRate: Number(paramSet.media_fee_rate),
    marketCoefficients,
    volumeDiscountTiers: (tiers ?? []).map((t) => ({
      fromCents: t.from_cents,
      rate: Number(t.discount_rate),
    })),
  };

  const [{ data: supports, error: supportsError }, { data: availability, error: availError }] =
    await Promise.all([
      // Nota: el select va en un único literal, no concatenado con `+`. El
      // parser de tipos de postgrest-js necesita un string LITERAL para
      // inferir las columnas; una concatenación en tiempo de ejecución
      // colapsa el tipo a `string` y el resultado se tipa como error.
      supabase
        .from('supports')
        .select(
          'id, name, channel, unit, business_hours, design_hours, external_cost_cents, lead_time_business_days, base_price_cents, is_media_buy, min_monthly_fee_cents, requires_availability_check, is_active',
        )
        .eq('is_active', true),
      supabase
        .from('support_market_availability')
        .select('support_id, market, is_sellable, external_cost_cents_override, note'),
    ]);

  if (supportsError) throw new Error(`No se pudo cargar el catálogo: ${supportsError.message}`);
  if (availError) throw new Error(`No se pudo cargar la vendibilidad por mercado: ${availError.message}`);

  const availabilityBySupport = new Map<string, typeof availability>();
  for (const row of availability ?? []) {
    const list = availabilityBySupport.get(row.support_id) ?? [];
    list.push(row);
    availabilityBySupport.set(row.support_id, list);
  }

  const catalog: Catalog = new Map(
    (supports ?? []).map((s): [string, SupportDefinition] => {
      const marketRows = availabilityBySupport.get(s.id) ?? [];
      const markets = Object.fromEntries(
        marketRows.map((m) => [
          m.market,
          {
            sellable: m.is_sellable,
            ...(m.external_cost_cents_override !== null
              ? { externalCostCents: m.external_cost_cents_override }
              : {}),
            ...(m.note ? { note: m.note } : {}),
          },
        ]),
      );

      return [
        s.id,
        {
          id: s.id,
          name: s.name,
          channel: s.channel,
          unit: s.unit,
          businessHours: Number(s.business_hours),
          designHours: Number(s.design_hours),
          externalCostCents: s.external_cost_cents,
          leadTimeBusinessDays: s.lead_time_business_days,
          basePriceCents: s.base_price_cents,
          isMediaBuy: s.is_media_buy,
          minMonthlyFeeCents: s.min_monthly_fee_cents,
          requiresAvailabilityCheck: s.requires_availability_check,
          markets,
        },
      ];
    }),
  );

  const { data: holidayRows, error: holidayError } = await supabase
    .from('market_holidays')
    .select('market, holiday_date, name');

  if (holidayError) throw new Error(`No se pudieron cargar los festivos: ${holidayError.message}`);

  const holidays: PublicHoliday[] = (holidayRows ?? []).map((h) => ({
    market: h.market,
    date: h.holiday_date,
    name: h.name,
  }));

  return { parameters, catalog, holidays, offerValidityDays: paramSet.offer_validity_days };
}
