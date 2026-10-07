'use client';

import { useState } from 'react';

import type { ContentLanguage, ProposalStatus } from '@/lib/domain';
import { formatCents, formatDate, formatPercent, supportLabel } from '@/lib/format';
import { useI18n, type I18nKey } from '@/lib/i18n-internal';
import { DuplicateButton } from './DuplicateButton';
import { RetrySendButton } from './RetrySendButton';
import { CounterProposalReview, type CounterProposalReviewData } from './CounterProposalReview';

/** CLAUDE.md, ronda 24: badge del estado — mismos colores que ya usaba STATUS_BADGE_CLASS, solo con los nombres de clase nuevos (`badge--*`, UltraHand v0.3). */
const STATUS_BADGE_CLASS: Record<ProposalStatus, string> = {
  DRAFT: 'badge--neutral',
  SENT: 'badge--warning',
  VIEWED: 'badge--warning',
  ACCEPTED: 'badge--success',
  REJECTED: 'badge--danger',
  EXPIRED: 'badge--danger',
  COUNTERED: 'badge--warning',
};

const STATUS_KEY: Record<ProposalStatus, I18nKey> = {
  DRAFT: 'status.DRAFT',
  SENT: 'status.SENT',
  VIEWED: 'status.VIEWED',
  ACCEPTED: 'status.ACCEPTED',
  REJECTED: 'status.REJECTED',
  EXPIRED: 'status.EXPIRED',
  COUNTERED: 'status.COUNTERED',
};

interface DetailLine {
  readonly support_id: string;
  readonly market: string;
  readonly quantity: number;
  readonly net_price_cents: number | null;
  readonly billed_total_cents: number | null;
  /** Antelación insuficiente forzada a mano (CLAUDE.md §5.3, ronda 11) — constancia visible en el detalle. */
  readonly lead_time_forced: boolean;
  readonly lead_time_force_reason: string | null;
}

interface DetailOption {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly pitch: string | null;
  readonly markets: readonly string[];
  readonly campaign_start: string | null;
  readonly campaign_end: string | null;
  readonly campaign_duration_count: number | null;
  readonly campaign_duration_unit: string | null;
  readonly billed_total_cents: number | null;
  readonly net_revenue_cents: number | null;
  readonly cost_cents: number | null;
  readonly margin_rate: number | null;
  readonly proposal_option_lines: readonly DetailLine[];
}

interface DetailProposal {
  readonly id: string;
  readonly proposal_number: string;
  readonly status: ProposalStatus;
  readonly language: string;
  readonly brief: string | null;
  readonly sent_at: string | null;
  readonly decided_at: string | null;
  readonly expires_at: string | null;
  readonly public_token: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly accounts: { readonly legal_name: string } | null;
  readonly contacts: { readonly full_name: string; readonly email: string } | null;
  readonly profiles: { readonly full_name: string } | null;
}

function MarginBadge({ marginRate }: { marginRate: number | null }) {
  const { t } = useI18n();
  if (marginRate === null) {
    return <span className="badge badge--neutral">—</span>;
  }
  const ok = marginRate >= 0.5;
  return (
    <span className={`badge ${ok ? 'badge--success' : 'badge--danger'}`}>
      {formatPercent(marginRate)} {t('proposalBuilder.margin').toLowerCase()}
    </span>
  );
}

export function ProposalDetailClient({
  proposal,
  options,
  supportNames,
  counterProposal,
  canDecideCounterProposal,
  currentUserName,
}: {
  proposal: DetailProposal;
  options: readonly DetailOption[];
  /** Código → nombre completo del soporte (CLAUDE.md §10.3 ter decies, ronda 13). */
  supportNames: Record<string, string>;
  /** Contrapropuesta del cliente (CLAUDE.md, ronda 16) — a lo sumo una por presupuesto. */
  counterProposal: CounterProposalReviewData | null;
  /** Solo el propietario del presupuesto o un administrador pueden decidir (calculado en el servidor). */
  canDecideCounterProposal: boolean;
  currentUserName: string | null;
}) {
  const { t } = useI18n();
  const [selectedOption, setSelectedOption] = useState(0);
  const publicUrl =
    typeof window !== 'undefined' ? `${window.location.origin}/p/${proposal.public_token}` : `/p/${proposal.public_token}`;

  const daysUntilExpiry = proposal.expires_at
    ? Math.max(0, Math.ceil((new Date(proposal.expires_at).getTime() - Date.now()) / 86400000))
    : null;

  const option = options[selectedOption] ?? options[0] ?? null;

  const pdfActions = (
    <>
      <a
        className="btn-secondary btn-compact"
        href={`/api/proposals/${proposal.id}/pdf?disposition=inline`}
        target="_blank"
        rel="noreferrer"
      >
        <svg className="i sm" viewBox="0 0 24 24">
          <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
        {t('proposalBuilder.previewPdf')}
      </a>
      <a className="btn-secondary btn-compact" href={`/api/proposals/${proposal.id}/pdf`}>
        <svg className="i sm" viewBox="0 0 24 24">
          <path d="M12 4v11M7 11l5 5 5-5M5 20h14" />
        </svg>
        {t('proposalDetail.downloadPdf')}
      </a>
    </>
  );

  return (
    <div className="wk2" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap-2xl)' }}>
      <div>
        <a className="crumb" href="/dashboard">
          <svg className="i sm" viewBox="0 0 24 24">
            <path d="M19 12H5M11 6l-6 6 6 6" />
          </svg>
          {t('proposalDetail.back')}
        </a>
      </div>

      <div className="detail-head">
        <div className="detail-title">
          <h1>{proposal.accounts?.legal_name ?? '—'}</h1>
          <span className="ref">{proposal.proposal_number}</span>
          <span className={`badge ${STATUS_BADGE_CLASS[proposal.status]}`}>
            <span className="dot" aria-hidden="true" />
            {t(STATUS_KEY[proposal.status])}
          </span>
        </div>
        <div className="actions">
          {proposal.status === 'DRAFT' && (
            <>
              <RetrySendButton proposalId={proposal.id} />
              <a className="btn-secondary btn-compact" href={`/proposals/new?editFrom=${proposal.id}`}>
                <svg className="i sm" viewBox="0 0 24 24">
                  <path d="M4 20h4L19 9l-4-4L4 16v4zM13 7l4 4" />
                </svg>
                {t('proposalDetail.editButton')}
              </a>
            </>
          )}
          {proposal.status !== 'DRAFT' && <DuplicateButton proposalId={proposal.id} />}
          {pdfActions}
        </div>
      </div>

      {proposal.status === 'DRAFT' && (
        <div className="alert alert--warning" role="note">
          <svg className="i sm" viewBox="0 0 24 24">
            <path d="M12 3l10 18H2L12 3zM12 10v5M12 18v.01" />
          </svg>
          <div className="alert__body">
            <strong>{t('proposalDetail.draftTitle')}</strong>
            {t('proposalDetail.draftNotice')}
          </div>
        </div>
      )}
      {(proposal.status === 'SENT' || proposal.status === 'VIEWED') && (
        <div className="alert alert--info" role="note">
          <svg className="i sm" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v5M12 16.5v.01" />
          </svg>
          <div className="alert__body">
            <strong>{t('proposalDetail.waitingClientTitle')}</strong>
            {t('proposalDetail.waitingClientBody', { days: daysUntilExpiry === null ? '—' : String(daysUntilExpiry) })}
          </div>
        </div>
      )}
      {proposal.status === 'COUNTERED' && (
        <div className="alert alert--danger" role="note">
          <svg className="i sm" viewBox="0 0 24 24">
            <path d="M12 3l10 18H2L12 3zM12 10v5M12 18v.01" />
          </svg>
          <div className="alert__body">
            <strong>{t('proposalDetail.counteredTitle')}</strong>
            {t('proposalDetail.counteredBody')}
          </div>
        </div>
      )}

      <div className="card">
        <dl className="meta">
          <div>
            <dt>{t('proposalsList.colContact')}</dt>
            <dd>{proposal.contacts ? `${proposal.contacts.full_name} · ${proposal.contacts.email}` : '—'}</dd>
          </div>
          <div>
            <dt>{t('proposalsList.colOwner')}</dt>
            <dd>{proposal.profiles?.full_name ?? '—'}</dd>
          </div>
          <div>
            <dt>{t('proposalsList.colUpdated')}</dt>
            <dd>{formatDate(proposal.updated_at)}</dd>
          </div>
          {proposal.sent_at && (
            <div>
              <dt>{t('proposalDetail.sentAt')}</dt>
              <dd>{formatDate(proposal.sent_at)}</dd>
            </div>
          )}
          {proposal.decided_at && (
            <div>
              <dt>{t('proposalDetail.decidedAt')}</dt>
              <dd>{formatDate(proposal.decided_at)}</dd>
            </div>
          )}
          {proposal.status !== 'DRAFT' && (
            <div>
              <dt>{t('proposalDetail.publicLink')}</dt>
              <dd>
                <a href={publicUrl} target="_blank" rel="noreferrer">
                  {publicUrl}
                </a>
              </dd>
            </div>
          )}
        </dl>
      </div>

      {counterProposal && proposal.accounts && proposal.contacts && (
        <CounterProposalReview
          proposalId={proposal.id}
          counterProposal={counterProposal}
          canDecide={canDecideCounterProposal}
          advertiserName={proposal.accounts.legal_name}
          contactFullName={proposal.contacts.full_name}
          proposalNumber={proposal.proposal_number}
          language={proposal.language as ContentLanguage}
          currentUserName={currentUserName}
        />
      )}

      {options.length > 0 && (
        <>
          <div className="tabs" role="tablist" aria-label={t('proposalDetail.option')}>
            {options.map((opt, idx) => (
              <button
                key={opt.id}
                type="button"
                role="tab"
                className="tab"
                aria-selected={idx === selectedOption}
                onClick={() => setSelectedOption(idx)}
              >
                <span className="tab__name">
                  {t('proposalDetail.option')} {opt.code}
                  {opt.name ? ` — ${opt.name}` : ''}
                </span>
                <span className="tab__amt">{formatCents(opt.billed_total_cents ?? 0)}</span>
                <MarginBadge marginRate={opt.margin_rate} />
              </button>
            ))}
          </div>

          {option && (
            <div className="split">
              <div className="card">
                <div className="opt-head">
                  <h2>
                    {t('proposalDetail.option')} {option.code}
                    {option.name ? ` — ${option.name}` : ''}
                  </h2>
                  <p>
                    {option.markets.join(', ')}
                    {' · '}
                    {option.campaign_start && option.campaign_end
                      ? `${formatDate(option.campaign_start)} – ${formatDate(option.campaign_end)}`
                      : option.campaign_duration_count
                        ? `${option.campaign_duration_count} ${
                            option.campaign_duration_unit === 'WEEK'
                              ? t('proposalBuilder.durationUnitWeek')
                              : t('proposalBuilder.durationUnitMonth')
                          }`
                        : '—'}
                    {option.pitch ? ` · ${option.pitch}` : ''}
                  </p>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>{t('proposalBuilder.support')}</th>
                        <th>{t('proposalDetail.lineMarket')}</th>
                        <th className="num">{t('proposalBuilder.quantity')}</th>
                        <th className="num">{t('proposalBuilder.billedTotal')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {option.proposal_option_lines.map((line, idx) => (
                        <tr key={`${line.support_id}-${line.market}-${idx}`}>
                          <td>
                            {supportLabel(supportNames[line.support_id], line.support_id)}
                            {line.lead_time_forced && (
                              <div style={{ marginTop: 4 }}>
                                <span className="badge badge--warning" style={{ fontSize: 10 }}>
                                  {t('proposalDetail.leadTimeForced')}
                                </span>
                                {line.lead_time_force_reason && (
                                  <div style={{ fontSize: 11, color: 'var(--foreground-tertiary)', marginTop: 2 }}>
                                    {t('proposalDetail.leadTimeForcedReason', { reason: line.lead_time_force_reason })}
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                          <td>
                            <span className="chip">{line.market}</span>
                          </td>
                          <td className="num">{line.quantity}</td>
                          <td className="num amount">{formatCents(line.billed_total_cents ?? 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="card sum">
                <h3 style={{ marginBottom: 'var(--gap-sm)' }}>{t('proposalDetail.summaryTitle')}</h3>
                <div className="sum__row">
                  <span>{t('proposalDetail.costInternal')}</span>
                  <strong>{formatCents(option.cost_cents ?? 0)}</strong>
                </div>
                <div className="sum__row">
                  <span>{t('proposalDetail.netOfMedia')}</span>
                  <strong>{formatCents(option.net_revenue_cents ?? 0)}</strong>
                </div>
                <div className="sum__row">
                  <span>{t('proposalBuilder.margin')}</span>
                  <MarginBadge marginRate={option.margin_rate} />
                </div>
                <div className="sum__total">
                  <span>{t('proposalBuilder.billedTotal')}</span>
                  <strong>{formatCents(option.billed_total_cents ?? 0)}</strong>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
