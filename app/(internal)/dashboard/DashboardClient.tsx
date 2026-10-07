'use client';

import { useMemo, useState } from 'react';
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

export type AttentionItemKind = 'counterProposal' | 'expiringSoon' | 'marginBelowFloor' | 'staleDraft';

/**
 * Una fila de "Requieren tu atención" (CLAUDE.md, ronda 24) — las cuatro
 * categorías pedidas, con datos reales únicamente: nunca se inventa un dato
 * que no exista (p. ej. la tasa de margen forzado, que `accept_counter_proposal`
 * deja deliberadamente `NULL`, CLAUDE.md ronda 16 — por eso este tipo lleva
 * `reason`, no `marginRate`, para ese kind).
 */
export interface AttentionItem {
  readonly kind: AttentionItemKind;
  readonly proposalId: string;
  readonly proposalNumber: string | null;
  readonly accountLegalName: string;
  /** Días hasta caducar (expiringSoon) o desde la creación (staleDraft); null en el resto. */
  readonly days: number | null;
  /** Importe de cabecera (expiringSoon/staleDraft); null en el resto. */
  readonly amountCents: number | null;
  /** Motivo registrado (marginBelowFloor); null en el resto. */
  readonly reason: string | null;
}

export interface DashboardData {
  readonly fiscalYear: number;
  readonly fiscalQuarter: 1 | 2 | 3 | 4 | null;
  readonly currentFiscalQuarter: 1 | 2 | 3 | 4;
  readonly proposals: readonly DashboardProposalInput[];
  readonly totalProposalsBeforeFilters: number;
  /** Recuento por estado, sobre el listado filtrado por todo salvo el propio estado (ronda 24). */
  readonly statusCounts: Partial<Record<DashboardProposalStatus, number>>;
  readonly quarterBreakdown: readonly {
    readonly quarter: 1 | 2 | 3 | 4;
    readonly cents: number;
    readonly targetCents: number;
    readonly isCurrent: boolean;
  }[];
  readonly attentionItems: readonly AttentionItem[];
  readonly kpis: DashboardKpis;
  readonly profiles: readonly { readonly id: string; readonly fullName: string }[];
  readonly supports: readonly { readonly id: string; readonly name: string }[];
}

const STATUS_BADGE_CLASS: Record<DashboardProposalStatus, string> = {
  DRAFT: 'badge--neutral',
  SENT: 'badge--warning',
  VIEWED: 'badge--warning',
  ACCEPTED: 'badge--success',
  REJECTED: 'badge--danger',
  EXPIRED: 'badge--danger',
  COUNTERED: 'badge--warning',
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

const ATTENTION_ICON_PATH: Record<AttentionItemKind, string> = {
  counterProposal: 'M7 8h12M7 8l3-3M7 8l3 3M17 16H5M17 16l-3-3M17 16l-3 3',
  expiringSoon: 'M12 7v5l3 2',
  marginBelowFloor: 'M12 3l10 18H2L12 3zM12 10v5M12 18v.01',
  staleDraft: 'M4 20h4L19 9l-4-4L4 16v4zM13 7l4 4',
};

const ATTENTION_TONE: Record<AttentionItemKind, 'danger' | 'warning' | 'info' | 'neutral'> = {
  counterProposal: 'danger',
  expiringSoon: 'warning',
  marginBelowFloor: 'info',
  staleDraft: 'neutral',
};

function headlineAmount(p: DashboardProposalInput): number | null {
  const amounts = p.options.map((o) => o.billedTotalCents).filter((c): c is number => c !== null);
  return amounts.length > 0 ? Math.max(...amounts) : null;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return parts.map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}

type SortKey = 'number' | 'account' | 'amount' | 'date';

const QUARTER_LABEL_KEY: Record<1 | 2 | 3 | 4, I18nKey> = {
  1: 'targets.q1',
  2: 'targets.q2',
  3: 'targets.q3',
  4: 'targets.q4',
};

/**
 * Dashboard de seguimiento (CLAUDE.md §1, ronda 18, bloque 4; rediseño
 * visual ronda 24 — maqueta en `docs/design/panel_mockup.html`). Dos
 * secciones con periodo distinto, a propósito (ver `page.tsx`): el objetivo
 * (año/quarter fiscal + AM) mide `acceptances`, imputadas por fecha de
 * FIRMA; el listado de abajo filtra por `created_at` y el resto de
 * criterios, para explorar cualquier presupuesto, de cualquier estado.
 */
export function DashboardClient({ data }: { data: DashboardData }) {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'date', dir: -1 });

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`/dashboard?${params.toString()}`);
  }

  function toggleSort(key: SortKey) {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 1 ? -1 : 1 } : { key, dir: 1 }));
  }

  const sortedProposals = useMemo(() => {
    const list = [...data.proposals];
    list.sort((a, b) => {
      let cmp = 0;
      if (sort.key === 'number') cmp = (a.proposalNumber ?? '').localeCompare(b.proposalNumber ?? '');
      else if (sort.key === 'account') cmp = a.accountLegalName.localeCompare(b.accountLegalName);
      else if (sort.key === 'amount') cmp = (headlineAmount(a) ?? -1) - (headlineAmount(b) ?? -1);
      else cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return cmp * sort.dir;
    });
    return list;
  }, [data.proposals, sort]);

  const progressRate =
    data.kpis.targetCents > 0 ? Math.min(data.kpis.billedNetOfMediaCents / data.kpis.targetCents, 1.5) : null;
  const progressPct = progressRate !== null ? Math.min(progressRate, 1) * 100 : 0;
  const remainingCents = data.kpis.targetCents - data.kpis.billedNetOfMediaCents;

  const periodLabel = data.fiscalQuarter
    ? `FY${data.fiscalYear}/${String((data.fiscalYear + 1) % 100).padStart(2, '0')} ${t(QUARTER_LABEL_KEY[data.fiscalQuarter]).split(' ')[0]}`
    : `FY${data.fiscalYear}/${String((data.fiscalYear + 1) % 100).padStart(2, '0')}`;

  const totalByStatus = Object.values(data.statusCounts).reduce((a: number, b) => a + (b ?? 0), 0);
  const activeStatus = (searchParams.get('status') as DashboardProposalStatus | null) ?? '';

  return (
    <div className="wk2" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap-3xl)' }}>
      <div className="page-head">
        <div>
          <h1>{t('dashboard.title')}</h1>
          <p className="page-head__sub">{t('dashboard.subtitle')}</p>
        </div>
        <div className="page-head__filters">
          <select
            className="field"
            aria-label={t('dashboard.ariaFiscalYear')}
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
            className="field"
            aria-label={t('dashboard.ariaPeriod')}
            value={data.fiscalQuarter ? String(data.fiscalQuarter) : ''}
            onChange={(e) => setParam('quarter', e.target.value)}
          >
            <option value="">{t('dashboard.wholeYear')}</option>
            <option value="1">{t('targets.q1')}</option>
            <option value="2">{t('targets.q2')}</option>
            <option value="3">{t('targets.q3')}</option>
            <option value="4">{t('targets.q4')}</option>
          </select>
          <select
            className="field"
            aria-label={t('dashboard.ariaAm')}
            value={searchParams.get('owner') ?? ''}
            onChange={(e) => setParam('owner', e.target.value)}
          >
            <option value="">{t('dashboard.allAms')}</option>
            {data.profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.fullName}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* --- Objetivo --- */}
      <div className="card goal">
        <div>
          <div className="goal__eyebrow">{t('dashboard.goalEyebrow', { period: periodLabel })}</div>
          <div className="goal__figure">
            <span className="goal__big">{formatCents(data.kpis.billedNetOfMediaCents)}</span>
            <span className="goal__of">
              {t('dashboard.goalOfTarget', { target: formatCents(data.kpis.targetCents) })}
            </span>
          </div>
          <div
            className="progress"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progressPct)}
            aria-label={t('dashboard.kpiProgress')}
          >
            <span style={{ width: `${progressPct}%` }} />
          </div>
          <div className="goal__meta">
            <span>
              {progressRate !== null ? (
                <strong>{formatPercent(progressRate)}</strong>
              ) : (
                <strong>—</strong>
              )}{' '}
              {t('dashboard.goalProgressSuffix')}
            </span>
            <span>
              {remainingCents > 0
                ? t('dashboard.goalRemaining', { amount: formatCents(remainingCents) })
                : t('dashboard.goalReached')}
            </span>
          </div>
        </div>
        <div className="quarters" aria-label={t('dashboard.objective')}>
          {data.quarterBreakdown.map((q) => {
            const barPct = q.targetCents > 0 ? Math.min((q.cents / q.targetCents) * 100, 100) : q.cents > 0 ? 100 : 0;
            return (
              <div key={q.quarter} className={`q${q.isCurrent ? ' is-now' : ''}`}>
                <span className="q__name">
                  {t(QUARTER_LABEL_KEY[q.quarter]).split(' ')[0]}
                  {q.isCurrent ? t('dashboard.quarterNowSuffix') : ''}
                </span>
                <span className="q__months">{t(QUARTER_LABEL_KEY[q.quarter]).replace(/^Q\d\s*/, '')}</span>
                <span className="q__val">{formatCents(q.cents)}</span>
                <span className="q__bar">
                  <span style={{ width: `${barPct}%` }} />
                </span>
                <span className="q__months">{t('dashboard.quarterTargetOf', { amount: formatCents(q.targetCents) })}</span>
              </div>
            );
          })}
        </div>

        {(data.kpis.byMarket.length > 0 || data.kpis.byAm.length > 0) && (
          <details style={{ gridColumn: '1 / -1', marginTop: 'var(--gap-md)' }}>
            <summary className="label" style={{ cursor: 'pointer' }}>
              {t('dashboard.breakdownToggle')}
            </summary>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 10 }}>
              <div>
                <p className="label">{t('dashboard.byMarket')}</p>
                {data.kpis.byMarket.map((row) => (
                  <div key={row.market} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0' }}>
                    <span>{MARKET_LABELS[row.market] ?? row.market}</span>
                    <span>{formatCents(row.cents)}</span>
                  </div>
                ))}
              </div>
              <div>
                <p className="label">{t('dashboard.byAm')}</p>
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
      </div>

      {/* --- KPIs --- */}
      <div className="kpis">
        <div className="card kpi">
          <div className="kpi__top">
            {t('dashboard.kpiAvgMargin')}
            <svg className="i sm" viewBox="0 0 24 24">
              <path d="M3 17l6-6 4 4 8-8M15 7h6v6" />
            </svg>
          </div>
          <div className="kpi__val">{data.kpis.avgMarginRate !== null ? formatPercent(data.kpis.avgMarginRate) : '—'}</div>
          <div className="kpi__sub">
            {data.kpis.optionsWithoutMargin > 0
              ? t('dashboard.optionsWithoutMarginNote', { count: String(data.kpis.optionsWithoutMargin) })
              : t('dashboard.kpiAvgMarginSub')}
          </div>
        </div>
        <div className="card kpi">
          <div className="kpi__top">
            {t('dashboard.kpiPendingCounter')}
            <svg className="i sm" viewBox="0 0 24 24">
              <path d={ATTENTION_ICON_PATH.counterProposal} />
            </svg>
          </div>
          <div className="kpi__val">{data.kpis.pendingCounterProposalsCount}</div>
          <div className="kpi__sub">{t('dashboard.kpiPendingCounterSub')}</div>
        </div>
        <div className="card kpi">
          <div className="kpi__top">
            {t('dashboard.kpiExpiringSoon')}
            <svg className="i sm" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="9" />
              <path d={ATTENTION_ICON_PATH.expiringSoon} />
            </svg>
          </div>
          <div className="kpi__val">{data.kpis.expiringSoonCount}</div>
          <div className="kpi__sub">{t('dashboard.kpiExpiringSoonSub')}</div>
        </div>
      </div>

      {/* --- Requieren tu atención --- */}
      <div className="card">
        <div className="section-head">
          <div>
            <h2>{t('dashboard.attentionTitle')}</h2>
            <p>{t('dashboard.attentionSubtitle')}</p>
          </div>
        </div>
        {data.attentionItems.length === 0 ? (
          <p className="empty">
            <strong>{t('dashboard.attentionEmpty')}</strong>
            <br />
            {t('dashboard.attentionEmptySub')}
          </p>
        ) : (
          <div className="todo">
            {data.attentionItems.map((item) => (
              <a key={`${item.kind}-${item.proposalId}`} className="todo__row" href={`/proposals/${item.proposalId}`}>
                <span className={`todo__ico ${ATTENTION_TONE[item.kind]}`} aria-hidden="true">
                  <svg className="i" viewBox="0 0 24 24">
                    <path d={ATTENTION_ICON_PATH[item.kind]} />
                  </svg>
                </span>
                <span className="todo__txt">
                  <span className="todo__title">{attentionTitle(t, item)}</span>
                  <br />
                  <span className="todo__sub">
                    {attentionSubtitle(t, item)} · <span className="tert">{item.proposalNumber ?? '—'}</span>
                  </span>
                </span>
                <span className="todo__go" aria-hidden="true">
                  <svg className="i" viewBox="0 0 24 24">
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </span>
              </a>
            ))}
          </div>
        )}
      </div>

      {/* --- Explorador de presupuestos --- */}
      <div className="card">
        <div className="section-head">
          <div>
            <h2>{t('dashboard.proposalsTitle')}</h2>
            <p className="count">
              {t('dashboard.resultsCount', { shown: String(data.proposals.length), total: String(data.totalProposalsBeforeFilters) })}
            </p>
          </div>
        </div>

        <div className="toolbar">
          <div className="search">
            <svg className="i" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
            <input
              className="field"
              type="search"
              defaultValue={searchParams.get('q') ?? ''}
              onBlur={(e) => setParam('q', e.target.value)}
              placeholder={t('dashboard.searchPlaceholder')}
              aria-label={t('dashboard.searchPlaceholder')}
            />
          </div>
          <button
            className="btn-secondary btn-compact"
            type="button"
            aria-expanded={showMoreFilters}
            onClick={() => setShowMoreFilters((v) => !v)}
          >
            <svg className="i sm" viewBox="0 0 24 24">
              <path d="M4 6h16M7 12h10M10 18h4" />
            </svg>
            {t('dashboard.moreFilters')}
          </button>
        </div>

        {showMoreFilters && (
          <div className="more">
            <label className="label">
              {t('dashboard.filterMarket')}
              <select className="field" value={searchParams.get('market') ?? ''} onChange={(e) => setParam('market', e.target.value)}>
                <option value="">{t('dashboard.all')}</option>
                {Object.keys(MARKET_LABELS).map((m) => (
                  <option key={m} value={m}>
                    {MARKET_LABELS[m]}
                  </option>
                ))}
              </select>
            </label>
            <label className="label">
              {t('proposalsList.filterOwner')}
              <select className="field" value={searchParams.get('owner') ?? ''} onChange={(e) => setParam('owner', e.target.value)}>
                <option value="">{t('proposalsList.filterOwnerAll')}</option>
                {data.profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.fullName}
                  </option>
                ))}
              </select>
            </label>
            <label className="label">
              {t('dashboard.filterDateFrom')}
              <input
                className="field"
                type="date"
                defaultValue={searchParams.get('dateFrom') ?? ''}
                onBlur={(e) => setParam('dateFrom', e.target.value)}
              />
            </label>
            <label className="label">
              {t('dashboard.filterDateTo')}
              <input
                className="field"
                type="date"
                defaultValue={searchParams.get('dateTo') ?? ''}
                onBlur={(e) => setParam('dateTo', e.target.value)}
              />
            </label>
            <label className="label">
              {t('dashboard.filterAmountMin')}
              <input
                className="field"
                type="number"
                defaultValue={searchParams.get('amountMin') ?? ''}
                onBlur={(e) => setParam('amountMin', e.target.value)}
              />
            </label>
            <label className="label">
              {t('dashboard.filterAmountMax')}
              <input
                className="field"
                type="number"
                defaultValue={searchParams.get('amountMax') ?? ''}
                onBlur={(e) => setParam('amountMax', e.target.value)}
              />
            </label>
            <label className="label">
              {t('dashboard.filterSupport')}
              <select className="field" value={searchParams.get('supportId') ?? ''} onChange={(e) => setParam('supportId', e.target.value)}>
                <option value="">{t('dashboard.all')}</option>
                {data.supports.map((s) => (
                  <option key={s.id} value={s.id}>
                    {supportLabel(s.name, s.id)}
                  </option>
                ))}
              </select>
            </label>
            <label className="label">
              {t('dashboard.togglePendingCounter')}
              <input
                type="checkbox"
                checked={searchParams.get('pendingCp') === '1'}
                onChange={(e) => setParam('pendingCp', e.target.checked ? '1' : '')}
              />
            </label>
            <label className="label">
              {t('dashboard.toggleExpiringSoon')}
              <input
                type="checkbox"
                checked={searchParams.get('expiringSoon') === '1'}
                onChange={(e) => setParam('expiringSoon', e.target.checked ? '1' : '')}
              />
            </label>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button className="btn-secondary btn-compact" type="button" onClick={() => router.push('/dashboard')}>
                {t('dashboard.resetFilters')}
              </button>
            </div>
          </div>
        )}

        <div className="pills" role="group" aria-label={t('dashboard.ariaStatusPills')}>
          <button
            className="pill"
            type="button"
            aria-pressed={activeStatus === ''}
            onClick={() => setParam('status', '')}
          >
            {t('dashboard.all')} <span className="n">{totalByStatus}</span>
          </button>
          {(PROPOSAL_STATUSES as readonly ProposalStatus[]).map((s) => (
            <button
              key={s}
              className="pill"
              type="button"
              aria-pressed={activeStatus === s}
              onClick={() => setParam('status', s)}
            >
              {t(STATUS_I18N_KEY[s])} <span className="n">{data.statusCounts[s] ?? 0}</span>
            </button>
          ))}
        </div>

        {data.proposals.length === 0 ? (
          <p className="empty">{t('proposalsList.empty')}</p>
        ) : (
          // Altura acotada con scroll interno (ronda 20): con hasta 300 filas
          // (CLAUDE.md §10.1.1), la tabla no debe forzar un scroll de página
          // excesivo por debajo de los KPIs — se queda visible de un vistazo
          // y, si hace falta ver más filas, se desplaza ella misma.
          <div className="table-wrap" style={{ maxHeight: '55vh', overflowY: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>
                    <SortButton label={t('proposalsList.colNumber')} sortKey="number" sort={sort} onSort={toggleSort} />
                  </th>
                  <th>
                    <SortButton label={t('proposalsList.colAccount')} sortKey="account" sort={sort} onSort={toggleSort} />
                  </th>
                  <th>{t('proposalsList.colStatus')}</th>
                  <th className="num">
                    <SortButton label={t('dashboard.colAmount')} sortKey="amount" sort={sort} onSort={toggleSort} />
                  </th>
                  <th>{t('dashboard.colMarkets')}</th>
                  <th>{t('proposalsList.colOwner')}</th>
                  <th>
                    <SortButton label={t('proposalsList.colUpdated')} sortKey="date" sort={sort} onSort={toggleSort} />
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedProposals.map((p) => {
                  const amount = headlineAmount(p);
                  const markets = Array.from(new Set(p.options.flatMap((o) => o.markets)));
                  const owner = data.profiles.find((pr) => pr.id === p.ownerId);
                  return (
                    <tr key={p.id}>
                      <td>
                        {/* Clicable al detalle del presupuesto (ronda 21) — la
                            columna "Compte" enlaza a la ficha de cuenta, un
                            destino distinto. */}
                        <a className="link" href={`/proposals/${p.id}`}>
                          {p.proposalNumber ?? '—'}
                        </a>
                      </td>
                      <td>
                        <a className="link link--soft" href={`/accounts/${p.accountId}`}>
                          {p.accountLegalName || '—'}
                        </a>
                      </td>
                      <td>
                        <span className={`badge ${STATUS_BADGE_CLASS[p.status]}`}>
                          <span className="dot" aria-hidden="true" />
                          {t(STATUS_I18N_KEY[p.status])}
                        </span>
                        {p.hasPendingCounterProposal && (
                          <span className="badge badge--warning" style={{ marginLeft: 6 }}>
                            {t('counterProposal.statusPending')}
                          </span>
                        )}
                      </td>
                      <td className="num amount">{amount !== null ? formatCents(amount) : '—'}</td>
                      <td>
                        <div className="chips">
                          {markets.length > 0
                            ? markets.map((m) => (
                                <span key={m} className="chip">
                                  {MARKET_LABELS[m] ?? m}
                                </span>
                              ))
                            : '—'}
                        </div>
                      </td>
                      <td>
                        <div className="who">
                          <span className="avatar sm" aria-hidden="true">
                            {owner ? initials(owner.fullName) : '?'}
                          </span>
                          {owner?.fullName ?? '—'}
                        </div>
                      </td>
                      <td className="muted">{formatDate(p.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function SortButton({
  label,
  sortKey,
  sort,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  sort: { key: SortKey; dir: 1 | -1 };
  onSort: (key: SortKey) => void;
}) {
  return (
    <button type="button" onClick={() => onSort(sortKey)}>
      {label} <span aria-hidden="true">{sort.key === sortKey ? (sort.dir === 1 ? '↑' : '↓') : '↕'}</span>
    </button>
  );
}

function attentionTitle(t: (key: I18nKey, vars?: Record<string, string>) => string, item: AttentionItem): string {
  switch (item.kind) {
    case 'counterProposal':
      return t('dashboard.attentionCounterTitle');
    case 'expiringSoon':
      return t('dashboard.attentionExpiringTitle', { days: String(item.days ?? '—') });
    case 'marginBelowFloor':
      return t('dashboard.attentionMarginTitle');
    case 'staleDraft':
      return t('dashboard.attentionDraftTitle', { days: String(item.days ?? '—') });
  }
}

function attentionSubtitle(t: (key: I18nKey, vars?: Record<string, string>) => string, item: AttentionItem): string {
  const account = item.accountLegalName || '—';
  switch (item.kind) {
    case 'counterProposal':
      return t('dashboard.attentionCounterSub', { account });
    case 'expiringSoon':
      return t('dashboard.attentionExpiringSub', {
        account,
        amount: item.amountCents !== null ? formatCents(item.amountCents) : '—',
      });
    case 'marginBelowFloor':
      return t('dashboard.attentionMarginSub', { account, reason: item.reason ?? '—' });
    case 'staleDraft':
      return t('dashboard.attentionDraftSub', {
        account,
        amount: item.amountCents !== null ? formatCents(item.amountCents) : '—',
      });
  }
}
