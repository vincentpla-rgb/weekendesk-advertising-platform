-- =============================================================================
-- Nombre opcional en la lista blanca.
--
-- /auth/callback crea automáticamente el `profiles` que falte en el primer
-- login de un email de `allowed_emails` (lib/supabase/team-access.ts).
-- `profiles.full_name` es NOT NULL, así que hace falta un valor: si quien da
-- de alta a alguien conoce su nombre, se guarda aquí y se usa tal cual; si no,
-- se deriva del email (p.ej. "vincent.pla" -> "Vincent Pla") como valor
-- provisional, corregible a mano después.
-- =============================================================================

alter table allowed_emails add column full_name text;
