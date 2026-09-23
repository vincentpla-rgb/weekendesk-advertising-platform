'use client';

import { useState } from 'react';

import { useI18n } from '@/lib/i18n-internal';
import { createTeamUser, removeTeamUser } from './actions';

export interface TeamUserRow {
  readonly email: string;
  readonly fullName: string | null;
  readonly note: string | null;
  /** true si ya existe `profiles` (ha entrado al menos una vez). */
  readonly hasSignedIn: boolean;
  readonly isActive: boolean | null;
}

function generatePassword(): string {
  // Suficiente para una contraseña inicial que se comunica a mano y se puede
  // cambiar luego desde Supabase (Authentication > Users): no hace falta un
  // generador criptográfico dedicado, solo algo largo e impredecible.
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 16);
}

export function AdminUsersClient({ users }: { users: readonly TeamUserRow[] }) {
  const { t } = useI18n();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [removingEmail, setRemovingEmail] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setNotice(null);

    const result = await createTeamUser({ email, fullName, password, note });

    if (!result.ok) {
      setError(result.error);
      setSubmitting(false);
      return;
    }

    setNotice(
      result.alreadyExisted ? t('admin.onlyAllowedEmailNotice') : t('admin.createdPasswordNotice'),
    );
    setFullName('');
    setEmail('');
    setPassword('');
    setNote('');
    setSubmitting(false);
  }

  async function handleRemove(targetEmail: string) {
    setRemovingEmail(targetEmail);
    setError(null);
    const result = await removeTeamUser(targetEmail);
    if (!result.ok) {
      setError(result.error);
    }
    setRemovingEmail(null);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <h1>{t('admin.title')}</h1>
      <p style={{ color: 'var(--wk-text-muted)', maxWidth: 640 }}>{t('admin.subtitle')}</p>

      <section className="wk-card" style={{ maxWidth: 480 }}>
        <form onSubmit={handleCreate}>
          <label className="wk-label">{t('admin.fullName')}</label>
          <input
            className="wk-input"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            style={{ marginBottom: 10 }}
          />

          <label className="wk-label">{t('admin.email')}</label>
          <input
            className="wk-input"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="remi.challal@weekendesk.fr"
            style={{ marginBottom: 10 }}
          />

          <label className="wk-label">{t('admin.password')}</label>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            <input
              className="wk-input"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              className="wk-btn wk-btn-secondary"
              onClick={() => setPassword(generatePassword())}
            >
              {t('admin.generatePassword')}
            </button>
          </div>

          <label className="wk-label">{t('admin.note')}</label>
          <input
            className="wk-input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            style={{ marginBottom: 14 }}
          />

          {error && (
            <div className="wk-alert wk-alert-danger" style={{ marginBottom: 12 }}>
              {error}
            </div>
          )}
          {notice && (
            <div className="wk-alert wk-alert-info" style={{ marginBottom: 12 }}>
              {notice}
            </div>
          )}

          <button type="submit" className="wk-btn wk-btn-primary" disabled={submitting}>
            {submitting ? t('admin.creating') : t('admin.create')}
          </button>
        </form>
      </section>

      <section className="wk-card">
        <h3>{t('admin.existingTitle')}</h3>
        <table className="wk-table">
          <thead>
            <tr>
              <th>{t('admin.colEmail')}</th>
              <th>{t('admin.colName')}</th>
              <th>{t('admin.colStatus')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.email}>
                <td>{u.email}</td>
                <td>{u.fullName ?? '—'}</td>
                <td>
                  <span
                    className={`wk-badge ${u.hasSignedIn && u.isActive ? 'wk-badge-success' : 'wk-badge-neutral'}`}
                  >
                    {u.hasSignedIn ? t('admin.statusActive') : t('admin.statusPending')}
                  </span>
                </td>
                <td>
                  <button
                    type="button"
                    className="wk-btn wk-btn-ghost"
                    disabled={removingEmail === u.email}
                    onClick={() => handleRemove(u.email)}
                  >
                    {t('admin.remove')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
