/**
 * Tipos generados a mano a partir de `supabase/migrations/`, no con
 * `supabase gen types` (no hay proyecto Supabase vivo en este entorno).
 * Cubre las tablas y funciones que la aplicación realmente usa desde
 * `@supabase/supabase-js` — no todo el esquema línea a línea.
 *
 * Al provisionar un proyecto Supabase real, sustituir por:
 *   supabase gen types typescript --project-id <id> > lib/supabase/database.types.ts
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Market = 'FR' | 'ES' | 'IT' | 'BE_FR' | 'BE_NL' | 'NL';
export type Channel = 'ONSITE' | 'CRM' | 'SOCIAL' | 'SOCIAL_ADS' | 'DISPLAY_SEA' | 'CONTENT' | 'INFLUENCER';
export type SupportUnit =
  | 'WEEK'
  | 'CAMPAIGN'
  | 'SEND'
  | 'INSERTION_WEEK'
  | 'MONTH'
  | 'UNIT'
  | 'COLLABORATION';
export type ContentLanguageEnum = 'FR' | 'ES' | 'IT' | 'NL' | 'EN';
export type ViesResultEnum = 'VALID' | 'INVALID' | 'UNAVAILABLE';
export type ProposalStatusEnum =
  | 'DRAFT'
  | 'SENT'
  | 'VIEWED'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'COUNTERED';
export type VatRegimeEnum = 'FR_VAT_20' | 'REVERSE_CHARGE';
export type PaymentTermsEnum = 'SPLIT_30_70' | 'FULL_ON_SIGNATURE';
export type CampaignDurationUnitEnum = 'WEEK' | 'MONTH';
/** Contrapropuesta editable del cliente (CLAUDE.md, ronda 16). */
export type CounterProposalStatusEnum = 'PENDING' | 'ACCEPTED' | 'REJECTED';
/** Excepciones registradas con autor/motivo/marca de tiempo (CLAUDE.md §8). */
export type OverrideKindEnum =
  | 'MARGIN_BELOW_FLOOR'
  | 'MANUAL_DISCOUNT'
  | 'LEAD_TIME_FORCED'
  | 'AVAILABILITY_FORCED'
  | 'VOLUME_DISCOUNT_DISABLED'
  | 'MEDIA_FEE_FORCED';

export interface Database {
  // Marcador que @supabase/postgrest-js (v2.47+) exige en el tipo Database
  // para resolver los genéricos de .rpc()/.from() — lo añade
  // `supabase gen types` automáticamente; aquí se escribe a mano.
  __InternalSupabase: { PostgrestVersion: '13.0.5' };
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string;
          is_active: boolean;
          /** Administrador (CLAUDE.md, ronda 16): puede decidir sobre CUALQUIER contrapropuesta, no solo las suyas. Protegido por trigger — solo la clave de servicio lo cambia. */
          is_admin: boolean;
          /** Idioma de interfaz interna por defecto (CLAUDE.md, ronda 17, bloque 3). Copiado de `allowed_emails.invite_language` al aprovisionar; default 'ES'. */
          preferred_language: 'ES' | 'FR' | 'EN';
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['profiles']['Row']> & { id: string; email: string; full_name: string };
        Update: Partial<Database['public']['Tables']['profiles']['Row']>;
        Relationships: [];
      };
      allowed_emails: {
        Row: {
          email: string;
          note: string | null;
          full_name: string | null;
          /** Idioma elegido al dar de alta el acceso (CLAUDE.md, ronda 17, bloque 3). NULL para accesos de antes de esta ronda. */
          invite_language: 'ES' | 'FR' | 'EN' | null;
          added_at: string;
          added_by: string | null;
        };
        Insert: Partial<Database['public']['Tables']['allowed_emails']['Row']> & { email: string };
        Update: Partial<Database['public']['Tables']['allowed_emails']['Row']>;
        Relationships: [];
      };
      accounts: {
        Row: {
          id: string;
          legal_name: string;
          country_code: string;
          primary_market: Market | null;
          vat_number: string | null;
          billing_address: string | null;
          owner_id: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['accounts']['Row']> & {
          legal_name: string;
          country_code: string;
        };
        Update: Partial<Database['public']['Tables']['accounts']['Row']>;
        Relationships: [];
      };
      // (La entrada de `contacts` incluye la FK hacia `accounts` para que el
      // embed `accounts(...contacts(...))` de app/(internal)/proposals/new
      // resuelva en tiempo de tipos.)
      contacts: {
        Row: {
          id: string;
          account_id: string;
          full_name: string;
          email: string;
          phone: string | null;
          role: string | null;
          language: ContentLanguageEnum;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['contacts']['Row']> & {
          account_id: string;
          full_name: string;
          email: string;
          language: ContentLanguageEnum;
        };
        Update: Partial<Database['public']['Tables']['contacts']['Row']>;
        Relationships: [
          {
            foreignKeyName: 'contacts_account_id_fkey';
            columns: ['account_id'];
            isOneToOne: false;
            referencedRelation: 'accounts';
            referencedColumns: ['id'];
          },
        ];
      };
      // Añadidas en la ronda 7 (navegación/listados): antes solo se tocaban
      // vía RPC (create_and_send_proposal, mark_proposal_sent...), que
      // devuelven `Json` opaco. Las pantallas de listado/detalle sí
      // necesitan `.from('proposals').select(...)` tipado de verdad.
      proposals: {
        Row: {
          id: string;
          account_id: string;
          contact_id: string;
          owner_id: string;
          parameter_set_id: string;
          version: number;
          supersedes_id: string | null;
          /** Número corto y legible (CLAUDE.md §10.3 octies), p. ej. "2026-014" — asignado al crear el borrador, único, nunca reutilizado. */
          proposal_number: string;
          status: ProposalStatusEnum;
          language: ContentLanguageEnum;
          brief: string | null;
          public_token: string;
          sent_at: string | null;
          first_viewed_at: string | null;
          decided_at: string | null;
          expires_at: string | null;
          vat_regime: VatRegimeEnum | null;
          payment_terms: PaymentTermsEnum | null;
          frozen_snapshot: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['proposals']['Row']> & {
          account_id: string;
          contact_id: string;
          owner_id: string;
          parameter_set_id: string;
          public_token: string;
          language: ContentLanguageEnum;
        };
        Update: Partial<Database['public']['Tables']['proposals']['Row']>;
        Relationships: [
          {
            foreignKeyName: 'proposals_account_id_fkey';
            columns: ['account_id'];
            isOneToOne: false;
            referencedRelation: 'accounts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'proposals_contact_id_fkey';
            columns: ['contact_id'];
            isOneToOne: false;
            referencedRelation: 'contacts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'proposals_owner_id_fkey';
            columns: ['owner_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      proposal_options: {
        Row: {
          id: string;
          proposal_id: string;
          code: 'A' | 'B' | 'C';
          name: string;
          pitch: string | null;
          sort_order: number;
          markets: Market[];
          campaign_start: string | null;
          campaign_end: string | null;
          campaign_duration_count: number | null;
          campaign_duration_unit: CampaignDurationUnitEnum | null;
          gross_net_of_media_cents: number | null;
          discount_cents: number | null;
          net_revenue_cents: number | null;
          media_budget_cents: number | null;
          billed_total_cents: number | null;
          cost_cents: number | null;
          margin_cents: number | null;
          margin_rate: number | null;
          max_lead_time_days: number | null;
          /** Interruptor "desactivar descuento por volumen" (CLAUDE.md §4.5, ronda 9). */
          volume_discount_disabled: boolean;
          calculated_at: string | null;
        };
        Insert: Partial<Database['public']['Tables']['proposal_options']['Row']> & {
          proposal_id: string;
          code: 'A' | 'B' | 'C';
          name: string;
        };
        Update: Partial<Database['public']['Tables']['proposal_options']['Row']>;
        Relationships: [
          {
            foreignKeyName: 'proposal_options_proposal_id_fkey';
            columns: ['proposal_id'];
            isOneToOne: false;
            referencedRelation: 'proposals';
            referencedColumns: ['id'];
          },
        ];
      };
      proposal_option_lines: {
        Row: {
          id: string;
          option_id: string;
          support_id: string;
          market: Market;
          quantity: number;
          media_budget_cents: number | null;
          media_months: number | null;
          is_lead_market: boolean | null;
          unit_cost_cents: number | null;
          cost_cents: number | null;
          gross_price_cents: number | null;
          margin_floor_cents: number | null;
          floor_applied: boolean | null;
          list_price_cents: number | null;
          discount_cents: number | null;
          net_price_cents: number | null;
          manual_fee_cents: number | null;
          manual_fee_reason: string | null;
          media_real_spend_cents: number | null;
          lead_time_forced: boolean;
          lead_time_force_reason: string | null;
          billed_total_cents: number | null;
          sort_order: number;
        };
        Insert: Partial<Database['public']['Tables']['proposal_option_lines']['Row']> & {
          option_id: string;
          support_id: string;
          market: Market;
        };
        Update: Partial<Database['public']['Tables']['proposal_option_lines']['Row']>;
        Relationships: [
          {
            foreignKeyName: 'proposal_option_lines_option_id_fkey';
            columns: ['option_id'];
            isOneToOne: false;
            referencedRelation: 'proposal_options';
            referencedColumns: ['id'];
          },
        ];
      };
      // Contrapropuesta editable del cliente (CLAUDE.md, ronda 16): lo que
      // `submit_counter_proposal` persiste. Solo lectura desde el SDK
      // (política `team_read`) — las mutaciones pasan exclusivamente por
      // accept_counter_proposal/reject_counter_proposal (RPC).
      counter_proposals: {
        Row: {
          id: string;
          proposal_id: string;
          option_code: 'A' | 'B' | 'C';
          option_name: string | null;
          status: CounterProposalStatusEnum;
          lines: Json;
          campaign_start: string | null;
          campaign_end: string | null;
          campaign_duration_count: number | null;
          campaign_duration_unit: CampaignDurationUnitEnum | null;
          legal_name: string;
          billing_address: string;
          vat_number: string | null;
          billing_contact_name: string;
          billing_contact_email: string;
          signer_name: string;
          signer_role: string;
          purchase_order_reference: string | null;
          vies_check_id: string | null;
          submitted_at: string;
          reviewed_at: string | null;
          reviewed_by: string | null;
          rejection_reason: string | null;
          resulting_proposal_id: string | null;
        };
        Insert: Partial<Database['public']['Tables']['counter_proposals']['Row']> & {
          proposal_id: string;
          option_code: 'A' | 'B' | 'C';
          lines: Json;
          legal_name: string;
          billing_address: string;
          billing_contact_name: string;
          billing_contact_email: string;
          signer_name: string;
          signer_role: string;
        };
        Update: Partial<Database['public']['Tables']['counter_proposals']['Row']>;
        Relationships: [
          {
            foreignKeyName: 'counter_proposals_proposal_id_fkey';
            columns: ['proposal_id'];
            isOneToOne: true;
            referencedRelation: 'proposals';
            referencedColumns: ['id'];
          },
        ];
      };
      // Ronda 18, bloque 4: fuente del dashboard para el importe facturado
      // (fee de gestión, "importe_neto_de_medios") por AM y quarter fiscal —
      // fiscal_year/fiscal_quarter se fijan por trigger a la fecha de FIRMA
      // (CLAUDE.md §0), nunca recalculados en la aplicación.
      acceptances: {
        Row: {
          id: string;
          proposal_id: string;
          option_id: string;
          legal_name: string;
          billing_address: string;
          vat_number: string | null;
          billing_contact_name: string;
          billing_contact_email: string;
          signer_name: string;
          signer_role: string;
          purchase_order_reference: string | null;
          vies_check_id: string | null;
          vat_regime_applied: VatRegimeEnum;
          accepted_at: string;
          fiscal_year: number;
          fiscal_quarter: 1 | 2 | 3 | 4;
        };
        Insert: Partial<Database['public']['Tables']['acceptances']['Row']> & {
          proposal_id: string;
          option_id: string;
          legal_name: string;
          billing_address: string;
          billing_contact_name: string;
          billing_contact_email: string;
          signer_name: string;
          signer_role: string;
          vat_regime_applied: VatRegimeEnum;
        };
        Update: Partial<Database['public']['Tables']['acceptances']['Row']>;
        Relationships: [
          {
            foreignKeyName: 'acceptances_proposal_id_fkey';
            columns: ['proposal_id'];
            isOneToOne: true;
            referencedRelation: 'proposals';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'acceptances_option_id_fkey';
            columns: ['option_id'];
            isOneToOne: true;
            referencedRelation: 'proposal_options';
            referencedColumns: ['id'];
          },
        ];
      };
      // Registro de eventos por presupuesto (visto/aceptado/rechazado…). En
      // el esquema desde la primera migración; el cron diario (ronda 18,
      // bloque 2) es el primero en LEERLA para deduplicar (evento
      // 'reminder_sent') y en escribir 'expired'.
      proposal_events: {
        Row: {
          id: string;
          proposal_id: string;
          event_type: string;
          payload: Json | null;
          actor_id: string | null;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['proposal_events']['Row']> & {
          proposal_id: string;
          event_type: string;
        };
        Update: Partial<Database['public']['Tables']['proposal_events']['Row']>;
        Relationships: [
          {
            foreignKeyName: 'proposal_events_proposal_id_fkey';
            columns: ['proposal_id'];
            isOneToOne: false;
            referencedRelation: 'proposals';
            referencedColumns: ['id'];
          },
        ];
      };
      // Excepciones registradas (CLAUDE.md §8) — primer `.select()` directo
      // (ronda 24, panel de "Requieren tu atención"): hasta ahora solo se
      // insertaba desde las funciones SQL, nunca se leía vía postgrest-js.
      overrides: {
        Row: {
          id: string;
          proposal_id: string;
          option_id: string | null;
          support_id: string | null;
          market: Market | null;
          kind: OverrideKindEnum;
          reason: string;
          created_by: string;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['overrides']['Row']> & {
          proposal_id: string;
          kind: OverrideKindEnum;
          reason: string;
          created_by: string;
        };
        Update: Partial<Database['public']['Tables']['overrides']['Row']>;
        Relationships: [
          {
            foreignKeyName: 'overrides_proposal_id_fkey';
            columns: ['proposal_id'];
            isOneToOne: false;
            referencedRelation: 'proposals';
            referencedColumns: ['id'];
          },
        ];
      };
      // Objetivo por advertising manager y por quarter fiscal (CLAUDE.md §0).
      // En el esquema desde la primera migración; ronda 18, bloque 4 es su
      // primer uso real (confirmado por Vincent: la tabla sirve tal cual).
      quarterly_targets: {
        Row: {
          id: string;
          profile_id: string;
          fiscal_year: number;
          fiscal_quarter: 1 | 2 | 3 | 4;
          target_cents: number;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: Partial<Database['public']['Tables']['quarterly_targets']['Row']> & {
          profile_id: string;
          fiscal_year: number;
          fiscal_quarter: 1 | 2 | 3 | 4;
          target_cents: number;
        };
        Update: Partial<Database['public']['Tables']['quarterly_targets']['Row']>;
        Relationships: [
          {
            foreignKeyName: 'quarterly_targets_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      pricing_parameter_sets: {
        Row: {
          id: string;
          label: string;
          effective_from: string;
          is_active: boolean;
          hourly_rate_cents: number;
          min_margin_rate: number;
          media_fee_rate: number;
          offer_validity_days: number;
          created_at: string;
          created_by: string | null;
        };
        Insert: Partial<Database['public']['Tables']['pricing_parameter_sets']['Row']> & {
          label: string;
          effective_from: string;
          hourly_rate_cents: number;
          min_margin_rate: number;
        };
        Update: Partial<Database['public']['Tables']['pricing_parameter_sets']['Row']>;
        Relationships: [];
      };
      market_coefficients: {
        Row: { parameter_set_id: string; market: Market; coefficient: number };
        Insert: { parameter_set_id: string; market: Market; coefficient: number };
        Update: Partial<Database['public']['Tables']['market_coefficients']['Row']>;
        Relationships: [];
      };
      volume_discount_tiers: {
        Row: { parameter_set_id: string; from_cents: number; discount_rate: number };
        Insert: { parameter_set_id: string; from_cents: number; discount_rate: number };
        Update: Partial<Database['public']['Tables']['volume_discount_tiers']['Row']>;
        Relationships: [];
      };
      multimarket_discount_guidance: {
        Row: { parameter_set_id: string; market_count: number; discount_rate: number };
        Insert: { parameter_set_id: string; market_count: number; discount_rate: number };
        Update: Partial<Database['public']['Tables']['multimarket_discount_guidance']['Row']>;
        Relationships: [];
      };
      supports: {
        Row: {
          id: string;
          name: string;
          channel: Channel;
          unit: SupportUnit;
          business_hours: number;
          design_hours: number;
          external_cost_cents: number;
          lead_time_business_days: number;
          base_price_cents: number;
          is_media_buy: boolean;
          min_monthly_fee_cents: number | null;
          always_manual_media_split: boolean;
          requires_availability_check: boolean;
          is_active: boolean;
          sort_order: number;
        };
        Insert: Partial<Database['public']['Tables']['supports']['Row']> & {
          id: string;
          name: string;
          channel: Channel;
          unit: SupportUnit;
        };
        Update: Partial<Database['public']['Tables']['supports']['Row']>;
        Relationships: [];
      };
      support_market_availability: {
        Row: {
          support_id: string;
          market: Market;
          is_sellable: boolean;
          external_cost_cents_override: number | null;
          note: string | null;
        };
        Insert: {
          support_id: string;
          market: Market;
          is_sellable?: boolean;
          external_cost_cents_override?: number | null;
          note?: string | null;
        };
        Update: Partial<Database['public']['Tables']['support_market_availability']['Row']>;
        Relationships: [];
      };
      market_holidays: {
        Row: { market: Market; holiday_date: string; name: string };
        Insert: { market: Market; holiday_date: string; name: string };
        Update: Partial<Database['public']['Tables']['market_holidays']['Row']>;
        Relationships: [];
      };
      reach_measurements: {
        Row: {
          id: string;
          support_id: string;
          market: Market;
          value: number | null;
          metric: string | null;
          period_unit: SupportUnit | null;
          source: string | null;
          measured_at: string | null;
          note: string | null;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['reach_measurements']['Row']> & {
          support_id: string;
          market: Market;
        };
        Update: Partial<Database['public']['Tables']['reach_measurements']['Row']>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      create_and_send_proposal: {
        Args: { payload: Json };
        Returns: Json;
      };
      get_public_proposal: {
        Args: { token: string };
        Returns: Json;
      };
      mark_public_proposal_viewed: {
        Args: { token: string };
        Returns: Json;
      };
      accept_public_proposal: {
        Args: {
          p_token: string;
          p_option_code: string;
          p_legal_name: string;
          p_billing_address: string;
          p_vat_number: string | null;
          p_billing_contact_name: string;
          p_billing_contact_email: string;
          p_signer_name: string;
          p_signer_role: string;
          p_purchase_order_reference: string | null;
          p_vies_result: ViesResultEnum;
          p_vies_raw: Json;
        };
        Returns: Json;
      };
      reject_public_proposal: {
        Args: { p_token: string; p_reason: string | null };
        Returns: Json;
      };
      mark_proposal_sent: {
        Args: { p_proposal_id: string; p_email: Json };
        Returns: Json;
      };
      log_proposal_send_failure: {
        Args: { p_proposal_id: string; p_email: Json };
        Returns: undefined;
      };
      submit_counter_proposal: {
        Args: {
          p_token: string;
          p_option_code: string;
          p_lines: Json;
          p_campaign_start: string | null;
          p_campaign_end: string | null;
          p_campaign_duration_count: number | null;
          p_campaign_duration_unit: string | null;
          p_legal_name: string;
          p_billing_address: string;
          p_vat_number: string | null;
          p_billing_contact_name: string;
          p_billing_contact_email: string;
          p_signer_name: string;
          p_signer_role: string;
          p_purchase_order_reference: string | null;
          p_vies_result: ViesResultEnum;
          p_vies_raw: Json;
        };
        Returns: Json;
      };
      accept_counter_proposal: {
        Args: { p_counter_proposal_id: string; p_margin_overrides: Json };
        Returns: Json;
      };
      reject_counter_proposal: {
        Args: { p_counter_proposal_id: string; p_reason: string };
        Returns: Json;
      };
    };
    Enums: {
      market: Market;
      channel: Channel;
      support_unit: SupportUnit;
      content_language: ContentLanguageEnum;
      vies_result: ViesResultEnum;
      proposal_status: ProposalStatusEnum;
      vat_regime: VatRegimeEnum;
      payment_terms: PaymentTermsEnum;
      counter_proposal_status: CounterProposalStatusEnum;
      override_kind: OverrideKindEnum;
    };
    CompositeTypes: Record<string, never>;
  };
}
