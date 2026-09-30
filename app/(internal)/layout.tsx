import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { InternalHeader } from '@/components/InternalHeader';
import { PreferredLanguageSeed } from '@/components/PreferredLanguageSeed';
import type { InternalLanguage } from '@/lib/i18n-internal';

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
    .select('full_name, email, preferred_language')
    .eq('id', user.id)
    .maybeSingle();

  return (
    <>
      <PreferredLanguageSeed preferredLanguage={(profile?.preferred_language as InternalLanguage) ?? null} />
      <InternalHeader displayName={profile?.full_name ?? user.email ?? ''} />
      {children}
    </>
  );
}
