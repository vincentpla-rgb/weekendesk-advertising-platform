-- =============================================================================
-- Ronda 17 (CLAUDE.md, bloque 3): idioma al invitar a un usuario del equipo.
--
-- Dos columnas nuevas, una en cada tabla que ya interviene en el alta de un
-- acceso (`app/(internal)/admin/users/actions.ts`, `createTeamUser`):
--
--   allowed_emails.invite_language: el idioma elegido por quien da de alta el
--   acceso, en el momento de darlo — `profiles` todavía no existe en ese
--   instante (se crea en el primer login, `resolveTeamAccess`,
--   `lib/supabase/team-access.ts`), así que no hay otro sitio donde guardarlo
--   hasta entonces. Nullable: los accesos dados de alta ANTES de esta ronda
--   no tienen ningún idioma que copiar — se tratan como "sin preferencia",
--   nunca como un error.
--
--   profiles.preferred_language: el idioma de interfaz por defecto de esa
--   persona en sus siguientes logins (CLAUDE.md, ronda 17, bloque 3, punto
--   9-b). Se copia de `allowed_emails.invite_language` en el momento exacto
--   en que se crea el `profiles` que falta (mismo punto que ya provisiona
--   `full_name` desde `allowed_emails.full_name`, ronda 2) — ver
--   `lib/supabase/team-access.ts`, sin migración SQL adicional para ese
--   paso, es lógica de aplicación. Default 'ES': mismo valor por defecto que
--   ya usa la interfaz interna sin ninguna preferencia guardada
--   (`readStoredLanguage()`, `lib/i18n-internal.tsx`) — no 'EN', que es el
--   fallback de las plantillas DE CARA AL CLIENTE, un contexto distinto.
--
-- Restringido a los tres idiomas de la interfaz interna (ES/FR/EN,
-- `lib/i18n-internal.tsx`), nunca los 5 idiomas de cara al cliente
-- (`ContentLanguage` incluye IT/NL) — un miembro de equipo nunca ve la
-- interfaz interna en italiano o neerlandés hoy, así que permitir esos
-- valores aquí solo invitaría a un dato que ninguna pantalla sabría usar.
-- =============================================================================

alter table allowed_emails
  add column invite_language text check (invite_language is null or invite_language in ('ES', 'FR', 'EN'));

comment on column allowed_emails.invite_language is
  'Idioma elegido al dar de alta el acceso (ronda 17, bloque 3): decide el '
  'idioma del email de invitación (pendiente de bloque 2, sin plantilla '
  'todavía) y se copia a profiles.preferred_language en el primer login. '
  'NULL para los accesos dados de alta antes de esta ronda.';

alter table profiles
  add column preferred_language text not null default 'ES' check (preferred_language in ('ES', 'FR', 'EN'));

comment on column profiles.preferred_language is
  'Idioma de interfaz interna por defecto (ronda 17, bloque 3) — un punto de '
  'partida para lib/i18n-internal.tsx en el primer render de esta persona, '
  'nunca una fuente de verdad que sobrescriba una preferencia ya guardada '
  'en su localStorage. Copiado de allowed_emails.invite_language al '
  'aprovisionar el profiles que falta (lib/supabase/team-access.ts); '
  'default ES para cualquier profiles creado sin ese dato (alta manual por '
  'SQL/dashboard, o accesos de antes de esta ronda).';
