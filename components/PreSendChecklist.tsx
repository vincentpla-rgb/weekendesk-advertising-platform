'use client';

import { useState } from 'react';

import type { CheckResult, Market } from '@/src/pricing/index.js';
import { useI18n } from '@/lib/i18n-internal';

/**
 * Controles previos al envío (CLAUDE.md §5.3). De los bloqueos duros, solo
 * LEAD_TIME_INSUFFICIENT (`forcible: true`, ronda 11) puede forzarse —
 * el resto (fechas inválidas, presupuesto de medios vacío, conflicto de
 * disponibilidad) no tiene ningún control para saltárselo, en ningún sitio
 * de la interfaz.
 */
export function PreSendChecklist({
  blockers,
  warnings,
  onForceLeadTime,
  onClearLeadTimeOverride,
}: {
  blockers: readonly CheckResult[];
  warnings: readonly CheckResult[];
  /** Ausente = sin forzado disponible (p. ej. presupuestos ya enviados, de solo lectura). */
  onForceLeadTime?: (optionId: string, supportId: string, market: Market, reason: string) => void;
  /** Deshace un forzado previo (p. ej. si el comercial cambia de opinión). */
  onClearLeadTimeOverride?: (optionId: string, supportId: string, market: Market) => void;
}) {
  const { t } = useI18n();

  if (blockers.length === 0 && warnings.length === 0) {
    return (
      <div className="wk-alert wk-alert-info">
        <strong>{t('checklist.allPass')}</strong>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {blockers.map((b, i) => (
        <div className="wk-alert wk-alert-danger" key={`b-${i}`}>
          <span className="wk-badge wk-badge-danger">{t('checklist.blocks')}</span>
          {t(b.messageKey, b.messageVars)}
          {b.forcible && b.optionId && b.supportId && b.market && onForceLeadTime && (
            <ForceLeadTimeControl
              optionId={b.optionId}
              supportId={b.supportId}
              market={b.market}
              onForce={onForceLeadTime}
            />
          )}
        </div>
      ))}
      {warnings.map((w, i) => (
        <div className="wk-alert wk-alert-warning" key={`w-${i}`}>
          <span className="wk-badge wk-badge-warning">{t('checklist.warning')}</span>
          {t(w.messageKey, w.messageVars)}
          {w.code === 'LEAD_TIME_FORCED' && w.optionId && w.supportId && w.market && onClearLeadTimeOverride && (
            <button
              type="button"
              className="wk-btn wk-btn-ghost"
              style={{ marginLeft: 10, fontSize: 12, padding: '2px 8px' }}
              onClick={() => onClearLeadTimeOverride(w.optionId!, w.supportId!, w.market!)}
            >
              {t('checklist.forceLeadTimeCancel')}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function ForceLeadTimeControl({
  optionId,
  supportId,
  market,
  onForce,
}: {
  optionId: string;
  supportId: string;
  market: Market;
  onForce: (optionId: string, supportId: string, market: Market, reason: string) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');

  if (!open) {
    return (
      <button
        type="button"
        className="wk-btn wk-btn-ghost"
        style={{ marginLeft: 10, fontSize: 12, padding: '2px 8px' }}
        onClick={() => setOpen(true)}
      >
        {t('checklist.forceLeadTime')}
      </button>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6 }}>
      <input
        className="wk-input"
        style={{ fontSize: 12, padding: '2px 6px', width: 220 }}
        placeholder={t('checklist.forceLeadTimeReasonLabel')}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <button
        type="button"
        className="wk-btn wk-btn-primary"
        style={{ fontSize: 12, padding: '2px 8px' }}
        disabled={reason.trim() === ''}
        onClick={() => {
          onForce(optionId, supportId, market, reason.trim());
          setOpen(false);
          setReason('');
        }}
      >
        {t('checklist.forceLeadTimeConfirm')}
      </button>
      <button
        type="button"
        className="wk-btn wk-btn-ghost"
        style={{ fontSize: 12, padding: '2px 8px' }}
        onClick={() => {
          setOpen(false);
          setReason('');
        }}
      >
        {t('checklist.forceLeadTimeCancel')}
      </button>
    </div>
  );
}
