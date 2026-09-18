'use client';

import { useState } from 'react';

import type { PublicCopy } from '@/lib/i18n';

export interface AcceptFormValues {
  legalName: string;
  billingAddress: string;
  vatNumber: string;
  billingContactName: string;
  billingContactEmail: string;
  signerName: string;
  signerRole: string;
  purchaseOrderReference: string;
}

/**
 * Formulario de aceptación (CLAUDE.md §6): datos fiscales, sin datos
 * bancarios. La verificación VIES la hace el servidor al enviar, no aquí.
 */
export function AcceptForm({
  copy,
  submitting,
  onSubmit,
  onCancel,
}: {
  copy: PublicCopy;
  submitting: boolean;
  onSubmit: (values: AcceptFormValues) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<AcceptFormValues>({
    legalName: '',
    billingAddress: '',
    vatNumber: '',
    billingContactName: '',
    billingContactEmail: '',
    signerName: '',
    signerRole: '',
    purchaseOrderReference: '',
  });

  function set<K extends keyof AcceptFormValues>(key: K, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  const required: (keyof AcceptFormValues)[] = [
    'legalName',
    'billingAddress',
    'billingContactName',
    'billingContactEmail',
    'signerName',
    'signerRole',
  ];
  const canSubmit = required.every((k) => values[k].trim() !== '');

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
      <div className="wk-card" style={{ maxWidth: 480, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
        <h3>{copy.acceptForm.title}</h3>
        <p style={{ fontSize: 12, color: 'var(--wk-text-muted)' }}>{copy.acceptForm.pricesExcludeVat}</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
          <Field label={copy.acceptForm.legalName} value={values.legalName} onChange={(v) => set('legalName', v)} required />
          <Field
            label={copy.acceptForm.billingAddress}
            value={values.billingAddress}
            onChange={(v) => set('billingAddress', v)}
            required
          />
          <Field label={copy.acceptForm.vatNumber} value={values.vatNumber} onChange={(v) => set('vatNumber', v)} />
          <Field
            label={copy.acceptForm.billingContactName}
            value={values.billingContactName}
            onChange={(v) => set('billingContactName', v)}
            required
          />
          <Field
            label={copy.acceptForm.billingContactEmail}
            value={values.billingContactEmail}
            onChange={(v) => set('billingContactEmail', v)}
            type="email"
            required
          />
          <Field label={copy.acceptForm.signerName} value={values.signerName} onChange={(v) => set('signerName', v)} required />
          <Field label={copy.acceptForm.signerRole} value={values.signerRole} onChange={(v) => set('signerRole', v)} required />
          <Field
            label={copy.acceptForm.purchaseOrderReference}
            value={values.purchaseOrderReference}
            onChange={(v) => set('purchaseOrderReference', v)}
          />
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
          <button
            type="button"
            className="wk-btn wk-btn-primary"
            disabled={!canSubmit || submitting}
            onClick={() => onSubmit(values)}
          >
            {submitting ? '…' : copy.acceptForm.submit}
          </button>
          <button type="button" className="wk-btn wk-btn-ghost" onClick={onCancel} disabled={submitting}>
            ✕
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
