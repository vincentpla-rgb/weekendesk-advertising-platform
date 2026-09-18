'use client';

import type { CheckResult } from '@/src/pricing/index.js';

export function PreSendChecklist({
  blockers,
  warnings,
}: {
  blockers: readonly CheckResult[];
  warnings: readonly CheckResult[];
}) {
  if (blockers.length === 0 && warnings.length === 0) {
    return (
      <div className="wk-alert wk-alert-info">
        <strong>Todos los controles previos al envío pasan.</strong>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {blockers.map((b, i) => (
        <div className="wk-alert wk-alert-danger" key={`b-${i}`}>
          <span className="wk-badge wk-badge-danger">Bloquea el envío</span>
          {b.message}
        </div>
      ))}
      {warnings.map((w, i) => (
        <div className="wk-alert wk-alert-warning" key={`w-${i}`}>
          <span className="wk-badge wk-badge-warning">Aviso</span>
          {w.message}
        </div>
      ))}
    </div>
  );
}
