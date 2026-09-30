'use client';

import { useState } from 'react';

import type { ContentLanguage } from '@/lib/domain';
import { formatCents, formatDate, formatPercent, supportLabel } from '@/lib/format';
import { useI18n } from '@/lib/i18n-internal';
import { buildCounterProposalRejectionEmailContent } from '@/lib/email/counter-proposal-rejection-email';
import { EmailPreviewModal } from '@/components/EmailPreviewModal';
import {
  acceptCounterProposal,
  rejectCounterProposal,
  type MarginOverrideInput,
} from './counter-proposal-actions';

export interface CounterProposalReviewLine {
  readonly supportId: string;
  readonly supportName: string;
  readonly market: string;
  readonly deleted: boolean;
  readonly originalPriceCents: number;
  readonly originalQuantity: number;
  readonly clientPriceCents: number;
  readonly clientQuantity: number;
  readonly margin: {
    readonly costCents: number;
    readonly marginCents: number;
    readonly marginRate: number;
    readonly floorCents: number;
    readonly belowFloor: boolean;
  } | null;
}

export interface CounterProposalReviewData {
  readonly id: string;
  readonly status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  readonly optionCode: string;
  readonly optionName: string | null;
  readonly submittedAt: string;
  readonly reviewedAt: string | null;
  readonly rejectionReason: string | null;
  readonly resultingProposalId: string | null;
  readonly lines: readonly CounterProposalReviewLine[];
}

function lineKey(l: { supportId: string; market: string }) {
  return `${l.supportId}::${l.market}`;
}

/**
 * Revisión interna de una contrapropuesta (CLAUDE.md, ronda 16, bloque 3):
 * el AM ve línea por línea el margen contra el coste interno real (nunca
 * visible en la pantalla pública) y decide Aceptar o Rechazar. El margen por
 * debajo del suelo del 50% nunca bloquea — es un aviso forzable con motivo,
 * mismo patrón que `overrides` (kind `MARGIN_BELOW_FLOOR`, primer uso real).
 * Solo el creador del presupuesto original o un administrador pueden decidir
 * (`canDecide`, calculado en el servidor con el mismo criterio que valida
 * `is_admin_or_proposal_owner` en SQL — esto es solo la UI, la comprobación
 * real vive en el RPC).
 */
export function CounterProposalReview({
  proposalId,
  counterProposal,
  canDecide,
  advertiserName,
  contactFullName,
  proposalNumber,
  language,
  currentUserName,
}: {
  proposalId: string;
  counterProposal: CounterProposalReviewData;
  canDecide: boolean;
  advertiserName: string;
  contactFullName: string;
  proposalNumber: string;
  language: ContentLanguage;
  currentUserName: string | null;
}) {
  const { t } = useI18n();
  const [forcedReasons, setForcedReasons] = useState<Record<string, string>>({});
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [showEmailPreview, setShowEmailPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<
    | { readonly kind: 'accepted'; readonly newProposalId: string }
    | { readonly kind: 'rejected' }
    | null
  >(null);

  const belowFloorLines = counterProposal.lines.filter((l) => l.margin?.belowFloor);

  async function handleAccept() {
    setSubmitting(true);
    setError(null);
    const marginOverrides: MarginOverrideInput[] = belowFloorLines
      .filter((l) => forcedReasons[lineKey(l)]?.trim())
      .map((l) => ({ supportId: l.supportId, market: l.market, reason: forcedReasons[lineKey(l)]!.trim() }));

    const stillUnforced = belowFloorLines.filter((l) => !forcedReasons[lineKey(l)]?.trim());
    if (stillUnforced.length > 0) {
      setError(t('counterProposal.forceMarginReasonLabel'));
      setSubmitting(false);
      return;
    }

    const res = await acceptCounterProposal(proposalId, counterProposal.id, marginOverrides);
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setResult({ kind: 'accepted', newProposalId: res.newProposalId });
  }

  async function handleReject() {
    if (rejectReason.trim() === '') {
      setError(t('counterProposal.rejectReasonRequired'));
      return;
    }
    setSubmitting(true);
    setError(null);
    const res = await rejectCounterProposal(proposalId, counterProposal.id, rejectReason.trim());
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error);
      if (res.decided) setResult({ kind: 'rejected' });
      return;
    }
    setResult({ kind: 'rejected' });
  }

  const emailPreviewContent = buildCounterProposalRejectionEmailContent({
    advertiserName,
    contactFullName,
    proposalNumber,
    reason: rejectReason.trim() || '…',
    salesName: currentUserName ?? '…',
    language,
  });

  const decided = counterProposal.status !== 'PENDING' || result !== null;

  return (
    <section className="wk-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ margin: 0 }}>
          {t('counterProposal.title')} — {t('proposalDetail.option')} {counterProposal.optionCode}
        </h3>
        <span
          className={`wk-badge ${
            counterProposal.status === 'ACCEPTED' || result?.kind === 'accepted'
              ? 'wk-badge-success'
              : counterProposal.status === 'REJECTED' || result?.kind === 'rejected'
                ? 'wk-badge-danger'
                : 'wk-badge-warning'
          }`}
        >
          {result?.kind === 'accepted' || counterProposal.status === 'ACCEPTED'
            ? t('counterProposal.statusAccepted')
            : result?.kind === 'rejected' || counterProposal.status === 'REJECTED'
              ? t('counterProposal.statusRejected')
              : t('counterProposal.statusPending')}
        </span>
      </div>
      <p style={{ fontSize: 13, color: 'var(--wk-text-muted)' }}>
        {t('counterProposal.submittedAt')} {formatDate(counterProposal.submittedAt)}
      </p>

      <table className="wk-table" style={{ marginTop: 8 }}>
        <thead>
          <tr>
            <th>{t('counterProposal.colSupport')}</th>
            <th>{t('counterProposal.colOriginal')}</th>
            <th>{t('counterProposal.colProposed')}</th>
            <th>{t('counterProposal.colMargin')}</th>
          </tr>
        </thead>
        <tbody>
          {counterProposal.lines.map((line) => (
            <tr key={lineKey(line)} style={line.deleted ? { opacity: 0.5 } : undefined}>
              <td>
                <strong>{supportLabel(line.supportName, line.supportId)}</strong>
                <div style={{ fontSize: 12, color: 'var(--wk-text-muted)' }}>{line.market}</div>
                {line.deleted && (
                  <span className="wk-badge wk-badge-danger" style={{ marginTop: 4 }}>
                    {t('counterProposal.lineDeleted')}
                  </span>
                )}
              </td>
              <td>
                {formatCents(line.originalPriceCents)} × {line.originalQuantity}
              </td>
              <td>
                {line.deleted ? '—' : `${formatCents(line.clientPriceCents)} × ${line.clientQuantity}`}
              </td>
              <td>
                {line.deleted ? (
                  '—'
                ) : line.margin === null ? (
                  <span style={{ fontSize: 12, color: 'var(--wk-text-muted)' }}>
                    {t('counterProposal.mediaBuyNoMargin')}
                  </span>
                ) : (
                  <div>
                    <div>
                      {formatCents(line.margin.marginCents)} ({formatPercent(line.margin.marginRate)})
                    </div>
                    {line.margin.belowFloor && (
                      <div style={{ marginTop: 4 }}>
                        <span className="wk-badge wk-badge-danger" style={{ fontSize: 10 }}>
                          {t('counterProposal.marginBelowFloor')}
                        </span>
                        {counterProposal.status === 'PENDING' && !decided && canDecide && (
                          <div style={{ marginTop: 6 }}>
                            <label className="wk-label">{t('counterProposal.forceMarginReasonLabel')}</label>
                            <input
                              className="wk-input"
                              value={forcedReasons[lineKey(line)] ?? ''}
                              onChange={(e) =>
                                setForcedReasons((prev) => ({ ...prev, [lineKey(line)]: e.target.value }))
                              }
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {!canDecide && counterProposal.status === 'PENDING' && !decided && (
        <div className="wk-alert wk-alert-warning" style={{ marginTop: 12 }}>
          {t('counterProposal.permissionDenied')}
        </div>
      )}

      {error && (
        <div className="wk-alert wk-alert-danger" style={{ marginTop: 12 }}>
          {error}
        </div>
      )}

      {result?.kind === 'accepted' && (
        <div className="wk-alert wk-alert-info" style={{ marginTop: 12 }}>
          {t('counterProposal.acceptSuccess', { number: result.newProposalId })}{' '}
          <a href={`/proposals/${result.newProposalId}`}>{t('proposalDetail.title')}</a>
        </div>
      )}
      {(result?.kind === 'rejected' || (counterProposal.status === 'REJECTED' && counterProposal.rejectionReason)) && (
        <div className="wk-alert wk-alert-info" style={{ marginTop: 12 }}>
          {result?.kind === 'rejected' ? t('counterProposal.rejectSuccess') : counterProposal.rejectionReason}
        </div>
      )}
      {counterProposal.status === 'ACCEPTED' && counterProposal.resultingProposalId && !result && (
        <div className="wk-alert wk-alert-info" style={{ marginTop: 12 }}>
          <a href={`/proposals/${counterProposal.resultingProposalId}`}>{t('proposalDetail.title')}</a>
        </div>
      )}

      {canDecide && counterProposal.status === 'PENDING' && !decided && (
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {!showRejectForm ? (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="wk-btn wk-btn-primary" disabled={submitting} onClick={handleAccept}>
                {submitting ? t('counterProposal.accepting') : t('counterProposal.acceptButton')}
              </button>
              <button
                type="button"
                className="wk-btn wk-btn-secondary"
                disabled={submitting}
                onClick={() => setShowRejectForm(true)}
              >
                {t('counterProposal.rejectButton')}
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label className="wk-label">{t('counterProposal.rejectReasonLabel')}</label>
              <textarea
                className="wk-textarea"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
              />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="wk-btn wk-btn-primary" disabled={submitting} onClick={handleReject}>
                  {submitting ? t('counterProposal.rejecting') : t('counterProposal.rejectButton')}
                </button>
                <button
                  type="button"
                  className="wk-btn wk-btn-secondary"
                  disabled={submitting || rejectReason.trim() === ''}
                  onClick={() => setShowEmailPreview(true)}
                >
                  {t('counterProposal.previewEmailButton')}
                </button>
                <button
                  type="button"
                  className="wk-btn wk-btn-ghost"
                  disabled={submitting}
                  onClick={() => setShowRejectForm(false)}
                >
                  {t('checklist.forceLeadTimeCancel')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {showEmailPreview && (
        <EmailPreviewModal
          content={emailPreviewContent}
          noticeKey="counterProposal.previewEmailNotice"
          onClose={() => setShowEmailPreview(false)}
        />
      )}
    </section>
  );
}
