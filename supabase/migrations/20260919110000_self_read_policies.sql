-- =============================================================================
-- Lectura de la propia fila en profiles/allowed_emails, sin pasar por
-- is_team_member() (CLAUDE.md §10.3).
--
-- team_all (initial_schema.sql) ya da acceso de equipo una vez
-- is_team_member() es verdadero. is_team_member() puede ver la fila de
-- profiles del propio usuario aunque esa tabla tenga RLS, porque es
-- SECURITY DEFINER y su consulta interna no pasa por las políticas — así
-- que un miembro de equipo YA ACTIVO (profiles.is_active = true) nunca
-- estuvo bloqueado para leer su propia fila con su propia sesión: verificado
-- contra un PostgreSQL 16 real, sin esta migración, is_team_member() ya
-- devuelve true y team_all ya deja pasar la lectura.
--
-- El caso real que sí queda bloqueado sin esta migración es un usuario
-- recién creado en Supabase Auth que **todavía no tiene fila en profiles**:
-- is_team_member() da false para él, así que team_all le cierra tanto
-- profiles como allowed_emails con su propia sesión — ni siquiera puede ver
-- su propia fila de allowed_emails para saber si está autorizado. Por eso
-- app/login/actions.ts (loginWithPassword) usa la clave de servicio
-- (lib/supabase/team-access.ts, resolveTeamAccess) para esa comprobación,
-- no la sesión del usuario: la clave de servicio bypassa RLS por completo y
-- no depende de esta política en absoluto.
--
-- Esta migración es una defensa en profundidad para cualquier código —
-- actual o futuro — que consulte estas dos tablas con la sesión del propio
-- usuario en vez de con la clave de servicio (p. ej. una futura pantalla de
-- "mi cuenta"). No sustituye ni afecta a la comprobación de acceso del
-- login, que sigue pasando por la clave de servicio.
-- =============================================================================

create policy self_read_profile on profiles for select
  to authenticated
  using (id = auth.uid());

create policy self_read_allowed_email on allowed_emails for select
  to authenticated
  using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));
