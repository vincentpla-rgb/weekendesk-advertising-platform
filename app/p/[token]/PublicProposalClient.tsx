'use client';

import { useMemo, useState } from 'react';

import { formatCents, formatDate, MARKET_LABELS } from '@/lib/format';
import { getPublicCopy, getVatNotice } from '@/lib/i18n';

import type { PublicOption, PublicProposal } from './page';
import { AcceptForm, type AcceptFormValues } from './AcceptForm';

const REACH_METRIC_LABELS: Record<string, string> = {
  PAGE_VIEWS: 'vistas de página',
  SESSIONS: 'sesiones',
  UNIQUE_USERS: 'usuarios únicos',
};

const UNIT_LABELS: Record<string, string> = {
  WEEK: 'semana',
  CAMPAIGN: 'campaña',
  SEND: 'envío',
  INSERTION_WEEK: 'semana de inserción',
  MONTH: 'mes',
  UNIT: 'unidad',
  COLLABORATION: 'colaboración',
};

export function PublicProposalClient({
  token,
  proposal,
}: {
  token: string;
  proposal: PublicProposal;
}) {
  const copy = getPublicCopy(proposal.language);
  const vatNotice = getVatNotice(proposal.language);

  const [decided, setDecided] = useState<'ACCEPTED' | 'REJECTED' | null>(
    proposal.status === 'ACCEPTED' ? 'ACCEPTED' : proposal.status === 'REJECTED' ? 'REJECTED' : null,
  );
  const [acceptingOption, setAcceptingOption] = useState<PublicOption | null>(null);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const daysRemaining = useMemo(() => {
    if (!proposal.expires_at) return null;
    const ms = new Date(proposal.expires_at).getTime() - Date.now();
    return Math.ceil(ms / 86_400_000);
  }, [proposal.expires_at]);

  async function submitAccept(values: AcceptFormValues) {
    if (!acceptingOption) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/public/proposals/${token}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ optionCode: acceptingOption.code, ...values }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Error al aceptar');
      setDecided('ACCEPTED');
      setAcceptingOption(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setSubmitting(false);
    }
  }

  async function submitReject() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/public/proposals/${token}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: rejectReason || null }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Error al rechazar');
      setDecided('REJECTED');
      setShowRejectForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setSubmitting(false);
    }
  }

  if (decided === 'ACCEPTED') {
    return (
      <div className="wk-shell" style={{ maxWidth: 480, marginTop: 60 }}>
        <div className="wk-alert wk-alert-info">{copy.acceptedThankYou}</div>
      </div>
    );
  }
  if (decided === 'REJECTED') {
    return (
      <div className="wk-shell" style={{ maxWidth: 480, marginTop: 60 }}>
        <div className="wk-alert wk-alert-info">{copy.rejectedThankYou}</div>
      </div>
    );
  }

  return (
    <div className="wk-shell">
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ marginBottom: 4 }}>{proposal.advertiser}</h1>
        {(proposal.campaign_start || proposal.campaign_end) && (
          <p style={{ color: 'var(--wk-text-muted)', margin: 0 }}>
            {copy.offerPeriod}:{' '}
            {proposal.campaign_start ? formatDate(proposal.campaign_start) : '—'}
            {' – '}
            {proposal.campaign_end ? formatDate(proposal.campaign_end) : '—'}
          </p>
        )}
        {proposal.expired ? (
          <span className="wk-badge wk-badge-danger" style={{ marginTop: 8 }}>
            {copy.expired}
          </span>
        ) : (
          daysRemaining !== null && (
            <span className="wk-badge wk-badge-warning" style={{ marginTop: 8 }}>
              {copy.daysRemaining(daysRemaining)}
              {proposal.expires_at ? ` · ${copy.validUntil} ${formatDate(proposal.expires_at)}` : ''}
            </span>
          )
        )}
      </div>

      {proposal.brief && (
        <div className="wk-card" style={{ marginBottom: 20 }}>
          <h3>{copy.brief}</h3>
          <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{proposal.brief}</p>
        </div>
      )}

      {error && (
        <div className="wk-alert wk-alert-danger" style={{ marginBottom: 16 }}>
          {error}
        </div>
      )}

      {!proposal.expired && proposal.options && (
        <div className="wk-grid-options">
          {proposal.options.map((option) => (
            <div className="wk-card" key={option.code} style={{ display: 'flex', flexDirection: 'column' }}>
              <h3>{option.name}</h3>
              {option.pitch && <p style={{ color: 'var(--wk-text-muted)', fontSize: 14 }}>{option.pitch}</p>}

              <div style={{ fontFamily: 'var(--wk-font-display)', fontSize: 26, fontWeight: 700, color: 'var(--wk-navy)' }}>
                {formatCents(option.billed_total_cents)}
              </div>
              {option.media_budget_cents > 0 && (
                <p style={{ fontSize: 12, color: 'var(--wk-text-muted)', marginTop: 2 }}>
                  incl. {formatCents(option.media_budget_cents)} de presupuesto de medios
                </p>
              )}

              <table className="wk-table" style={{ marginTop: 12, flex: 1 }}>
                <tbody>
                  {option.lines.map((line, idx) => (
                    <tr key={idx}>
                      <td>
                        <strong>{line.support_name}</strong>
                        <div style={{ fontSize: 12, color: 'var(--wk-text-muted)' }}>
                          {MARKET_LABELS[line.market] ?? line.market} · {line.quantity}{' '}
                          {UNIT_LABELS[line.unit] ?? line.unit}
                          {line.quantity > 1 ? 's' : ''}
                        </div>
                        {line.reach ? (
                          <div style={{ fontSize: 12, color: 'var(--wk-navy)', marginTop: 2 }}>
                            {copy.reach}: {line.reach.value.toLocaleString()}{' '}
                            {REACH_METRIC_LABELS[line.reach.metric] ?? line.reach.metric} (
                            {line.reach.source}, {formatDate(line.reach.measured_at)})
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <button
                type="button"
                className="wk-btn wk-btn-primary"
                style={{ marginTop: 14, justifyContent: 'center' }}
                onClick={() => setAcceptingOption(option)}
              >
                {copy.accept}
              </button>
            </div>
          ))}
        </div>
      )}

      {!proposal.expired && (
        <div style={{ marginTop: 24 }}>
          <button type="button" className="wk-btn wk-btn-ghost" onClick={() => setShowRejectForm(true)}>
            {copy.rejectWholeProposal}
          </button>
        </div>
      )}

      {vatNotice && (
        <p style={{ fontSize: 11, color: 'var(--wk-text-muted)', marginTop: 32, maxWidth: 640 }}>{vatNotice}</p>
      )}

      {acceptingOption && (
        <AcceptForm
          copy={copy}
          submitting={submitting}
          onSubmit={submitAccept}
          onCancel={() => setAcceptingOption(null)}
        />
      )}

      {showRejectForm && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(16,21,42,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            zIndex: 50,
          }}
        >
          <div className="wk-card" style={{ maxWidth: 420, width: '100%' }}>
            <h3>{copy.rejectForm.title}</h3>
            <label className="wk-label">{copy.rejectForm.reason}</label>
            <textarea
              className="wk-textarea"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button type="button" className="wk-btn wk-btn-primary" disabled={submitting} onClick={submitReject}>
                {submitting ? '…' : copy.rejectForm.submit}
              </button>
              <button
                type="button"
                className="wk-btn wk-btn-ghost"
                onClick={() => setShowRejectForm(false)}
                disabled={submitting}
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
