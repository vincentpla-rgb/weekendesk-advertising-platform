'use client';

import { useState, useTransition } from 'react';

import { useI18n } from '@/lib/i18n-internal';
import { retryProposalSend } from './actions';

export function RetrySendButton({ proposalId }: { proposalId: string }) {
  const { t } = useI18n();
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  function handleClick() {
    setResult(null);
    startTransition(async () => {
      const res = await retryProposalSend(proposalId);
      setResult(
        res.ok
          ? { ok: true, message: t('proposalDetail.retrySuccess') }
          : { ok: false, message: res.error },
      );
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
      <button
        type="button"
        className="wk-btn wk-btn-primary"
        disabled={isPending || result?.ok === true}
        onClick={handleClick}
      >
        {isPending ? t('proposalDetail.retrying') : t('proposalDetail.retryButton')}
      </button>
      {result && (
        <div className={`wk-alert ${result.ok ? 'wk-alert-info' : 'wk-alert-danger'}`}>{result.message}</div>
      )}
    </div>
  );
}
