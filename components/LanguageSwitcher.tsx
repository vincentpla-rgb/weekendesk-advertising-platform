'use client';

import { INTERNAL_LANGUAGES, INTERNAL_LANGUAGE_LABELS, useI18n } from '@/lib/i18n-internal';

/** Selector visible del idioma de la INTERFAZ (CLAUDE.md §2, ronda 2) — no confundir con el idioma del cliente (§5.6, §6), que se elige por presupuesto. */
export function LanguageSwitcher({ dark = false }: { dark?: boolean }) {
  const { language, setLanguage } = useI18n();

  return (
    <select
      aria-label="Idioma de la interfaz / Interface language / Langue de l'interface"
      value={language}
      onChange={(e) => setLanguage(e.target.value as (typeof INTERNAL_LANGUAGES)[number])}
      style={{
        background: dark ? 'rgba(255,255,255,0.12)' : 'var(--wk-surface)',
        color: dark ? '#fff' : 'var(--wk-text)',
        border: `1px solid ${dark ? 'rgba(255,255,255,0.3)' : 'var(--wk-border)'}`,
        borderRadius: 8,
        padding: '4px 8px',
        fontSize: 13,
        fontFamily: 'inherit',
      }}
    >
      {INTERNAL_LANGUAGES.map((l) => (
        <option key={l} value={l} style={{ color: '#000' }}>
          {INTERNAL_LANGUAGE_LABELS[l]}
        </option>
      ))}
    </select>
  );
}
