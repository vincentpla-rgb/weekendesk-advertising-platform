'use client';

import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { useI18n } from '@/lib/i18n-internal';

/**
 * Cabecera de la app interna. Logo blanco sobre el fondo azul marino de
 * `.wk-header` (CLAUDE.md §2, ronda 2 — sustituye al texto "Weekendesk
 * Advertising"), enlaces de navegación e idioma de interfaz, y salir.
 */
export function InternalHeader({
  displayName,
}: {
  displayName: string;
}) {
  const { t } = useI18n();

  return (
    <header className="wk-header">
      <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
        <a href="/proposals/new" style={{ display: 'flex', alignItems: 'center' }}>
          <img src="/LOGO_Weekendesk_white.png" alt={t('app.title')} style={{ height: 22, width: 'auto' }} />
        </a>
        <nav style={{ display: 'flex', gap: 16 }}>
          <a href="/proposals/new" style={{ fontSize: 13, fontWeight: 500 }}>
            {t('nav.newProposal')}
          </a>
          <a href="/admin/users" style={{ fontSize: 13, fontWeight: 500 }}>
            {t('nav.admin')}
          </a>
        </nav>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 13 }}>
        <LanguageSwitcher dark />
        <span style={{ opacity: 0.85 }}>{displayName}</span>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="wk-btn wk-btn-ghost"
            style={{ color: '#fff', padding: '4px 8px' }}
          >
            {t('header.signOut')}
          </button>
        </form>
      </div>
    </header>
  );
}
