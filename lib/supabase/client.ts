'use client';

import { createBrowserClient } from '@supabase/ssr';

import type { Database } from './database.types.js';

/**
 * Cliente de Supabase para componentes de cliente. Usa la clave anon: todo lo
 * que hace pasa por RLS (`team_all`, o las funciones SECURITY DEFINER de la
 * pantalla pública). Nunca lleva la service role key.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
