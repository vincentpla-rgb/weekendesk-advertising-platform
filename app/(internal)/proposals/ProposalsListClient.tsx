'use client';

import type { ProposalListItem } from '@/lib/domain';
import { useI18n } from '@/lib/i18n-internal';
import { ProposalsFilterBar } from '@/components/ProposalsFilterBar';
import { ProposalsTable } from '@/components/ProposalsTable';

export function ProposalsListClient({
  items,
  owners,
}: {
  items: readonly ProposalListItem[];
  owners: readonly { id: string; full_name: string }[];
}) {
  const { t } = useI18n();
  return (
    <>
      <h1>{t('proposalsList.title')}</h1>
      <ProposalsFilterBar owners={owners} />
      <ProposalsTable items={items} />
    </>
  );
}
