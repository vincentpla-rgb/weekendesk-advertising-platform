'use client';

import type { ProposalStatus } from '@/lib/domain';
import { formatCents, formatDate, formatPercent } from '@/lib/format';
import { useI18n, type I18nKey } from '@/lib/i18n-internal';
import { RetrySendButton } from './RetrySendButton';

const STATUS_BADGE_CLASS: Record<ProposalStatus, string> = {
  DRAFT: 'wk-badge-neutral',
  SENT: 'wk-badge-warning',
  VIEWED: 'wk-badge-warning',
  ACCEPTED: 'wk-badge-success',
  REJECTED: 'wk-badge-danger',
  EXPIRED: 'wk-badge-danger',
};

const STATUS_KEY: Record<ProposalStatus, I18nKey> = {
  DRAFT: 'status.DRAFT',
  SENT: 'status.SENT',
  VIEWED: 'status.VIEWED',
  ACCEPTED: 'status.ACCEPTED',
  REJECTED: 'status.REJECTED',
  EXPIRED: 'status.EXPIRED',
};

interface DetailLine {
  readonly support_id: string;
  readonly market: string;
  readonly quantity: number;
  readonly net_price_cents: number | null;
  readonly billed_total_cents: number | null;
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
  readonly margin_rate: number | null;
  readonly proposal_option_lines: readonly DetailLine[];
}

interface DetailProposal {
  readonly id: string;
  readonly status: ProposalStatus;
  readonly brief: string | null;
  readonly sent_at: string | null;
  readonly decided_at: string | null;
  readonly public_token: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly accounts: { readonly legal_name: string } | null;
  readonly contacts: { readonly full_name: string; readonly email: string } | null;
  readonly profiles: { readonly full_name: string } | null;
}

export function ProposalDetailClient({
  proposal,
  options,
}: {
  proposal: DetailProposal;
  options: readonly DetailOption[];
}) {
  const { t } = useI18n();
  const publicUrl = typeof window !== 'undefined' ? `${window.location.origin}/p/${proposal.public_token}` : `/p/${proposal.public_token}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <a href="/proposals" style={{ fontSize: 13 }}>
        {t('proposalDetail.back')}
      </a>

      <section className="wk-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
          <h1 style={{ margin: 0 }}>{proposal.accounts?.legal_name ?? '—'}</h1>
          <span className={`wk-badge ${STATUS_BADGE_CLASS[proposal.status]}`}>{t(STATUS_KEY[proposal.status])}</span>
        </div>
        <table className="wk-table" style={{ marginTop: 12 }}>
          <tbody>
            <tr>
              <td>{t('proposalsList.colContact')}</td>
              <td>
                {proposal.contacts ? `${proposal.contacts.full_name} (${proposal.contacts.email})` : '—'}
              </td>
            </tr>
            <tr>
              <td>{t('proposalsList.colOwner')}</td>
              <td>{proposal.profiles?.full_name ?? '—'}</td>
            </tr>
            <tr>
              <td>{t('proposalsList.colUpdated')}</td>
              <td>{formatDate(proposal.updated_at)}</td>
            </tr>
            {proposal.sent_at && (
              <tr>
                <td>{t('proposalDetail.sentAt')}</td>
                <td>{formatDate(proposal.sent_at)}</td>
              </tr>
            )}
            {proposal.decided_at && (
              <tr>
                <td>{t('proposalDetail.decidedAt')}</td>
                <td>{formatDate(proposal.decided_at)}</td>
              </tr>
            )}
            {proposal.status !== 'DRAFT' && (
              <tr>
                <td>{t('proposalDetail.publicLink')}</td>
                <td>
                  <a href={publicUrl} target="_blank" rel="noreferrer">
                    {publicUrl}
                  </a>
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {proposal.status === 'DRAFT' && (
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="wk-alert wk-alert-warning">{t('proposalDetail.draftNotice')}</div>
            <RetrySendButton proposalId={proposal.id} />
          </div>
        )}
      </section>

      {options.map((option) => (
        <section key={option.id} className="wk-card">
          <h3>
            {t('proposalDetail.option')} {option.code}
            {option.name ? ` — ${option.name}` : ''}
          </h3>
          {option.pitch && <p style={{ color: 'var(--wk-text-muted)' }}>{option.pitch}</p>}
          <p style={{ fontSize: 13, color: 'var(--wk-text-muted)' }}>
            {option.markets.join(', ')}
            {' · '}
            {option.campaign_start && option.campaign_end
              ? `${formatDate(option.campaign_start)} – ${formatDate(option.campaign_end)}`
              : option.campaign_duration_count
                ? `${option.campaign_duration_count} ${option.campaign_duration_unit === 'WEEK' ? t('proposalBuilder.durationUnitWeek') : t('proposalBuilder.durationUnitMonth')}`
                : '—'}
          </p>
          <table className="wk-table">
            <thead>
              <tr>
                <th>{t('proposalBuilder.support')}</th>
                <th>{t('proposalDetail.lineMarket')}</th>
                <th>{t('proposalBuilder.quantity')}</th>
                <th>{t('proposalBuilder.billedTotal')}</th>
              </tr>
            </thead>
            <tbody>
              {option.proposal_option_lines.map((line, idx) => (
                <tr key={`${line.support_id}-${line.market}-${idx}`}>
                  <td>{line.support_id}</td>
                  <td>{line.market}</td>
                  <td>{line.quantity}</td>
                  <td>{formatCents(line.billed_total_cents ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 10, display: 'flex', gap: 20, fontSize: 14 }}>
            <div>
              <strong>{formatCents(option.billed_total_cents ?? 0)}</strong> {t('proposalBuilder.billedTotal').toLowerCase()}
            </div>
            <div>
              {option.margin_rate === null ? '—' : formatPercent(option.margin_rate)} {t('proposalBuilder.margin').toLowerCase()}
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}
