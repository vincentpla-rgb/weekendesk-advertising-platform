'use client';

import type { AccountRow, ProposalListItem } from '@/lib/domain';
import { useI18n } from '@/lib/i18n-internal';
import { ProposalsTable } from '@/components/ProposalsTable';

export function AccountDetailClient({
  account,
  proposals,
}: {
  account: AccountRow;
  proposals: readonly ProposalListItem[];
}) {
  const { t } = useI18n();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <a href="/accounts" style={{ fontSize: 13 }}>
        {t('accountDetail.back')}
      </a>

      <section className="wk-card">
        <h1 style={{ marginTop: 0 }}>{account.legal_name}</h1>

        <h3>{t('accountDetail.contacts')}</h3>
        {account.contacts.length === 0 ? (
          <p style={{ color: 'var(--wk-text-muted)' }}>—</p>
        ) : (
          <ul style={{ paddingLeft: 18, margin: 0 }}>
            {account.contacts.map((c) => (
              <li key={c.id}>
                {c.full_name} — {c.email}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="wk-card">
        <h3 style={{ marginTop: 0 }}>{t('accountDetail.proposals')}</h3>
        <ProposalsTable items={proposals} showAccount={false} emptyMessage={t('accountDetail.noProposals')} />
      </section>
    </div>
  );
}
