'use client';

import { useRouter, useSearchParams } from 'next/navigation';

import { formatCents, formatDate, formatPercent, supportLabel, MARKET_LABELS } from '@/lib/format';
import type { ProposalStatus } from '@/lib/domain';
import { PROPOSAL_STATUSES } from '@/lib/domain';
import { useI18n, type I18nKey } from '@/lib/i18n-internal';
import type { DashboardProposalInput, DashboardProposalStatus, Market } from '@/src/pricing/index.js';

export interface DashboardKpis {
  readonly billedNetOfMediaCents: number;
  readonly targetCents: number;
  readonly pendingCounterProposalsCount: number;
  readonly expiringSoonCount: number;
  readonly avgMarginRate: number | null;
  /** Opciones aceptadas vía contrapropuesta, sin margen calculable (CLAUDE.md, ronda 16) — excluidas de avgMarginRate, nunca silenciosamente. */
  readonly optionsWithoutMargin: number;
  readonly byMarket: readonly { readonly market: Market; readonly cents: number }[];
  readonly byAm: readonly { readonly profileId: string; readonly fullName: string; readonly cents: number }[];
}

export interface DashboardData {
  readonly fiscalYear: number;
  readonly fiscalQuarter: 1 | 2 | 3 | 4 | null;
  readonly proposals: readonly DashboardProposalInput[];
  readonly totalProposalsBeforeFilters: number;
  readonly kpis: DashboardKpis;
  readonly profiles: readonly { readonly id: string; readonly fullName: string }[];
  readonly supports: readonly { readonly id: string; readonly name: string }[];
}

const STATUS_BADGE_CLASS: Record<DashboardProposalStatus, string> = {
  DRAFT: 'wk-badge-neutral',
  SENT: 'wk-badge-warning',
  VIEWED: 'wk-badge-warning',
  ACCEPTED: 'wk-badge-success',
  REJECTED: 'wk-badge-danger',
  EXPIRED: 'wk-badge-danger',
  COUNTERED: 'wk-badge-warning',
};

const STATUS_I18N_KEY: Record<DashboardProposalStatus, I18nKey> = {
  DRAFT: 'status.DRAFT',
  SENT: 'status.SENT',
  VIEWED: 'status.VIEWED',
  ACCEPTED: 'status.ACCEPTED',
  REJECTED: 'status.REJECTED',
  EXPIRED: 'status.EXPIRED',
  COUNTERED: 'status.COUNTERED',
};

function headlineAmount(p: DashboardProposalInput): number | null {
  const amounts = p.options.map((o) => o.billedTotalCents).filter((c): c is number => c !== null);
  return amounts.length > 0 ? Math.max(...amounts) : null;
}

/**
 * Dashboard de seguimiento (CLAUDE.md §1, ronda 18, bloque 4). Dos
 * secciones con periodo distinto, a propósito (ver `page.tsx`): el objetivo
 * (año/quarter fiscal + AM) mide `acceptances`, imputadas por fecha de
 * FIRMA; el listado de abajo filtra por `created_at` y el resto de
 * criterios, para explorar cualquier presupuesto, de cualquier estado.
 */
export function DashboardClient({ data }: { data: DashboardData }) {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`/dashboard?${params.toString()}`);
  }

  const progressRate =
    data.kpis.targetCents > 0 ? Math.min(data.kpis.billedNetOfMediaCents / data.kpis.targetCents, 1.5) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <h1>{t('dashboard.title')}</h1>

      {/* --- Objetivo: año/quarter fiscal propio, compartido con el filtro de AM --- */}
      <section className="wk-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h3 style={{ margin: 0 }}>{t('dashboard.objective')}</h3>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select
              className="wk-select"
              value={String(data.fiscalYear)}
              onChange={(e) => setParam('year', e.target.value)}
            >
              {[data.fiscalYear - 1, data.fiscalYear, data.fiscalYear + 1].map((y) => (
                <option key={y} value={y}>
                  FY{y}/{String((y + 1) % 100).padStart(2, '0')}
                </option>
              ))}
            </select>
            <select
              className="wk-select"
              value={data.fiscalQuarter ? String(data.fiscalQuarter) : ''}
              onChange={(e) => setParam('quarter', e.target.value)}
            >
              <option value="">{t('dashboard.wholeYear')}</option>
              <option value="1">{t('targets.q1')}</option>
              <option value="2">{t('targets.q2')}</option>
              <option value="3">{t('targets.q3')}</option>
              <option value="4">{t('targets.q4')}</option>
            </select>
            <select className="wk-select" value={searchParams.get('owner') ?? ''} onChange={(e) => setParam('owner', e.target.value)}>
              <option value="">{t('dashboard.allAms')}</option>
              {data.profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fullName}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
          <KpiTile label={t('dashboard.kpiBilled')} value={formatCents(data.kpis.billedNetOfMediaCents)} />
          <KpiTile label={t('dashboard.kpiTarget')} value={formatCents(data.kpis.targetCents)} />
          <KpiTile
            label={t('dashboard.kpiProgress')}
            value={progressRate !== null ? formatPercent(progressRate) : '—'}
          />
          <KpiTile
            label={t('dashboard.kpiAvgMargin')}
            value={data.kpis.avgMarginRate !== null ? formatPercent(data.kpis.avgMarginRate) : '—'}
            note={
              data.kpis.optionsWithoutMargin > 0
                ? t('dashboard.optionsWithoutMarginNote', { count: String(data.kpis.optionsWithoutMargin) })
                : undefined
            }
          />
          <KpiTile label={t('dashboard.kpiPendingCounter')} value={String(data.kpis.pendingCounterProposalsCount)} />
          <KpiTile label={t('dashboard.kpiExpiringSoon')} value={String(data.kpis.expiringSoonCount)} />
        </div>

        {/* Colapsado por defecto (ronda 20): con varios AMs/mercados este
            bloque puede alargarse bastante, y el listado de abajo debe verse
            sin desplazarse en exceso — un detalle, no el primer vistazo. */}
        {(data.kpis.byMarket.length > 0 || data.kpis.byAm.length > 0) && (
          <details style={{ marginTop: 18 }}>
            <summary className="wk-label" style={{ cursor: 'pointer' }}>
              {t('dashboard.breakdownToggle')}
            </summary>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 10 }}>
              <div>
                <p className="wk-label">{t('dashboard.byMarket')}</p>
                {data.kpis.byMarket.map((row) => (
                  <div key={row.market} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0' }}>
                    <span>{MARKET_LABELS[row.market] ?? row.market}</span>
                    <span>{formatCents(row.cents)}</span>
                  </div>
                ))}
              </div>
              <div>
                <p className="wk-label">{t('dashboard.byAm')}</p>
                {data.kpis.byAm.map((row) => (
                  <div key={row.profileId} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0' }}>
                    <span>{row.fullName}</span>
                    <span>{formatCents(row.cents)}</span>
                  </div>
                ))}
              </div>
            </div>
          </details>
        )}
      </section>

      {/* --- Filtros del listado --- */}
      <section className="wk-card">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <Field label={t('dashboard.filterMarket')}>
            <select className="wk-select" value={searchParams.get('market') ?? ''} onChange={(e) => setParam('market', e.target.value)}>
              <option value="">{t('dashboard.all')}</option>
              {Object.keys(MARKET_LABELS).map((m) => (
                <option key={m} value={m}>
                  {MARKET_LABELS[m]}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('proposalsList.filterOwner')}>
            <select className="wk-select" value={searchParams.get('owner') ?? ''} onChange={(e) => setParam('owner', e.target.value)}>
              <option value="">{t('proposalsList.filterOwnerAll')}</option>
              {data.profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fullName}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('proposalsList.filterStatus')}>
            <select className="wk-select" value={searchParams.get('status') ?? ''} onChange={(e) => setParam('status', e.target.value)}>
              <option value="">{t('proposalsList.filterStatusAll')}</option>
              {(PROPOSAL_STATUSES as readonly ProposalStatus[]).map((s) => (
                <option key={s} value={s}>
                  {t(STATUS_I18N_KEY[s])}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('dashboard.filterSupport')}>
            <select className="wk-select" value={searchParams.get('supportId') ?? ''} onChange={(e) => setParam('supportId', e.target.value)}>
              <option value="">{t('dashboard.all')}</option>
              {data.supports.map((s) => (
                <option key={s.id} value={s.id}>
                  {supportLabel(s.name, s.id)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('dashboard.filterAccount')}>
            <input
              className="wk-input"
              style={{ width: 160 }}
              defaultValue={searchParams.get('q') ?? ''}
              onBlur={(e) => setParam('q', e.target.value)}
              placeholder={t('dashboard.filterAccountPlaceholder')}
            />
          </Field>
          <Field label={t('dashboard.filterProposalNumber')}>
            <input
              className="wk-input"
              style={{ width: 130 }}
              defaultValue={searchParams.get('number') ?? ''}
              onBlur={(e) => setParam('number', e.target.value)}
              placeholder={t('dashboard.filterProposalNumberPlaceholder')}
            />
          </Field>
          <Field label={t('dashboard.filterDateFrom')}>
            <input
              className="wk-input"
              type="date"
              defaultValue={searchParams.get('dateFrom') ?? ''}
              onBlur={(e) => setParam('dateFrom', e.target.value)}
            />
          </Field>
          <Field label={t('dashboard.filterDateTo')}>
            <input
              className="wk-input"
              type="date"
              defaultValue={searchParams.get('dateTo') ?? ''}
              onBlur={(e) => setParam('dateTo', e.target.value)}
            />
          </Field>
          <Field label={t('dashboard.filterAmountMin')}>
            <input
              className="wk-input"
              type="number"
              style={{ width: 100 }}
              defaultValue={searchParams.get('amountMin') ?? ''}
              onBlur={(e) => setParam('amountMin', e.target.value)}
            />
          </Field>
          <Field label={t('dashboard.filterAmountMax')}>
            <input
              className="wk-input"
              type="number"
              style={{ width: 100 }}
              defaultValue={searchParams.get('amountMax') ?? ''}
              onBlur={(e) => setParam('amountMax', e.target.value)}
            />
          </Field>
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 14 }}>
          <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="checkbox"
              checked={searchParams.get('pendingCp') === '1'}
              onChange={(e) => setParam('pendingCp', e.target.checked ? '1' : '')}
            />
            {t('dashboard.togglePendingCounter')}
          </label>
          <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="checkbox"
              checked={searchParams.get('expiringSoon') === '1'}
              onChange={(e) => setParam('expiringSoon', e.target.checked ? '1' : '')}
            />
            {t('dashboard.toggleExpiringSoon')}
          </label>
        </div>
      </section>

      {/* --- Listado filtrado --- */}
      <section className="wk-card">
        <p style={{ color: 'var(--wk-text-muted)', fontSize: 13, marginTop: 0 }}>
          {t('dashboard.resultsCount', { shown: String(data.proposals.length), total: String(data.totalProposalsBeforeFilters) })}
        </p>
        {data.proposals.length === 0 ? (
          <p style={{ color: 'var(--wk-text-muted)' }}>{t('proposalsList.empty')}</p>
        ) : (
          // Altura acotada con scroll interno (ronda 20): con hasta 300 filas
          // (CLAUDE.md §10.1.1), la tabla no debe forzar un scroll de página
          // excesivo por debajo de los KPIs — se queda visible de un vistazo
          // y, si hace falta ver más filas, se desplaza ella misma.
          <div style={{ maxHeight: '55vh', overflowY: 'auto' }}>
            <table className="wk-table">
              <thead>
                <tr>
                  <th>{t('proposalsList.colNumber')}</th>
                  <th>{t('proposalsList.colAccount')}</th>
                  <th>{t('proposalsList.colStatus')}</th>
                  <th>{t('dashboard.colAmount')}</th>
                  <th>{t('dashboard.colMarkets')}</th>
                  <th>{t('proposalsList.colOwner')}</th>
                  <th>{t('proposalsList.colUpdated')}</th>
                </tr>
              </thead>
              <tbody>
                {data.proposals.map((p) => {
                  const amount = headlineAmount(p);
                  const markets = Array.from(new Set(p.options.flatMap((o) => o.markets)));
                  const owner = data.profiles.find((pr) => pr.id === p.ownerId);
                  return (
                    <tr key={p.id}>
                      <td>
                        {/* Clicable al detalle del presupuesto (ronda 21) — la
                            columna "Compte" enlaza a la ficha de cuenta, un
                            destino distinto. */}
                        <a href={`/proposals/${p.id}`}>{p.proposalNumber ?? '—'}</a>
                      </td>
                      <td>
                        <a href={`/accounts/${p.accountId}`}>{p.accountLegalName || '—'}</a>
                      </td>
                      <td>
                        <span className={`wk-badge ${STATUS_BADGE_CLASS[p.status]}`}>{t(STATUS_I18N_KEY[p.status])}</span>
                        {p.hasPendingCounterProposal && (
                          <span className="wk-badge wk-badge-warning" style={{ marginLeft: 6 }}>
                            {t('counterProposal.statusPending')}
                          </span>
                        )}
                      </td>
                      <td>{amount !== null ? formatCents(amount) : '—'}</td>
                      <td>{markets.map((m) => MARKET_LABELS[m] ?? m).join(', ') || '—'}</td>
                      <td>{owner?.fullName ?? '—'}</td>
                      <td>{formatDate(p.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function KpiTile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div style={{ border: '1px solid var(--wk-border, #e5e5e5)', borderRadius: 8, padding: '12px 14px' }}>
      <div style={{ fontSize: 12, color: 'var(--wk-text-muted)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
      {note && <div style={{ fontSize: 11, color: 'var(--wk-text-muted)', marginTop: 4 }}>{note}</div>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="wk-label">{label}</label>
      <div>{children}</div>
    </div>
  );
}
