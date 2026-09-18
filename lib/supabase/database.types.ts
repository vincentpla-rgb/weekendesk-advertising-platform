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

export type Market = 'FR' | 'ES' | 'IT' | 'BE_FR' | 'BE_NL';
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
export type ProposalStatusEnum = 'DRAFT' | 'SENT' | 'VIEWED' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';
/** PENDING = fallo técnico de VIES al aceptar; reintentar con resolve_vat_regime. */
export type VatRegimeEnum = 'FR_VAT_20' | 'REVERSE_CHARGE' | 'PENDING';

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
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['profiles']['Row']> & { id: string; email: string; full_name: string };
        Update: Partial<Database['public']['Tables']['profiles']['Row']>;
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
      // Las cuatro tablas siguientes solo se leen desde la ficha interna del
      // presupuesto (app/(internal)/proposals/[id]) — la escritura del ciclo
      // envío/aceptación/rechazo pasa por RPC (create_and_send_proposal,
      // accept_public_proposal, reject_public_proposal, resolve_vat_regime),
      // no por INSERT/UPDATE directos desde el cliente.
      proposals: {
        Row: {
          id: string;
          account_id: string;
          contact_id: string;
          owner_id: string;
          status: ProposalStatusEnum;
          language: ContentLanguageEnum;
          brief: string | null;
          campaign_start: string | null;
          campaign_end: string | null;
          public_token: string;
          sent_at: string | null;
          expires_at: string | null;
          decided_at: string | null;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['proposals']['Row']> & {
          account_id: string;
          contact_id: string;
          owner_id: string;
          public_token: string;
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
        ];
      };
      proposal_options: {
        Row: {
          id: string;
          proposal_id: string;
          code: string;
          name: string;
          pitch: string | null;
          net_revenue_cents: number | null;
          media_budget_cents: number | null;
          billed_total_cents: number | null;
          margin_rate: number | null;
          sort_order: number;
        };
        Insert: Partial<Database['public']['Tables']['proposal_options']['Row']> & {
          proposal_id: string;
          code: string;
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
          fiscal_quarter: number;
        };
        Insert: Partial<Database['public']['Tables']['acceptances']['Row']> & {
          proposal_id: string;
          option_id: string;
          legal_name: string;
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
            isOneToOne: false;
            referencedRelation: 'proposal_options';
            referencedColumns: ['id'];
          },
        ];
      };
      rejections: {
        Row: {
          id: string;
          proposal_id: string;
          reason: string | null;
          counter_proposal_id: string | null;
          rejected_at: string;
        };
        Insert: Partial<Database['public']['Tables']['rejections']['Row']> & { proposal_id: string };
        Update: Partial<Database['public']['Tables']['rejections']['Row']>;
        Relationships: [
          {
            foreignKeyName: 'rejections_proposal_id_fkey';
            columns: ['proposal_id'];
            isOneToOne: true;
            referencedRelation: 'proposals';
            referencedColumns: ['id'];
          },
        ];
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
        Returns: undefined;
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
      resolve_vat_regime: {
        Args: { p_acceptance_id: string; p_vies_result: ViesResultEnum; p_vies_raw: Json };
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
    };
    CompositeTypes: Record<string, never>;
  };
}
