# Plataforma Publicitaria Weekendesk — Especificación MVP

> Documento de referencia para Claude Code. Contiene todas las decisiones tomadas.
> Cuando algo no esté aquí, **preguntar antes de inventar**. No inventar cifras nunca.

---

## 0. Contexto

Weekendesk (plataforma de escapadas cortas, 5 mercados: FR, ES, IT, BE-FR, BE-NL) está creando una unidad de negocio publicitaria que vende espacios a anunciantes externos: oficinas de turismo, comités regionales, DMOs, city pass, agencias de medios.

Equipo: Vincent (Advertising Manager), Rémi Challal (Francia), Mario Martínez (España). Italia sin responsable asignado.

Objetivo de negocio: 150.000–200.000 € por año fiscal. El objetivo se reparte **por advertising manager y por quarter fiscal**, y varía cada quarter. Debe ser editable desde admin.

**Año fiscal: 1 de mayo – 30 de abril.**
- Q1 = mayo–julio · Q2 = agosto–octubre · Q3 = noviembre–enero · Q4 = febrero–abril
- Una campaña se imputa al quarter de su **fecha de firma**, no de ejecución.

Desarrollo en solitario, sin equipo técnico. Fecha objetivo del MVP: **martes**.

---

## 1. Alcance

### Dentro del MVP
- Calculadora de precios con las 19 líneas del rate card
- Construcción de presupuestos con 2–3 opciones comparables
- Soporte multimercado dentro de una misma opción
- Controles previos al envío (margen, antelación, VIES, disponibilidad)
- Envío mediante enlace único + email automático por Resend
- Pantalla pública comparativa para el cliente
- Aceptación con captura de datos fiscales y verificación VIES
- Rechazo con flujo de contrapropuesta
- Dashboard de seguimiento por persona y quarter fiscal

### Fuera del MVP (v2)
- Generación de PDF (solo tras aceptación, no en el primer email)
- Firma electrónica (Docusign — licencia ya disponible)
- Facturación y cobro
- Inventario y calendario real de disponibilidad
- Gestión de leads, enriquecimiento, Make
- Google SSO restringido a @weekendesk
- Traducción automática de textos

---

## 2. Stack

| Capa | Elección | Motivo |
|---|---|---|
| Framework | Next.js (App Router) | — |
| Base de datos | Supabase (PostgreSQL) | Sin proceso IT interno |
| Auth | Supabase Auth, email + contraseña + lista blanca de emails | Google SSO exige app interna en el Workspace = 1 semana de IT. El magic link se probó primero y se abandonó — ver más abajo y §10.3 |
| Email transaccional | Resend | Sin dominio propio de Weekendesk todavía; su dominio de pruebas no depende de IT |
| Hosting | Vercel (Hobby) | Deploy desde GitHub |
| Repo | GitHub | — |

**Restricción central del proyecto:** nada que dependa del proceso IT interno de Weekendesk (una semana). Eso excluye del MVP: Google SSO, dominio propio, DNS, API de Docusign, GCP, y **enviar desde una dirección `@weekendesk.fr` real** (necesitaría verificar ese dominio en Resend, que sí depende de DNS/IT).

El envío de email **sí es automático**: la aplicación manda el presupuesto directamente por Resend al aceptar "Enviar" — ya no es un borrador que el comercial abre y manda a mano. El remitente usa el dominio de pruebas de Resend (`onboarding@resend.dev`) con el nombre visible "Weekendesk Advertising", configurable por variable de entorno (`RESEND_FROM_EMAIL`) para poder pasar al dominio propio sin tocar código el día que esté verificado. El seguimiento de apertura lo sigue capturando la página pública, no el email. Si el envío de email falla, el presupuesto **no** queda marcado como enviado (ver §5.3 y §10.3). El contenido de ese email — plantilla por idioma, sin precios ni mención de IVA — está en §5.6.

**El login del equipo es email + contraseña, no magic link.** Se probó el magic link primero (por Resend, vía un "Send Email Hook" de Supabase Auth) y se abandonó tras dos días de bucle en producción sin arreglo posible desde este repo — el detalle completo está en §10.3. La infraestructura del magic link (`app/api/auth/send-email/`, `app/auth/confirm/`, `lib/supabase/login-redirect.ts`, `lib/email/magic-link-email.ts`, `lib/email/confirm-url.ts`) se deja en el código, sin usar, por si se recupera más adelante — nada la invoca desde `/login` hoy.

Con email + contraseña: **sin registro público** — los usuarios los da de alta un administrador desde el dashboard de Supabase (Authentication > Users), nunca desde la app. **Sin recuperación de contraseña por email en esta versión** — depender del correo para entrar es exactamente el problema que este cambio resuelve, así que no se reintroduce por la puerta de la recuperación. La lista blanca (`allowed_emails`) se sigue comprobando igual que con el magic link, en el mismo momento del login (`app/login/actions.ts`, `loginWithPassword`): si el email autenticado no está en ella, se cierra la sesión que Supabase acaba de abrir y se muestra un mensaje claro, sin dejar una sesión sin perfil de equipo.

Marca: Host Grotesk + Inter, rojo `#f8443a`, azul marino `#001c4d`.

---

## 3. Rate card — catálogo maestro

Fuente: fichero *ADVERTISING DEALS — GLOBAL OVERVIEW*, Google Drive.

### Parámetros del modelo (editables en admin)

| Parámetro | Valor | Nota |
|---|---|---|
| Tarifa hora interna cargada | **35 €/h** | Validado por Quentin Heliot (CFO) |
| Margen bruto mínimo | **50 %** | Regla de Quentin. Suelo duro por opción |
| Fee de gestión sobre media buy | 40 % | Sobre el presupuesto de medios |
| Fee mínimo mensual — Meta (ADS-01) | 1.200 € | |
| Fee mínimo mensual — Pmax (ADS-02) | 1.500 € | |
| Fee mínimo mensual — Display (ADS-03) | **sin dato** | Pendiente. Ver 4.4 |
| Fee mínimo mensual — Influencer (INF-01) | **sin dato** | Pendiente. Ver 4.4 |
| Coste de boost por publicación social | 100 € | Pendiente confirmar si varía por mercado |

El fichero original usa 50 €/h y 45 % de margen. **Están obsoletos: usar 35 €/h y 50 %.**

### Coeficientes de mercado

| Mercado | Coeficiente |
|---|---|
| FR | 1,00 |
| ES | 0,88 |
| BE-FR | 0,79 |
| BE-NL | 0,75 |
| IT | 0,74 |

### Catálogo (19 soportes)

`h_neg` = horas negocio · `h_dis` = horas diseño · `ext` = coste externo directo (€) · `ant` = antelación en días laborables · `precio` = precio base recomendado en índice FR.

| ID | Soporte | Canal | Unidad | h_neg | h_dis | ext | ant | precio |
|---|---|---|---|---|---|---|---|---|
| ON-01 | Marketing Block | Onsite | Semana | 2,0 | 2,0 | 0 | 15 | 430 |
| ON-02 | Targeted Banner | Onsite | Semana | 1,5 | 1,5 | 0 | 15 | 250 |
| ON-03 | Ribbon (todas las SERP) | Onsite | Semana | 1,5 | 1,5 | 0 | 15 | 500 |
| ON-04 | Landing page dedicada | Onsite | Campaña | 5,0 | 3,0 | 0 | 20 | 800 |
| CRM-01 | Newsletter exclusiva | CRM | Envío | 3,0 | 3,0 | 0 | 15 | 2000 |
| CRM-02 | Newsletter segmentada / geolocalizada | CRM | Envío | 4,0 | 2,0 | 0 | 15 | 950 |
| CRM-03 | Banner insertado en newsletter | CRM | Semana de inserción | 1,0 | 1,0 | 0 | 10 | 400 |
| CRM-04 | Push notification | CRM | Envío | 1,5 | 0,0 | 0 | 10 | 430 |
| CRM-05 | Emails de ciclo de vida | CRM | Mes | 1,5 | 1,5 | 0 | 20 | 450 |
| SOC-01 | Reel Instagram | Social | Unidad | 2,0 | 4,0 | 100 | 15 | 800 |
| SOC-02 | Story Instagram | Social | Unidad | 0,5 | 1,0 | 100 | 10 | 300 |
| SOC-03 | Post o carrusel | Social | Unidad | 1,0 | 2,0 | 100 | 10 | 430 |
| SOC-04 | Concurso o sorteo | Social | Unidad | 5,0 | 3,0 | 100 | 20 | 950 |
| SOC-05 | Video TikTok | Social | Unidad | 2,0 | 4,0 | 100 | 15 | 850 |
| ADS-01 | Campaña Meta patrocinada | Social Ads | Mes | 7,0 | 3,0 | 0 | 15 | 1850 |
| ADS-02 | Google Performance Max | Display / SEA | Mes | 10,0 | 0,0 | 0 | 15 | 2250 |
| ADS-03 | Display ads | Display / SEA | Mes | 7,0 | 3,0 | 0 | 15 | 1500 |
| CON-01 | Artículo de blog dedicado | Content | Unidad | 8,0 | 0,0 | 0 | 20 | 850 |
| INF-01 | Colaboración con influencer | Influencer | Colaboración | 8,0 | 2,0 | 0 | 30 | 2250 |

ADS-01, ADS-02, ADS-03 e INF-01 son **soportes de media buy**: su precio base es únicamente el fee mínimo. Ver sección 4.4.

SOC-05 (TikTok) solo está confirmado en FR. Marcar el resto de mercados como no vendibles hasta confirmación.

### Datos de reach

El reach se guarda por soporte y mercado. **Regla absoluta: si no hay dato medido, el valor es nulo y la fila no aparece en la pantalla del cliente.** Nunca cero, nunca estimado. Esta regla existe porque un cliente (Office de tourisme d'Amiens) rechazó una propuesta por citar cifras sin fuente.

Cada dato de reach guarda: valor, unidad, métrica (vistas de página / sesiones / usuarios únicos), fuente, fecha de medición.

Las tres métricas **no son comparables ni sumables entre sí**. No agregar reach de métricas distintas.

Datos disponibles hoy en onsite: solo BE-FR (ON-01: 15.841/semana; ON-02: 36.200/semana). FR, ES, IT y BE-NL sin medir. ON-03 y ON-04 sin dato en ningún mercado. Petición enviada a Marketing.

ADS-01: el reach de 35.000/mes del fichero es dudoso (incoherente con un CPM de 4–6 €). **Marcar como sin dato** hasta aclaración con el equipo Paid.

CPM de Meta confirmado por Francesco Dellaca (Paid): 4–6 € según país y tipo de campaña. Sustituye los rangos antiguos del fichero. Pmax y Display sin actualizar.

### Inventario

Fuera del sistema en el MVP. Solo se registra un check manual (ver 5.3).

Restricción conocida (Francesco, Paid): **máximo una campaña de cliente por país en Meta durante toda la duración de la campaña**. Es decir, 5 slots simultáneos en todo el grupo. Pendiente saber si aplica también a Pmax y Display.

---

## 4. Motor de precios

### 4.1 Coste interno

```
coste_unitario = (h_neg + h_dis) × 35 € + ext
coste_linea    = coste_unitario × cantidad
```

**El coste escala con la cantidad.** Cada unidad consume sus horas y su coste externo: 3 stories son 3 boosts de 100 €, no uno. En consecuencia el suelo de margen de 4.3 también escala, y protege el margen igual en volumen que en unidad.

### 4.2 Multimercado dentro de una misma opción

El diseño se reutiliza entre mercados; el boost externo no.

- **Primer mercado** (el de coeficiente más alto, normalmente FR): coste completo.
- **Segundo mercado en adelante**: solo `h_neg × 35 € + ext`. Las horas de diseño no se recuentan.

**El primer mercado se determina por soporte, no por opción.** Para cada soporte paga coste completo el mercado de coeficiente más alto **entre aquellos en los que ese soporte aparece**. Si un soporte solo se contrata en ES dentro de una opción FR+ES, ES paga el diseño: no existe diseño previo que reutilizar. Cuando todos los soportes están en todos los mercados, la regla coincide con el enunciado literal.

Ejemplo: ON-01 en FR = 140 €. El mismo ON-01 en ES dentro de la misma opción = 70 €.
SOC-01 en FR = 310 €. En ES = 170 € (se ahorra el diseño, el boost se paga igual).

### 4.3 Precio de venta

```
precio_linea = precio_base × coeficiente_mercado × cantidad
precio_linea = max(precio_linea, coste_linea / 0,50)     ← suelo de margen
```

El suelo se aplica **por línea y por mercado**, y se recalcula después de cualquier descuento manual.

Con 35 €/h, los soportes que activan el suelo en algún mercado son ON-02, SOC-01, SOC-02, SOC-03 y SOC-04 — todos los que llevan boost externo fijo. SOC-02 lo activa incluso en Francia (precio mínimo 305 €).

**No existe coeficiente de duración.** Más duración = más cantidad = más tarifa bruta = más descuento por volumen automático. Añadir un coeficiente sería descontar dos veces.

### 4.4 Soportes de media buy (ADS-01, ADS-02, ADS-03, INF-01)

Salen de la fórmula general. El presupuesto de medios y el fee de influencer se facturan **a coste, sin margen**, y llevan su propio fee de gestión:

```
fee = max(presupuesto_medios × 0,40 ; fee_minimo_mensual × meses)
total_facturado = presupuesto_medios + fee
```

**Fee mínimo sin dato (ADS-03 e INF-01).** Solo están validados los mínimos de Meta (1.200 €) y Pmax (1.500 €). Mientras no haya cifra confirmada, el parámetro es **nulo** y el motor calcula `fee = presupuesto_medios × 0,40` sin suelo, marcando la línea con un aviso de parámetro pendiente. **No se inventa un mínimo.** No vale deducirlo del precio base del catálogo: para ADS-01 y ADS-02 el precio base (1.850 € y 2.250 €) no coincide con sus mínimos reales (1.200 € y 1.500 €), luego la analogía no se sostiene.

El suelo de margen del 50 % de 4.3 **no se aplica línea a línea** a los soportes de media buy: están fuera de la fórmula general. Sí entran en el margen de la opción, calculado **neto de medios**, que es el que debe superar el 50 % (ver 5.1 y 5.3). Así, un ADS-03 con poco presupuesto de medios y un fee que no cubre sus horas bloquea el envío por la vía del control de opción, no por un suelo de línea que la especificación no define.

**El fee mínimo mensual resiste los descuentos, confirmado.** Es un `max()` en la fórmula: dejar que un descuento lo perfore por debajo dejaría el "mínimo" sin sentido. Un fee de Pmax que dispara el mínimo mensual (por ejemplo, el caso de 4.500 € con 3.000 € de medios a tres meses) entra igualmente en la base del descuento por volumen, pero el descuento no puede bajarlo de los 4.500 €: el suelo se reaplica después del reparto, igual que en cualquier otra línea (ver 4.5).

Motivo: incluir los medios en la base del margen dispararía el precio final (un 50 % sobre 10.000 € de medios = fee implícito del 121 %, fuera de mercado) y falsearía el porcentaje de margen del informe.

**Regla de tesorería: los medios se cobran al 100 % por adelantado**, sea cual sea la condición de pago del resto. Weekendesk no adelanta dinero de Meta ni de Google.

**Para el dashboard:** guardar por separado `importe_facturado` e `importe_neto_de_medios`. El objetivo anual se mide sobre el neto. Contablemente el importe completo es cifra de negocio (Weekendesk actúa como principal, no como agente), pero el objetivo comercial no debe inflarse con dinero que entra y sale sin margen.

### 4.5 Descuentos

#### Base de cálculo

**La base del descuento por volumen es exactamente lo que genera margen para Weekendesk**, es decir la misma base que el `importe_neto_de_medios` del dashboard (ver 4.4):

```
base_descuento = Σ tarifa de las líneas normales (tras el suelo de 4.3)
               + Σ fee de gestión de las líneas de media buy
```

**El presupuesto de medios queda fuera.** Es dinero del cliente en tránsito: Weekendesk lo cobra y lo paga a Meta o Google sin margen. Por tanto:

- **no suma para alcanzar el tramo** de descuento, y
- **no se descuenta nunca.**

El fee de gestión sí entra en la base y sí es descontable: es margen de Weekendesk.

Razón: descontar los medios sería vender por debajo de coste, e inflar el umbral con ellos regalaría un tramo de descuento a cambio de dinero que no deja margen. Un cliente con 10.000 € de medios y 1.000 € de soportes clásicos está en el tramo del 0 %, no en el del 15 %.

#### Escala por volumen

Aplicada **por opción** sobre la base anterior:

| Desde | Descuento |
|---|---|
| 0 € | 0 % |
| 3.000 € | 5 % |
| 6.000 € | 10 % |
| 10.000 € | 15 % |
| 15.000 € | 20 % |

El tramo se determina sobre la base **antes** de descuento. Los umbrales son inclusivos: exactamente 3.000 € da 5 %.

#### Descuento multimercado

10 % por 2 mercados, 15 % por 3, 20 % por 4 o 5: **manual, nunca automático**, con motivo obligatorio registrado.

#### Acumulación y suelo

Los descuentos (volumen + manuales) se **suman** sobre la base, y el total se reparte a prorrata entre las líneas descontables. **Confirmado por Vincent**: 15 % + 10 % son 25 %, no una composición (15 % + 10 % × 85 % = 23,5 %).

Después del reparto **se vuelve a aplicar el suelo de margen del 50 % línea a línea** (regla de 4.3). Una línea que cae por debajo de su suelo se sube de nuevo al suelo y el exceso **no** se redistribuye: el descuento realmente concedido es menor que el nominal. El motor devuelve ambos, nominal y efectivo, para que el comercial vea que el suelo ha mordido.

**El total de descuento acumulado (nominal y efectivo) debe verse de forma bien visible en la interfaz del comercial** — no es un dato secundario en un desglose: es lo primero que hay que ver antes de enviar una opción con varios descuentos apilados, precisamente porque el suelo puede hacer que lo efectivo sea menor que lo nominal sin que salte ningún error.

Toda excepción (margen bajo suelo, descuento manual, forzado de antelación) se registra con autor, motivo y marca de tiempo.

---

## 5. Modelo de presupuesto

### 5.1 Estructura

```
Cuenta (anunciante)
 └── Contacto
      └── Envío  ← lo que recibe el cliente, 1 enlace único
           ├── Opción A  ← pack cerrado
           ├── Opción B
           └── Opción C  (2 o 3 opciones por envío)
                └── Líneas (soporte, mercado, cantidad)
```

- Una **opción es un pack cerrado**: el cliente la acepta entera o no. No se combinan líneas entre opciones.
- Cada opción puede ser **multimercado**, y los mercados se eligen al crear cada opción. Las opciones de un mismo envío pueden tener mercados distintos.
- Cada opción calcula su propio precio, coste, margen, reach y CPM. **Todas deben pasar el suelo del 50 %**; no se compensa una opción floja con otra.
- Los 7 packs históricos del fichero (Visit Wallonia, C. Valenciana, ARA Wellness, Global City Pass) se cargan como **plantillas** de opción: entrada / estándar / amplia / premium.

### 5.2 Campos de texto libre

- **Brief de campaña**: uno por envío, heredado por todas las opciones. Contexto de la campaña: qué busca el cliente, temporada, destino.
- **Frase de opción**: una o dos líneas por opción, explicando su lógica estratégica.

Ambos en **el idioma del cliente** — cada comercial escribe directamente en francés, español, italiano o neerlandés. Sin traducción automática en el MVP.

Texto enriquecido básico: negrita, cursiva, listas, saltos de línea. Nada más (la página es pública, un editor completo abre riesgos de inyección).

El brief se reutiliza en el cuerpo del email que manda la aplicación y, más adelante, en el PDF. Empieza vacío, sin plantilla. Si está vacío al enviar: **aviso, no bloqueo**.

### 5.3 Controles antes del envío

Bloquean el botón de envío (forzables con motivo registrado):

1. Margen por debajo del 50 % en cualquier opción
2. Antelación insuficiente: días laborables entre hoy y el inicio de campaña < antelación del soporte más lento
3. Disponibilidad no confirmada con Marketing — checkbox manual con quién y cuándo, obligatorio para ON-01, ON-02, ON-03, CRM-03 y ADS-01
4. Brief vacío (solo aviso)

**Días laborables, resuelto (CLAUDE.md §9).** El cálculo excluye sábados, domingos y los festivos nacionales del mercado de cada línea (tabla `market_holidays`, editable en admin, sembrada con FR/ES/IT/BE-FR/BE-NL 2026-2027). BE-FR y BE-NL comparten calendario: son festivos federales belgas, no de comunidad lingüística.

El control 2 se evalúa **por línea, no por opción**: el calendario de festivos es por mercado, así que dos soportes con la misma antelación nominal pueden tener fecha límite real distinta según dónde se contraten. Motivo de la tabla: la primera campaña real es Navidad, y 15 días laborables desde diciembre cruzan el 25 de diciembre y el 1 de enero — sin festivos la calculadora decía que se llegaba a tiempo cuando no era así.

No incluye festivos regionales o municipales (2 por comunidad autónoma en España, patronales en Italia): solo el calendario nacional. Añadir eso, si hace falta, es una fila más en `market_holidays`.

**Un quinto control, técnico, no de negocio: el email tiene que salir de verdad.** El cálculo y las líneas se persisten en cuanto se pulsan los controles anteriores, pero el envío no se marca `enviado` hasta que Resend confirma la entrega. Si el email falla (Resend caído, dirección inválida, etc.), el comercial ve el error y el envío se queda internamente en `borrador` — no aparece como enviado en ningún sitio y el cliente no recibe nada. Ver §10.3.

### 5.4 Inmutabilidad

Al enviar, el envío se **congela**. Ningún cambio posterior altera lo que el cliente tiene delante. Cualquier modificación crea una **versión nueva** con su propio enlace.

La **contrapropuesta solo aparece detrás del botón de rechazo**, nunca junto a aceptar. Si se ofrece al lado, el cliente negocia a la baja de entrada.

### 5.5 Estados

`borrador` → `enviado` → `visto` → `aceptado` | `rechazado` | `caducado`

`rechazado` puede generar una versión nueva en estado `borrador` (contrapropuesta).

### 5.6 Plantillas del email de envío

El email que manda la aplicación (§2) tiene una plantilla por idioma del cliente, en ficheros de traducción (`lib/email/templates/proposal-email.<idioma>.ts`), no incrustada en la lógica de envío (`lib/email/proposal-email.ts`): se puede retocar el texto sin tocar cómo se envía.

**Tres reglas de contenido, fijadas por Vincent:**

1. **Sin mención de IVA.** Va en la pantalla comparativa, donde están los precios (§7). En el email solo añade ruido.
2. **Ningún precio en el email.** Ni total, ni "desde", ni rango. El cliente tiene que abrir la pantalla pública para verlos.
3. **El asunto no lleva el nombre de la campaña**, solo el anunciante (razón social de la cuenta).

**Formato**: texto sobrio, sin maquetación pesada ni imágenes — estos destinatarios son organismos públicos y los filtros corporativos tratan mejor el texto simple. Un único enlace destacado como botón, nada más. Se manda siempre versión en texto plano además de HTML.

**Variables**, con su origen:

| Variable | Origen |
|---|---|
| Anunciante / ciudad u organismo | `accounts.legal_name` de la cuenta del presupuesto |
| Nombre de pila del contacto | Primera palabra de `contacts.full_name` |
| Brief de campaña | `proposals.brief`, tal cual lo escribió el comercial (texto plano, §5.2) — si está vacío, se omite el párrafo, no se deja un hueco |
| Número de opciones | Recuento de opciones del envío (2 o 3, §5.1); la plantilla concuerda en género y número en cada idioma |
| Enlace único | La pantalla pública (`/p/[token]`) |
| Fecha de caducidad | `sent_at + offer_validity_days`, formateada en el idioma del cliente |
| Nombre del comercial | `profiles.full_name` de quien creó el presupuesto |
| Cargo del comercial | **No se incluye**: no hay ese dato por persona en `profiles` (solo nombre, email, activo). Inventar un cargo por comercial violaría "no inventar cifras/datos nunca" (§8), así que la firma lleva el departamento fijo ("Régie publicitaire" / "Publicidad" / "Pubblicità" / "Advertising"), no un cargo personal. Ver §10.3 |

**Plantillas** (contenido de referencia; el texto vivo está en `lib/email/templates/`):

**FR** — Asunto: `Proposition de visibilité Weekendesk — {anunciante}`
```
Bonjour {prénom_contact},

{brief_campagne}

Vous trouverez ci-dessous notre proposition, qui présente {n} formule(s) au choix. Chacune détaille les supports retenus, les marchés concernés et les périodes de diffusion.

[ Consulter la proposition ]

Vous pouvez y accepter la formule qui vous convient ou nous faire part de vos remarques directement depuis la page.

Cette proposition est valable jusqu'au {date_expiration}.

Je reste à votre disposition pour en échanger.

Bien cordialement,

{nom_commercial}
Régie publicitaire
Weekendesk SAS
```

**ES** — Asunto: `Propuesta de visibilidad Weekendesk — {anunciante}`
```
Hola {nombre_contacto}:

{brief_campaña}

A continuación encontrarás nuestra propuesta, con {n} fórmula(s) entre la(s) que elegir. Cada una detalla los soportes incluidos, los mercados y los periodos de difusión.

[ Ver la propuesta ]

Desde la misma página puedes aceptar la fórmula que prefieras o enviarnos tus comentarios.

La propuesta es válida hasta el {fecha_caducidad}.

Quedo a tu disposición para cualquier consulta.

Un saludo,

{nombre_comercial}
Publicidad
Weekendesk SAS
```

**IT** — Asunto: `Proposta di visibilità Weekendesk — {anunciante}`
```
Gentile {nome_contatto},

{brief_campagna}

Di seguito trova la nostra proposta, che presenta {n} formula/e tra cui scegliere. Ciascuna indica i supporti previsti, i mercati interessati e i periodi di diffusione.

[ Consulta la proposta ]

Dalla stessa pagina può accettare la formula che preferisce oppure inviarci le sue osservazioni.

La proposta è valida fino al {data_scadenza}.

Resto a disposizione per qualsiasi chiarimento.

Cordiali saluti,

{nome_commerciale}
Pubblicità
Weekendesk SAS
```

**NL** — Asunto: `Zichtbaarheidsvoorstel Weekendesk — {anunciante}`
```
Beste {voornaam_contact},

{brief_campagne}

Hieronder vindt u ons voorstel met {n} formule(s) om uit te kiezen. Bij elke formule staan de opgenomen kanalen, de betrokken markten en de looptijd vermeld.

[ Bekijk het voorstel ]

Op dezelfde pagina kunt u de gewenste formule aanvaarden of ons uw opmerkingen bezorgen.

Dit voorstel is geldig tot {vervaldatum}.

Ik sta tot uw beschikking voor verdere vragen.

Met vriendelijke groet,

{naam_verkoper}
Advertising
Weekendesk SAS
```

**EN** — Subject: `Weekendesk visibility proposal — {advertiser}`
```
Dear {contact_first_name},

{campaign_brief}

Below you will find our proposal, setting out {n} package(s) to choose from. Each one lists the placements included, the markets covered and the campaign periods.

[ View the proposal ]

You can accept your preferred package or send us your comments directly from the page.

This proposal is valid until {expiry_date}.

I remain available should you have any questions.

Kind regards,

{sales_name}
Advertising
Weekendesk SAS
```

---

## 6. Pantalla pública

Enlace con token largo, no adivinable. Sin indexación (`noindex`). **Caduca a los 14 días**, coincidiendo con la validez de la oferta; después deja de mostrar precios.

Contenido:
- Cabecera: anunciante, periodo de campaña, validez con cuenta atrás
- Brief de campaña
- Las 2–3 opciones en columnas: nombre, frase de opción, precio, detalle de soportes y mercados, reach cuando exista
- Botones: aceptar (por opción) · rechazar (el envío entero)

Reglas:
- **Precios siempre HT.** En el momento del envío aún no se conoce el régimen de IVA definitivo.
- **Reach solo donde hay dato medido con fuente.** Si no hay dato, la fila no aparece.
- Idioma del cliente.

### Formulario de aceptación

Razón social · dirección de facturación · número de IVA intracomunitario · contacto de facturación con email · nombre y cargo del firmante · **referencia de pedido o expediente** (muchos organismos públicos no pagan sin ella).

Sin datos bancarios.

Al aceptar: se verifica el número contra VIES, se fija el régimen de IVA, el envío pasa a `aceptado` y el importe se imputa al quarter fiscal de esa fecha.

---

## 7. IVA y condiciones

### Régimen

| Cliente | Régimen |
|---|---|
| Empresa u organismo **francés** | IVA francés 20 % |
| Empresa UE **con número válido en VIES** | Sin IVA, autoliquidación por el cliente |
| Cliente UE **sin número válido en VIES** | IVA francés 20 % |

Base legal: artículo 44 de la Directiva 2006/112/CE, transpuesto en el artículo 259-1° del CGI. Una persona jurídica no sujeta pero identificada a efectos de IVA **se considera sujeto pasivo** para las reglas de localización (art. 43(2)) — un ente público con número válido va a autoliquidación.

**Tener NIF no implica estar en VIES.** En España hace falta alta en el ROI (modelo 036); en Italia hay que solicitar la inclusión expresamente. Muchos organismos públicos que nunca han comprado fuera de su país no están dados de alta.

Guardar siempre: número, fecha de verificación, resultado. Un número inválido en VIES tumba la autoliquidación y la administración puede reclamar el IVA francés.

Obligación asociada (no en el MVP): declaración europea de servicios (DES) mensual desde el primer euro facturado.

### Mención en presupuestos fuera de Francia

> **ES** — *Importes expresados sin IVA. Operación no sujeta a IVA francés: inversión del sujeto pasivo conforme al artículo 44 de la Directiva 2006/112/CE. La exención queda condicionada a la validez del número de IVA intracomunitario del cliente en el momento de la emisión de la factura. En su defecto, se aplicará el IVA francés del 20 %.*

Versiones en FR, IT, NL y EN disponibles — misma estructura, la segunda frase es imprescindible.

### Condiciones comerciales

- **Validez de la oferta: 14 días**
- **Pago**: si hay un mes o más entre presupuesto e inicio de campaña, 30 % a la firma y 70 % siete días antes del arranque. Si hay menos de un mes, 100 % a la firma.
- **Medios (ADS-01/02/03, INF-01): 100 % por adelantado siempre.**

Entidad facturadora: Weekendesk SAS, 28 rue de Londres, 75009 Paris.

---

## 8. Principios de diseño

- Los envíos enviados son **inmutables**. Cualquier cambio es una versión nueva.
- La **contrapropuesta va detrás del rechazo**, nunca junto a aceptar.
- El inventario se reserva **en la aceptación**, no en el envío.
- Toda **excepción se registra** con autor, motivo y marca de tiempo.
- Los parámetros económicos (tarifa hora, suelo de margen, coeficientes, escalas de descuento, objetivos) son **editables desde admin, nunca hardcodeados**.
- **Ninguna cifra sin fuente y fecha llega al cliente.** Lo que no se puede fuentear se marca como sin dato y se omite.

---

## 9. Pendiente de decisión

| Tema | Responsable | Estado |
|---|---|---|
| Reach onsite real por mercado e inventario semanal | Marketing (Pauline Rabaux, Erika Odena) | Petición enviada, plazo 2 de octubre |
| Datos regionales Francia (Hauts-de-France, Grand Est, Centre-Val de Loire) | Erika Odena | Petición enviada |
| `promotional_bar` y `cards_block`: ¿comercializables? | Pauline Rabaux | Fuera del catálogo hasta tener horas, precio y reach |
| ¿La regla de una campaña por país aplica a Pmax y Display? | Francesco Dellaca | Preguntado |
| ADS-01: los 35.000/mes, ¿impresiones o alcance neto? | Francesco Dellaca | Preguntado |
| ¿Quién asume el coste de la gift card del concurso (SOC-04)? | Social | Abierto |
| Coste de boost: ¿100 € en los 5 mercados? | Social | Abierto |
| Objetivo por persona y por quarter | Vincent / dirección | Editable en admin |
| **Fee mínimo mensual de ADS-03 (Display) e INF-01 (Influencer)** | Vincent / Quentin Heliot | Abierto. Parámetro nulo en base de datos, el motor avisa. Ver 4.4 |
| Festivos regionales/municipales (ES, IT) en el cálculo de antelación | Vincent | Fuera de alcance por ahora. Solo calendario nacional en `market_holidays` |
| ~~Comprobar Site URL y Redirect URLs / desactivar Click Tracking en Resend~~ | Vincent | **Superado**: el login dejó de depender del magic link (§10.3), así que estos dos puntos ya no bloquean nada. El código que los necesitaría (`app/api/auth/send-email/`, etc.) se queda sin usar por si se recupera el magic link — entonces sí volverían a hacer falta |
| **Dar de alta en Supabase (Authentication > Users) a los usuarios del equipo con contraseña**: Vincent, Rémi, Mario | Vincent | Bloqueante para el login nuevo: sin esto nadie puede entrar. Ver §10.3 |
| ~~Comprobar `SUPABASE_SERVICE_ROLE_KEY` en Vercel~~ | Vincent | **Resuelto**: la clave era correcta. El bug real era que `service_role` no tenía privilegios de tabla (GRANT, no RLS) sobre `allowed_emails`/`profiles` — arreglado en `20260919120000_service_role_grants.sql`. Ver §10.3 |
| **Aplicar `20260919120000_service_role_grants.sql` en el proyecto Supabase real** (dashboard SQL editor o `supabase db push`) | Vincent | Bloqueante: sin esta migración, `service_role` sigue sin poder leer `allowed_emails`/`profiles`, y el login sigue dando "no tiene acceso" pase lo que pase con la clave. Ver §10.3 |


---

## 10. Estado de la implementación

### 10.1 Qué existe hoy

| Módulo | Ruta | Estado |
|---|---|---|
| Esquema PostgreSQL / Supabase | `supabase/migrations/` | Hecho |
| Motor de precios | `src/pricing/` | Hecho |
| Envío de email real (Resend) | `app/api/proposals/`, `lib/email/` | Hecho — presupuesto al cliente. `app/api/auth/send-email/` (magic link del equipo) queda en el código sin usar, ver §2 y §10.3 |
| Tests unitarios | `src/pricing/__tests__/`, `lib/**/*.test.ts`, `app/**/*.test.ts` | Hecho — 143 tests + scripts/verify-rls-self-read.sh (contra PostgreSQL 16 real) |
| Interfaz (Next.js) | `app/`, `lib/`, `components/` | Hecho — 3 pantallas del MVP |

El motor es **puro**: no lee de la base de datos. Recibe el juego de parámetros y el catálogo como argumentos, para que los valores editables en admin (tarifa hora, suelo, coeficientes, escalas) lleguen desde `pricing_parameter_sets` y nunca estén hardcodeados en la lógica. Los valores de la sección 3 viven en `src/pricing/parameters.ts` y en la migración de seed únicamente como **estado inicial**, no como constantes de cálculo.

### 10.1.1 Pantallas construidas

| Pantalla | Ruta | Notas |
|---|---|---|
| Creación de presupuesto | `/proposals/new` | 2-3 opciones, líneas multimercado, descuentos manuales, vista previa en vivo con el motor, checklist de controles previos al envío |
| Pantalla pública comparativa | `/p/[token]` | `get_public_proposal` (SECURITY DEFINER), reach solo con dato medido, caduca a los 14 días, idioma del cliente |
| Aceptación con datos fiscales | Modal en `/p/[token]` | VIES verificado en servidor (`app/api/public/proposals/[token]/accept`), régimen de IVA decidido en `accept_public_proposal` |
| Rechazo | Modal en `/p/[token]` | Registra motivo; **no** construye la contrapropuesta (ver más abajo) |
| Login | `/login` | Email + contraseña (`supabase.auth.signInWithPassword`), no magic link — ver §2 y §10.3 para por qué. `app/login/actions.ts` (`loginWithPassword`, Server Action) hace el login y comprueba la lista blanca en el mismo paso: si `signInWithPassword` falla, mensaje genérico de credenciales incorrectas sin revelar si el email existe; si tiene éxito pero el email no está en `allowed_emails`, cierra la sesión ahí mismo (`supabase.auth.signOut()`) y devuelve un motivo claro ("no tiene acceso... pide a Vincent"). Reutiliza `resolveTeamAccess` (`lib/supabase/team-access.ts`) sin cambios: mismo aprovisionamiento de `profiles` que con el magic link, que crea el `profiles` que falta en el primer login para evitar la dependencia circular con RLS (`is_team_member()` exige un `profiles` que aún no existe). `allowed_emails.full_name` es opcional: si no se rellena al dar de alta a alguien, se deriva del email. Un fallo al crear el `profiles` (constraint, RLS mal configurado, lo que sea) se registra explícitamente como fallo de aprovisionamiento y no como "no autorizado". Sin registro público (usuarios dados de alta por un admin en el dashboard de Supabase) ni recuperación de contraseña por email en esta versión. El código del magic link (`/auth/callback`, `/auth/confirm`, `lib/supabase/login-redirect.ts`, `lib/email/magic-link-email.ts`, `lib/email/confirm-url.ts`, `app/api/auth/send-email/`) sigue en el repo, sin usar, por si se recupera más adelante |

**Arquitectura de cálculo:** el navegador ejecuta el mismo motor (`src/pricing/`) para la vista previa en vivo mientras el comercial edita, pero esos números **nunca se persisten**. Al pulsar "Enviar", `app/api/proposals/route.ts` recibe los datos crudos (soportes, mercados, cantidades, descuentos) y **vuelve a calcular en el servidor** con los parámetros vivos de la base de datos — eso es lo único que se guarda, vía `create_and_send_proposal` (una función SQL `SECURITY INVOKER`, atómica: opción + líneas + descuentos + checks de disponibilidad en una sola transacción). El envío ya no se marca `SENT` dentro de esa misma función: queda en `DRAFT`, congelado (mismo `frozen_snapshot` de siempre) pero invisible en la pantalla pública, hasta que la ruta de servidor manda el email por Resend y llama a `mark_proposal_sent`. Si Resend falla, llama a `log_proposal_send_failure` en su lugar y el envío se queda en `DRAFT` — nunca se marca enviado sin que el cliente lo haya recibido (ver §5.3, §10.3).

**Verificado end to end contra un PostgreSQL 16 real** (no solo tipado): crear y enviar un presupuesto con el motor real, leer la pantalla pública (reach con y sin dato, caducidad), aceptar con VIES simulado (régimen de IVA correcto), rechazar, y los bloqueos de estado (no se puede aceptar dos veces, ni aceptar un envío caducado). El envío de email por Resend y el "Send Email Hook" de Supabase están escritos contra la documentación de ambos, no contra un proyecto Supabase ni una cuenta de Resend reales (ver más abajo): conviene una prueba manual tras el primer despliegue.

### 10.1.2 Deliberadamente fuera de esta pasada

Explícito para no dar por hecho más de lo construido:

- **Dashboard de seguimiento** por persona y quarter fiscal (CLAUDE.md §1): no pedido en esta pasada, no construido.
- **Contrapropuesta** tras rechazo (§5.4, §5.5): el rechazo se registra; crear la versión nueva en `borrador` es una acción interna posterior, no implementada.
- **Forzar un bloqueo con motivo** (§5.3, tabla `overrides`): hoy un bloqueo (margen, antelación, disponibilidad) impide enviar sin excepción; no hay UI para forzarlo y registrar autor/motivo.
- **Gestión de cuentas y contactos** como pantallas propias: se crean inline al construir un presupuesto, sin un CRM dedicado.
- **Verificación VIES mientras se escribe**: se comprueba solo al enviar el formulario de aceptación, no en vivo. Probado que el endpoint construye la llamada REST correctamente; **no se ha podido probar contra la API real de la UE** porque la política de red de este entorno de desarrollo bloquea la salida a `ec.europa.eu` — funcionará en Vercel, pero conviene una prueba manual tras el primer despliegue.
- **Sin proyecto Supabase real conectado**: el código usa `@supabase/ssr` correctamente (`lib/supabase/`), pero no hay credenciales en este entorno. `lib/supabase/database.types.ts` está escrito a mano a partir de las migraciones; al crear el proyecto real, regenerar con `supabase gen types typescript` y revisar que coincide.
- **Sin cuenta de Resend real conectada**: `lib/email/` (contenido de los emails de presupuesto, cliente de Resend) está probado con tests unitarios y mocks de `fetch`; el envío real (`app/api/proposals/route.ts`) sigue la documentación de Resend pero no se ha podido disparar contra la API real en este entorno. Configurar `RESEND_API_KEY` y `RESEND_FROM_EMAIL` en Vercel y probar el envío a mano tras el despliegue. `app/api/auth/send-email/route.ts` (el "Send Email Hook") sigue sin usarse — el login ya no depende de él, ver §10.3.
- **Reintento de un envío con email fallido**: si Resend falla, el presupuesto se queda en `DRAFT` internamente (ver §5.3, §10.3), pero no hay ninguna pantalla que liste esos borradores ni un botón de "reintentar envío" — el comercial solo ve el error en el momento y tendría que rehacer el presupuesto desde cero. Aceptable para el MVP porque un fallo de Resend en producción debería ser raro, pero es una limitación real, no un descuido.
- **Gestión de usuarios del equipo** (crear cuentas, cambiar contraseñas): se hace a mano en el dashboard de Supabase (Authentication > Users) más el alta en `allowed_emails` — no hay pantalla de administración en la app para ninguna de las dos cosas.
- **Recuperación de contraseña por email**: fuera de alcance a propósito en esta versión (§10.3) — dependía otra vez del correo, la misma causa del bug que este cambio resuelve. Si alguien la pierde, un admin se la resetea a mano desde Supabase.

### 10.2 Convenciones de cálculo

- Todo importe monetario se maneja en **céntimos enteros**, nunca en coma flotante. Las columnas de dinero son `bigint` con sufijo `_cents`.
- Se redondea al céntimo (`Math.round`) en cada paso del cálculo, no solo al final.
- El reparto a prorrata de un descuento usa **restos mayores**, de modo que la suma de las líneas cuadre exactamente con el total de la opción.
- Los porcentajes (margen, descuento, coeficiente) son fracciones: `0,50`, no `50`.

### 10.3 Decisiones tomadas al implementar el motor

Cuatro puntos no estaban determinados en la especificación. Se resolvieron así y la especificación de arriba ya recoge la decisión:

1. **Fee mínimo de ADS-03 e INF-01**: parámetro nulo + aviso. Ver 4.4.
2. **Coste × cantidad**: el coste unitario se multiplica por la cantidad. Ver 4.1.
3. **Base del descuento**: neto de medios, idéntica al `importe_neto_de_medios`. Ver 4.5.
4. **Mercado líder**: se determina por soporte. Ver 4.2.

Confirmado por Vincent, ya no son supuestos: el fee mínimo mensual resiste los descuentos (ver 4.4), los descuentos acumulados se **suman** y no se componen (ver 4.5), y el cálculo de días laborables **excluye los festivos por mercado** de la tabla `market_holidays`, evaluado por línea (ver 5.3). Queda fuera de alcance el detalle regional/municipal de festivos en España e Italia, listado en la sección 9.

Un quinto punto, al implementar el envío real por Resend:

5. **"Enviado" se marca al confirmar el email, no al persistir el cálculo.** `create_and_send_proposal` dejó de poner `SENT` — ahora deja el envío en `DRAFT` (calculado, congelado, con enlace público ya generado, pero invisible: `get_public_proposal` sigue descartando `DRAFT`). Solo `mark_proposal_sent` pone `SENT` + `sent_at` + `expires_at`, y solo se llama si Resend confirma la entrega; si falla, `log_proposal_send_failure` registra el intento y el envío se queda en `DRAFT`. Es la única forma de cumplir a la vez la inmutabilidad de §5.4 (el cálculo se congela en un solo paso, no se recalcula después) y la regla nueva de que un email fallido no puede dejar un envío marcado como enviado.
6. **Sin cargo personal en la firma del email (§5.6).** Las plantillas de Vincent llevan un `{cargo}` por comercial, pero `profiles` no guarda ese dato (solo nombre, email, activo) y no se ha pedido añadirlo. Inventarlo violaría "no inventar cifras/datos nunca" (§8) igual que inventar una cifra de negocio. La firma usa el departamento fijo ("Régie publicitaire" / "Publicidad" / "Pubblicità" / "Advertising", según idioma) en vez del cargo personal. Si hace falta el cargo real, es una columna nueva en `profiles` y una pantalla para editarla — no está en esta pasada.

**Bug real en producción, corregido: bucle de login por saltarse el canje del código PKCE.** `emailRedirectTo` apuntaba directo a `/proposals/new` en vez de a `/auth/callback`. Supabase incrusta esa URL en el email como el sitio que debe canjear el `code` (`exchangeCodeForSession`) — apuntando directo a la página destino, ese canje nunca ocurría: no se creaba sesión y el enlace acababa como `otp_expired` al segundo toque. Los logs de Vercel lo confirmaron: `/proposals/new` aparecía, `/auth/callback` no, nunca. Corregido en `lib/supabase/login-redirect.ts` (`buildLoginRedirectUrl`, puro y testeado): `emailRedirectTo` apunta siempre a `/auth/callback?next=<destino>`, con el origin de la petición (`window.location.origin`), no escrito a mano. De paso reveló que el "Send Email Hook" de Resend (§2, §10.1.1) **no está activo** en el proyecto real — si lo estuviera, `app/api/auth/send-email/route.ts` recibiría ese `redirect_to` con el `next` anidado en la query, no en el pathname; `lib/email/confirm-url.ts` ya lo desanida por si acaso, para que ambos flujos (activo el hook o no) lleven al mismo destino final.

**Por qué el bug siguió en producción después del primer arreglo: un problema de proceso, no de código.** El commit del arreglo (`lib/supabase/login-redirect.ts`) se subió a esta misma rama, pero el PR #4 ya se había fusionado a `main` con el commit anterior como cabecera — el arreglo se quedó huérfano en la rama, sin PR que lo llevara a `main`, y `main` (lo que Vercel despliega) siguió teniendo `emailRedirectTo: \`${window.location.origin}/proposals/new\`` literal. Verificado con `git merge-base --is-ancestor <commit> origin/main` antes de dar nada por corregido esta vez. Lección: comprobar contra `origin/main`, no contra el estado local de la rama, antes de decir que un fix está en producción.

**Dos riesgos externos al código, comprobados y documentados aquí porque no se pueden arreglar desde este repo:**

1. **Site URL / Redirect URLs de Supabase pueden sobrescribir `emailRedirectTo` en silencio.** Supabase exige que la `redirect_to` que manda el cliente coincida con una entrada de la lista blanca "Redirect URLs" del proyecto (Authentication > URL Configuration); si no coincide, Supabase **no avisa de ningún error** — simplemente ignora lo pedido y usa la "Site URL" configurada. Si esa lista blanca no incluye `https://<dominio>/auth/callback` (o un comodín `https://<dominio>/**` que lo cubra), el arreglo de código de este documento no tiene ningún efecto: Supabase seguiría mandando a la Site URL de siempre, sea cual sea. **Comprobación pendiente en el dashboard real** (no se puede verificar desde este entorno de desarrollo, sin proyecto Supabase conectado, ver §10.1.2): Site URL = `https://<dominio-de-producción>` y Redirect URLs debe incluir `https://<dominio-de-producción>/auth/callback` (o el comodín `/**`). Si alguien configuró la Site URL como `.../proposals/new` en algún momento (posible causa de que el enlace "por defecto" apuntara ahí), hay que corregirlo a la raíz del dominio.
2. **El enlace de Supabase puede consumirse antes de que el usuario lo abra, si el email pasa por un rastreador de clics.** El dato de Vincent: el enlace recibido venía envuelto por `awstrack.me` (rastreador de clics de Amazon SES — la infraestructura de envío que usa Resend por debajo). Si el SMTP de Supabase está configurado para usar Resend con el "Click Tracking" activado, Resend/SES reescribe todos los enlaces del email, incluido el `ConfirmationURL` que genera Supabase (`{SUPABASE_URL}/auth/v1/verify?token=...&type=magiclink&redirect_to=...`). Ese endpoint de Supabase es un **GET que canjea el token en el momento en que se visita**, sin ningún paso intermedio que dependa de una acción humana — así que cualquier apertura automática del enlace (el propio rastreador, un escáner de seguridad corporativo tipo Safe Links/Proofpoint que abre los enlaces de un email antes de entregarlo) consume el token de un solo uso antes de que la persona haga clic de verdad. Esto ocurre **en la infraestructura de Supabase, antes de que la petición llegue a `/auth/callback`**: no hay forma de defenderse desde el código de esta app en ese punto. Dos arreglos reales, ninguno de código:
   - **Corto plazo**: desactivar "Click Tracking" en la configuración de Resend/SES para el dominio o API key que usa el SMTP de Supabase.
   - **Correcto a medio plazo**: activar el "Send Email Hook" (§2, §10.1.1). Con el hook activo, Supabase deja de generar su propio `ConfirmationURL` con canje automático por GET — en su lugar manda un `token_hash` que solo se canjea cuando `app/auth/confirm/route.ts` llama a `supabase.auth.verifyOtp()`, un paso que si hiciera falta sí se puede proteger con una confirmación manual del usuario (no implementado todavía porque el hook no está activo — ver §10.1.2).

Estos dos puntos son la explicación más probable de que el bucle de login pueda seguir reproduciéndose incluso con `emailRedirectTo` corregido: son configuración del dashboard de Supabase/Resend, no código de este repositorio, y solo se pueden comprobar y corregir ahí.

**Decisión final: se abandona el magic link, login con email y contraseña.** Tras dos días con el enlace mágico sin funcionar — incluso ya con `emailRedirectTo` apuntando a `/auth/callback`, la Redirect URL correcta en Supabase y Resend configurado — la causa quedó acotada al punto 2 de arriba: el rastreador de clics de Resend consume el token PKCE de un solo uso antes de que la persona lo abra, y **no se puede desactivar en el dominio de pruebas de Resend** (el Click Tracking por dominio es una función de dominios verificados; Weekendesk todavía no tiene uno, ver §2). Activar el "Send Email Hook" habría evitado el `ConfirmationURL` vulnerable de Supabase, pero no protege el `token_hash` de un consumo igual de automático si algo vuelve a abrir el enlace antes que la persona — habría cambiado el síntoma, no eliminado el riesgo de raíz mientras el envío dependa de un dominio de pruebas ajeno.

Con contraseña no hay ningún enlace de un solo uso que un rastreador o un escáner de seguridad pueda consumir por delante del usuario — el problema desaparece por diseño, no se mitiga.

Contrapartidas aceptadas, explícitamente, no descuidos:
- **Sin recuperación de contraseña por email.** Añadirla reintroduciría exactamente la dependencia del correo que se acaba de quitar. Si alguien pierde su contraseña, un admin se la cambia a mano desde Supabase (Authentication > Users > Reset password), sin que pase por el buzón de la persona.
- **Sin registro público.** Los tres miembros del equipo (Vincent, Rémi, Mario) los da de alta un admin en el dashboard de Supabase con una contraseña inicial — no hay pantalla de alta en la app. Sigue haciendo falta añadir el email a `allowed_emails` además de crear el usuario en Supabase Auth: son dos pasos distintos, uno de autenticación (Supabase) y otro de autorización (`allowed_emails`), y ambos son necesarios.
- **La lista blanca sigue siendo la autoridad, no Supabase Auth por sí solo.** Que alguien tenga usuario y contraseña en Supabase no basta para entrar: `loginWithPassword` (`app/login/actions.ts`) sigue comprobando `allowed_emails` en el mismo paso, exactamente igual que antes comprobaba el magic link al volver del enlace — el mecanismo de entrada cambió, la autorización no.
- **El código del magic link no se borra.** `app/auth/callback/`, `app/auth/confirm/`, `app/api/auth/send-email/`, `lib/supabase/login-redirect.ts`, `lib/email/magic-link-email.ts`, `lib/email/confirm-url.ts` y sus tests se quedan tal cual, sin usar desde `/login`, por si Weekendesk consigue un dominio propio verificado en Resend (sin el Click Tracking del dominio de pruebas de por medio) y se quiere recuperar. `lib/supabase/authorize-session.ts` y `lib/supabase/team-access.ts` (aprovisionamiento de `profiles`, lista blanca) no cambian: los usa tanto el magic link dormido como, indirectamente a través de `resolveTeamAccess`, el login nuevo.

**Reporte de Vincent: "email o contraseña incorrectos" — no, en realidad "este email no tiene acceso" — con `allowed_emails` y `profiles` correctos en la base de datos.** Investigado a fondo, con una base de datos PostgreSQL 16 real (no solo lectura de código), antes de tocar nada — igual que exige este documento no dar un arreglo por bueno sin comprobarlo:

1. **`loginWithPassword` (`app/login/actions.ts`) ya usaba la clave de servicio.** Releído el código: construye el gateway con `createServiceClient()`, no con la sesión del usuario — exactamente lo que se pedía. `app/login/actions.test.ts` tiene ahora un test dedicado a esto (`createSupabaseTeamAccessGateway` debe recibir el cliente de servicio, nunca el de sesión) para que un futuro refactor no lo rompa sin que salte una prueba.
2. **Reproducida la dependencia circular contra un PostgreSQL 16 real** (`scripts/verify-rls-self-read.sh`, ejecutable y repetible, no solo una prueba manual de una vez): con el esquema de `is_team_member()` tal cual estaba, un usuario **recién creado en Supabase Auth, todavía sin fila en `profiles`**, no puede leer su propia fila de `allowed_emails` con su propia sesión — `is_team_member()` da `false` para él, `team_all` le cierra la tabla, 0 filas. Con la clave de servicio (bypassa RLS) esa misma lectura encuentra la fila sin problema — es justo la razón de que `resolveTeamAccess` exista con ese diseño.
3. **Para un miembro ya activo — el caso exacto que reportaba Vincent, con `profiles.is_active = true`** — se comprobó también contra Postgres real que **no hay dependencia circular ni con la sesión del propio usuario**: `is_team_member()` es `security definer`, así que su lectura interna de `profiles` no pasa por RLS, y una vez da `true`, `team_all` deja leer ambas tablas con normalidad. Es decir: el escenario que describía el reporte (filas ya existentes y correctas) no reproduce ningún bloqueo de RLS, ni con la clave de servicio ni con la sesión — con el código ya existente antes de este cambio.
4. **Conclusión honesta:** el código de `loginWithPassword` ya hacía lo correcto y quedó verificado, no solo revisado. La causa más probable de que Vincent siga viendo "no tiene acceso" con las filas correctas en la base de datos es que **`SUPABASE_SERVICE_ROLE_KEY` en Vercel no sea la clave real de `service_role`** (vacía, la clave `anon` puesta por error, o configurada solo para Development/Preview y no para Production) — si `createServiceClient()` acaba actuando como `anon` o como una sesión normal, sí reproduce el síntoma exacto (autentica pero “no tiene acceso”), y es exactamente el mismo tipo de problema de configuración externa que las Redirect URLs de Supabase o el Click Tracking de Resend de más arriba: no se puede comprobar ni arreglar desde este repositorio. Queda como pendiente bloqueante en §9.

**Se añade igualmente la política de RLS pedida, como defensa en profundidad, no como el arreglo del síntoma reportado** (`supabase/migrations/20260919110000_self_read_policies.sql`): permite a un usuario autenticado leer su propia fila de `profiles` (`id = auth.uid()`) y de `allowed_emails` (comparando el email del JWT) sin pasar por `is_team_member()`. Cubre el caso 2 de arriba (usuario nuevo, sesión propia, sin pasar por la clave de servicio) para cualquier código presente o futuro que use la sesión del usuario en vez de la clave de servicio — `loginWithPassword` no depende de ella, sigue usando la clave de servicio. Verificado con el mismo script que la política nueva **no** amplía el acceso a filas de otras personas (un usuario nuevo ve su propia fila, cero de las demás, aunque haga `select *`).

**El síntoma siguió reproduciéndose después de lo anterior, y esta vez sí era el código (una migración, no RLS). Log de Vercel con el error exacto: `[team-access] error leyendo allowed_emails de vincent.pla@weekendesk.fr: permission denied for table allowed_emails`.** "Permission denied for table" es un error de **GRANT** de PostgreSQL — la capa de privilegios de tabla, por debajo de RLS — no de política. Diagnosticado contra un PostgreSQL 16 real, con las dos hipótesis planteadas:

1. **Hipótesis descartada:** que `createServiceClient()` no estuviera usando de verdad la clave `service_role` en runtime. Si así fuera, el rol efectivo sería `anon` (sin ningún privilegio de tabla, por diseño — ver `grants.sql`) o `authenticated`; en ambos casos el error habría sido el mismo tipo ("permission denied"), así que esta hipótesis no se podía descartar solo por el mensaje. Vincent ya había sustituido la clave por la legacy `service_role` (formato `eyJhbGci...`) y redesplegado, y el error seguía — eso apunta a la otra hipótesis.
2. **Hipótesis confirmada:** `supabase/migrations/20260918140100_grants.sql` concede privilegios de tabla (`select, insert, update, delete`) a `authenticated`, explícitamente, con este mismo razonamiento en su comentario: *"RLS restringe FILAS, pero además hace falta el privilegio de tabla (Supabase lo concede por defecto en su bootstrapping de proyecto; se hace explícito aquí para no depender de ese comportamiento implícito...)"*. Esa migración **nunca hizo lo mismo para `service_role`** — asumía que Supabase se lo concedía solo. En este proyecto real, ese supuesto era falso: `service_role` se quedó sin privilegios de tabla sobre lo que crean las migraciones de este repo (`allowed_emails`, `profiles`, y el resto). `service_role` tiene `BYPASSRLS`, así que las políticas nunca fueron el problema — pero el GRANT es una capa aparte, y sin él Postgres deniega el acceso antes de que RLS llegue a evaluarse. Reproducido carácter por carácter contra un PostgreSQL 16 real: aplicando solo las migraciones reales del repo (sin dar por hecho ningún bootstrapping implícito), `set role service_role; select * from allowed_emails` da exactamente `permission denied for table allowed_emails`.

**Arreglado en `supabase/migrations/20260919120000_service_role_grants.sql`**: concede a `service_role` los mismos privilegios de tabla que `grants.sql` ya concedía a `authenticated`, sobre las mismas tablas. Verificado contra Postgres real que, tras esta migración, la misma consulta que antes daba `permission denied` funciona sin error.

**El propio script de verificación (`scripts/verify-rls-self-read.sh`) escondía este bug sin darse cuenta.** Su primera versión incluía `grant all privileges on all tables in schema public to service_role` en su propio montaje de prueba, con el comentario "Supabase concede esto por defecto al aprovisionar el proyecto" — la misma suposición implícita que resultó falsa en el proyecto real. Ese grant de más hacía que el script pasara aunque las migraciones reales del repo NO concedieran nada a `service_role`, ocultando exactamente este bug. Corregido: el script ya no da por hecho ningún privilegio de `service_role` por su cuenta — todo tiene que venir de las migraciones reales, igual que en producción — y ahora tiene un primer bloque de pasos que reproduce el error de GRANT (Bug A) antes de comprobar la dependencia circular de RLS (Bug B, la de antes). Lección repetida: no dar por buena ninguna suposición sobre el comportamiento implícito de Supabase sin comprobarla contra Postgres real, ni siquiera en el propio arnés de pruebas.

---

## Nota sobre los prototipos de `/design`

Los prototipos HTML de `/design` son **referencia visual**: maquetación, jerarquía, componentes, tono. Sirven para saber cómo debe verse la interfaz.

**En caso de discrepancia entre un prototipo y este documento, manda este documento.** Cualquier cifra, regla de cálculo, campo, estado o control que aparezca en un prototipo y contradiga lo escrito aquí es obsoleto: los prototipos se hicieron antes de fijar 35 €/h y el 50 % de margen, y pueden arrastrar precios, porcentajes o pantallas que ya no son válidos. Un prototipo nunca es fuente de una cifra.
