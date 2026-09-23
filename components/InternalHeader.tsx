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
        <a href="/proposals" style={{ display: 'flex', alignItems: 'center' }}>
          <img src="/LOGO_Weekendesk_white.png" alt={t('app.title')} style={{ height: 22, width: 'auto' }} />
        </a>
        {/* Navegación estructural (CLAUDE.md §10.1.1, ronda 7): antes solo
            existía la pantalla de crear presupuesto — sin forma de volver a
            ver lo ya enviado ni de navegar a las cuentas. */}
        <nav style={{ display: 'flex', gap: 16 }}>
          <a href="/proposals" style={{ fontSize: 13, fontWeight: 500 }}>
            {t('nav.proposalsList')}
          </a>
          <a href="/accounts" style={{ fontSize: 13, fontWeight: 500 }}>
            {t('nav.accountsList')}
          </a>
          <a href="/admin/users" style={{ fontSize: 13, fontWeight: 500 }}>
            {t('nav.admin')}
          </a>
        </nav>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 13 }}>
        {/* Siempre visible, no solo accesible desde /proposals/new (ronda 7). */}
        <a
          href="/proposals/new"
          className="wk-btn wk-btn-primary"
          style={{ padding: '6px 14px', fontSize: 13 }}
        >
          {t('nav.newProposal')}
        </a>
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
