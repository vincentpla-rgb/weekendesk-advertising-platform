'use client';

import { useEffect } from 'react';

import { useI18n, hasExplicitStoredLanguage, type InternalLanguage } from '@/lib/i18n-internal';

/**
 * Semilla del idioma de interfaz por defecto (CLAUDE.md, ronda 17, bloque 3,
 * punto 9-b): en el primer render de esta persona EN ESTE NAVEGADOR (sin
 * ninguna preferencia ya guardada en `localStorage`), aplica
 * `profiles.preferred_language`, elegido al invitarla. Nunca sobrescribe una
 * preferencia ya guardada — `hasExplicitStoredLanguage()` es la comprobación
 * que lo garantiza, distinta de simplemente leer `language` del contexto
 * (que siempre trae un valor usable, 'ES' de por defecto, y no distingue
 * "nunca se eligió nada" de "se eligió ES a propósito").
 *
 * Renderizado sin más marcado (`return null`) desde `(internal)/layout.tsx`,
 * dentro de `InternalI18nProvider` (montado en la raíz, `app/layout.tsx`) —
 * este componente solo necesita el contexto, no aporta nada visual.
 */
export function PreferredLanguageSeed({ preferredLanguage }: { preferredLanguage: InternalLanguage | null }) {
  const { setLanguage } = useI18n();

  useEffect(() => {
    if (preferredLanguage && !hasExplicitStoredLanguage()) {
      setLanguage(preferredLanguage);
    }
    // Solo al montar: una vez sembrado (o si ya había preferencia), no hay
    // nada más que hacer en esta sesión de navegador.
  }, []);

  return null;
}
