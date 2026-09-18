/**
 * Tipos de dominio que solo existen en la capa de aplicación (no en el
 * motor puro de src/pricing): idioma del cliente, estructura de cuentas y
 * contactos tal como llegan de Supabase.
 */
export type ContentLanguage = 'FR' | 'ES' | 'IT' | 'NL' | 'EN';

export const CONTENT_LANGUAGES: readonly ContentLanguage[] = ['FR', 'ES', 'IT', 'NL', 'EN'];

export const LANGUAGE_LABELS: Record<ContentLanguage, string> = {
  FR: 'Francés',
  ES: 'Español',
  IT: 'Italiano',
  NL: 'Neerlandés',
  EN: 'Inglés',
};

export interface ContactRow {
  readonly id: string;
  readonly full_name: string;
  readonly email: string;
  readonly language: ContentLanguage;
}

export interface AccountRow {
  readonly id: string;
  readonly legal_name: string;
  readonly country_code: string;
  readonly contacts: readonly ContactRow[];
}
