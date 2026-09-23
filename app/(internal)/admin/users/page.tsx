import { createClient } from '@/lib/supabase/server';
import { AdminUsersClient, type TeamUserRow } from './AdminUsersClient';

export const dynamic = 'force-dynamic';

export default async function AdminUsersPage() {
  const supabase = await createClient();

  const [{ data: allowedEmails, error: allowedError }, { data: profiles, error: profilesError }] =
    await Promise.all([
      supabase.from('allowed_emails').select('email, full_name, note, added_at').order('added_at'),
      supabase.from('profiles').select('email, is_active'),
    ]);

  if (allowedError || profilesError) {
    throw new Error(
      `No se pudo cargar la lista de usuarios: ${(allowedError ?? profilesError)!.message}`,
    );
  }

  const profileByEmail = new Map((profiles ?? []).map((p) => [p.email, p]));

  const users: TeamUserRow[] = (allowedEmails ?? []).map((a) => {
    const profile = profileByEmail.get(a.email);
    return {
      email: a.email,
      fullName: a.full_name,
      note: a.note,
      hasSignedIn: profile !== undefined,
      isActive: profile?.is_active ?? null,
    };
  });

  return (
    <div className="wk-shell">
      <AdminUsersClient users={users} />
    </div>
  );
}
