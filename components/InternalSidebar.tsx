'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { useI18n } from '@/lib/i18n-internal';

interface NavItem {
  readonly href: string;
  readonly labelKey: 'nav.dashboard' | 'nav.accountsList' | 'nav.targets' | 'nav.admin';
  readonly icon: string;
}

const NAV_ITEMS: readonly NavItem[] = [
  { href: '/dashboard', labelKey: 'nav.dashboard', icon: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>' },
  { href: '/accounts', labelKey: 'nav.accountsList', icon: '<path d="M4 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16M14 9h5a1 1 0 0 1 1 1v11M3 21h18M8 8h2M8 12h2M8 16h2"/>' },
  { href: '/admin/targets', labelKey: 'nav.targets', icon: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>' },
  { href: '/admin/users', labelKey: 'nav.admin', icon: '<path d="M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM20 20v-1.5a3.5 3.5 0 0 0-2.5-3.35M15.5 4.2a3.5 3.5 0 0 1 0 6.6"/>' },
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return parts.map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}

/**
 * Menú lateral del marco interno (CLAUDE.md §10.3, ronda 24) — sustituye a
 * `InternalHeader.tsx` (cabecera horizontal) en TODAS las pantallas internas,
 * siguiendo `docs/design/panel_mockup.html`. Mismas rutas y permisos que
 * antes (CLAUDE.md §9: Objetivos/Usuarios no están restringidos a admin
 * todavía) — solo cambia la forma, nunca a qué se puede llegar.
 *
 * El cajón móvil (<960px) se controla aquí con una clase en `document.body`
 * (`nav-open`), exactamente el mismo mecanismo que ya usaba la maqueta en
 * JS plano — las reglas de mostrar/ocultar siguen siendo CSS puro
 * (`@media (max-width:960px)`, `app/globals.css`).
 */
export function InternalSidebar({
  displayName,
  isAdmin,
}: {
  displayName: string;
  isAdmin: boolean;
}) {
  const { t } = useI18n();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    document.body.classList.toggle('nav-open', open);
    return () => document.body.classList.remove('nav-open');
  }, [open]);

  // Cerrar el cajón al navegar — la pestaña sigue siendo persistente dentro
  // del layout, así que sin esto el cajón se quedaría abierto tras el clic.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const nav = (
    <nav className="nav" aria-label={t('sidebar.navLabel')}>
      <span className="nav__label">{t('nav.sectionLabel')}</span>
      {NAV_ITEMS.map((item) => {
        const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
        return (
          <a key={item.href} href={item.href} aria-current={active ? 'page' : undefined}>
            <svg className="i" viewBox="0 0 24 24" dangerouslySetInnerHTML={{ __html: item.icon }} />
            {t(item.labelKey)}
          </a>
        );
      })}
    </nav>
  );

  const foot = (
    <div className="sidebar__foot">
      <label className="lang">
        <svg className="i sm" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
        </svg>
        <span className="sr-only">{t('sidebar.languageLabel')}</span>
        <LanguageSwitcher bare />
      </label>
      <div className="user">
        <span className="avatar" aria-hidden="true">
          {initials(displayName)}
        </span>
        <div>
          <div className="user__name">{displayName}</div>
          <div className="user__role">{isAdmin ? t('sidebar.roleAdmin') : t('sidebar.roleTeam')}</div>
        </div>
        <form action="/auth/signout" method="post" style={{ marginLeft: 'auto' }}>
          <button className="logout" type="submit" aria-label={t('header.signOut')} title={t('header.signOut')}>
            <svg className="i" viewBox="0 0 24 24">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <>
      <header className="topbar">
        <button type="button" aria-label={t('sidebar.openMenu')} onClick={() => setOpen(true)}>
          <svg className="i" viewBox="0 0 24 24">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <img alt={t('app.title')} src="/LOGO_Weekendesk_white.png" />
        <span style={{ width: 40 }} />
      </header>
      <div className="scrim" onClick={() => setOpen(false)} aria-hidden="true" />

      <aside className="sidebar" aria-label={t('sidebar.navLabel')}>
        <div className="brand">
          <a href="/dashboard" style={{ display: 'flex' }}>
            <img alt={t('app.title')} src="/LOGO_Weekendesk_white.png" />
          </a>
        </div>

        <a className="btn-primary block" href="/proposals/new">
          <svg className="i" viewBox="0 0 24 24">
            <path d="M12 5v14M5 12h14" />
          </svg>
          {t('nav.newProposal')}
        </a>

        {nav}
        {foot}
      </aside>
    </>
  );
}
