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
        className="btn-primary btn-compact"
        disabled={isPending || result?.ok === true}
        onClick={handleClick}
      >
        <svg className="i sm" viewBox="0 0 24 24">
          <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
        </svg>
        {isPending ? t('proposalDetail.sending') : t('proposalDetail.sendButton')}
      </button>
      {result && (
        <div className={`alert alert--${result.ok ? 'info' : 'danger'}`} role="note">
          {result.message}
        </div>
      )}
    </div>
  );
}
