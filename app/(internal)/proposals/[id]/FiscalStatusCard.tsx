'use client';

import { useState } from 'react';

import { formatDate } from '@/lib/format';
import type { VatRegimeEnum } from '@/lib/supabase/database.types.js';

const REGIME_LABELS: Record<VatRegimeEnum, string> = {
  FR_VAT_20: 'IVA francés 20 %',
  REVERSE_CHARGE: 'Autoliquidación (sin IVA)',
  PENDING: 'Pendiente de verificar VIES',
};

export function FiscalStatusCard({
  proposalId,
  legalName,
  vatNumber,
  vatRegime: initialRegime,
  purchaseOrderReference,
  acceptedAt,
}: {
  proposalId: string;
  legalName: string;
  vatNumber: string | null;
  vatRegime: VatRegimeEnum;
  purchaseOrderReference: string | null;
  acceptedAt: string;
}) {
  const [vatRegime, setVatRegime] = useState(initialRegime);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function retry() {
    setRetrying(true);
    setError(null);
    try {
      const res = await fetch(`/api/proposals/${proposalId}/resolve-vat`, { method: 'POST' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Error al reintentar');
      setVatRegime(body.vat_regime as VatRegimeEnum);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setRetrying(false);
    }
  }

  const isPending = vatRegime === 'PENDING';

  return (
    <div className="wk-card">
      <h3>Datos fiscales</h3>

      {isPending && (
        <div className="wk-alert wk-alert-danger" style={{ marginBottom: 14 }}>
          <strong>Régimen de IVA pendiente de verificación.</strong>
          <span>
            VIES no respondió al aceptar (servicio caído o timeout). No facturar este presupuesto
            hasta resolverlo — reintenta la verificación.
          </span>
        </div>
      )}

      <table className="wk-table">
        <tbody>
          <tr>
            <td>Razón social</td>
            <td>{legalName}</td>
          </tr>
          <tr>
            <td>Número de IVA</td>
            <td>{vatNumber || '—'}</td>
          </tr>
          <tr>
            <td>Régimen aplicado</td>
            <td>
              <span
                className={`wk-badge ${isPending ? 'wk-badge-danger' : 'wk-badge-success'}`}
              >
                {REGIME_LABELS[vatRegime]}
              </span>
            </td>
          </tr>
          <tr>
            <td>Referencia de pedido</td>
            <td>{purchaseOrderReference || '—'}</td>
          </tr>
          <tr>
            <td>Aceptado el</td>
            <td>{formatDate(acceptedAt)}</td>
          </tr>
        </tbody>
      </table>

      {isPending && (
        <>
          <button
            type="button"
            className="wk-btn wk-btn-primary"
            onClick={retry}
            disabled={retrying}
            style={{ marginTop: 14 }}
          >
            {retrying ? 'Verificando…' : 'Reintentar verificación VIES'}
          </button>
          {error && (
            <div className="wk-alert wk-alert-danger" style={{ marginTop: 10 }}>
              {error}
            </div>
          )}
        </>
      )}
    </div>
  );
}
