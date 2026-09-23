# weekendesk-advertising-platform

Plataforma publicitaria de Weekendesk: calculadora de precios, construcción de
presupuestos y seguimiento comercial.

**La especificación completa está en [`CLAUDE.md`](./CLAUDE.md).** Es la fuente de
verdad del proyecto: cifras, reglas de cálculo, estados y controles. Cuando algo
no esté ahí, preguntar antes de inventar.

## Estado

| Módulo | Ruta | Estado |
|---|---|---|
| Esquema PostgreSQL / Supabase | `supabase/migrations/` | Hecho |
| Motor de precios | `src/pricing/` | Hecho |
| Envío de email real (Resend) | `app/api/proposals/`, `lib/email/` | Hecho — presupuesto al cliente |
| Login | `app/login/` | Hecho — email + contraseña, no magic link (ver CLAUDE.md §10.3) |
| Alta de usuarios del equipo | `app/(internal)/admin/users/` | Hecho — crea el usuario en Supabase Auth y lo añade a `allowed_emails` desde la app (CLAUDE.md §10.3 bis) |
| Tests unitarios | `src/pricing/__tests__/`, `lib/**/*.test.ts`, `app/**/*.test.ts` | Hecho + scripts/verify-rls-self-read.sh (contra PostgreSQL 16 real) — `npm test` para el número actual |
| Interfaz (Next.js) | `app/`, `lib/`, `components/` | Hecho — 4 pantallas del MVP, interfaz interna en ES/FR/EN (`lib/i18n-internal.tsx`) |

Ver CLAUDE.md §10 para el detalle de qué pantallas existen y qué queda
explícitamente fuera de esta pasada (dashboard, contrapropuesta, forzar
bloqueos, gestión de cuentas como CRM propio).

## Desarrollo

```bash
npm install
npm test          # vitest — motor de precios
npm run typecheck # tsc --noEmit — todo el proyecto, motor + app
npm run build     # next build
npm run dev       # next dev
```

### Base de datos

Las migraciones de `supabase/migrations/` se aplican en orden alfabético (por
fecha en el nombre), con la CLI de Supabase (`supabase db push`) o con `psql`.
Verificadas ejecutándolas contra un PostgreSQL 16 real, no solo por sintaxis.

1. `..._initial_schema.sql` — esquema, RLS, funciones de fecha
2. `..._public_proposal_access.sql` — lectura pública (`get_public_proposal`)
3. `..._seed_reference_data.sql` — catálogo y parámetros, estado inicial editable
4. `..._market_holidays.sql` — tabla de festivos
5. `..._seed_market_holidays.sql` — festivos FR/ES/IT/BE-FR/BE-NL 2026-2027
6. `..._create_and_send_proposal.sql` — creación atómica de presupuestos, aceptación y rechazo públicos
7. `..._grants.sql` — privilegios de tabla explícitos para `authenticated`
8. `..._allowed_emails_full_name.sql` — nombre opcional en la lista blanca, para el `profiles` que se autoprovisiona en el primer login (ver `lib/supabase/team-access.ts`)
9. `..._email_send.sql` — separa "crear el presupuesto" de "marcarlo enviado": `create_and_send_proposal` ahora deja el envío en `DRAFT`, y `mark_proposal_sent` / `log_proposal_send_failure` lo confirman o registran el fallo según la respuesta de Resend (ver `app/api/proposals/route.ts`)
10. `..._self_read_policies.sql` — permite a un usuario autenticado leer su propia fila de `profiles` y de `allowed_emails` sin pasar por `is_team_member()` (defensa en profundidad, CLAUDE.md §10.3; `loginWithPassword` no depende de ella, sigue usando la clave de servicio)
11. `..._service_role_grants.sql` — **bloqueante para el login en producción**: concede a `service_role` los privilegios de tabla que `grants.sql` (punto 7) ya concedía a `authenticated`. Sin esta migración, `service_role` da `permission denied for table allowed_emails` (un error de GRANT, no de RLS) y el login siempre deniega el acceso aunque las filas sean correctas. Ver CLAUDE.md §10.3
12. `..._option_level_campaign.sql` — mueve `campaign_start`/`campaign_end` de `proposals` a `proposal_options` (cada opción tiene su propio periodo, CLAUDE.md §5.1) y añade `markets`, `campaign_duration_count`/`campaign_duration_unit` (modo "solo duración", §5.3 bis)
13. `..._create_and_send_proposal_v2.sql` — `create_and_send_proposal` persiste mercados y fechas por opción; deja de escribir en `availability_checks` (el check manual de disponibilidad se quita de la app, §5.3, ronda 2)
14. `..._public_proposal_access_v2.sql` — `get_public_proposal` devuelve mercados, fechas y duración por opción en vez de un único periodo de envío
15. `..._accepted_availability_conflict.sql` — regla de disponibilidad real (CLAUDE.md §3, ronda 3): `create_and_send_proposal` y `accept_public_proposal` bloquean si un soporte, en su mercado y fechas, choca con un presupuesto ya `ACCEPTED` de otro cliente. Solo mira lo ya aceptado — nunca borradores ni envíos sin respuesta

**Aplicar los puntos 10 a 15 en el proyecto Supabase real** (dashboard SQL
editor o `supabase db push`) — hacer `git push`/desplegar en Vercel no
aplica migraciones de base de datos por sí solo, son dos pasos
independientes.

`scripts/verify-rls-self-read.sh` reproduce y verifica, contra un
PostgreSQL 16 real (crea y borra su propia base de datos de prueba), los dos
bugs de acceso de los puntos 10 y 11: sin el punto 11, `service_role` no
puede leer `allowed_emails` (`permission denied for table`); sin el punto
10, un usuario recién creado no puede leer su propia fila con su propia
sesión. Con ambas migraciones aplicadas, los dos casos funcionan, y sin que
nadie vea filas ajenas. Ejecutar con `bash scripts/verify-rls-self-read.sh`.

`scripts/verify-accepted-availability.sh` reproduce y verifica, contra un
PostgreSQL 16 real, la regla de disponibilidad del punto 15: dos envíos de
cuentas distintas con el mismo soporte/mercado/fechas coexisten sin
bloqueo; uno nuevo que choca con un `ACCEPTED` de otra cuenta no se puede
enviar; la misma cuenta que el ya aceptado sí puede enviar otro para el
mismo hueco; y, en la carrera entre dos envíos que compiten por el mismo
hueco, el segundo en aceptar choca contra el primero. Ejecutar con
`bash scripts/verify-accepted-availability.sh`.

### Variables de entorno

```bash
cp .env.example .env.local
```

Rellenar con la URL y la clave anon de un proyecto Supabase real (Project
Settings > API). Sin proyecto conectado, `npm run build` funciona igual (las
páginas que necesitan datos son dinámicas, no se generan en build), pero
`npm run dev` no podrá leer ni escribir nada.

`lib/supabase/database.types.ts` está escrito a mano a partir de las
migraciones (no hay proyecto Supabase vivo en este entorno de desarrollo para
generarlo). Al crear el proyecto real, regenerar con:

```bash
supabase gen types typescript --project-id <id> > lib/supabase/database.types.ts
```

y revisar que coincide con lo que espera el resto del código — sobre todo las
funciones `Functions` (`create_and_send_proposal`, `get_public_proposal`,
`accept_public_proposal`, `reject_public_proposal`, `mark_public_proposal_viewed`,
`mark_proposal_sent`, `log_proposal_send_failure`).

### Login: email y contraseña, no magic link

El login del equipo usa `supabase.auth.signInWithPassword` (`app/login/`),
comprobando la lista blanca (`allowed_emails`) en el mismo paso
(`app/login/actions.ts`). Se probó primero un magic link enviado por Resend
vía un "Send Email Hook" de Supabase Auth, y se abandonó tras dos días de
bucle en producción: el rastreador de clics de Resend consumía el token de
un solo uso antes de que la persona lo abriera, y eso no se puede desactivar
en el dominio de pruebas de Resend. El detalle completo está en
**CLAUDE.md §10.3** — es la fuente de verdad de esta decisión.

Sin registro público (los usuarios los da de alta un administrador en
Authentication > Users del dashboard de Supabase, además de añadirlos a
`allowed_emails`) ni recuperación de contraseña por email en esta versión.

El código del magic link (`app/api/auth/send-email/`, `app/auth/confirm/`,
`lib/supabase/login-redirect.ts`, `lib/email/magic-link-email.ts`,
`lib/email/confirm-url.ts`) se queda en el repo sin usar, por si se recupera
más adelante — `app/auth/callback/` sigue siendo una ruta válida (el canje
PKCE no cambió), simplemente nada genera ya un enlace hacia ella.

### Email (Resend) para el envío de presupuestos

`RESEND_API_KEY` ya está configurada en Vercel. Además hace falta
`RESEND_FROM_EMAIL` — remitente de los emails de presupuesto, con nombre
visible. Dominio de pruebas de Resend por ahora (`onboarding@resend.dev`);
el dominio propio llegará más adelante y solo hará falta cambiar esta
variable. `SEND_EMAIL_HOOK_SECRET` sigue documentada en `.env.example` por
si se recupera el magic link, pero no hace falta configurarla mientras el
login sea por contraseña.

## Cómo está organizado el motor

`src/pricing/` es puro: no toca la base de datos. Recibe el juego de parámetros
y el catálogo, y devuelve el cálculo con su traza.

| Fichero | Qué hace |
|---|---|
| `money.ts` | Aritmética en céntimos enteros, suelo de margen, reparto a prorrata |
| `types.ts` | Tipos de entrada y salida |
| `parameters.ts` | Parámetros iniciales (35 €/h, 50 %, coeficientes, escalas) |
| `catalog.ts` | Los 19 soportes del rate card |
| `engine.ts` | Coste, multimercado, suelo, media buy, descuentos |
| `reach.ts` | Audiencia: sin dato medido, valor nulo |
| `checks.ts` | Controles previos al envío, festivos por mercado incluidos, antelación no verificable en modo "solo duración" (§5.3 bis) |
| `fiscal.ts` | Año fiscal mayo–abril |
| `holidays.ts` | Festivos nacionales FR/ES/IT/BE-FR/BE-NL 2026-2027 |
| `duration.ts` | Conversión periodo de fechas → semanas/meses; alimenta la cantidad sugerida de una línea (CLAUDE.md §5.3 bis, ronda 2) |

## Cómo está organizada la app

- `app/(internal)/proposals/new/` — creación de presupuesto (requiere sesión). Cada opción elige sus propios mercados y su propio periodo (fechas o solo duración) — CLAUDE.md §4.2/§5.3 bis, ronda 2
- `app/(internal)/admin/users/` — alta y baja de usuarios del equipo (Supabase Auth + `allowed_emails` en un paso, ronda 2)
- `app/p/[token]/` — pantalla pública comparativa + aceptación + rechazo
- `app/api/proposals/` — crea un presupuesto, lo manda por email con Resend y solo entonces lo marca `SENT`
- `app/api/public/proposals/[token]/{accept,reject}/` — flujo público
- `app/login/` + `app/login/actions.ts` — login con email y contraseña; `loginWithPassword` autentica y comprueba la lista blanca en el mismo paso
- `app/api/auth/send-email/`, `app/auth/confirm/`, `lib/supabase/login-redirect.ts`, `lib/email/magic-link-email.ts`, `lib/email/confirm-url.ts` — infraestructura del magic link, sin usar desde que el login pasó a contraseña (CLAUDE.md §10.3); `app/auth/callback/` sigue activa como ruta de vuelta del canje PKCE, aunque nada la invoca ya
- `lib/pricing-context.ts` — puente entre las tablas de Supabase y el motor puro
- `lib/vies.ts` — verificación VIES (llamada de servidor, la función SQL no tiene salida de red)
- `lib/i18n.ts` — textos de la pantalla pública en el idioma DEL CLIENTE (mención de IVA incluida) — no confundir con `lib/i18n-internal.tsx`, el idioma de la INTERFAZ del equipo (ES/FR/EN, preferencia de navegador, ronda 2)
- `lib/countries.ts` — lista de países ISO-2 para el desplegable de "País" al crear una cuenta (ronda 2, sustituye al texto libre)
- `lib/email/` — contenido de los emails (presupuesto, magic link), cliente de Resend y verificación de firma del webhook — todo puro salvo `resend-client.ts`, que hace la llamada HTTP
- `lib/email/templates/` — una plantilla por idioma del email de presupuesto (`proposal-email.<idioma>.ts`), separada de la lógica de envío para poder retocar el texto sin tocarla

**Ningún precio que ve el cliente se calcula en el navegador y se guarda tal
cual.** El navegador solo usa el motor para la vista previa en vivo; al
enviar, el servidor recibe los datos crudos y recalcula con los parámetros
vivos de la base de datos antes de persistir nada.
