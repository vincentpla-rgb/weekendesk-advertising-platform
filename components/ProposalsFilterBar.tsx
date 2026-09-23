'use client';

import { useRouter, useSearchParams } from 'next/navigation';

import { PROPOSAL_STATUSES, type ProposalStatus } from '@/lib/domain';
import { useI18n, type I18nKey } from '@/lib/i18n-internal';

const STATUS_KEY: Record<ProposalStatus, I18nKey> = {
  DRAFT: 'status.DRAFT',
  SENT: 'status.SENT',
  VIEWED: 'status.VIEWED',
  ACCEPTED: 'status.ACCEPTED',
  REJECTED: 'status.REJECTED',
  EXPIRED: 'status.EXPIRED',
};

/**
 * Filtro por estado y por creador de `/proposals` (CLAUDE.md §10.1.1, ronda
 * 7 — "como mínimo"). Navega vía query string (`?status=&owner=`) para que
 * el listado en sí siga siendo un Server Component que consulta con los
 * filtros ya aplicados, en vez de filtrar en el cliente lo que ya se trajo.
 */
export function ProposalsFilterBar({
  owners,
}: {
  owners: readonly { readonly id: string; readonly full_name: string }[];
}) {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();

  function setParam(key: 'status' | 'owner', value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    router.push(`/proposals${params.toString() ? `?${params.toString()}` : ''}`);
  }

  return (
    <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
      <div>
        <label className="wk-label">{t('proposalsList.filterStatus')}</label>
        <select
          className="wk-select"
          value={searchParams.get('status') ?? ''}
          onChange={(e) => setParam('status', e.target.value)}
        >
          <option value="">{t('proposalsList.filterStatusAll')}</option>
          {PROPOSAL_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(STATUS_KEY[s])}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="wk-label">{t('proposalsList.filterOwner')}</label>
        <select
          className="wk-select"
          value={searchParams.get('owner') ?? ''}
          onChange={(e) => setParam('owner', e.target.value)}
        >
          <option value="">{t('proposalsList.filterOwnerAll')}</option>
          {owners.map((o) => (
            <option key={o.id} value={o.id}>
              {o.full_name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
