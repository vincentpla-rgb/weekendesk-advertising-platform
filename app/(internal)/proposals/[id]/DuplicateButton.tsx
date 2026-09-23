'use client';

import { useState, useTransition } from 'react';

import { useI18n } from '@/lib/i18n-internal';
import { duplicateProposal } from './actions';

/**
 * Botón "Duplicar" (CLAUDE.md §10.3 octies, ronda 8): disponible en
 * cualquier presupuesto que ya salió de DRAFT (enviado, visto, aceptado,
 * rechazado o caducado). Crea un presupuesto nuevo en DRAFT y navega a su
 * propio detalle — nunca modifica ni recalcula el presupuesto actual, que
 * sigue congelado como siempre (CLAUDE.md §5.4).
 */
export function DuplicateButton({ proposalId }: { proposalId: string }) {
  const { t } = useI18n();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const res = await duplicateProposal(proposalId);
      if (res.ok) {
        window.location.href = `/proposals/${res.newProposalId}`;
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
      <button type="button" className="wk-btn" disabled={isPending} onClick={handleClick}>
        {isPending ? t('proposalDetail.duplicating') : t('proposalDetail.duplicateButton')}
      </button>
      {error && <div className="wk-alert wk-alert-danger">{error}</div>}
    </div>
  );
}
