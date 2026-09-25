'use client';

import { useState } from 'react';

import { useI18n, type I18nKey } from '@/lib/i18n-internal';
import type { EmailContent } from '@/lib/email/proposal-email';

/**
 * Vista previa del email de envío, sin enviarlo (CLAUDE.md §10.3 duodecies,
 * ronda 12): un modal que renderiza un `EmailContent` ya construido por
 * `buildProposalEmailContent` (mismo motor que el envío real, con datos de
 * borrador sin guardar o de un DRAFT ya persistido según el llamante) —
 * este componente solo pinta, no calcula nada.
 *
 * `noticeKey` es lo único que cambia según el contexto (CLAUDE.md §10.3 ter
 * decies, ronda 13): en el creador (`/proposals/new`), el enlace y el
 * número son marcadores de posición (aviso por defecto); en el detalle de
 * un DRAFT ya persistido (`/proposals/[id]`), ya son los reales.
 */
export function EmailPreviewModal({
  content,
  onClose,
  noticeKey = 'proposalBuilder.previewEmailPlaceholderNotice',
}: {
  content: EmailContent;
  onClose: () => void;
  noticeKey?: I18nKey;
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState<'text' | 'html'>('html');

  return (
    <div
      className="wk-modal-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="wk-modal" role="dialog" aria-modal="true" aria-label={t('proposalBuilder.previewEmailModalTitle')}>
        <div className="wk-modal-header">
          <h3 style={{ margin: 0 }}>{t('proposalBuilder.previewEmailModalTitle')}</h3>
          <button type="button" className="wk-btn wk-btn-ghost" onClick={onClose}>
            {t('proposalBuilder.previewEmailClose')}
          </button>
        </div>

        <p className="wk-alert wk-alert-info" style={{ margin: '0 0 12px' }}>
          {t(noticeKey)}
        </p>

        <div style={{ marginBottom: 8 }}>
          <span className="wk-label" style={{ display: 'inline', textTransform: 'none', fontSize: 13 }}>
            {t('proposalBuilder.previewEmailSubject')}:{' '}
          </span>
          <strong>{content.subject}</strong>
        </div>

        <div className="wk-modal-tabs">
          <button
            type="button"
            className={`wk-modal-tab${tab === 'html' ? ' wk-modal-tab-active' : ''}`}
            onClick={() => setTab('html')}
          >
            {t('proposalBuilder.previewEmailTabHtml')}
          </button>
          <button
            type="button"
            className={`wk-modal-tab${tab === 'text' ? ' wk-modal-tab-active' : ''}`}
            onClick={() => setTab('text')}
          >
            {t('proposalBuilder.previewEmailTabText')}
          </button>
        </div>

        {tab === 'html' ? (
          <iframe
            title={t('proposalBuilder.previewEmailModalTitle')}
            srcDoc={content.html}
            sandbox=""
            style={{
              width: '100%',
              height: 420,
              border: '1px solid var(--wk-border)',
              borderRadius: 8,
              background: '#fff',
            }}
          />
        ) : (
          <pre className="wk-modal-pre">{content.text}</pre>
        )}
      </div>
    </div>
  );
}
