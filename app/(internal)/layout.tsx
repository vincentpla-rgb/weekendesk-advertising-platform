import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';

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
      <header className="wk-header">
        <a href="/proposals/new">Weekendesk Advertising</a>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 13 }}>
          <span style={{ opacity: 0.85 }}>{profile?.full_name ?? user.email}</span>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="wk-btn wk-btn-ghost"
              style={{ color: '#fff', padding: '4px 8px' }}
            >
              Salir
            </button>
          </form>
        </div>
      </header>
      {children}
    </>
  );
}
