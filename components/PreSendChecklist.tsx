'use client';

import type { CheckResult } from '@/src/pricing/index.js';
import { useI18n } from '@/lib/i18n-internal';

export function PreSendChecklist({
  blockers,
  warnings,
}: {
  blockers: readonly CheckResult[];
  warnings: readonly CheckResult[];
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
          {b.message}
        </div>
      ))}
      {warnings.map((w, i) => (
        <div className="wk-alert wk-alert-warning" key={`w-${i}`}>
          <span className="wk-badge wk-badge-warning">{t('checklist.warning')}</span>
          {w.message}
        </div>
      ))}
    </div>
  );
}
