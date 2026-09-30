'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { changePassword } from './actions';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { useI18n } from '@/lib/i18n-internal';

/**
 * Cambio de contraseña obligatorio en el primer login (CLAUDE.md §2, §10.3,
 * ronda 15) — ver `./actions.ts` para el porqué (ajuste de seguridad: el
 * admin no debe seguir "conociendo" la contraseña de otra persona una vez
 * que esa persona ya entró, y todo ocurre en la sesión ya autenticada, sin
 * ningún email de por medio).
 */
export default function ChangePasswordPage() {
  const router = useRouter();
  const { t } = useI18n();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError(t('changePassword.mismatchError'));
      return;
    }

    setSubmitting(true);
    const result = await changePassword(password);

    if (!result.ok) {
      setError(result.error);
      setSubmitting(false);
      return;
    }

    const next = new URLSearchParams(window.location.search).get('next') ?? '/proposals/new';
    router.push(next);
    router.refresh();
  }

  return (
    <div className="wk-shell" style={{ maxWidth: 400, marginTop: 80 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <img src="/LOGO_Weekendesk_color.png" alt={t('app.title')} style={{ height: 26, width: 'auto' }} />
        <LanguageSwitcher />
      </div>
      <div className="wk-card">
        <h1 style={{ marginTop: 0, fontSize: 20 }}>{t('changePassword.title')}</h1>
        <p style={{ color: 'var(--wk-text-muted)', fontSize: 13, marginBottom: 18 }}>
          {t('changePassword.subtitle')}
        </p>

        <form onSubmit={handleSubmit}>
          <label className="wk-label" htmlFor="new-password">
            {t('changePassword.newPassword')}
          </label>
          <input
            id="new-password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="wk-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ marginBottom: 12 }}
          />

          <label className="wk-label" htmlFor="confirm-password">
            {t('changePassword.confirmPassword')}
          </label>
          <input
            id="confirm-password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="wk-input"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            style={{ marginBottom: 12 }}
          />

          {error && (
            <div className="wk-alert wk-alert-danger" style={{ marginBottom: 12 }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            className="wk-btn wk-btn-primary"
            disabled={submitting}
            style={{ width: '100%', justifyContent: 'center' }}
          >
            {submitting ? t('changePassword.submitting') : t('changePassword.submit')}
          </button>
        </form>
      </div>
    </div>
  );
}
