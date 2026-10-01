import { createClient } from '@/lib/supabase/server';
import { currentFiscalYear } from '@/src/pricing/index.js';
import { TargetsClient, type TargetsAmRow } from './TargetsClient';

export const dynamic = 'force-dynamic';

/**
 * Objetivos por advertising manager y por quarter fiscal (CLAUDE.md §0,
 * ronda 18, bloque 4): editable desde admin, un valor por persona y por
 * quarter, distinto cada quarter. `quarterly_targets` ya existía en el
 * esquema desde la primera migración — esta pantalla es su primer uso real.
 */
export default async function AdminTargetsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const { year } = await searchParams;
  const fiscalYear = year && /^\d{4}$/.test(year) ? Number(year) : currentFiscalYear();

  const supabase = await createClient();

  const [{ data: profiles, error: profilesError }, { data: targets, error: targetsError }] =
    await Promise.all([
      supabase.from('profiles').select('id, full_name, is_active').eq('is_active', true).order('full_name'),
      supabase
        .from('quarterly_targets')
        .select('profile_id, fiscal_quarter, target_cents')
        .eq('fiscal_year', fiscalYear),
    ]);

  if (profilesError) throw new Error(`No se pudieron cargar los advertising managers: ${profilesError.message}`);
  if (targetsError) throw new Error(`No se pudieron cargar los objetivos: ${targetsError.message}`);

  const targetsByProfile = new Map<string, Partial<Record<1 | 2 | 3 | 4, number>>>();
  for (const t of targets ?? []) {
    const existing = targetsByProfile.get(t.profile_id) ?? {};
    existing[t.fiscal_quarter] = t.target_cents;
    targetsByProfile.set(t.profile_id, existing);
  }

  const rows: TargetsAmRow[] = (profiles ?? []).map((p) => ({
    profileId: p.id,
    fullName: p.full_name,
    targetsByQuarter: targetsByProfile.get(p.id) ?? {},
  }));

  return (
    <div className="wk-shell">
      <TargetsClient fiscalYear={fiscalYear} rows={rows} />
    </div>
  );
}
