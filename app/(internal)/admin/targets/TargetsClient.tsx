'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { useI18n } from '@/lib/i18n-internal';
import { FISCAL_QUARTERS, toEuros, type FiscalQuarter } from '@/src/pricing/index.js';
import { setQuarterlyTarget } from './actions';

export interface TargetsAmRow {
  readonly profileId: string;
  readonly fullName: string;
  readonly targetsByQuarter: Partial<Record<FiscalQuarter, number>>;
}

type RowState = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Objetivos por AM y quarter fiscal (CLAUDE.md §0, ronda 18, bloque 4). Una
 * fila por advertising manager activo, cuatro campos editables (Q1-Q4) para
 * el año fiscal elegido — "editable desde admin, nunca hardcodeado" (§8).
 * Un campo en blanco se guarda como 0 €, nunca se borra la fila: el
 * objetivo global del dashboard es siempre "la suma de las 4 filas de cada
 * AM" (confirmado por Vincent), una suma simple sin casos aparte para "sin
 * objetivo puesto todavía".
 */
export function TargetsClient({ fiscalYear, rows }: { fiscalYear: number; rows: readonly TargetsAmRow[] }) {
  const { t } = useI18n();
  const router = useRouter();

  const [values, setValues] = useState<Record<string, Partial<Record<FiscalQuarter, string>>>>(() => {
    const initial: Record<string, Partial<Record<FiscalQuarter, string>>> = {};
    for (const row of rows) {
      const perQuarter: Partial<Record<FiscalQuarter, string>> = {};
      for (const q of FISCAL_QUARTERS) {
        const cents = row.targetsByQuarter[q];
        perQuarter[q] = cents !== undefined ? String(toEuros(cents)) : '';
      }
      initial[row.profileId] = perQuarter;
    }
    return initial;
  });
  const [rowState, setRowState] = useState<Record<string, RowState>>({});
  const [rowError, setRowError] = useState<Record<string, string>>({});

  function setCell(profileId: string, quarter: FiscalQuarter, raw: string) {
    setValues((prev) => ({ ...prev, [profileId]: { ...prev[profileId], [quarter]: raw } }));
  }

  async function saveRow(profileId: string) {
    setRowState((prev) => ({ ...prev, [profileId]: 'saving' }));
    setRowError((prev) => ({ ...prev, [profileId]: '' }));

    const cells = values[profileId] ?? {};
    const results = await Promise.all(
      FISCAL_QUARTERS.map((q) =>
        setQuarterlyTarget({
          profileId,
          fiscalYear,
          fiscalQuarter: q,
          targetEuros: cells[q]?.trim() ? Number(cells[q]) : 0,
        }),
      ),
    );

    const failed = results.find((r) => !r.ok);
    if (failed && !failed.ok) {
      setRowState((prev) => ({ ...prev, [profileId]: 'error' }));
      setRowError((prev) => ({ ...prev, [profileId]: failed.error }));
      return;
    }
    setRowState((prev) => ({ ...prev, [profileId]: 'saved' }));
  }

  function changeYear(nextYear: number) {
    router.push(`/admin/targets?year=${nextYear}`);
  }

  const quarterLabels: Record<FiscalQuarter, string> = {
    1: t('targets.q1'),
    2: t('targets.q2'),
    3: t('targets.q3'),
    4: t('targets.q4'),
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1>{t('targets.title')}</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button type="button" className="wk-btn wk-btn-secondary" onClick={() => changeYear(fiscalYear - 1)}>
            ←
          </button>
          <span style={{ fontWeight: 600, minWidth: 90, textAlign: 'center' }}>
            {t('targets.fiscalYear', { year: `${fiscalYear}/${String((fiscalYear + 1) % 100).padStart(2, '0')}` })}
          </span>
          <button type="button" className="wk-btn wk-btn-secondary" onClick={() => changeYear(fiscalYear + 1)}>
            →
          </button>
        </div>
      </div>

      <section className="wk-card">
        <table className="wk-table">
          <thead>
            <tr>
              <th>{t('targets.am')}</th>
              {FISCAL_QUARTERS.map((q) => (
                <th key={q}>{quarterLabels[q]}</th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const state = rowState[row.profileId] ?? 'idle';
              return (
                <tr key={row.profileId}>
                  <td>{row.fullName}</td>
                  {FISCAL_QUARTERS.map((q) => (
                    <td key={q}>
                      <input
                        className="wk-input"
                        type="number"
                        min={0}
                        step="0.01"
                        style={{ width: 110 }}
                        value={values[row.profileId]?.[q] ?? ''}
                        onChange={(e) => setCell(row.profileId, q, e.target.value)}
                      />
                    </td>
                  ))}
                  <td>
                    <button
                      type="button"
                      className="wk-btn wk-btn-primary"
                      disabled={state === 'saving'}
                      onClick={() => saveRow(row.profileId)}
                    >
                      {state === 'saving' ? t('targets.saving') : t('targets.save')}
                    </button>
                    {state === 'saved' && <span style={{ color: 'var(--wk-success, green)', marginLeft: 8 }}>{t('targets.saved')}</span>}
                    {state === 'error' && (
                      <span style={{ color: 'var(--wk-danger, red)', marginLeft: 8 }}>{rowError[row.profileId]}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <p style={{ color: 'var(--wk-text-muted)', fontSize: 13 }}>{t('targets.note')}</p>
    </div>
  );
}
