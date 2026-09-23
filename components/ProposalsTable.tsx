'use client';

import type { ProposalListItem, ProposalStatus } from '@/lib/domain';
import { formatDate } from '@/lib/format';
import { useI18n, type I18nKey } from '@/lib/i18n-internal';

/**
 * Tabla de presupuestos, compartida entre `/proposals` (listado completo,
 * con filtros) y `/accounts/[id]` (historial de una sola cuenta) — CLAUDE.md
 * §10.1.1, ronda 7. Cada fila abre `/proposals/[id]`.
 */
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

export function ProposalsTable({
  items,
  showAccount = true,
  emptyMessage,
}: {
  items: readonly ProposalListItem[];
  /** La tabla de una cuenta concreta (accountDetail) no necesita repetir la cuenta en cada fila. */
  showAccount?: boolean;
  emptyMessage?: string;
}) {
  const { t } = useI18n();

  if (items.length === 0) {
    return <p style={{ color: 'var(--wk-text-muted)', margin: 0 }}>{emptyMessage ?? t('proposalsList.empty')}</p>;
  }

  return (
    <table className="wk-table">
      <thead>
        <tr>
          {showAccount && <th>{t('proposalsList.colAccount')}</th>}
          <th>{t('proposalsList.colContact')}</th>
          <th>{t('proposalsList.colStatus')}</th>
          <th>{t('proposalsList.colUpdated')}</th>
          <th>{t('proposalsList.colOwner')}</th>
        </tr>
      </thead>
      <tbody>
        {items.map((p) => (
          <tr key={p.id}>
            {showAccount && (
              <td>
                <a href={`/proposals/${p.id}`}>{p.account?.legal_name ?? '—'}</a>
              </td>
            )}
            <td>
              {showAccount ? (
                p.contact?.full_name ?? '—'
              ) : (
                <a href={`/proposals/${p.id}`}>{p.contact?.full_name ?? '—'}</a>
              )}
            </td>
            <td>
              <span className={`wk-badge ${STATUS_BADGE_CLASS[p.status]}`}>{t(STATUS_KEY[p.status])}</span>
            </td>
            <td>{formatDate(p.updated_at)}</td>
            <td>{p.owner?.full_name ?? '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
