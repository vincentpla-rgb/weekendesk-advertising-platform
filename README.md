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
| Envío de email real (Resend) | `app/api/proposals/`, `lib/email/` | Hecho — presupuesto al cliente y magic link del equipo |
| Tests unitarios | `src/pricing/__tests__/`, `lib/**/*.test.ts` | Hecho — 135 tests |
| Interfaz (Next.js) | `app/`, `lib/`, `components/` | Hecho — 3 pantallas del MVP |

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

### Email (Resend) y magic link del equipo

`RESEND_API_KEY` ya está configurada en Vercel. Además hace falta:

- `RESEND_FROM_EMAIL` — remitente de todos los emails salientes (presupuestos
  y magic link), con nombre visible. Dominio de pruebas de Resend por ahora
  (`onboarding@resend.dev`); el dominio propio llegará más adelante y solo
  hará falta cambiar esta variable.
- `SEND_EMAIL_HOOK_SECRET` — secreto del "Send Email Hook" de Supabase Auth
  (Authentication > Hooks > Send Email, en el dashboard del proyecto),
  apuntando a `/api/auth/send-email`. Sustituye el SMTP de pruebas de
  Supabase (límite de 4 correos/hora) para el magic link del equipo.

**El "Send Email Hook" no está activo en el proyecto real todavía** (es una
configuración del dashboard de Supabase, no de este repo). Hasta que se
active, Supabase manda su propio email con su plantilla por defecto, y la
vuelta real en producción es siempre `/auth/callback?code=...` (PKCE) —
`emailRedirectTo` (`lib/supabase/login-redirect.ts`) apunta siempre ahí,
nunca directo a la página destino: apuntar directo fue un bug real (el
enlace se quedaba en `otp_expired` sin crear sesión nunca, porque el código
PKCE no se llegaba a canjear). Si el hook se activa algún día, la vuelta pasa
a ser `/auth/confirm` (`token_hash` + `verifyOtp`) en vez de `/auth/callback`
— ambas rutas comparten la comprobación de lista blanca
(`lib/supabase/authorize-session.ts`).

No verificado contra un hook real de Supabase en este entorno de desarrollo
(sin proyecto conectado, ver más abajo): la forma del payload sigue la
documentación de Supabase Auth Hooks. Conviene una prueba manual tras
configurar el hook en el proyecto real.

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
| `checks.ts` | Controles previos al envío, festivos por mercado incluidos |
| `fiscal.ts` | Año fiscal mayo–abril |
| `holidays.ts` | Festivos nacionales FR/ES/IT/BE-FR/BE-NL 2026-2027 |

## Cómo está organizada la app

- `app/(internal)/proposals/new/` — creación de presupuesto (requiere sesión)
- `app/p/[token]/` — pantalla pública comparativa + aceptación + rechazo
- `app/api/proposals/` — crea un presupuesto, lo manda por email con Resend y solo entonces lo marca `SENT`
- `app/api/public/proposals/[token]/{accept,reject}/` — flujo público
- `app/api/auth/send-email/` — "Send Email Hook" de Supabase Auth: manda el magic link del equipo por Resend (no activo en el proyecto real todavía, ver más abajo)
- `app/auth/callback/` — vuelta real del magic link hoy (`code` + `exchangeCodeForSession`); `app/auth/confirm/` es la vuelta que usaría el hook (`token_hash` + `verifyOtp`) si se activa
- `lib/supabase/login-redirect.ts` — construye la URL de `emailRedirectTo`, siempre hacia `/auth/callback`
- `lib/pricing-context.ts` — puente entre las tablas de Supabase y el motor puro
- `lib/vies.ts` — verificación VIES (llamada de servidor, la función SQL no tiene salida de red)
- `lib/i18n.ts` — textos de la pantalla pública en el idioma del cliente (mención de IVA incluida)
- `lib/email/` — contenido de los emails (presupuesto, magic link), cliente de Resend y verificación de firma del webhook — todo puro salvo `resend-client.ts`, que hace la llamada HTTP
- `lib/email/templates/` — una plantilla por idioma del email de presupuesto (`proposal-email.<idioma>.ts`), separada de la lógica de envío para poder retocar el texto sin tocarla

**Ningún precio que ve el cliente se calcula en el navegador y se guarda tal
cual.** El navegador solo usa el motor para la vista previa en vivo; al
enviar, el servidor recibe los datos crudos y recalcula con los parámetros
vivos de la base de datos antes de persistir nada.
