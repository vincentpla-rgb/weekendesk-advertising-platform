import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { InternalSidebar } from '@/components/InternalSidebar';
import { PreferredLanguageSeed } from '@/components/PreferredLanguageSeed';
import type { InternalLanguage } from '@/lib/i18n-internal';

/**
 * Marco de las pantallas internas (CLAUDE.md §10.3, ronda 24): menú lateral
 * (`InternalSidebar`, antes `InternalHeader` horizontal) + el contenido de
 * cada pantalla dentro de `.main > .container` (`app/globals.css`). Mismas
 * rutas y permisos de siempre — ninguna pantalla se mueve ni se restringe,
 * solo cambia el marco que las envuelve.
 */
export default async function InternalLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, email, preferred_language, is_admin')
    .eq('id', user.id)
    .maybeSingle();

  return (
    <div className="app">
      <PreferredLanguageSeed preferredLanguage={(profile?.preferred_language as InternalLanguage) ?? null} />
      <InternalSidebar displayName={profile?.full_name ?? user.email ?? ''} isAdmin={Boolean(profile?.is_admin)} />
      <main className="main">
        <div className="container">{children}</div>
      </main>
    </div>
  );
}
