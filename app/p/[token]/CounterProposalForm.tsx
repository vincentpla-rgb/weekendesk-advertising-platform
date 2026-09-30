'use client';

import { useState } from 'react';

import { formatCents, MARKET_LABELS, supportLabel } from '@/lib/format';
import type { PublicCopy } from '@/lib/i18n';
import { euros, toEuros } from '@/src/pricing/index.js';

import type { PublicOption } from './page';

export interface CounterProposalLineValues {
  readonly supportId: string;
  readonly market: string;
  readonly originalPriceCents: number;
  readonly originalQuantity: number;
  clientPriceCents: number;
  clientQuantity: number;
  deleted: boolean;
}

export interface CounterProposalFiscalValues {
  legalName: string;
  billingAddress: string;
  vatNumber: string;
  billingContactName: string;
  billingContactEmail: string;
  signerName: string;
  signerRole: string;
  purchaseOrderReference: string;
}

export interface CounterProposalValues extends CounterProposalFiscalValues {
  lines: readonly CounterProposalLineValues[];
  campaignStart: string | null;
  campaignEnd: string | null;
  campaignDurationCount: number | null;
  campaignDurationUnit: 'WEEK' | 'MONTH' | null;
}

/**
 * Formulario editable de contrapropuesta (CLAUDE.md, ronda 16, bloque 2):
 * segunda vía del flujo de rechazo, por opción. El cliente edita precio,
 * cantidad y periodo, o elimina una línea entera — NUNCA añade un soporte
 * nuevo (no hay ningún control para eso aquí). El total se recalcula como
 * una simple suma de lo tecleado: cero lógica de negocio de pricing llega
 * a esta pantalla (CLAUDE.md §8).
 *
 * Captura fiscal embebida (confirmado): los mismos campos que `AcceptForm`,
 * recogidos aquí mismo para que "Aceptar" (revisión interna) pueda cerrar
 * el trato en un solo paso, sin pedirle los datos al cliente dos veces.
 */
export function CounterProposalForm({
  option,
  copy,
  submitting,
  onSubmit,
  onCancel,
}: {
  option: PublicOption;
  copy: PublicCopy;
  submitting: boolean;
  onSubmit: (values: CounterProposalValues) => void;
  onCancel: () => void;
}) {
  const [lines, setLines] = useState<CounterProposalLineValues[]>(() =>
    option.lines.map((line) => ({
      supportId: line.support_id,
      market: line.market,
      originalPriceCents: line.billed_total_cents,
      originalQuantity: line.quantity,
      clientPriceCents: line.billed_total_cents,
      clientQuantity: line.quantity,
      deleted: false,
    })),
  );

  const [campaignStart, setCampaignStart] = useState(option.campaign_start ?? '');
  const [campaignEnd, setCampaignEnd] = useState(option.campaign_end ?? '');
  const [durationCount, setDurationCount] = useState(option.campaign_duration_count ?? 1);
  const usesDuration = !option.campaign_start && !option.campaign_end;

  const [fiscal, setFiscal] = useState<CounterProposalFiscalValues>({
    legalName: '',
    billingAddress: '',
    vatNumber: '',
    billingContactName: '',
    billingContactEmail: '',
    signerName: '',
    signerRole: '',
    purchaseOrderReference: '',
  });

  function setFiscalField<K extends keyof CounterProposalFiscalValues>(key: K, value: string) {
    setFiscal((v) => ({ ...v, [key]: value }));
  }

  function updateLine(index: number, patch: Partial<CounterProposalLineValues>) {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  const requiredFiscal: (keyof CounterProposalFiscalValues)[] = [
    'legalName',
    'billingAddress',
    'billingContactName',
    'billingContactEmail',
    'signerName',
    'signerRole',
  ];
  const canSubmit =
    requiredFiscal.every((k) => fiscal[k].trim() !== '') &&
    lines.some((l) => !l.deleted) &&
    (usesDuration ? durationCount > 0 : campaignStart !== '' && campaignEnd !== '' && campaignEnd >= campaignStart);

  const total = lines.filter((l) => !l.deleted).reduce((sum, l) => sum + l.clientPriceCents, 0);

  function submit() {
    onSubmit({
      lines,
      campaignStart: usesDuration ? null : campaignStart,
      campaignEnd: usesDuration ? null : campaignEnd,
      campaignDurationCount: usesDuration ? durationCount : null,
      campaignDurationUnit: usesDuration ? option.campaign_duration_unit : null,
      ...fiscal,
    });
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(16,21,42,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        zIndex: 50,
      }}
    >
      <div className="wk-card" style={{ maxWidth: 640, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
        <h3>{copy.counterProposalForm.title}</h3>
        <p style={{ fontSize: 13, color: 'var(--wk-text-muted)' }}>{copy.counterProposalForm.intro}</p>

        <table className="wk-table" style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th>{copy.counterProposalForm.colSupport}</th>
              <th>{copy.counterProposalForm.colOriginalPrice}</th>
              <th>{copy.counterProposalForm.colYourPrice}</th>
              <th>{copy.counterProposalForm.colQuantity}</th>
              <th>{copy.counterProposalForm.removeLine}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, idx) => {
              const support = option.lines[idx]!;
              return (
                <tr key={`${line.supportId}-${line.market}`} style={line.deleted ? { opacity: 0.5 } : undefined}>
                  <td>
                    <strong>{supportLabel(support.support_name, support.support_id)}</strong>
                    <div style={{ fontSize: 12, color: 'var(--wk-text-muted)' }}>
                      {MARKET_LABELS[line.market] ?? line.market}
                    </div>
                    {line.deleted && (
                      <span className="wk-badge wk-badge-danger" style={{ marginTop: 4 }}>
                        {copy.counterProposalForm.lineRemoved}
                      </span>
                    )}
                  </td>
                  <td>{formatCents(line.originalPriceCents)}</td>
                  <td>
                    <input
                      className="wk-input"
                      type="number"
                      min={0}
                      step="0.01"
                      disabled={line.deleted}
                      value={toEuros(line.clientPriceCents)}
                      onChange={(e) =>
                        updateLine(idx, { clientPriceCents: e.target.value === '' ? 0 : euros(Number(e.target.value)) })
                      }
                    />
                  </td>
                  <td>
                    <input
                      className="wk-input"
                      type="number"
                      min={0}
                      step="1"
                      disabled={line.deleted}
                      value={line.clientQuantity}
                      onChange={(e) => updateLine(idx, { clientQuantity: e.target.value === '' ? 0 : Number(e.target.value) })}
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={line.deleted}
                      onChange={(e) => updateLine(idx, { deleted: e.target.checked })}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div style={{ fontSize: 15, fontWeight: 600, marginTop: 8 }}>{formatCents(total)}</div>

        <div style={{ marginTop: 16 }}>
          <label className="wk-label">{copy.counterProposalForm.campaignPeriod}</label>
          {usesDuration ? (
            <input
              className="wk-input"
              type="number"
              min={1}
              value={durationCount}
              onChange={(e) => setDurationCount(e.target.value === '' ? 1 : Number(e.target.value))}
            />
          ) : (
            <div style={{ display: 'flex', gap: 10 }}>
              <div>
                <label className="wk-label">{copy.counterProposalForm.campaignStart}</label>
                <input
                  className="wk-input"
                  type="date"
                  value={campaignStart}
                  onChange={(e) => setCampaignStart(e.target.value)}
                />
              </div>
              <div>
                <label className="wk-label">{copy.counterProposalForm.campaignEnd}</label>
                <input className="wk-input" type="date" value={campaignEnd} onChange={(e) => setCampaignEnd(e.target.value)} />
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
          <h4 style={{ margin: 0 }}>{copy.counterProposalForm.fiscalTitle}</h4>
          <Field label={copy.acceptForm.legalName} value={fiscal.legalName} onChange={(v) => setFiscalField('legalName', v)} required />
          <Field
            label={copy.acceptForm.billingAddress}
            value={fiscal.billingAddress}
            onChange={(v) => setFiscalField('billingAddress', v)}
            required
          />
          <Field label={copy.acceptForm.vatNumber} value={fiscal.vatNumber} onChange={(v) => setFiscalField('vatNumber', v)} />
          <Field
            label={copy.acceptForm.billingContactName}
            value={fiscal.billingContactName}
            onChange={(v) => setFiscalField('billingContactName', v)}
            required
          />
          <Field
            label={copy.acceptForm.billingContactEmail}
            value={fiscal.billingContactEmail}
            onChange={(v) => setFiscalField('billingContactEmail', v)}
            type="email"
            required
          />
          <Field
            label={copy.acceptForm.signerName}
            value={fiscal.signerName}
            onChange={(v) => setFiscalField('signerName', v)}
            required
          />
          <Field
            label={copy.acceptForm.signerRole}
            value={fiscal.signerRole}
            onChange={(v) => setFiscalField('signerRole', v)}
            required
          />
          <Field
            label={copy.acceptForm.purchaseOrderReference}
            value={fiscal.purchaseOrderReference}
            onChange={(v) => setFiscalField('purchaseOrderReference', v)}
          />
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
          <button type="button" className="wk-btn wk-btn-primary" disabled={!canSubmit || submitting} onClick={submit}>
            {submitting ? '…' : copy.counterProposalForm.submit}
          </button>
          <button type="button" className="wk-btn wk-btn-ghost" onClick={onCancel} disabled={submitting}>
            {copy.counterProposalForm.cancel}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  required = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="wk-label">
        {label}
        {required ? ' *' : ''}
      </label>
      <input className="wk-input" type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
