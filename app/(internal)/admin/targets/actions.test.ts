import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `setQuarterlyTarget` (CLAUDE.md §0, ronda 18, bloque 4): upsert de un
 * objetivo por AM y quarter fiscal. `quarterly_targets` ya existía desde la
 * primera migración — esta es su primera escritura real.
 */

const getUser = vi.fn();
const upsert = vi.fn();
const revalidatePath = vi.fn();

const supabaseClient = {
  auth: { getUser },
  from: vi.fn((table: string) => {
    if (table === 'quarterly_targets') return { upsert };
    throw new Error(`tabla inesperada: ${table}`);
  }),
};

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => supabaseClient),
}));
vi.mock('next/cache', () => ({ revalidatePath }));

const { setQuarterlyTarget } = await import('./actions.js');

describe('setQuarterlyTarget', () => {
  beforeEach(() => {
    getUser.mockReset();
    upsert.mockReset();
    revalidatePath.mockReset();
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
  });

  it('rechaza sin sesión, sin llamar a Supabase', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const result = await setQuarterlyTarget({ profileId: 'p1', fiscalYear: 2026, fiscalQuarter: 1, targetEuros: 1000 });
    expect(result).toEqual({ ok: false, error: 'No autenticado' });
    expect(upsert).not.toHaveBeenCalled();
  });

  it('rechaza un objetivo negativo, sin llamar a Supabase', async () => {
    const result = await setQuarterlyTarget({ profileId: 'p1', fiscalYear: 2026, fiscalQuarter: 1, targetEuros: -5 });
    expect(result.ok).toBe(false);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('convierte euros a céntimos y hace upsert con el autor y la marca de tiempo', async () => {
    upsert.mockResolvedValue({ error: null });

    const result = await setQuarterlyTarget({ profileId: 'p1', fiscalYear: 2026, fiscalQuarter: 2, targetEuros: 1234.5 });

    expect(result).toEqual({ ok: true });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        profile_id: 'p1',
        fiscal_year: 2026,
        fiscal_quarter: 2,
        target_cents: 123450,
        updated_by: 'u1',
      }),
      { onConflict: 'profile_id,fiscal_year,fiscal_quarter' },
    );
    expect(revalidatePath).toHaveBeenCalledWith('/admin/targets');
    expect(revalidatePath).toHaveBeenCalledWith('/dashboard');
  });

  it('un objetivo en blanco (0) se guarda como 0, nunca se omite', async () => {
    upsert.mockResolvedValue({ error: null });
    await setQuarterlyTarget({ profileId: 'p1', fiscalYear: 2026, fiscalQuarter: 3, targetEuros: 0 });
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ target_cents: 0 }), expect.anything());
  });

  it('devuelve el error de Supabase tal cual si falla el upsert', async () => {
    upsert.mockResolvedValue({ error: { message: 'boom' } });
    const result = await setQuarterlyTarget({ profileId: 'p1', fiscalYear: 2026, fiscalQuarter: 4, targetEuros: 500 });
    expect(result).toEqual({ ok: false, error: 'boom' });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
