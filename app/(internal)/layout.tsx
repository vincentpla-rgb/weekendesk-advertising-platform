import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { InternalHeader } from '@/components/InternalHeader';

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
    .select('full_name, email')
    .eq('id', user.id)
    .maybeSingle();

  return (
    <>
      <InternalHeader displayName={profile?.full_name ?? user.email ?? ''} />
      {children}
    </>
  );
}
