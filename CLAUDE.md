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

Con email + contraseña: **sin registro público** — los usuarios se dan de alta desde `/admin/users` (ver §10.1.1, ronda 2 de correcciones), que crea el usuario en Supabase Auth y lo añade a `allowed_emails` en el mismo paso; el alta manual por SQL o por el dashboard de Supabase sigue funcionando como alternativa, pero ya no es el único camino. **Sin recuperación de contraseña por email en esta versión** — depender del correo para entrar es exactamente el problema que este cambio resuelve, así que no se reintroduce por la puerta de la recuperación. La lista blanca (`allowed_emails`) se sigue comprobando igual que con el magic link, en el mismo momento del login (`app/login/actions.ts`, `loginWithPassword`): si el email autenticado no está en ella, se cierra la sesión que Supabase acaba de abrir y se muestra un mensaje claro, sin dejar una sesión sin perfil de equipo.

Marca: Host Grotesk + Inter, rojo `#f8443a`, azul marino `#001c4d`. Logo (`LOGO_Weekendesk_color.png` / `LOGO_Weekendesk_white.png`, en `/public`): versión en color sobre fondo claro (login, pantalla pública), versión en blanco sobre el azul marino de la cabecera interna.

**Interfaz interna en varios idiomas (ronda 2).** La UI del equipo (no la del cliente, ver §5.6/§6) tiene selector de idioma — español, francés, inglés — visible en la cabecera y en el login (`lib/i18n-internal.tsx`, `components/LanguageSwitcher.tsx`). Es una preferencia de navegador (`localStorage`), no un dato de negocio: nunca se guarda en la base de datos ni afecta a lo que ve el cliente. No confundir con el idioma DEL CLIENTE (`lib/i18n.ts`), que se elige por presupuesto y determina la pantalla pública y el email — ver §5.6.

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

Fuera del sistema en el MVP: no hay calendario real de disponibilidad por soporte y mercado. En su lugar, una **regla de disponibilidad decidida (ronda 3, reemplaza a la restricción anterior que solo hablaba de Meta por país):**

**Mientras no haya inventario real, ningún soporte puede tener dos campañas de CLIENTES DISTINTOS aceptadas y activas a la vez, en el mismo mercado.** No es solo Meta (ADS-01): es la regla general para los 19 soportes del catálogo, incluidos CRM y Social, en este MVP (ver la nota de revisión pendiente en §9 — probablemente no todos necesiten la misma regla).

- **El control se comprueba solo contra presupuestos YA ACEPTADOS.** Se pueden crear y enviar cuantos presupuestos se quiera con el mismo soporte, mercado y fechas, a distintos prospectos — compiten por el mismo hueco, y el primero en aceptar se lo lleva. Un choque entre dos envíos sin respuesta **no** bloquea nada y no genera aviso.
- **Se activa en dos momentos**: (1) al enviar un presupuesto nuevo, si alguna de sus líneas choca con un presupuesto ya ACEPTADO de otro cliente — bloquea el envío entero, con aviso claro; (2) al aceptar un presupuesto, si para entonces ya existe otro ACEPTADO que choca — bloquea la aceptación. El caso (2) cubre la carrera entre dos presupuestos que compiten por el mismo hueco: el primero en aceptar se lo lleva, el segundo intento de aceptación choca aquí.
- **"Clientes distintos"**: el mismo anunciante (`accounts.id`) puede tener dos presupuestos aceptados para el mismo soporte y las mismas fechas sin que se bloqueen entre sí — la regla protege el hueco frente a la competencia, no impide repetir con el mismo cliente.
- **Límite conocido**: una opción cotizada solo por duración, sin fecha de inicio concreta (§5.3 bis), no tiene fechas con las que comprobar solapamiento — el control no se evalúa para ella y no bloquea. Documentado, no un descuido: implementado en `has_accepted_availability_conflict` (`supabase/migrations/20260923100000_accepted_availability_conflict.sql`), verificado contra un PostgreSQL 16 real (`scripts/verify-accepted-availability.sh`).

---

## 4. Motor de precios

### 4.1 Coste interno

```
coste_unitario = (h_neg + h_dis) × 35 € + ext
coste_linea    = coste_unitario × cantidad
```

**El coste escala con la cantidad.** Cada unidad consume sus horas y su coste externo: 3 stories son 3 boosts de 100 €, no uno. En consecuencia el suelo de margen de 4.3 también escala, y protege el margen igual en volumen que en unidad.

### 4.2 Multimercado: mercados por opción, no por línea (ronda 2)

**Los mercados se eligen UNA VEZ al configurar cada opción**, no soporte a soporte. Todo soporte de la opción se vende automáticamente en todos los mercados elegidos para ella — ya no existe "este soporte solo en ES dentro de una opción FR+ES". Cada opción del mismo envío puede tener mercados distintos entre sí (§5.1).

El diseño se reutiliza entre mercados; el boost externo no.

- **Mercado líder de la opción** (el de coeficiente más alto entre los elegidos para ELLA): coste completo en todos sus soportes.
- **Resto de mercados de la opción**: solo `h_neg × 35 € + ext` en cada uno. Las horas de diseño no se recuentan.

**Simplificación respecto a la primera versión de esta regla:** antes el mercado líder se resolvía por soporte ("el de coeficiente más alto entre aquellos en los que ESE soporte aparece"), porque un soporte podía estar en unos mercados de la opción y no en otros. Con los mercados elegidos por opción esa situación ya no puede darse — todo soporte está, por construcción, en todos los mercados de su opción — así que el mercado líder es uno solo, igual para toda la opción.

Ejemplo: opción FR+ES con ON-01 y SOC-01. FR (coeficiente 1,00) es el líder: ON-01 = 140 €, SOC-01 = 310 €. En ES: ON-01 = 70 €, SOC-01 = 170 € (se ahorra el diseño, el boost se paga igual).

**Media buy (ADS-*, INF-01) en una opción multimercado:** el presupuesto de medios y los meses dados en la línea se aplican igual en cada mercado de la opción — una campaña de Meta por país (§3), no un presupuesto repartido entre países. Es una interpretación adoptada al implementar, no una cifra del fichero origen: ver §10.3.

### 4.3 Precio de venta

```
precio_linea = precio_base × coeficiente_mercado × cantidad
precio_linea = max(precio_linea, coste_linea / 0,50)     ← suelo de margen
```

El suelo se aplica **por línea y por mercado**, y se recalcula después de cualquier descuento manual.

Con 35 €/h, los soportes que activan el suelo en algún mercado son ON-02, SOC-01, SOC-02, SOC-03 y SOC-04 — todos los que llevan boost externo fijo. SOC-02 lo activa incluso en Francia (precio mínimo 305 €).

**No existe coeficiente de duración.** Más duración = más cantidad = más tarifa bruta = más descuento por volumen automático. Añadir un coeficiente sería descontar dos veces.

### 4.4 Soportes de media buy (ADS-01, ADS-02, ADS-03, INF-01)

Salen de la fórmula general. **El cliente factura EXACTAMENTE el importe que decide gastar, nunca más** (ronda 10, sustituye al modelo anterior de esta sección). Ese importe se reparte por dentro entre lo que va al medio real (Meta, Google, el influencer) y el fee de gestión de Weekendesk — el fee se **resta** del presupuesto, no se suma encima:

```
fee                = max(presupuesto_medios × 0,40 ; fee_minimo_mensual × meses)   ← reparto automático
importe_real_medio = presupuesto_medios - fee
total_facturado    = presupuesto_medios                                            ← nunca presupuesto_medios + fee
```

**Modelo anterior, sustituido.** Antes de esta ronda el fee se sumaba ENCIMA del presupuesto: un cliente que daba 2.000 € facturaba 2.000 € + fee, aparte. Con 2.000 € de medios y un mínimo mensual de 1.200 € a un mes: fee = 1.200 €, importe real al medio = 800 €, **factura al cliente: 2.000 €, ni un euro más** — antes habría sido 3.200 €. La fórmula del fee (`max(presupuesto × 40 % ; mínimo × meses)`) no cambia; lo que cambia es que su resultado se resta del presupuesto para facturar, en vez de sumarse.

**Reparto forzable a mano, con auditoría (ronda 10).** El reparto automático de arriba es el comportamiento por defecto de ADS-01/02/03, pero se puede **forzar** a un importe negociado para un caso concreto — un fee distinto pactado con el cliente. Un fee forzado es **fijo: suelo y techo a la vez**, inmune a cualquier descuento posterior (automático o manual): representa un importe ya cerrado, no uno que deba seguir recalculándose. Como el resto de excepciones del proyecto (§8), se registra con autor, motivo y marca de tiempo — en `overrides`, kind `MEDIA_FEE_FORCED`, una fila por soporte forzado (no por mercado: el mismo reparto se aplica igual en cada mercado de la opción, §4.2).

**INF-01: el reparto SIEMPRE es manual, nunca automático.** Cada colaboración con un influencer se negocia caso por caso — no hay una regla del 40 % ni un mínimo mensual que tenga sentido de negocio ahí. La interfaz pide el presupuesto total del cliente y cuánto de eso se lleva el influencer; el resto es el fee de Weekendesk. El envío se bloquea (control nuevo en §5.3) mientras ese reparto no se confirme a mano — para este soporte, "forzar el reparto" no es una excepción ocasional, es el único camino.

**Caso límite: el presupuesto no cubre el mínimo de gestión.** Si el reparto automático dejara el importe real al medio en negativo (p. ej. cliente da 800 € pero el mínimo es 1.200 €), el motor lo calcula igual — no se inventa un suelo ni se trunca a cero en silencio — pero el envío se **bloquea** con un aviso claro (§5.3): hay que forzar el reparto a mano o subir el presupuesto. El motor solo calcula; bloquear es responsabilidad de los controles previos al envío, no de `priceOption`.

**Fee mínimo sin dato (ADS-03 e INF-01).** Solo están validados los mínimos de Meta (1.200 €) y Pmax (1.500 €). Mientras no haya cifra confirmada, el parámetro es **nulo** y el motor calcula `fee = presupuesto_medios × 0,40` sin suelo, marcando la línea con un aviso de parámetro pendiente. **No se inventa un mínimo.** No vale deducirlo del precio base del catálogo: para ADS-01 y ADS-02 el precio base (1.850 € y 2.250 €) no coincide con sus mínimos reales (1.200 € y 1.500 €), luego la analogía no se sostiene.

El suelo de margen del 50 % de 4.3 **no se aplica línea a línea** a los soportes de media buy: están fuera de la fórmula general. Sí entran en el margen de la opción, calculado **neto de medios**, que es el que debe superar el 50 % (ver 5.1 y 5.3). Así, un ADS-03 con poco presupuesto de medios y un fee que no cubre sus horas bloquea el envío por la vía del control de opción, no por un suelo de línea que la especificación no define.

**El fee mínimo mensual resiste los descuentos, confirmado.** Es un `max()` en la fórmula: dejar que un descuento lo perfore por debajo dejaría el "mínimo" sin sentido. Un fee de Pmax que dispara el mínimo mensual (por ejemplo, el caso de 4.500 € con 3.000 € de medios a tres meses) entra igualmente en la base del descuento por volumen, pero el descuento no puede bajarlo de los 4.500 €: el suelo se reaplica después del reparto, igual que en cualquier otra línea (ver 4.5). Un fee **forzado** a mano se comporta igual, con un suelo aún más estricto: coincide con el techo, así que ningún descuento le resta ni un céntimo (ver arriba).

Motivo: incluir los medios en la base del margen dispararía el precio final (un 50 % sobre 10.000 € de medios = fee implícito del 121 %, fuera de mercado) y falsearía el porcentaje de margen del informe.

**Regla de tesorería: los medios se cobran al 100 % por adelantado**, sea cual sea la condición de pago del resto. Weekendesk no adelanta dinero de Meta ni de Google.

**Para el dashboard: `importe_neto_de_medios`, redefinido (ronda 10).** Es la suma de los **fees de gestión** que Weekendesk se queda de verdad — no, como antes de esta ronda, "el importe facturado menos el gasto en medios" (esa resta daría CERO ahora que el fee ya no se suma al presupuesto para facturar: la fórmula antigua dejó de tener sentido con el modelo nuevo). El objetivo anual (150.000–200.000 €, §0) se mide sobre esta suma de fees, nunca sobre `importe_facturado`: ese es cifra de negocio contable (Weekendesk actúa como principal, no como agente), pero incluye dinero de medios que entra y sale sin margen, y no debe inflar el objetivo comercial.

**De cara al cliente: un único importe por línea de media buy, nunca el desglose (§6).** La pantalla pública, el email y el futuro PDF muestran solo el presupuesto total que dio el cliente (`billed_total_cents`) — nunca el fee calculado ni el importe real al medio por separado. De cara adentro (la interfaz de creación), el comercial sí ve el desglose completo — presupuesto, fee, importe real al medio — para controlar el margen antes de enviar.

**Presupuesto de medios: obligatorio, nunca se calcula solo (ronda 9).** Es una cifra de negociación con el cliente — sin ella, el fee de gestión no tiene sentido de negocio. El campo empieza vacío y bloquea el envío mientras lo esté (control nuevo en §5.3). **Meses del fee mínimo: nunca un campo manual (ronda 9).** Se derivan de la duración vigente de la opción, igual que la cantidad de las demás líneas (§4.2): si el periodo cambia, el número de meses se actualiza solo. Ver §10.3 novies para el detalle de implementación (`suggestedMediaMonths`).

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

#### Desactivar el descuento por volumen (ronda 9)

Interruptor **por opción**, distinto de los descuentos manuales de arriba (que se suman aparte y no cambian con este interruptor): desactiva el tramo automático de la escala por volumen para esa opción, aunque su base supere el umbral que lo activaría. Con el interruptor activado, la tarifa bruta se factura **sin ningún descuento por tramo** — los descuentos manuales, si los hay, se siguen aplicando con normalidad.

Como el resto de excepciones del proyecto (§8), se registra con autor y marca de tiempo — en la tabla `overrides`, que ya existía en el esquema desde la primera migración pero hasta esta ronda ningún flujo llegaba a escribir en ella (ver §10.1.2 y §10.3 novies).

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
- Cada opción puede ser **multimercado**, y los mercados se eligen UNA VEZ al crear cada opción (§4.2, ronda 2) — no por línea. Las opciones de un mismo envío pueden tener mercados distintos.
- **Las fechas de campaña son de cada opción, no del envío** (ronda 2): cada opción tiene su propio periodo (`campaign_start`/`campaign_end`) o, si aún no hay fecha concreta, solo una duración (§5.3 bis). Antes eran del envío entero; se movieron porque dos opciones del mismo envío pueden proponer periodos distintos (p. ej. una entrada más corta, una premium más larga).
- Cada opción calcula su propio precio, coste, margen, reach y CPM. **Todas deben pasar el suelo del 50 %**; no se compensa una opción floja con otra.
- Los 7 packs históricos del fichero (Visit Wallonia, C. Valenciana, ARA Wellness, Global City Pass) se cargan como **plantillas** de opción: entrada / estándar / amplia / premium.

### 5.2 Campos de texto libre

- **Brief de campaña**: uno por envío, heredado por todas las opciones. Contexto de la campaña: qué busca el cliente, temporada, destino.
- **Frase de opción**: una o dos líneas por opción, explicando su lógica estratégica.

Ambos en **el idioma del cliente** — cada comercial escribe directamente en francés, español, italiano o neerlandés. Sin traducción automática en el MVP.

Texto enriquecido básico: negrita, cursiva, listas, saltos de línea. Nada más (la página es pública, un editor completo abre riesgos de inyección).

El brief se reutiliza en el cuerpo del email que manda la aplicación y, más adelante, en el PDF. Empieza vacío, sin plantilla. Si está vacío al enviar: **aviso, no bloqueo**.

### 5.3 Controles antes del envío

Bloquean el botón de envío. **De los bloqueos duros, solo la antelación insuficiente (2) se puede forzar** (ronda 11, motivo obligatorio, registrado con autor y marca de tiempo en `overrides`) — es la única decisión de negocio legítima entre las cuatro; el resto son errores de datos o compromisos ya cerrados con otro cliente, y no tienen ni han tenido nunca ningún camino para saltárselos:

1. Margen por debajo del 50 % en cualquier opción — duro, no forzable
2. **Antelación insuficiente** (días laborables entre hoy y el inicio de campaña < antelación del soporte más lento) — **el único bloqueo forzable** (ronda 11, ver más abajo)
3. Disponibilidad: algún soporte de la opción, en su mercado y fechas, choca con un presupuesto ya ACEPTADO de otro cliente (§3, ronda 3) — se comprueba solo contra lo aceptado, nunca contra otros envíos sin respuesta. Duro, no forzable: forzarlo prometería al cliente un hueco que físicamente pertenece a otra campaña ya confirmada — requiere resolución humana fuera de la aplicación
4. Brief vacío (solo aviso)
5. Fechas de campaña inválidas: la fecha de fin no puede ser anterior a la de inicio (ronda 9) — solo se evalúa en modo "fechas concretas", con ambas fechas rellenas. Duro, no forzable: es un error de datos, no una decisión de negocio
6. Presupuesto de medios sin rellenar en una línea de media buy (ronda 9) — es una cifra de negociación con el cliente, nunca se calcula sola (§4.4). Duro, no forzable: falta un dato obligatorio para poder calcular el precio
7. Presupuesto de medios por debajo del fee mínimo de gestión (ronda 10, §4.4): el reparto automático dejaría el importe real al medio en negativo. Duro, no forzable como bloqueo — se resuelve forzando el REPARTO de medios a mano (`manualFeeCents`, §4.4, un control distinto) o subiendo el presupuesto, no forzando este bloqueo en sí
8. Reparto de medios sin confirmar en un soporte de reparto siempre manual (INF-01, ronda 10, §4.4) — mientras no se fuerce a mano, el envío no puede salir con ese soporte. Mismo matiz que el punto 7: lo que se fuerza es el reparto, no este bloqueo

**Antelación insuficiente forzada a mano — el único bloqueo forzable (ronda 11).** Una decisión de negocio legítima: por ejemplo, un cliente grande acepta el riesgo de un plazo ajustado. Al forzarla, la interfaz exige un motivo obligatorio antes de continuar (`src/pricing/option-draft.ts`, `forceLeadTimeOverride` — un motivo vacío o solo espacios no tiene ningún efecto, ni en la interfaz ni en el motor: `runPreSendChecks` vuelve a comprobarlo) y se registra al enviar, en `create_and_send_proposal`, con autor (`created_by`), motivo y marca de tiempo en la tabla `overrides` (kind `LEAD_TIME_FORCED` — el valor ya existía en el enum `override_kind` desde la primera migración, sin usar hasta esta ronda). Es por **soporte+mercado**, no por soporte entero: el calendario de festivos es por mercado (más abajo), así que la misma línea puede tener antelación suficiente en un mercado de la opción e insuficiente en otro — a diferencia del reparto de medios forzado (ronda 10, por soporte, igual en todos los mercados), aquí cada forzado es independiente y se registra en una fila propia de `overrides`, sin deduplicar por soporte. El detalle interno del presupuesto (`/proposals/[id]`) deja constancia visible: un badge "Antelación forzada" junto al soporte, con el motivo debajo (`proposal_option_lines.lead_time_forced`/`lead_time_force_reason`, denormalización de lectura del registro de `overrides`, mismo patrón que `manual_fee_cents` en ronda 10).

**Días laborables, resuelto (CLAUDE.md §9).** El cálculo excluye sábados, domingos y los festivos nacionales del mercado de cada línea (tabla `market_holidays`, editable en admin, sembrada con FR/ES/IT/BE-FR/BE-NL 2026-2027). BE-FR y BE-NL comparten calendario: son festivos federales belgas, no de comunidad lingüística.

El control 2 se evalúa **por línea, no por opción**: el calendario de festivos es por mercado, así que dos soportes con la misma antelación nominal pueden tener fecha límite real distinta según dónde se contraten. Motivo de la tabla: la primera campaña real es Navidad, y 15 días laborables desde diciembre cruzan el 25 de diciembre y el 1 de enero — sin festivos la calculadora decía que se llegaba a tiempo cuando no era así.

No incluye festivos regionales o municipales (2 por comunidad autónoma en España, patronales en Italia): solo el calendario nacional. Añadir eso, si hace falta, es una fila más en `market_holidays`.

**§5.3 bis — Cotizar por duración, sin fecha de inicio concreta (ronda 2).** Cada opción se puede cotizar de dos formas:
- **Fechas concretas**: `campaign_start`/`campaign_end`, igual que antes.
- **Solo duración**: p. ej. "una campaña de 1 mes", sin comprometerse a una fecha de inicio. En este modo el control 2 (antelación) **no se puede evaluar** — no hay desde cuándo contar los días laborables — así que en vez de bloquear en silencio, el motor emite un aviso visible: `LEAD_TIME_NOT_VERIFIABLE` (warning, no bloqueo). La duración elegida (p. ej. "4 semanas") se guarda tal cual (`campaign_duration_count` + `campaign_duration_unit`, en `proposal_options`) y se muestra tanto en el checklist interno como en la pantalla pública ("Duración: 4 semanas — fecha de inicio por confirmar"), para que nadie confunda un aviso con una comprobación real.

**Equivalencia periodo → unidades, y de dónde sale la cantidad sugerida.** Al introducir un periodo con fechas concretas, la interfaz muestra al lado su equivalencia en semanas y meses ("1 al 28 de octubre" → "4 semanas") con `computeDurationUnits` (`src/pricing/duration.ts`) — la MISMA función, no una aproximación aparte, que alimenta el botón "Usar duración" de cada línea (rellena la cantidad de un soporte semanal o mensual con `suggestedQuantity`). En modo "solo duración" la equivalencia es la que el comercial introdujo directamente.

**Se quita el check manual de disponibilidad con Marketing (ronda 2).** Existía como bloqueo en la app (checkbox "confirmado con…", obligatorio para ON-01, ON-02, ON-03, CRM-03 y ADS-01). Se comprueba **antes de crear el presupuesto, fuera del sistema** — la app ya no lo pide ni lo bloquea. `supports.requires_availability_check` se conserva en el catálogo como recordatorio informativo (un badge no bloqueante en la línea, "Confirmar disponibilidad con Marketing antes de contratar"), y la tabla `availability_checks` se queda en el esquema sin que nada vuelva a escribir en ella — no se borra por si se quisiera recuperar el control más adelante.

**Un control más, técnico, no de negocio: el email tiene que salir de verdad.** El cálculo y las líneas se persisten en cuanto se pulsan los controles anteriores, pero el envío no se marca `enviado` hasta que Resend confirma la entrega. Si el email falla (Resend caído, dirección inválida, etc.), el comercial ve el error y el envío se queda internamente en `borrador` — no aparece como enviado en ningún sitio y el cliente no recibe nada. Ver §10.3.

### 5.4 Inmutabilidad

Al enviar, el envío se **congela**. Ningún cambio posterior altera lo que el cliente tiene delante. Cualquier modificación crea una **versión nueva** con su propio enlace.

La **contrapropuesta solo aparece detrás del botón de rechazo**, nunca junto a aceptar. Si se ofrece al lado, el cliente negocia a la baja de entrada.

### 5.5 Estados

`borrador` → `enviado` → `visto` → `aceptado` | `rechazado` | `caducado`

`rechazado` puede generar una versión nueva en estado `borrador` (contrapropuesta).

### 5.6 Plantillas del email de envío

El email que manda la aplicación (§2) tiene una plantilla por idioma del cliente, en ficheros de traducción (`lib/email/templates/proposal-email.<idioma>.ts`), no incrustada en la lógica de envío (`lib/email/proposal-email.ts`): se puede retocar el texto sin tocar cómo se envía.

**El idioma del email es el mismo que el de la pantalla pública: `proposals.language`, el que el comercial elige al crear el presupuesto (§5.1) — nunca `contacts.language`.** Un contacto ya existente guarda su propio idioma (útil si se le vuelve a escribir en un presupuesto futuro), pero ese campo puede arrastrar el idioma de un envío anterior y no tiene por qué coincidir con el que se elige para ESTE envío. Antes de la ronda 2 el email sí usaba `contacts.language`: para un contacto reutilizado, la pantalla pública podía quedar en un idioma y el email en otro sin que nadie lo notara. Corregido en `app/api/proposals/route.ts` (guarda de regresión: `app/api/proposals/route.test.ts`).

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
- Cabecera: anunciante, validez con cuenta atrás
- Brief de campaña
- Las 2–3 opciones en columnas: nombre, frase de opción, **mercados y periodo de campaña de ESA opción** (o su duración, en modo "solo duración", §5.3 bis — cada opción puede tener mercados y fechas distintos, ronda 2), precio, detalle de soportes, reach cuando exista
- Botones: aceptar (por opción) · rechazar (el envío entero)

Reglas:
- **Precios siempre HT.** En el momento del envío aún no se conoce el régimen de IVA definitivo.
- **Reach solo donde hay dato medido con fuente.** Si no hay dato, la fila no aparece.
- Idioma del cliente.
- **Soportes de media buy: un único importe por línea, nunca el desglose (ronda 10, §4.4).** El precio que ve el cliente es el presupuesto de medios que él mismo dio — nunca el fee de gestión calculado, ni el importe que llega de verdad al medio real, ni ninguna resta entre ambos. Regla absoluta, igual en la pantalla pública, en el email y en el futuro PDF: `get_public_proposal` ni siquiera manda esos campos en su respuesta.

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
| ~~¿La regla de una campaña por país aplica a Pmax y Display?~~ | Francesco Dellaca | **Superada** (ronda 3): la regla de disponibilidad dejó de ser específica de Meta — ahora es general para los 19 soportes (§3). Ya no queda pendiente por soporte |
| **v2 — ¿CRM y Social necesitan una regla de disponibilidad distinta a la de §3?** | Vincent / dirección | Abierto. La regla actual de "un solo cliente aceptado a la vez por soporte y mercado" (§3) tiene sentido para un espacio físico limitado (ON-01 Marketing Block, ON-03 Ribbon). Una newsletter (CRM-01) o un post de Instagram (SOC-03) no tienen ese problema de espacio: varios clientes probablemente pueden compartirlos sin conflicto real. Aplicada tal cual, la regla puede bloquear envíos que en realidad no chocan con nada. Revisar en v2, no en este MVP |
| ADS-01: los 35.000/mes, ¿impresiones o alcance neto? | Francesco Dellaca | Preguntado |
| ¿Quién asume el coste de la gift card del concurso (SOC-04)? | Social | Abierto |
| Coste de boost: ¿100 € en los 5 mercados? | Social | Abierto |
| Objetivo por persona y por quarter | Vincent / dirección | Editable en admin |
| **Fee mínimo mensual de ADS-03 (Display) e INF-01 (Influencer)** | Vincent / Quentin Heliot | Abierto. Parámetro nulo en base de datos, el motor avisa. Ver 4.4 |
| Festivos regionales/municipales (ES, IT) en el cálculo de antelación | Vincent | Fuera de alcance por ahora. Solo calendario nacional en `market_holidays` |
| ~~Comprobar Site URL y Redirect URLs / desactivar Click Tracking en Resend~~ | Vincent | **Superado**: el login dejó de depender del magic link (§10.3), así que estos dos puntos ya no bloquean nada. El código que los necesitaría (`app/api/auth/send-email/`, etc.) se queda sin usar por si se recupera el magic link — entonces sí volverían a hacer falta |
| ~~Dar de alta en Supabase (Authentication > Users) a los usuarios del equipo con contraseña: Vincent, Rémi, Mario~~ | Vincent | **Ya no bloqueante**: `/admin/users` (ronda 2, §10.1.1) crea el usuario de Supabase Auth y lo añade a `allowed_emails` desde la app — no hace falta el dashboard de Supabase ni SQL a mano para dar de alta a Rémi y Mario. Sigue pendiente que Vincent los dé de alta de verdad, solo que ya puede hacerlo él mismo desde la app |
| ~~Comprobar `SUPABASE_SERVICE_ROLE_KEY` en Vercel~~ | Vincent | **Resuelto**: la clave era correcta. El bug real era que `service_role` no tenía privilegios de tabla (GRANT, no RLS) sobre `allowed_emails`/`profiles` — arreglado en `20260919120000_service_role_grants.sql`. Ver §10.3 |
| **Aplicar `20260919120000_service_role_grants.sql` en el proyecto Supabase real** (dashboard SQL editor o `supabase db push`) | Vincent | Bloqueante: sin esta migración, `service_role` sigue sin poder leer `allowed_emails`/`profiles`, y el login sigue dando "no tiene acceso" pase lo que pase con la clave. Ver §10.3 |
| **Aplicar las 3 migraciones de la ronda 2** (`20260922100000_option_level_campaign.sql`, `20260922110000_create_and_send_proposal_v2.sql`, `20260922120000_public_proposal_access_v2.sql`) en el proyecto Supabase real | Vincent | Bloqueante para mercados/fechas por opción: sin ellas, `proposal_options` no tiene las columnas nuevas y `create_and_send_proposal`/`get_public_proposal` siguen con el comportamiento antiguo (fechas del envío, no de la opción) |
| **Media buy en una opción multimercado: ¿presupuesto replicado por mercado, o repartido entre ellos?** | Vincent | Interpretación adoptada al implementar (§4.2, ronda 2): el presupuesto y los meses de la línea se aplican IGUAL en cada mercado de la opción (una campaña de Meta por país). No es una cifra confirmada por nadie — es la lectura más simple de "todos los soportes... se calculan automáticamente sobre" los mercados elegidos. Confirmar o corregir |
| **Permisos de `/admin/users`: ¿cualquier miembro de equipo, o solo un rol de administrador?** | Vincent | Hoy cualquier miembro autenticado puede dar de alta o quitar acceso a otro — no existe un rol "admin" en `profiles` (§10.3, ronda 2). Aceptable para 3 personas; si hiciera falta restringirlo, es una columna nueva y una comprobación en `app/(internal)/admin/users/actions.ts` |
| **Aplicar `20260923100000_accepted_availability_conflict.sql` en el proyecto Supabase real** | Vincent | Bloqueante para la regla de disponibilidad de §3 (ronda 3): sin esta migración, `create_and_send_proposal` y `accept_public_proposal` siguen sin comprobar conflictos con presupuestos ya aceptados |
| **Aplicar `20260924090000_qualify_pgcrypto_schema.sql` y `20260925090000_proposal_numbering.sql` en el proyecto Supabase real** | Vincent | Bloqueante: sin la primera, `create_and_send_proposal` sigue fallando con `gen_random_bytes(integer) does not exist` en el proyecto real (§10.3 quinquies); sin la segunda, `proposals.proposal_number` no existe y ni el envío normal ni "Duplicar" (ronda 8, §10.3 octies) pueden funcionar |
| **Aplicar `20260926090000_volume_discount_toggle.sql` en el proyecto Supabase real** | Vincent | Bloqueante para el interruptor "desactivar descuento por volumen" (ronda 9, §4.5, §10.3 novies): sin ella, `proposal_options.volume_discount_disabled` no existe, el valor `VOLUME_DISCOUNT_DISABLED` de `override_kind` no existe, y `create_and_send_proposal` sigue sin poder registrar la excepción en `overrides` |
| **Aplicar `20260927090000_media_fee_split.sql` en el proyecto Supabase real** | Vincent | Bloqueante para el nuevo modelo de facturación de media buy (ronda 10, §4.4, §10.3 decies): sin ella, `supports.always_manual_media_split` no existe (INF-01 no se reconoce como reparto siempre manual), `proposal_option_lines` no tiene `manual_fee_cents`/`manual_fee_reason`/`media_real_spend_cents`, el valor `MEDIA_FEE_FORCED` de `override_kind` no existe, y `create_and_send_proposal`/`get_public_proposal` siguen con el comportamiento antiguo (fee sumado al presupuesto, `net_revenue_cents` visible en la pantalla pública) |
| **Confirmar con Vincent: ¿el fee mínimo mensual de ADS-03 e INF-01 cambia ahora que INF-01 nunca tiene reparto automático?** | Vincent | Abierto, ronda 10. El parámetro sigue nulo para ambos (§4.4, §9 arriba) — para INF-01 ya no importa de cara al cálculo (el reparto siempre es manual, nunca usa `mediaManagementFee`), pero ADS-03 sigue sin mínimo confirmado y su reparto SÍ es automático por defecto. No se ha tocado el parámetro en esta ronda: sigue pendiente de Quentin Heliot como antes |
| **Aplicar `20260928090000_lead_time_force.sql` en el proyecto Supabase real** | Vincent | Bloqueante para forzar la antelación insuficiente a mano (ronda 11, §5.3, §10.3 undecies): sin ella, `overrides` no tiene la columna `market` y `proposal_option_lines` no tiene `lead_time_forced`/`lead_time_force_reason`, y `create_and_send_proposal` sigue sin poder registrar el forzado ni denormalizarlo en la línea para el detalle interno. El valor `LEAD_TIME_FORCED` de `override_kind` ya existía desde la primera migración — nada que aplicar ahí |


---

## 10. Estado de la implementación

### 10.1 Qué existe hoy

| Módulo | Ruta | Estado |
|---|---|---|
| Esquema PostgreSQL / Supabase | `supabase/migrations/` | Hecho |
| Motor de precios | `src/pricing/` | Hecho |
| Envío de email real (Resend) | `app/api/proposals/`, `lib/email/` | Hecho — presupuesto al cliente. `app/api/auth/send-email/` (magic link del equipo) queda en el código sin usar, ver §2 y §10.3 |
| Tests unitarios | `src/pricing/__tests__/`, `lib/**/*.test.ts`, `app/**/*.test.ts` | Hecho — 248 tests + scripts/verify-rls-self-read.sh + scripts/verify-accepted-availability.sh + scripts/verify-pgcrypto-schema.sh + scripts/verify-proposals-list.sh + scripts/verify-proposal-numbering.sh + scripts/verify-volume-discount-toggle.sh + scripts/verify-media-fee-split.sh + scripts/verify-lead-time-force.sh (contra PostgreSQL 16 real) |
| Interfaz (Next.js) | `app/`, `lib/`, `components/` | Hecho — 4 pantallas del MVP + navegación y listados (ronda 7) + duplicar presupuesto y numeración (ronda 8) + reparto de medios forzable a mano (ronda 10) + antelación forzable a mano y checklist traducido (ronda 11), interfaz interna en ES/FR/EN |

El motor es **puro**: no lee de la base de datos. Recibe el juego de parámetros y el catálogo como argumentos, para que los valores editables en admin (tarifa hora, suelo, coeficientes, escalas) lleguen desde `pricing_parameter_sets` y nunca estén hardcodeados en la lógica. Los valores de la sección 3 viven en `src/pricing/parameters.ts` y en la migración de seed únicamente como **estado inicial**, no como constantes de cálculo.

### 10.1.1 Pantallas construidas

| Pantalla | Ruta | Notas |
|---|---|---|
| Creación de presupuesto | `/proposals/new` | 2-3 opciones, cada una con sus propios **mercados** (checkbox múltiple) y su propio **periodo** (fechas concretas o solo duración, §5.3 bis) — ronda 2, ya no por línea ni por envío. Desplegable de país **del cliente** (ronda 2; restringido a 10 países en ronda 9, §10.3 novies) al crear cuenta nueva — no confundir con los 5 mercados de venta. Descuentos manuales, interruptor "desactivar descuento por volumen" por opción (ronda 9), vista previa en vivo con el motor, checklist de controles previos al envío (ya sin el check de disponibilidad con Marketing, ronda 2; con fechas de campaña inválidas y presupuesto de medios obligatorio añadidos en ronda 9). **Layout por pestañas (ronda 4)**: se empieza con una sola opción, sin pestañas; desde la segunda, aparecen pestañas (Opción A, B…) — cada una ocupa el ancho completo en vez de columnas apretadas — y cada pestaña dobla como resumen fijo (precio + margen), visible aunque se esté editando otra, para no perder la comparación. **Cantidad de línea auto-sincronizada con el periodo (ronda 6)**: al fijar o cambiar las fechas de la opción, la cantidad de cada línea cuya unidad coincide (semana con semana, mes con mes) se rellena sola — ya no hace falta pulsar "Usar duración" para que cuente de verdad. Una vez el comercial edita la cantidad a mano, se respeta y deja de tocarse sola; el botón pasa a servir para resincronizarla si el periodo cambia después de esa edición. **Meses del fee mínimo de media buy auto-derivados de la duración (ronda 9)**: nunca un campo manual, igual principio que la cantidad. **Reparto de medios forzable a mano (ronda 10)**: cada línea de media buy muestra el desglose interno en vivo (fee calculado, importe real al medio) y, para ADS-01/02/03, un interruptor para forzar el fee a un importe negociado; INF-01 siempre muestra el campo de forzado (nunca reparto automático), enmarcado como "importe para el influencer" en vez de "fee", derivando el fee internamente como la resta contra el presupuesto total — mismo modelo de datos por debajo, presentación distinta según el soporte. **Checklist de controles en el idioma de interfaz, y antelación forzable a mano (ronda 11)**: los textos de avisos y bloqueos, antes en español fijo dentro de `src/pricing/checks.ts`, se traducen ahora con el mismo selector ES/FR/EN de la cabecera; cada bloqueo de antelación insuficiente (el único forzable, §5.3) lleva un botón "Forzar antelación" que pide un motivo obligatorio antes de continuar — al confirmarlo, el bloqueo pasa a un aviso "forzado" con un botón para deshacerlo, y el motivo viaja hasta `create_and_send_proposal`, que lo registra en `overrides` con autor y marca de tiempo |
| Alta de usuarios del equipo | `/admin/users` | Ronda 2. Crea el usuario en Supabase Auth (`auth.admin.createUser`, clave de servicio) y lo añade a `allowed_emails` en el mismo paso — sustituye el alta manual por SQL/dashboard como único camino (sigue funcionando como alternativa). Lista el estado de cada email (ha entrado / aún no) y permite quitar el acceso. Cualquier miembro de equipo autenticado puede usarla: no hay rol de administrador separado (§9) |
| Pantalla pública comparativa | `/p/[token]` | `get_public_proposal` (SECURITY DEFINER), reach solo con dato medido, caduca a los 14 días, idioma del cliente. Mercados y periodo (o duración) **por opción**, ronda 2 |
| Aceptación con datos fiscales | Modal en `/p/[token]` | VIES verificado en servidor (`app/api/public/proposals/[token]/accept`), régimen de IVA decidido en `accept_public_proposal` |
| Rechazo | Modal en `/p/[token]` | Registra motivo; **no** construye la contrapropuesta (ver más abajo) |
| Login | `/login` | Email + contraseña (`supabase.auth.signInWithPassword`), no magic link — ver §2 y §10.3 para por qué. `app/login/actions.ts` (`loginWithPassword`, Server Action) hace el login y comprueba la lista blanca en el mismo paso: si `signInWithPassword` falla, mensaje genérico de credenciales incorrectas sin revelar si el email existe; si tiene éxito pero el email no está en `allowed_emails`, cierra la sesión ahí mismo (`supabase.auth.signOut()`) y devuelve un motivo claro ("no tiene acceso... pide a Vincent"). Reutiliza `resolveTeamAccess` (`lib/supabase/team-access.ts`) sin cambios: mismo aprovisionamiento de `profiles` que con el magic link, que crea el `profiles` que falta en el primer login para evitar la dependencia circular con RLS (`is_team_member()` exige un `profiles` que aún no existe). `allowed_emails.full_name` es opcional: si no se rellena al dar de alta a alguien, se deriva del email. Un fallo al crear el `profiles` (constraint, RLS mal configurado, lo que sea) se registra explícitamente como fallo de aprovisionamiento y no como "no autorizado". Sin registro público (usuarios dados de alta desde `/admin/users`, ronda 2, o a mano en el dashboard de Supabase) ni recuperación de contraseña por email en esta versión. El código del magic link (`/auth/callback`, `/auth/confirm`, `lib/supabase/login-redirect.ts`, `lib/email/magic-link-email.ts`, `lib/email/confirm-url.ts`, `app/api/auth/send-email/`) sigue en el repo, sin usar, por si se recupera más adelante |
| Listado de presupuestos | `/proposals` | Ronda 7, ampliado en ronda 8. Todos los presupuestos (cualquier miembro de equipo ve los de todo el equipo, RLS `team_all` sin scoping por `owner_id` — §10.3 septies), con filtro por estado y por creador (`ProposalsFilterBar`, navega por query string `?status=&owner=` para que el Server Component vuelva a consultar ya filtrado). Columnas: **número** (§10.3 octies), cuenta, contacto, estado, última modificación, creador. Cada fila abre `/proposals/[id]` |
| Detalle de presupuesto | `/proposals/[id]` | Ronda 7, ampliado en ronda 8. Solo lectura: cabecera (número de presupuesto, cuenta, contacto, creador, fechas) + una tarjeta por opción con sus líneas, tal como quedaron congeladas al crear el presupuesto. En `DRAFT` (el email nunca salió) muestra un aviso y el botón **"Reintentar envío"** (`RetrySendButton` → `actions.ts`, `retryProposalSend`) — reintenta solo el paso de mandar el email con los datos ya persistidos, nunca recalcula el precio (ver §10.3 septies sobre por qué no es un editor de campos). En cualquier otro estado, enlace público (`/p/[token]`), fechas, y el botón **"Duplicar"** (`DuplicateButton` → `actions.ts`, `duplicateProposal`, ronda 8, §10.3 octies) — crea un presupuesto nuevo en `DRAFT`, recalculado con los parámetros vivos, y navega a su propio detalle. **Antelación forzada, visible por línea (ronda 11)**: si una línea forzó su antelación insuficiente al enviar, un badge "Antelación forzada" con el motivo debajo — constancia visible del §5.3, leída de `proposal_option_lines.lead_time_forced`/`lead_time_force_reason` |
| Listado de cuentas | `/accounts` | Ronda 7. Razón social, país, nº de contactos, nº de presupuestos; abre `/accounts/[id]` |
| Ficha de cuenta | `/accounts/[id]` | Ronda 7. Contactos de la cuenta + historial completo de sus presupuestos (misma tabla que `/proposals`, `ProposalsTable`, sin repetir la columna de cuenta), cada uno abriendo `/proposals/[id]` |

**Arquitectura de cálculo:** el navegador ejecuta el mismo motor (`src/pricing/`) para la vista previa en vivo mientras el comercial edita, pero esos números **nunca se persisten**. Al pulsar "Enviar", `app/api/proposals/route.ts` recibe los datos crudos (soportes, mercados, cantidades, descuentos) y **vuelve a calcular en el servidor** con los parámetros vivos de la base de datos — eso es lo único que se guarda, vía `create_and_send_proposal` (una función SQL `SECURITY INVOKER`, atómica: opción + líneas + descuentos + checks de disponibilidad en una sola transacción). El envío ya no se marca `SENT` dentro de esa misma función: queda en `DRAFT`, congelado (mismo `frozen_snapshot` de siempre) pero invisible en la pantalla pública, hasta que la ruta de servidor manda el email por Resend y llama a `mark_proposal_sent`. Si Resend falla, llama a `log_proposal_send_failure` en su lugar y el envío se queda en `DRAFT` — nunca se marca enviado sin que el cliente lo haya recibido (ver §5.3, §10.3).

**Verificado end to end contra un PostgreSQL 16 real** (no solo tipado): crear y enviar un presupuesto con el motor real, leer la pantalla pública (reach con y sin dato, caducidad), aceptar con VIES simulado (régimen de IVA correcto), rechazar, y los bloqueos de estado (no se puede aceptar dos veces, ni aceptar un envío caducado). El envío de email por Resend y el "Send Email Hook" de Supabase están escritos contra la documentación de ambos, no contra un proyecto Supabase ni una cuenta de Resend reales (ver más abajo): conviene una prueba manual tras el primer despliegue.

### 10.1.2 Deliberadamente fuera de esta pasada

Explícito para no dar por hecho más de lo construido:

- **Dashboard de seguimiento** por persona y quarter fiscal, con métricas y gráficas (CLAUDE.md §1): sigue sin construir. No confundir con la navegación y los listados de `/proposals` y `/accounts` (ronda 7, §10.3 septies) — eso resuelve "no hay forma de ver lo ya enviado", no el objetivo por persona/quarter fiscal ni ningún gráfico; explícitamente pedido aparte cuando toque.
- **Contrapropuesta** tras rechazo (§5.4, §5.5): el rechazo se registra; crear la versión nueva en `borrador` es una acción interna posterior, no implementada. No confundir con **"Duplicar"** (ronda 8, §10.3 octies): duplicar parte de CUALQUIER presupuesto ya enviado, no solo de uno rechazado, y no guarda ninguna relación con el rechazo ni con `rejection_reason` — es una copia general, no el flujo de contrapropuesta que pide esta especificación.
- **Forzar un bloqueo con motivo** (§5.3, tabla `overrides`): hoy un bloqueo (margen, antelación, disponibilidad) impide enviar sin excepción; no hay UI para forzarlo y registrar autor/motivo.
- **Gestión de cuentas y contactos** como pantallas propias: siguen creándose inline al construir un presupuesto (`/proposals/new`, sin un CRM dedicado — crear o editar una cuenta/contacto no tiene pantalla propia). La ronda 7 añade `/accounts` y `/accounts/[id]` como **listado y ficha de solo lectura** (contactos, historial de presupuestos): es navegación, no gestión — ver §10.3 septies.
- **Verificación VIES mientras se escribe**: se comprueba solo al enviar el formulario de aceptación, no en vivo. Probado que el endpoint construye la llamada REST correctamente; **no se ha podido probar contra la API real de la UE** porque la política de red de este entorno de desarrollo bloquea la salida a `ec.europa.eu` — funcionará en Vercel, pero conviene una prueba manual tras el primer despliegue.
- **Sin proyecto Supabase real conectado**: el código usa `@supabase/ssr` correctamente (`lib/supabase/`), pero no hay credenciales en este entorno. `lib/supabase/database.types.ts` está escrito a mano a partir de las migraciones; al crear el proyecto real, regenerar con `supabase gen types typescript` y revisar que coincide.
- **Sin cuenta de Resend real conectada**: `lib/email/` (contenido de los emails de presupuesto, cliente de Resend) está probado con tests unitarios y mocks de `fetch`; el envío real (`app/api/proposals/route.ts`) sigue la documentación de Resend pero no se ha podido disparar contra la API real en este entorno. Configurar `RESEND_API_KEY` y `RESEND_FROM_EMAIL` en Vercel y probar el envío a mano tras el despliegue. `app/api/auth/send-email/route.ts` (el "Send Email Hook") sigue sin usarse — el login ya no depende de él, ver §10.3. **Que falten estas variables ya no impide crear el presupuesto** (ronda 4, §10.3): el envío se persiste en `DRAFT` igual, y solo el "mandarlo por email" queda bloqueado — antes faltaban y no se creaba nada en absoluto, ni la cuenta ni el contacto.
- ~~**Reintento de un envío con email fallido**~~: **resuelto en la ronda 7** (§10.3 septies). `/proposals/[id]` lista el presupuesto en `DRAFT` con un botón "Reintentar envío" que llama a `retryProposalSend` (`app/(internal)/proposals/[id]/actions.ts`) — reintenta solo el email, con los datos ya persistidos, sin recalcular el precio.
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

### 10.3 bis — Ronda 2 de correcciones (primera prueba real de la app)

Primera tanda de correcciones tras probar el MVP de verdad (no solo tipado ni Postgres local), agrupada en el pedido original por prioridad: bloqueante, funcional, interfaz. Cada punto se verificó — el motor y las migraciones contra un PostgreSQL 16 real, igual que en las rondas anteriores — antes de darlo por resuelto.

**1–2. "Nueva cuenta" y "Nuevo contacto" no funcionaban.** Diagnosticado en dos frentes:

- **Capa de datos**: se reprodujo la creación de una cuenta y un contacto nuevos a través de `create_and_send_proposal` contra un PostgreSQL 16 real (payload completo, dos opciones) — funcionó sin error. La función SQL en sí nunca fue el problema.
- **Interfaz**: `ProposalBuilder.tsx` tenía el desplegable de "Contacto" con `disabled={accountId === '__new__' && selectedAccount === null}`. Como `selectedAccount` se busca por `accounts.find(a => a.id === accountId)`, y ninguna cuenta real tiene id `'__new__'`, esa condición es **siempre** `accountId === '__new__' && true` — el desplegable de contacto queda bloqueado (gris, no interactivo) cada vez que se elige "+ Nueva cuenta". Los campos de texto de "Nuevo contacto" seguían renderizándose debajo y funcionando, pero un desplegable inutilizable justo encima parece, con razón, que "no funciona". Arreglado quitando esa condición al reconstruir el formulario (ver punto 9 más abajo): ya no hay ningún `disabled` espurio.

**3. Alta de usuarios desde la app.** Hasta ahora había que crear el usuario en Supabase Auth (dashboard) y añadirlo a `allowed_emails` (SQL) por separado — dos pasos manuales que bloqueaban literalmente a Rémi y Mario. Nueva pantalla `/admin/users` (`app/(internal)/admin/users/`): un formulario llama a `auth.admin.createUser` con la clave de servicio (la única forma de crear un usuario con contraseña sin pasar por el registro público) y hace `upsert` en `allowed_emails` en el mismo paso; la lista de abajo muestra quién ya ha entrado (existe `profiles`) y permite quitar el acceso (borra de `allowed_emails` y desactiva el `profiles` si existe, sin borrar el usuario de Supabase Auth — revertirlo es volver a darlo de alta). No hay concepto de "administrador" en el modelo de datos (`is_team_member()` es binario: miembro de equipo o no), así que cualquier persona con sesión puede usar esta pantalla — documentado como decisión abierta en §9, no un descuido.

**4. Mercados por opción, no por línea.** Cambio de fondo en el motor (§4.2): `OptionInput` pasa de tener `market` en cada línea a tener `markets: Market[]` una vez por opción; el motor expande automáticamente cada soporte a todos los mercados de la opción y calcula el mercado líder (el de mayor coeficiente entre los elegidos) una sola vez para toda la opción, no soporte a soporte. Esto **simplifica** la regla original de §4.2 ("el mercado líder se determina por soporte"): ese matiz solo existía porque antes un soporte podía estar en unos mercados de la opción y no en otros; con los mercados elegidos por opción eso ya no puede pasar. Los tests de `engine.test.ts` que cubrían ese caso concreto (`CRM-01` solo en ES dentro de una opción FR+ES) se sustituyeron por uno que confirma que ya no es posible expresarlo — todo soporte de una opción está, por construcción, en todos sus mercados.

**5. Fechas de campaña por opción, no por presupuesto.** `proposals.campaign_start`/`campaign_end` se mueven a `proposal_options` (migración `20260922100000_option_level_campaign.sql`), junto con `markets market[]` (guardado explícito, no solo derivable de las líneas — para no recalcularlo cada vez que se muestra: cabecera de opción en la pantalla pública, futuro dashboard). `create_and_send_proposal` y `get_public_proposal` se reescriben en consecuencia (`_v2.sql`). Verificado end-to-end contra Postgres real: una opción con fechas concretas y otra con mercados distintos y solo duración, en el mismo envío, se crean y se leen correctamente por separado.

**6. Equivalencia periodo → unidades, y de dónde sale la cantidad.** Nueva función pura `computeDurationUnits` (`src/pricing/duration.ts`, con sus propios tests): días naturales inclusive → semanas y meses, redondeando hacia arriba (una semana empezada cuenta entera). Es la MISMA función que alimenta el botón "Usar duración" de cada línea semanal o mensual (`suggestedQuantity`) — no una fórmula de mostrar distinta de la de calcular, que es justo lo que se pedía verificar.

**7. Cotizar por duración sin fechas concretas.** Cada opción tiene ahora un modo — "Fechas concretas" o "Solo duración" — con radio buttons en la interfaz. En modo duración se guarda `campaign_duration_count`/`campaign_duration_unit` en vez de fechas, y el control de antelación (§5.3) no se evalúa: en su lugar, un aviso nuevo y explícito (`LEAD_TIME_NOT_VERIFIABLE`, warning no bloqueante) dice que la antelación no se pudo comprobar. La duración se muestra tanto en el checklist interno como en la pantalla pública del cliente ("Duración: 4 semanas — fecha de inicio por confirmar"), no solo puertas adentro.

**8. Se quita el check manual de disponibilidad con Marketing.** Bloqueante (`AVAILABILITY_NOT_CONFIRMED`) y su checkbox correspondiente, eliminados de `checks.ts` y de `ProposalBuilder.tsx`. Se comprueba antes de crear el presupuesto, fuera del sistema (§5.3). `supports.requires_availability_check` se conserva como recordatorio informativo (badge no bloqueante en la línea) y la tabla `availability_checks` se queda en el esquema sin uso — ninguna migración destructiva.

**9. Desplegable de país.** El campo de texto libre "País (ISO-2, ej. FR)" se sustituye por un `<select>` (`lib/countries.ts`, `COUNTRY_CODES`) con el nombre del país generado por `Intl.DisplayNames`, ya localizado al idioma de interfaz activo — evita mantener a mano tres traducciones de ~60 nombres de país. Esto también forzó a separar `country_code` (cualquier país, ahora de verdad seleccionable) de `primary_market` (uno de los 5 mercados de Weekendesk): el campo `primary_market` de `newAccount` nunca tuvo un control en la interfaz (siempre viajaba fijo a `'FR'`) y se ha quitado del todo en vez de intentar derivarlo de un país arbitrario que puede no ser ninguno de los 5.

**10. Interfaz interna en varios idiomas.** `lib/i18n-internal.tsx`: contexto de React + diccionario ES/FR/EN + `localStorage` (preferencia de navegador, nunca en base de datos — no confundir con el idioma DEL CLIENTE, que sigue siendo un dato de `proposals`). Selector visible (`components/LanguageSwitcher.tsx`) en la cabecera interna y en el login. Aplicado a login, cabecera, `/admin/users`, `ProposalBuilder`, `PreSendChecklist` y `DiscountBanner` — el grueso de la interfaz que usa el equipo a diario.

**11. Verificación del idioma del cliente — se encontró un bug real de sincronización.** Al trazar "el idioma se elige al crear el presupuesto y determina la pantalla pública y el email" de un extremo a otro se encontró que **no** era del todo cierto: la pantalla pública lee `proposals.language` (fijado por el selector "Idioma del cliente" de la interfaz), pero el email se construía con `contacts.language` — el idioma guardado en la ficha del contacto, que para un contacto YA EXISTENTE puede venir de un envío anterior en otro idioma y no tiene por qué coincidir con lo elegido para ESTE envío. Corregido en `app/api/proposals/route.ts`: el email usa ahora `body.language`, exactamente el mismo valor que alimenta `proposals.language`, con una guarda de regresión de texto fuente (`app/api/proposals/route.test.ts`) para que no vuelva a divergir sin que salte algo. De paso, el campo `newContact.language` de la interfaz (que existía en el estado pero nunca tuvo un control propio, y se quedaba fijo en `'FR'`) se quitó: un contacto nuevo hereda directamente el idioma elegido para el envío.

**12. Logos.** `LOGO_Weekendesk_color.png` y `LOGO_Weekendesk_white.png` en `/public` (no estaban en la raíz del repo como se indicó — se localizaron entre los recursos de marca ya disponibles en este entorno, mismos ficheros). Sustituyen al texto "Weekendesk Advertising": versión en color en el login y en la pantalla pública (fondo claro), versión en blanco en la cabecera interna (fondo azul marino).

### 10.3 ter — Ronda 3: regla de disponibilidad real (sustituye a la de Meta por país)

Vincent decidió la regla que sustituye a la restricción original de §3 ("máximo una campaña de cliente por país en Meta"), demasiado estrecha una vez el catálogo entero (19 soportes) puede chocar por falta de inventario real:

**Mientras no haya inventario real, ningún soporte puede tener dos campañas de CLIENTES DISTINTOS aceptadas y activas a la vez, en el mismo mercado** — no solo Meta, todo el catálogo, CRM y Social incluidos en este MVP (con la salvedad de revisión pendiente para v2, ver §9: una newsletter o un post no compiten por un espacio físico limitado igual que un Marketing Block o un Ribbon, así que puede que no necesiten la misma regla — pero eso se decide en v2, no aquí).

**Punto central de la especificación: el control solo mira presupuestos YA ACEPTADOS.** Se pueden crear y enviar cuantos presupuestos se quiera con el mismo soporte, mercado y fechas, a distintos prospectos: compiten por el mismo hueco y el primero en aceptar se lo lleva. Un choque entre dos envíos sin respuesta no bloquea nada y no genera aviso — bloquearlo ahí habría impedido a los comerciales ni siquiera COTIZAR en paralelo a dos prospectos por el mismo hueco, que es exactamente el comportamiento comercial normal mientras no hay inventario reservado.

**Implementación** (`supabase/migrations/20260923100000_accepted_availability_conflict.sql`):

- `has_accepted_availability_conflict(support_id, market, campaign_start, campaign_end, account_id, exclude_proposal_id)`: función SQL pura, `SECURITY DEFINER` (como `is_team_member()`, para funcionar igual la llame quien la llame). Comprueba si existe un presupuesto `ACCEPTED` de una cuenta **distinta** cuya opción aceptada tenga una línea con el mismo `support_id`+`market` y un periodo que se solape (`campaign_start <= otro.campaign_end and otro.campaign_start <= campaign_end`).
- **`create_and_send_proposal`** (ronda 3): antes de insertar cada línea, comprueba el conflicto para esa opción; si lo hay, `raise exception` con el soporte y mercado exactos — aborta la transacción entera, nada se persiste, mensaje claro para el comercial (llega tal cual a `submitError` en `ProposalBuilder` vía `app/api/proposals/route.ts`).
- **`accept_public_proposal`** (ronda 3): antes de registrar la aceptación, la misma comprobación sobre las líneas de la opción que se está aceptando — cubre la carrera entre dos presupuestos que compiten por el mismo hueco: el primero en aceptar pasa, el segundo choca aquí, ya con el primero como aceptado.
- **Límite documentado, no un descuido**: una opción en modo "solo duración" (§5.3 bis) no tiene fechas concretas, así que el solapamiento no se puede determinar — la función simplemente no encuentra conflicto para ella (ni bloquea ni deja de bloquear con certeza: no se pronuncia). No se ha construido ningún aviso adicional para este caso en esta pasada — es una limitación real, documentada aquí para no repetir la sorpresa de una regla "que no hace nada" sin más explicación.

**Verificado contra un PostgreSQL 16 real**, no solo tipado (`scripts/verify-accepted-availability.sh`, ejecutable y repetible): dos presupuestos `SENT` de cuentas distintas con el mismo soporte/mercado/fechas coexisten sin bloqueo; un presupuesto nuevo que choca con uno ya `ACCEPTED` de otra cuenta no se puede enviar; la MISMA cuenta que el ya aceptado sí puede enviar otro para el mismo hueco (la regla es "clientes distintos"); y, en la carrera entre dos `SENT` que compiten por el mismo hueco, el segundo en intentar aceptar choca contra el primero ya aceptado.

### 10.3 quater — Ronda 4: "Nueva cuenta" seguía sin funcionar de verdad, y layout por pestañas

**El diagnóstico de la ronda 2 fue incompleto — arregló un bug real, pero no EL bug que impedía crear nada en producción.** Reporte de Vincent: `accounts` seguía con 0 filas después del PR de la ronda 2. Investigado desde cero, sin repetir el diagnóstico anterior sin comprobarlo:

1. **Hipótesis descartada, verificada contra un PostgreSQL 16 real**: que las migraciones de la ronda 2/3 (mercados y fechas por opción) no aplicadas en producción hicieran que `create_and_send_proposal` (la versión antigua, la que seguiría viva sin esas migraciones) rechazara el payload nuevo que manda la app actual. Reproducido explícitamente: se aplicaron solo las migraciones hasta la ronda 1 (sin las de mercados/fechas por opción ni la de disponibilidad) y se llamó a esa función con el payload EXACTO que construye hoy `app/api/proposals/route.ts` (mercados por opción, sin `market` a nivel de línea de entrada, sin fechas a nivel de envío) — la cuenta se creó sin error (`select count(*) from accounts` → 1). La función antigua ignora en silencio las claves JSON que no conoce; no hay desajuste de esquema que la rompa.
2. **Causa real, encontrada al releer `app/api/proposals/route.ts` de arriba a abajo**: la ruta comprobaba `RESEND_API_KEY`/`RESEND_FROM_EMAIL` **antes** de llamar a `create_and_send_proposal`, y abortaba con un 500 si faltaban — sin llegar nunca a la función que crea la cuenta, el contacto, las opciones y las líneas. Si esas dos variables no están configuradas en Vercel (§10.1.2 ya documentaba que no se habían probado contra una cuenta de Resend real, pero no que esto bloqueara la persistencia), **ningún presupuesto se llega a crear jamás**, sin importar si la cuenta es nueva o existente — coincide exactamente con `accounts` en 0 filas.
3. **Por qué el diagnóstico de la ronda 2 no era falso, solo incompleto**: el `disabled` espurio del desplegable de "Contacto" (ronda 2) era un bug real y se quedó arreglado — pero incluso con la interfaz perfecta, si el comercial completa el formulario y pulsa "Enviar", la petición nunca llegaba a tocar la base de datos por este segundo bloqueo, independiente del primero. Los dos bugs estaban apilados uno detrás del otro.

**Arreglado invirtiendo el orden** (`app/api/proposals/route.ts`): `create_and_send_proposal` se llama primero, siempre que los datos sean válidos — el presupuesto (cuenta, contacto, opciones, líneas) se persiste en `DRAFT` pase lo que pase con Resend, cumpliendo lo que el diseño de la ronda 1 ya pretendía (§10.3, punto 5: "enviado" se marca al confirmar el email, no al persistir el cálculo). La comprobación de `RESEND_API_KEY`/`RESEND_FROM_EMAIL` se mueve a después, justo donde se decide si se puede intentar mandar el email — si faltan, se trata exactamente como un fallo de envío de Resend (`log_proposal_send_failure`, el envío se queda en `DRAFT`), no como un motivo para no haber guardado nada.

**Guarda de regresión de comportamiento**, no solo de texto fuente (`app/api/proposals/route.test.ts`, con Supabase/Resend simulados): un envío con `RESEND_API_KEY`/`RESEND_FROM_EMAIL` ausentes sigue llamando a `create_and_send_proposal` (se persiste) y llama a `log_proposal_send_failure` (nunca a `sendEmail`); con las variables presentes, manda el email y marca `mark_proposal_sent` con normalidad. Así, si alguien reordena esto otra vez sin darse cuenta, una prueba lo detecta antes que un reporte de producción.

**Layout del creador de presupuesto: de columnas a pestañas.** Con mercados, fechas, líneas y precios por opción (rondas 2-3), las columnas lado a lado (`.wk-grid-options`, `repeat(auto-fit, minmax(300px,1fr))`) se quedaban demasiado estrechas para ser legibles. Sustituido por pestañas (`ProposalBuilder.tsx`, `OptionSummaryTab`):

- Se empieza con **una sola opción, sin pestañas visibles** — nada que comparar todavía.
- Al añadir la segunda (`+ Añadir opción`), aparecen pestañas (Opción A, Opción B…), cada una ocupando el ancho completo en vez de una columna estrecha. Añadir o quitar una opción cambia la pestaña activa a la recién creada o a la primera restante.
- **Cada pestaña dobla como resumen fijo** (precio facturado + margen de esa opción), con `position: sticky; top: 0` — se ve aunque se esté editando otra pestaña más abajo en la página, para no perder la comparación de un vistazo (pedido explícito de Vincent). Verificado visualmente con capturas de Playwright contra un servidor de desarrollo real: la barra de pestañas se queda fija arriba del viewport al hacer scroll por el contenido de una opción larga, y cambiar de pestaña sustituye el editor completo sin tocar el resto del formulario (cuenta, contacto, idioma, brief).
- El botón "Enviar al cliente" se deshabilita explícitamente con menos de 2 opciones (antes no había ninguna comprobación de cliente para este caso; el servidor ya lo rechazaba, pero solo después de que el comercial pulsara enviar).

### 10.3 quinquies — Ronda 5: `gen_random_bytes` no se encontraba — pgcrypto vive en "extensions", no en "public"

Con la persistencia arreglada (ronda 4), Vincent llegó a probar un envío real y dio un error nuevo, más profundo: `function gen_random_bytes(integer) does not exist`. Confirmó él mismo en el dashboard de Supabase que pgcrypto **sí** está instalada (`select extname from pg_extension where extname = 'pgcrypto'` devuelve una fila) — así que el problema no era la extensión en sí, sino dónde vive.

**Diagnóstico, confirmado contra un PostgreSQL 16 real antes de tocar nada** (`scripts/verify-pgcrypto-schema.sh`, nuevo):

- En un proyecto Supabase real, Supabase instala pgcrypto en el esquema **`extensions`**, no en `public` — de fábrica, antes de que corra ninguna migración de este repo.
- `create_and_send_proposal` (y todas las funciones `SECURITY DEFINER`/`SECURITY INVOKER` de este esquema) fijan `set search_path = public` a propósito — buena práctica de seguridad para funciones privilegiadas, para no depender de un search_path mutable que alguien pueda manipular. Pero eso significa que ninguna de ellas ve `extensions` en su search_path: una llamada sin cualificar a `gen_random_bytes(24)` nunca la encuentra ahí.
- `create extension if not exists "pgcrypto"` (en `20260918120000_initial_schema.sql`) es un no-op silencioso cuando la extensión ya existe en OTRO esquema — comprobado explícitamente: `create extension if not exists "pgcrypto"` sobre una base con pgcrypto ya instalada en `extensions` no crea ninguna copia en `public`, solo emite un aviso ("already exists, skipping") y no hace nada más. En el proyecto Supabase real, esa migración nunca llegó a instalar nada en `public`: pgcrypto ya estaba en `extensions` desde antes.
- El entorno de desarrollo de este repo (sin proyecto Supabase real, §10.1.2) sí crea pgcrypto en `public`, porque `create extension if not exists "pgcrypto"` corre sobre una base de datos nueva donde `public` es el único esquema con algo dentro — por eso ningún script de verificación anterior (`verify-accepted-availability.sh`, `verify-rls-self-read.sh`) reprodujo nunca este bug: sus bases de prueba nunca tuvieron pgcrypto en ningún otro sitio que no fuera `public`.

**Barrido completo del esquema, tal como pidió Vincent**, no solo la línea que falló: `grep` de `gen_random_bytes|encode(|digest(|crypt(|hmac(` sobre `supabase/migrations/*.sql` — el único sitio de todo el esquema que llama a una función de pgcrypto es la generación del token público en `create_and_send_proposal` (`encode(gen_random_bytes(24), 'hex')`, repetida en cada versión sucesiva de la función a lo largo de las rondas). Ningún otro sitio necesita el arreglo: todos los demás usos de aleatoriedad en el esquema son `gen_random_uuid()`, que desde PostgreSQL 13 es una función nativa de `pg_catalog` — no depende de pgcrypto ni de ningún esquema de extensión, por eso nunca ha dado este problema.

**Arreglo, en una migración nueva** (`20260924090000_qualify_pgcrypto_schema.sql`; no se edita `20260923100000_accepted_availability_conflict.sql`, ya aplicada — una migración aplicada no se reescribe, se sustituye con `create or replace function` en una migración posterior):

1. Cualifica la llamada como `extensions.gen_random_bytes(24)` en vez de `gen_random_bytes(24)`. Es la solución robusta que pidió Vincent, no un `search_path` frágil: una referencia cualificada por esquema ignora el search_path por completo, así que funciona sea cual sea el search_path de la función que la llama, ahora y si alguien lo cambia en el futuro. La alternativa de añadir `extensions` al `search_path` de la función se descarta a propósito: reabriría exactamente el problema que fijar `search_path = public` evita en una función privilegiada.
2. Para que el mismo arreglo funcione también en el entorno de desarrollo de este repo (pgcrypto en `public`, no en `extensions`): crea el esquema `extensions` si no existe y, si pgcrypto ya existe en otro esquema, la mueve con `alter extension pgcrypto set schema extensions` (Postgres no permite dos copias de la misma extensión en esquemas distintos). En el proyecto Supabase real esto es un no-op — pgcrypto ya está en `extensions` — y en local, la deja exactamente donde este arreglo la espera.
3. **Concede explícitamente `usage on schema extensions` a `anon`, `authenticated` y `service_role`.** Sin este grant, la migración se probó contra Postgres real y falló con `permission denied for schema extensions` al ejecutarla sobre una base donde `extensions` se acaba de crear (el caso del entorno de desarrollo, paso 2 de arriba) — un error de USAGE de esquema, distinto y anterior al de EXECUTE sobre la función. Es la misma lección, repetida, del Bug A de la ronda 1 (`service_role_grants.sql`, §10.3): no dar por buena ninguna suposición sobre qué le concede Supabase a un rol por defecto, en ningún esquema, sin comprobarlo contra Postgres real — ni siquiera en el propio arnés de pruebas. En el proyecto Supabase real este grant probablemente ya existe (Supabase concede `usage` sobre `extensions` a estos tres roles de fábrica), pero concederlo aquí de forma explícita no tiene coste y hace que la migración sea autosuficiente en cualquier entorno, sin depender de ese bootstrapping implícito.

**Test que reproduce el fallo contra Postgres real antes de arreglarlo** (`scripts/verify-pgcrypto-schema.sh`, nuevo, siguiendo el mismo patrón que `verify-accepted-availability.sh` y `verify-rls-self-read.sh`): a diferencia de esos dos scripts, este monta pgcrypto en un esquema `extensions` **antes** de aplicar ninguna migración del repo — igual que hace Supabase de fábrica, y a propósito distinto del resto de scripts de este repo, que dejan que sea la migración inicial la que la cree (en `public`, ocultando el bug). Con las migraciones aplicadas solo hasta la ronda 3 (sin el arreglo), `create_and_send_proposal` falla exactamente con `function gen_random_bytes(integer) does not exist` — el mismo error de Vincent — y sin dejar ninguna fila a medias (la función es una sola transacción). Tras aplicar `20260924090000_qualify_pgcrypto_schema.sql`, la misma llamada funciona, el token público sigue midiendo 48 caracteres hex (mismo formato exacto de antes, 24 bytes) y pgcrypto sigue teniendo una única instalación en `extensions` (la migración no duplica la extensión).

**Regresión encontrada y corregida en el propio arreglo, antes de darlo por bueno**: la primera versión de la migración (sin el grant del punto 3) pasaba `verify-pgcrypto-schema.sh` pero rompía `verify-accepted-availability.sh` con el mismo `permission denied for schema extensions` — ese script parte de pgcrypto en `public` (como el resto del entorno de desarrollo), así que el bloque que mueve la extensión a `extensions` sí se ejecuta ahí, y sin el grant explícito el nuevo esquema se queda sin acceso para los roles de Supabase. Se reprodujo, se añadió el grant, y se volvieron a pasar los tres scripts de verificación (`verify-pgcrypto-schema.sh`, `verify-accepted-availability.sh`, `verify-rls-self-read.sh`) para confirmar que ninguno queda roto por el arreglo de otro.

### 10.3 sexies — Ronda 6: la cantidad de línea dependía de una acción manual, al revés de lo decidido — y verificación de todo el motor como cascada

**Bug confirmado por Vincent, con reproducción exacta**: al fijar el periodo de una opción, la cantidad de cada línea arrancaba en 1 — el comercial tenía que acordarse de pulsar "Usar duración" en cada línea para que se rellenara con el equivalente real (p. ej. 4 semanas de campaña → 4 en una línea semanal de ON-01). Si se olvidaba en una sola línea, el presupuesto se calculaba con una cantidad muy inferior a la real, sin ningún aviso, y se podía llegar a enviar así al cliente. Es exactamente al revés de cómo debía funcionar: la cantidad tenía que depender del periodo automáticamente, no de que nadie se acordara de un botón.

**Causa**: `ProposalBuilder.tsx` creaba cada línea con `quantity: 1` fijo (`emptyLine`), y el único sitio que la recalculaba era el `onClick` de "Usar duración" — nunca se disparaba solo al cambiar `campaignStart`/`campaignEnd`/`durationCount`/`durationUnit`. El resto del motor (coste, precio, tramo de descuento, margen, comparación entre opciones) sí se recalculaba ya en cada render a través de `priceOption` — la cantidad de línea era la única pieza que rompía esa garantía.

**Arreglo — extraído a un módulo puro para poder testearlo sin React** (`src/pricing/option-draft.ts`, nuevo): todas las transiciones de estado del creador de presupuestos (crear/actualizar una opción o línea, cambiar de soporte, editar la cantidad a mano, resincronizar) viven ahora como funciones puras sobre `OptionDraft`/`LineDraft`, sin `useState` ni DOM — `components/ProposalBuilder.tsx` solo conecta `useState` a ellas. Cada línea lleva un campo nuevo, `quantityAutoSynced`:

- Mientras es `true` (por defecto, al crear la línea), la cantidad se mantiene al día automáticamente: `updateOptionDraft` detecta cuándo el patch toca un campo del periodo (`scheduleMode`, `campaignStart`, `campaignEnd`, `durationCount`, `durationUnit`) y, si lo hace, recalcula en cascada la cantidad de toda línea auto-sincronizada cuya unidad de soporte coincida con la unidad del periodo (semana con semana, mes con mes) — sin que el comercial pulse nada. Añadir una línea nueva después de fijar el periodo (`addLineDraft`) la crea ya con la cantidad sugerida, nunca en 1 a la espera de una acción.
- En cuanto el comercial edita la cantidad a mano (`setLineQuantityManually`), la línea pasa a `quantityAutoSynced: false` y se respeta: un cambio posterior del periodo ya no la toca.
- El botón "Usar duración" (`resyncLineQuantity`) cambia de papel: ya no hace falta para que la cantidad cuente por primera vez — sirve para volver a alinear una línea que el comercial editó a mano, si el periodo cambia después de esa edición. Solo se muestra cuando hay algo que resincronizar (línea editada a mano + una sugerencia disponible); mientras la línea sigue en modo automático se muestra en su lugar un indicativo ("Automático según duración").
- Cambiar el soporte de una línea (`setLineSupport`) recalcula la cantidad sugerida para el soporte nuevo si la línea seguía en automático; si estaba editada a mano, no la toca.
- Soportes cuya unidad no es semana ni mes (ON-04 "Campaña", INF-01 "Colaboración"…) siguen en cantidad 1 por defecto, sin inventar ninguna conversión — comportamiento preservado explícitamente, no una omisión.

`toOptionInput` (también en el módulo nuevo) es la MISMA conversión de `OptionDraft` a `OptionInput` que antes vivía duplicada dentro del componente — la usan tanto la vista previa en vivo de la interfaz como los tests, así que ningún test reimplementa el cálculo por su cuenta.

**Verificación de que TODO el motor se recalcula en cascada, no solo la cantidad** (pedido explícito de Vincent): `src/pricing/__tests__/option-draft.test.ts` (17 tests nuevos, 171 en total) cubre, con la conversión real (`toOptionInput`) y el motor real (`priceOption`), no una reimplementación:

1. Fijar/cambiar el periodo recalcula la cantidad sugerida de cada línea que coincide en unidad — el caso exacto reportado, 4 semanas + ON-01 sin pulsar nada, y un cambio posterior de 4 a 6 semanas que también se propaga solo.
2. Cambiar los mercados de la opción recalcula coste y precio de cada línea (mercado líder con coste completo, el resto solo horas de negocio + externo, CLAUDE.md §4.2).
3. Cambiar la cantidad de una línea recalcula coste, tarifa bruta, tramo de descuento por volumen y margen de la opción.
4. El suelo de margen del 50 % se reaplica **después** de un descuento manual (40 % manual + 5 % de volumen = 45 % nominal contra ON-01): la línea activa `DISCOUNT_ABSORBED_BY_FLOOR` y el descuento efectivo queda por debajo del nominal — nunca se deja pasar en silencio (CLAUDE.md §4.5). Nota de implementación: el campo `floorApplied` de una línea refleja el suelo PRE-descuento (si la tarifa bruta ya lo necesitaba, como SOC-02); la señal de que el suelo mordió tras un descuento es el aviso `DISCOUNT_ABSORBED_BY_FLOOR`, no ese campo — distinción que este test deja documentada para no repetir la confusión.
5. Añadir o quitar una línea recalcula el total de la opción sin ninguna acción aparte (la comparación en las pestañas de arriba se alimenta del mismo cálculo, en cada render).
6. Ningún paso necesita refrescar ni pulsar un botón de "recalcular": la misma función pura, en cada paso, da el resultado final.

**Límite de diseño, documentado en el propio test en vez de forzado a existir**: el caso pedido de "2 mercados con distinta cantidad de semanas cada uno" no es expresable — los mercados se eligen UNA VEZ por opción (§4.2, ronda 2) y toda línea se vende automáticamente en todos ellos con la MISMA cantidad; no hay, por diseño, una cantidad por mercado dentro de una opción. El test más cercano demuestra en su lugar dos LÍNEAS de unidades distintas (ON-01 semanal, ADS-02 mensual) dentro del mismo periodo, cada una con su propia cantidad sugerida — y confirma explícitamente que la cantidad de una línea es idéntica en los dos mercados de la opción, porque no podría ser de otro modo.

**Verificado también en un navegador real** (Playwright, mismo procedimiento que en la ronda 4: servidor de desarrollo real vía una ruta de prueba temporal, sin credenciales de Supabase, eliminada antes de este commit): fijar el periodo (1 al 28 de octubre de 2027) rellena la cantidad a 4 sin pulsar nada, con el indicativo "Automático según duración" visible; editar la cantidad a mano a 99 la deja en 99 aunque se alargue después la campaña a 6 semanas; y pulsar "Usar duración" la resincroniza a 6 — con el coste interno (840 €) y la tarifa bruta (2.580 €) de la vista previa cuadrando exactamente con 6 semanas de ON-01, no con 1.

### 10.3 septies — Ronda 7: navegación estructural (listado de presupuestos, cuentas, reintento de envío)

Reporte de Vincent: hasta esta ronda solo existía la pantalla de crear un presupuesto — al enviarlo, ninguna forma de volver a verlo, ni de navegar a las cuentas, sin recargar la página a mano para volver a `/proposals/new`.

**Cabecera con navegación estructural** (`components/InternalHeader.tsx`): el enlace del logo pasa de `/proposals/new` a `/proposals` (nuevo "inicio" de la app); la barra de navegación gana **Presupuestos** (`/proposals`) y **Cuentas** (`/accounts`) junto al ya existente **Usuarios** (`/admin/users` — ya vivía en el mismo menú desde la ronda 2, no en una ruta suelta como parecía sugerir el reporte); "Nuevo presupuesto" se convierte en un botón `wk-btn-primary` siempre visible en la cabecera, no solo alcanzable desde dentro de `/proposals/new`.

**`/proposals` — listado, con filtro por estado y por creador (pedido explícito, "como mínimo")**: Server Component que consulta `proposals` con `.eq('status', …)`/`.eq('owner_id', …)` ya aplicados según la query string (`ProposalsFilterBar`, un Client Component que navega con `router.push` — el filtrado ocurre en el servidor, no en el cliente sobre datos ya traídos). Columnas: cuenta, contacto, estado (badge coloreado por `ProposalsTable`), última modificación, creador. **Cualquier miembro de equipo ve los presupuestos de todo el equipo, no solo los suyos**: la política RLS `team_all` (CLAUDE.md §10.1, aplicada igual a `proposals` que al resto de tablas del equipo) no distingue por `owner_id` — "creador" es un filtro de la interfaz, nunca una restricción de acceso. Verificado explícitamente contra un PostgreSQL 16 real, no asumido (ver más abajo): sería fácil dar por hecho lo contrario y sorprenderse en producción, como ya ha pasado varias veces en este proyecto con supuestos sobre RLS/grants sin comprobar (§10.3, Bug A y B).

**`/proposals/[id]` — detalle, de solo lectura, con reintento de envío para `DRAFT`**. Punto de diseño deliberado, no lo que se pedía literalmente ("si está en borrador, lo continúa editando"): en este MVP, un presupuesto en `DRAFT` que ya existe en la base de datos es SIEMPRE uno cuyo cálculo ya se congeló en `create_and_send_proposal` (`frozen_snapshot`, opciones y líneas ya persistidas, CLAUDE.md §10.3 punto 5) y cuyo ÚNICO paso pendiente es mandar el email — nunca un borrador a medio construir en el sentido de "el comercial todavía está eligiendo soportes" (eso vive solo en el estado de React de `ProposalBuilder`, nunca tocó la base de datos hasta pulsar "Enviar"). Construir un editor de campos aquí habría abierto exactamente el riesgo que la inmutabilidad de §5.4 prohíbe: recalcular con `pricing_parameter_sets`/`supports` que pueden haber cambiado desde la creación, dando un precio distinto del que el comercial vio. La interfaz refleja esto con fidelidad: vista de solo lectura (cabecera + una tarjeta por opción con sus líneas, tal como quedaron) y, solo en `DRAFT`, un aviso más el botón **"Reintentar envío"**.

- `app/(internal)/proposals/[id]/actions.ts` (`retryProposalSend`, Server Action): reconstruye el email a partir de los datos YA persistidos (cuenta, contacto, comercial creador, número de opciones) — nunca de `frozen_snapshot` reinterpretado ni de un recálculo del motor — y repite exactamente la cola de `app/api/proposals/route.ts` (comprobar `RESEND_API_KEY`/`RESEND_FROM_EMAIL`, `buildProposalEmailContent`, `sendEmail`, `mark_proposal_sent` o `log_proposal_send_failure` según el resultado). `offer_validity_days` se lee del `pricing_parameter_sets` referenciado por `proposals.parameter_set_id` — el que estaba activo cuando se CREÓ este presupuesto, no el que esté activo ahora — por el mismo motivo que `mark_proposal_sent` hace ese mismo join en vez de mirar `is_active`. El nombre del comercial en la firma del email sigue siendo el del CREADOR original (`profiles.full_name` vía `owner_id`, CLAUDE.md §5.6), no el de quien pulsa "reintentar" — puede ser cualquier miembro de equipo, ya que `team_all` no restringe por owner.
- Esto cierra la limitación documentada explícitamente desde la implementación del envío real (§10.3, `20260919100000_email_send.sql`: *"No hay UI de reintento en esta pasada... es una limitación conocida, no un descuido"*) — las funciones SQL que lo necesitan ya existían desde entonces; solo faltaba esta ruta.
- **Test de comportamiento, con mocks** (`app/(internal)/proposals/[id]/actions.test.ts`, mismo patrón de `app/api/proposals/route.test.ts`): un presupuesto que ya no está en `DRAFT` se rechaza sin tocar Resend; sin `RESEND_API_KEY`/`RESEND_FROM_EMAIL` se registra el fallo sin mandar el email; un fallo de Resend se registra igual; y un envío con éxito manda el email, marca `SENT` y revalida `/proposals/[id]` y `/proposals` — comprobando explícitamente que el número de opciones y el nombre del comercial que llegan al email son los ya persistidos, no recalculados.

**`/accounts` y `/accounts/[id]`**: listado de cuentas (razón social, país, nº de contactos, nº de presupuestos — contados en JS con un `Map`, mismo patrón que `admin/users/page.tsx`, no con un embed `proposals(count)` de postgrest) y ficha de cuenta (contactos + historial completo de presupuestos, reutilizando `ProposalsTable` sin la columna de cuenta). Son pantallas de **navegación**, no de gestión: crear o editar una cuenta/contacto sigue haciéndose solo inline al construir un presupuesto (§10.1.2) — no hay un CRM dedicado en esta pasada.

**Pantalla de envío completada, con salida real** (`components/ProposalBuilder.tsx`): antes de esta ronda, tras enviar, la única acción posible era abrir la pantalla pública — ni un enlace de vuelta al presupuesto recién creado, ni una forma clara de empezar el siguiente sin recargar la página a mano. Ahora ofrece explícitamente **"Ver presupuesto enviado"** (`/proposals/[id]`, requiere que `app/api/proposals/route.ts` devuelva `proposalId` además de `publicToken` — ya lo hacía, solo faltaba leerlo en el cliente) y **"Crear otro presupuesto"** (enlace a `/proposals/new`: una navegación completa, no un reseteo de estado en memoria, para no arrastrar ningún residuo del envío anterior).

**Tipos de `lib/supabase/database.types.ts` completados**: hasta ahora `proposals`/`proposal_options`/`proposal_option_lines` solo se tocaban vía RPC (`Json` opaco) — ninguna pantalla había hecho `.from('proposals').select(...)` directamente. Añadidas con sus `Relationships` (FKs a `accounts`/`contacts`/`profiles`, y de `proposal_options` a `proposals`, de `proposal_option_lines` a `proposal_options`) para que los embeds (`accounts(legal_name)`, `proposal_options(*, proposal_option_lines(*))`) se resuelvan tipados — verificado con `tsc --noEmit`, no solo asumido: la cardinalidad de cada embed (objeto único al recorrer desde la tabla que tiene la FK, array al recorrerla al revés) la decide `@supabase/postgrest-js` a partir de esas `Relationships`, y una declaración equivocada se habría notado en el propio `.legal_name`/`.contacts` mal tipado.

**Trampa evitada, ya avisada por el propio código**: `lib/pricing-context.ts` deja un comentario explícito sobre que el `.select()` de postgrest-js necesita ser un string LITERAL, no una concatenación en tiempo de ejecución, para que el parser de tipos infiera las columnas de los embeds — se pisó ese mismo charco al escribir el `.select()` de `/proposals/[id]` con `+` entre líneas por legibilidad, y `tsc` lo señaló de inmediato (`Property 'proposal_options' does not exist on type 'GenericStringError'`) antes de llegar a ningún commit. Corregido a un único literal largo.

**Verificado contra un PostgreSQL 16 real, no asumido** (`scripts/verify-proposals-list.sh`, nuevo, mismo patrón que el resto de `scripts/verify-*.sh`): dos comerciales (Vincent, Rémi), cada uno con un presupuesto `SENT` de una cuenta distinta, más un segundo presupuesto de Vincent en `DRAFT` (para otra cuenta, sin enviar) — confirma que filtrar por estado separa los 2 `SENT` del único `DRAFT`; que filtrar por `owner_id` separa correctamente los de cada comercial; que **sin filtro, Vincent Y Rémi ven los 3 presupuestos por igual** (la confirmación central: `team_all` no restringe por creador); que filtrar por cuenta devuelve solo el presupuesto de esa cuenta; y que el join cuenta+contacto+creador que alimenta el listado resuelve con los datos correctos para la fila en `DRAFT`.

**Verificado también en un navegador real** (Playwright, misma metodología que rondas anteriores: servidor de desarrollo real, ruta de prueba temporal eliminada antes de este commit, sin credenciales de Supabase): la cabecera renderiza los tres enlaces nuevos y el botón "Nuevo presupuesto" con el estilo esperado; `ProposalsTable` con datos de prueba pinta correctamente cuenta/contacto/estado (badges por color)/fecha/creador; la vista de detalle en `DRAFT` muestra el aviso y el botón de reintento; y pulsar "Reintentar envío" ejecuta la Server Action de extremo a extremo sin errores de consola — con la sesión de prueba sin usuario real (esperable en este entorno, sin proyecto Supabase conectado, §10.1.2), el resultado es "No autenticado" mostrado con normalidad en la interfaz, confirmando que el circuito completo (clic → Server Action → estado de error → aviso en pantalla) funciona, no solo que compila.

### 10.3 octies — Ronda 8: duplicar un presupuesto, y numeración

Pedido de Vincent, en dos partes: (1) una acción "Duplicar" en cualquier presupuesto ya enviado, que crea una copia nueva en borrador con los precios recalculados, nunca copiados; (2) un número de presupuesto corto y legible, asignado al crear el borrador, visible en listado/detalle/email.

**Numeración: `<año natural>-NNN`, p. ej. `2026-014`** (`supabase/migrations/20260925090000_proposal_numbering.sql`). Decisiones tomadas al implementar, sin cifra ni convención dictada por Vincent más allá de "año + secuencial, pero usa tu criterio":

- **Año natural, no año fiscal.** El año fiscal de Weekendesk es mayo–abril (§0); un número de referencia para mencionar en una llamada es más intuitivo en año natural. No confundir con el quarter FISCAL que sigue calculando `set_acceptance_fiscal_period()` para el objetivo de negocio — son dos cosas distintas, el número de presupuesto no tiene ninguna relación con el reparto del objetivo por quarter.
- **Contador por año, en una tabla aparte (`proposal_number_counters`), no en una `SEQUENCE` nativa de Postgres.** Una `SEQUENCE` no se puede "reiniciar por año" dinámicamente sin SQL dinámico (`CREATE SEQUENCE` en tiempo de ejecución, cada vez que cambia el año). Una fila por año con un UPSERT atómico (`insert ... on conflict (year) do update set last_seq = last_seq + 1 returning last_seq`) es más simple y sigue siendo seguro bajo concurrencia: el UPSERT toma un lock de fila, así que dos creaciones simultáneas del mismo año nunca repiten secuencial.
- **Asignado dentro de `create_and_send_proposal`, al crear el BORRADOR — no al enviar.** Es el mismo momento en que hoy se genera el token público y se congela `frozen_snapshot`; ambos ya viven en esa función, así que el número se suma a lo que esa transacción ya asigna atómicamente.
- **Nunca se reutiliza.** El contador solo avanza (`last_seq = last_seq + 1`); nada en el esquema lo hace retroceder, ni siquiera si se borra la fila de `proposals` que usó ese número. Verificado explícitamente: borrar un presupuesto y crear uno nuevo salta el número perdido, no lo repite.
- **`proposal_number text not null unique`** en `proposals`, con backfill defensivo para cualquier fila preexistente (no-op en la práctica: el proyecto Supabase real sigue con 0 filas en `proposals`, §9).
- **Formato zero-padded a 3 dígitos** (`lpad(seq::text, 3, '0')`): pasado 999 en un año, Postgres sigue devolviendo el número entero sin recortar (`1000`, no `000`) — `lpad` no trunca, solo rellena por la izquierda cuando hace falta. 200 presupuestos/año son el objetivo (§0); tres dígitos sobran con margen amplio, y si algún año los superase el número seguiría siendo único y ordenable, solo con más cifras.

**Verificado contra un PostgreSQL 16 real, no solo tipado** (`scripts/verify-proposal-numbering.sh`, nuevo, mismo patrón que el resto de `scripts/verify-*.sh`): dos presupuestos consecutivos (de dos comerciales distintos) reciben números distintos con formato `<año>-NNN` y secuenciales exactos; el número ya está en la fila nada más crearse, en estado `DRAFT`, antes de que exista ningún envío; borrar el presupuesto que usó un número y crear uno nuevo NO repite ese número (salta al siguiente del contador, que nunca retrocede); y forzar dos filas con el mismo `proposal_number` a mano falla por la restricción `UNIQUE` (`proposals_number_unique`). Los cuatro scripts de verificación anteriores (`verify-accepted-availability.sh`, `verify-pgcrypto-schema.sh`, `verify-rls-self-read.sh`, `verify-proposals-list.sh`) se repitieron tras esta migración para confirmar que ninguno queda roto por la tabla o el grant nuevos — ninguno lo estaba.

**Trampa encontrada y corregida en el propio arnés de pruebas**: la primera pasada de `scripts/verify-pgcrypto-schema.sh` (ronda 5) dejó de reproducir el bug original tras añadir esta migración, porque su "Paso 1: aplicar las migraciones SOLO hasta la ronda 3" saltaba por NOMBRE la migración del arreglo (`20260924090000_qualify_pgcrypto_schema.sql`) pero seguía aplicando TODO lo posterior — incluida la migración nueva de esta ronda, que reescribe `create_and_send_proposal` con `extensions.gen_random_bytes(24)` YA cualificado, así que el bug dejaba de reproducirse sin que el arreglo real (la migración 5) hubiera entrado en juego. Corregido cambiando ese bucle para que se DETENGA en la migración del arreglo, no solo la salte — cualquier migración posterior que redefina la misma función se queda fuera del "paso 1" de reproducción, sea cual sea su contenido. Lección repetida de este proyecto: un script de verificación puede esconder una regresión tan fácilmente como el código que verifica, y hay que releerlo con la misma sospecha cada vez que algo cambia alrededor.

**Duplicar (`app/(internal)/proposals/[id]/actions.ts`, `duplicateProposal`; botón `DuplicateButton.tsx`, visible en `/proposals/[id]` para cualquier estado salvo `DRAFT`):**

- **Fuente de los datos: `frozen_snapshot`**, el mismo jsonb que `create_and_send_proposal` guarda tal cual se le mandó (§10.3, punto 5: "el cálculo se congela en un solo paso, no se recalcula después"). Sus opciones ya vienen con las líneas EXPANDIDAS por mercado (una fila por soporte y mercado de la opción, §4.2); para reconstruir la entrada cruda que espera el motor (una fila por SOPORTE, sin mercado — el motor vuelve a expandir según `option.markets`) basta con quedarse con la fila del mercado líder de cada soporte (`is_lead_market`), que existe exactamente una vez por soporte y lleva la cantidad y el presupuesto de medios reales de la línea. Da igual cuál de los mercados se use como fuente: §4.2 ya fija que el presupuesto de medios y los meses de una línea de media buy se aplican IGUAL en cada mercado de la opción.
- **Recalcula con `loadPricingContext`, siempre en vivo — nunca copia los números de `frozen_snapshot`.** `loadPricingContext` no cachea nada (lee `pricing_parameter_sets`/`supports`/`market_holidays` en cada llamada, §10.1.1): si la tarifa hora, el suelo de margen o el catálogo cambiaron desde que se creó el original, la copia lo refleja. Coherente con la inmutabilidad de §5.4: el original nunca se toca, la copia es un presupuesto nuevo de pleno derecho, con su propio cálculo, su propio `frozen_snapshot` y su propio número.
- **Descuentos: solo los `MANUAL` sobreviven a la duplicación**, con su motivo — igual que un comercial los volvería a introducir a mano. Los `VOLUME` no se copian: son automáticos y se recalculan solos a partir de la base nueva (§4.5) — copiarlos sería arrastrar un descuento que quizá ya no corresponde al tramo de la base recalculada.
- **Extraído a un módulo compartido, `lib/proposals/build-options-payload.ts`** (`buildProposalOptionsPayload`): es EXACTAMENTE el mismo bucle de cálculo que ya usaba `app/api/proposals/route.ts` para el envío normal — extraído de ahí, no reescrito, para que el envío normal y la duplicación nunca puedan divergir en cómo llaman al motor. `route.ts` se refactorizó para usar el módulo nuevo; sus tests existentes (`route.test.ts`) siguen en verde sin tocar su lógica de negocio, solo su implementación interna.
- **El resultado pasa por el mismo `create_and_send_proposal` que cualquier presupuesto nuevo** — mismos controles (suelo de margen del 50 % por línea, `has_accepted_availability_conflict` de §3), mismo número asignado atómicamente, mismo `DRAFT` de partida, ningún enlace público ni envío heredado del original. El duplicado se comporta, en todo, como si el comercial hubiera vuelto a construir el presupuesto desde cero con los mismos datos — porque eso es exactamente lo que hace, solo que sin que el comercial tenga que volver a teclearlos.
- **Cuenta y contacto se preservan por `id`** (`account_id`/`contact_id` del presupuesto original, nunca reconstruidos desde `frozen_snapshot.account`/`.contact` — esos campos solo existían en el payload cuando la cuenta o el contacto eran NUEVOS en el momento de crear el original; para un presupuesto ya persistido, `proposals.account_id`/`.contact_id` son la fuente correcta y siempre existen).

**Email: número de presupuesto añadido, sin tocar ninguna de las tres reglas de contenido de Vincent (§5.6).** Nuevo campo `referenceLine` en `ProposalEmailTemplate` (`lib/email/templates/types.ts`, implementado en las 5 plantillas de idioma), colocado justo debajo del saludo, antes del brief — "Referencia: 2026-014" en español, con su traducción en cada idioma. No es un precio ni una mención de IVA, así que no rompe ninguna de las reglas 1–2; y va en el CUERPO, no en el asunto, para no interferir con la regla 3 ("el asunto lleva el anunciante, nunca el nombre de la campaña" — el número de presupuesto tampoco es el nombre de la campaña, pero mantenerlo fuera del asunto evita cualquier ambigüedad). `buildProposalEmailContent` (`lib/email/proposal-email.ts`) exige ahora `proposalNumber` en su entrada; sus dos llamadas (`app/api/proposals/route.ts`, con el valor que devuelve `create_and_send_proposal`; `retryProposalSend` en `actions.ts`, leyendo `proposals.proposal_number` de la fila ya persistida) se actualizaron en consecuencia. PDF: fuera de alcance en este MVP (§1), pero el campo ya existe donde el PDF, cuando se construya, tendría que leerlo — documentado aquí para que nadie tenga que volver a decidir de dónde sale.

**Tests**: `app/(internal)/proposals/[id]/actions.test.ts` gana 10 tests para `duplicateProposal` (con el motor de precios REAL, sin mockear — solo `loadPricingContext` está mockeado, igual que `route.test.ts`): rechaza duplicar un `DRAFT` (todavía no se envió ni una vez) y un presupuesto inexistente; para cada estado no-`DRAFT` (`SENT`, `VIEWED`, `ACCEPTED`, `REJECTED`, `EXPIRED`) confirma que el payload que llega a `create_and_send_proposal` preserva cuenta/contacto/idioma/brief/soportes/mercados/fechas/cantidades del original y el descuento `MANUAL` (pero no el `VOLUME`), que el payload nunca lleva `status`/`sent_at`/`public_token` (nada que pudiera colar un estado o un envío heredado), y que el número nuevo nunca coincide con el del original — porque `duplicateProposal` ni siquiera lee el `proposal_number` del presupuesto de origen; que el coste recalculado con los parámetros vivos coincide EXACTAMENTE con lo que da `priceOption` (el motor real) para el mismo soporte/cantidad, nunca con el coste absurdo (`999_999_999`) sembrado a propósito en el `frozen_snapshot` de prueba — si el código copiara en vez de recalcular, ese valor reaparecería y el test fallaría; y que cambiar la tarifa hora del contexto vivo entre una llamada y otra cambia el coste de la copia en consecuencia. `lib/email/proposal-email.test.ts` gana un test que confirma que `referenceLine` aparece en texto y HTML en los 5 idiomas. `app/api/proposals/route.test.ts` gana una comprobación de que la respuesta de la ruta incluye `proposalNumber`.

**Verificado también en un navegador real** (Playwright, misma metodología que rondas anteriores: servidor de desarrollo real, ruta de prueba temporal y bypass de middleware eliminados antes de este commit, sin credenciales de Supabase): `ProposalsTable` con datos de prueba pinta la columna "Número" con el valor esperado; la cabecera de `/proposals/[id]` muestra el número junto al nombre de la cuenta; el botón "Duplicar" aparece en un presupuesto `SENT` (nunca en uno `DRAFT`); y pulsarlo ejecuta la Server Action de extremo a extremo sin errores de consola — con la sesión de prueba sin usuario real (esperable en este entorno, §10.1.2), el resultado es "No autenticado" mostrado con normalidad, confirmando que el circuito completo (clic → Server Action → `loadPricingContext` → motor → RPC → estado de error) funciona, no solo que compila.

### 10.3 novies — Ronda 9: cinco correcciones encontradas al probar

Cinco puntos, cada uno con su propio diagnóstico y decisión — verificados igual que en rondas anteriores (motor puro con tests reales, migración nueva contra un PostgreSQL 16 real, y un pase en navegador real con Playwright sobre los cinco a la vez al terminar).

**1. Fechas de campaña: el fin podía ser anterior al inicio, sin ningún aviso.** El formulario no comprobaba el orden de las fechas. Curiosamente, `computeDurationUnits` (`src/pricing/duration.ts`) YA lanzaba `RangeError('La fecha de fin no puede ser anterior a la de inicio')` desde su implementación original — pero `optionDurationUnits` (`src/pricing/option-draft.ts`) atrapaba esa excepción y devolvía `null` en silencio, así que el único síntoma visible era que la cantidad sugerida de las líneas dejaba de calcularse, sin ninguna explicación. Arreglado con un control nuevo en `src/pricing/checks.ts` (`CAMPAIGN_DATES_INVALID`, bloqueante, igual patrón que los demás controles previos al envío de §5.3): `PreSendOptionContext` gana un campo `campaignEnd: Date | null` junto al `campaignStart` que ya tenía, y el control compara ambas fechas cuando las dos están rellenas (modo "fechas concretas"; en modo "solo duración" no hay fechas que comparar, así que no se evalúa). Es deliberadamente solo un control de la interfaz, no una comprobación server-side nueva: sigue exactamente el mismo patrón que el control de antelación (§5.3, punto 2), que tampoco se revalida en el servidor — el único control que sí se repite server-side es el suelo de margen, porque es una propiedad del propio motor, no una regla de negocio aparte.

**2. Campos de medios sin etiqueta ni comportamiento claro.** Dos problemas en uno:

- **Presupuesto de medios**: llevaba solo un placeholder ("€ medios"), no una etiqueta. Arreglado con un `<label>` visible ("Presupuesto de medios (€)") y un nuevo control bloqueante (`MEDIA_BUDGET_MISSING` en `checks.ts`): si una línea de media buy tiene `mediaBudgetCents === 0` (el valor que produce un campo vacío), bloquea el envío — una sola vez por soporte, no por mercado, ya que el presupuesto es el mismo en todos los mercados de la opción (§4.2). El motor en sí sigue aceptando `mediaBudgetCents: 0` sin error (ya lo hacía): 0 € es una entrada válida desde el punto de vista del cálculo, la exigencia de que sea obligatorio es una regla de negocio de la interfaz, igual que el resto de controles de §5.3.
- **Meses del fee mínimo**: era un segundo campo numérico suelto, que el comercial tenía que rellenar A MANO aunque la cantidad de la línea (para ADS-01/02/03, de unidad "Mes") ya se auto-sincronizaba con la duración de la opción desde la ronda 6 — literalmente el mismo número, tecleado dos veces. Arreglado quitándolo del todo como campo editable: nueva función pura `suggestedMediaMonths(schedule)` en `option-draft.ts`, que deriva los meses de la duración vigente de la opción — a diferencia de la cantidad de línea, NO depende de la unidad del soporte (INF-01 es "Colaboración", no "Mes", así que su cantidad —número de colaboraciones— es un eje distinto de la duración en meses del fee; `suggestedMediaMonths` los deriva igual para los dos casos). En modo "fechas concretas" es `computeDurationUnits(...).months`; en "solo duración" con unidad "mes" es el conteo directo, y con unidad "semana" se aproxima con la misma equivalencia de 7/30 días que ya usa el resto del motor (sin inventar una segunda regla de conversión). `LineDraft.mediaMonths` desaparece como campo de estado — ya no hay nada que sincronizar ni ningún botón de resincronizar: el valor se recalcula en cada render y se manda ya calculado al servidor (`toOptionInput`, y el payload de `ProposalBuilder.tsx`). En la interfaz, el campo pasa a ser un `<input disabled>` de solo lectura con su propia etiqueta ("Meses (según duración)").

**3. Desplegable de "Contacto": ¿problema real o solo visual?** Investigado a fondo antes de tocar nada, siguiendo lo pedido: releído el código de extremo a extremo (`ProposalBuilder.tsx`, `app/api/proposals/route.ts`, `create_and_send_proposal`). **Conclusión: nunca fue un bug de asociación de datos.** Con "+ Nueva cuenta" o "+ Nuevo contacto" seleccionados, el contacto tecleado todavía no existe en la base de datos — se crea atómicamente junto con el presupuesto al pulsar "Enviar", no antes — así que no hay, en ese momento, ningún contacto real que "seleccionar" en el desplegable: `contactId` se queda en `'__new__'` como indicador de modo, y el dato que de verdad viaja al servidor sale directamente de `newContact.full_name`/`.email` (verificado también en `create_and_send_proposal`: usa `payload->'contact'->>'full_name'` sin pasar por ningún desplegable). Es exactamente el comportamiento correcto — el problema real era solo de PERCEPCIÓN: el desplegable seguía mostrando literalmente "+ Nuevo contacto" mientras los campos de abajo ya tenían datos, dando la falsa impresión de que lo escrito se ignoraba. Arreglado hoy con un cambio puramente visual: la propia etiqueta de la opción `'__new__'` del desplegable refleja el nombre tecleado ("+ Nuevo contacto: María González") en cuanto el comercial escribe algo — sin tocar ningún dato ni comportamiento de envío. Se dejó el desplegable de "Cuenta" (`'+ Nueva cuenta'`) sin el mismo tratamiento a propósito: no se pidió, y el mismo argumento (no hay una cuenta real que seleccionar todavía) se aplica igual sin que nadie lo haya reportado como confuso.

**4. Desplegable de país: ~60 países, cuando solo hacían falta 10.** `lib/countries.ts` (`COUNTRY_CODES`) tenía una lista de casi toda Europa más un puñado de países de fuera (Vincent estimó "cerca de 195" a ojo; la lista real tenía 60, pero el problema de fondo era el mismo: una lista genérica ISO en vez de los países reales del negocio). Restringida a los 10 países pedidos: Francia, España, Portugal, Andorra, Italia, Suiza, Alemania, Luxemburgo, Bélgica, Países Bajos. **Es el país DEL CLIENTE** (`accounts.country_code`), no debe confundirse con los 5 MERCADOS DE VENTA de Weekendesk (`Market` en `src/pricing/types.ts`: FR/ES/IT/BE_FR/BE_NL) — un cliente puede estar en un país (p. ej. Andorra o Suiza) donde Weekendesk no vende ningún soporte todavía, y eso es perfectamente normal: la cuenta existe igual, solo que sus presupuestos se venden en los mercados que elija cada opción, no en el país de la cuenta. `countryName()` (basado en `Intl.DisplayNames`) sigue funcionando igual para cualquier código ISO, restringido o no: una cuenta antigua con un país fuera de la lista nueva se sigue mostrando bien en `/accounts`, solo que ya no se puede volver a elegir ese país al crear una cuenta nueva.

**5. Interruptor "desactivar descuento por volumen" por opción.** Pedido nuevo, distinto de los descuentos manuales que ya existían (§4.5): un interruptor por opción que, activado, factura la tarifa bruta sin ningún descuento automático por tramo, aunque la base supere el umbral que lo activaría — los descuentos manuales, si los hay, se siguen sumando aparte sin cambios.

- **Motor** (`src/pricing/types.ts`, `engine.ts`): `OptionInput` gana `volumeDiscountDisabled?: boolean`; en `priceOption`, con el interruptor activado el tramo de volumen simplemente no se calcula (`volumeRate = 0`), así que no aparece ningún `AppliedDiscount` de kind `'VOLUME'` — un cambio de una línea, sin tocar nada más del cálculo (el suelo de margen, el reparto a prorrata de los descuentos manuales, etc. siguen igual).
- **Interfaz** (`option-draft.ts`, `ProposalBuilder.tsx`): `OptionDraft` gana el mismo campo, por defecto `false`; se edita con el mecanismo genérico `updateOptionDraft` que ya existía (no toca ningún campo de periodo, así que no dispara ninguna resincronización de cantidades). Checkbox nuevo bajo los descuentos manuales, con su texto de ayuda explicando qué hace y que queda registrado con autor y fecha.
- **Persistencia y auditoría — se usa por primera vez la tabla `overrides`.** Esa tabla existe en el esquema desde la primerísima migración (CLAUDE.md §8: "toda excepción se registra con autor, motivo y marca de tiempo"), pero hasta esta ronda ningún flujo llegaba a escribir en ella — documentado explícitamente como pendiente en §10.1.2 ("no hay UI para forzarlo y registrar autor/motivo"). Este interruptor es la primera excepción real que la usa: migración nueva `supabase/migrations/20260926090000_volume_discount_toggle.sql` añade el valor `'VOLUME_DISCOUNT_DISABLED'` al enum `override_kind`, la columna `proposal_options.volume_discount_disabled boolean not null default false`, y reescribe `create_and_send_proposal` para que, cuando el payload de una opción trae el interruptor activado, guarde la columna Y además inserte una fila en `overrides` (`proposal_id`, `option_id`, `kind`, `created_by = auth.uid()`, `created_at = now()`). El motivo (`reason`, `not null` en el esquema) es un texto fijo ("Descuento automático por volumen desactivado para esta opción"), no un campo que el comercial tenga que rellenar — no se pidió esa fricción extra, y el propio nombre de la excepción ya deja claro qué pasó; lo que aporta valor de auditoría aquí es el autor y la marca de tiempo, que es exactamente lo que pidió Vincent literalmente para este punto (a diferencia de los descuentos manuales, que sí exigen un motivo escrito porque ahí el "por qué" no es obvio por sí solo).
- **Duplicar (ronda 8) traslada el interruptor, no lo recalcula.** `duplicateProposal` (`actions.ts`) lee `volume_discount_disabled` de `frozen_snapshot` y lo pasa tal cual al `RawOption` reconstruido: es una decisión de negocio sobre la opción, no un número que dependa de parámetros vivos — coherente con cómo ya se trasladan los mercados, las fechas y los descuentos manuales del original.
- **Compartido con el envío normal vía `build-options-payload.ts`** (igual que el resto de campos desde la ronda 8): `RawOption` gana `volumeDiscountDisabled: boolean`, y el módulo lo traduce a `volume_discount_disabled` en el jsonb que recibe `create_and_send_proposal` — un único punto de conversión para el envío nuevo y la duplicación.

**Verificado contra un PostgreSQL 16 real** (`scripts/verify-volume-discount-toggle.sh`, nuevo, mismo patrón que el resto de `scripts/verify-*.sh`): una opción con el interruptor desactivado (o sin especificar, por defecto) no genera ninguna fila en `overrides`; una opción con el interruptor activado guarda `volume_discount_disabled = true` en `proposal_options` y genera EXACTAMENTE una fila en `overrides`, con el `kind` correcto, el autor (`created_by`) igual al usuario que llama a la función, marca de tiempo no nula, y apuntando a la opción correcta; y una segunda opción del mismo envío sin el interruptor no contagia ni genera una fila de más — el override es por opción, no por presupuesto entero. Los cinco scripts de verificación anteriores se repitieron tras esta migración para confirmar que ninguno queda roto.

**Tests**: `src/pricing/__tests__/checks.test.ts` gana tests para `CAMPAIGN_DATES_INVALID` (bloquea con fin < inicio; no bloquea con fin ≥ inicio; no se evalúa en modo "solo duración") y `MEDIA_BUDGET_MISSING` (bloquea sin presupuesto; no bloquea con presupuesto; no afecta a líneas normales; avisa una sola vez por soporte aunque se venda en varios mercados). `src/pricing/__tests__/option-draft.test.ts` gana tests para `suggestedMediaMonths` en los dos modos de periodo (fechas concretas, solo duración en meses, solo duración en semanas), para INF-01 (cantidad y meses son ejes independientes) y para el interruptor de descuento por volumen (con el motor real, no mockeado). `src/pricing/__tests__/engine.test.ts` gana tests para `volumeDiscountDisabled` (no aplica el tramo aunque la base lo supere; no afecta a los descuentos manuales, que se siguen sumando aparte). `lib/countries.test.ts` (nuevo) verifica la lista exacta de 10 países, que ya no incluye países fuera de la lista, que no confunde país de cliente con mercado de venta (`BE` sí, `BE_FR`/`BE_NL` no), y que `countryName` produce un nombre en los tres idiomas de interfaz. `app/(internal)/proposals/[id]/actions.test.ts` gana la comprobación de que `duplicateProposal` traslada el interruptor tal cual, opción por opción. 210 tests en total (187 → 210).

**Verificado también en un navegador real** (Playwright, misma metodología que rondas anteriores: servidor de desarrollo real, ruta de prueba temporal y bypass de middleware eliminados antes de este commit, sin credenciales de Supabase), los cinco arreglos a la vez sobre el mismo formulario: el desplegable de país muestra exactamente 10 opciones; escribir un nombre de contacto nuevo actualiza la etiqueta del desplegable a "+ Nuevo contacto: María González"; fijar una fecha de fin anterior a la de inicio hace aparecer el bloqueo `CAMPAIGN_DATES_INVALID` en el checklist, con el texto esperado; al añadir una línea ADS-01, la etiqueta "Presupuesto de medios (€)" es visible, el badge "Obligatorio" aparece con el campo vacío y desaparece al rellenarlo, y el campo de meses (deshabilitado) muestra el valor derivado de la duración de la opción sin ninguna acción manual; y el checkbox "Desactivar el descuento automático por volumen" es visible, marcable, y al activarlo el banner de descuento pasa a "Sin descuento aplicado" con el importe facturado reflejando la tarifa bruta completa.

### 10.3 decies — Ronda 10: el fee de media buy se resta del presupuesto, no se suma

Cambio de fondo pedido por Vincent sobre una regla que ya estaba en producción (§4.4): **el cliente factura exactamente el importe que decide gastar en medios, nunca más.** Antes de esta ronda el fee de gestión se sumaba ENCIMA de ese presupuesto (`billed_total_cents = net_price_cents + media_budget_cents`, donde `net_price_cents` es el fee); ahora se resta de él (`billed_total_cents = media_budget_cents`, con el fee repartido por dentro). Vincent pidió expresamente confirmar el plan de cambio antes de tocar el motor, dado el calado de la modificación sobre una regla ya en producción — se resumió el plan (ficheros a tocar, la decisión de que un fee forzado es fijo e inmune a descuentos posteriores) y se confirmó antes de escribir ningún código.

**Motor (`src/pricing/engine.ts`, `types.ts`).** `mediaManagementFee()` no cambia — sigue siendo `max(presupuesto × 40 % ; mínimo mensual × meses)` — lo que cambia es cómo se usa su resultado para facturar:

- `PricedLine.billedTotalCents`: para una línea de media buy es ahora `mediaBudgetCents` (el presupuesto íntegro), no `netPriceCents + mediaBudgetCents`.
- `PricedOption.billedTotalCents`: suma de los `billedTotalCents` de línea ya corregidos — dejó de ser `netRevenueCents + mediaBudgetCents`, identidad que se rompió con el cambio (esa fórmula daría el fee sumado dos veces si se hubiera dejado como estaba).
- `netRevenueCents` (`importe_neto_de_medios`) **no cambió de fórmula** — sigue siendo la suma de `netPriceCents` de todas las líneas, y `netPriceCents` de una línea de media buy YA ERA el fee antes de esta ronda. Lo que cambió es lo que esa cifra representa en la prosa de CLAUDE.md: antes se describía como "facturado menos medios" (una resta que ahora daría cero, porque el fee ya no se suma para facturar); ahora se describe directamente como "suma de fees", que es lo que el código siempre calculó. Ninguna línea de `engine.ts` tuvo que tocarse para esto — solo la documentación.
- Nuevo `PricedLine.mediaRealSpendCents: Cents | null` = `mediaBudgetCents - netPriceCents` para líneas de media buy, calculado en el paso POST-descuento (no en `priceLineBeforeDiscount`): puede salir negativo si el presupuesto no cubre el fee — el motor lo calcula igual, sin bloquear (bloquear es cosa de `checks.ts`).
- Nuevo `OptionLineInput.manualFeeCents?: Cents` + `manualFeeReason?: string`: fuerza el reparto a un importe negociado. **Decisión de diseño explícita, confirmada con Vincent antes de implementar**: un fee forzado es **fijo, suelo y techo a la vez** (`enforcedFloorCents = manualFeeCents = listPriceCents`) — inmune a cualquier descuento posterior, automático o manual. Es la misma mecánica de suelo que ya existía (`DISCOUNT_ABSORBED_BY_FLOOR` se dispara igual si se le "pide" un descuento que no puede darse), sin ningún caso especial nuevo en el reparto a prorrata ni en la reaplicación del suelo. `manualFeeReason` es obligatorio en cuanto se rellena `manualFeeCents` — validado en el motor (`validate()`), no solo en la interfaz, igual que el resto de motivos obligatorios del proyecto (§8).
- Nuevo `PricedLine.feeForced: boolean` (si el fee de esta línea se forzó a mano) y `PricedLine.alwaysManualMediaSplit: boolean` (copiado del catálogo).

**Catálogo (`src/pricing/catalog.ts`, `types.ts`).** Nuevo `SupportDefinition.alwaysManualMediaSplit: boolean`, `true` únicamente en INF-01 — evita hardcodear el ID de soporte dentro del módulo genérico `checks.ts`, mismo patrón que `isMediaBuy`/`requiresAvailabilityCheck`. Para INF-01, el reparto nunca es automático: cada colaboración con un influencer se negocia caso por caso, no hay un 40 % ni un mínimo mensual que tenga sentido de negocio ahí.

**Controles previos al envío (`src/pricing/checks.ts`, §5.3).** Dos bloqueos nuevos, con el mismo patrón de deduplicación por soporte (no por mercado) que ya usaba `MEDIA_BUDGET_MISSING` (ronda 9):

- `MEDIA_FEE_EXCEEDS_BUDGET`: cuando `mediaRealSpendCents < 0` — el presupuesto del cliente no cubre el fee mínimo de gestión. Mensaje explícito: cuánto falta, y que hay que forzar el reparto a mano o subir el presupuesto.
- `MEDIA_SPLIT_REQUIRED`: cuando `alwaysManualMediaSplit && !feeForced` — el envío no puede salir con INF-01 mientras el reparto no se confirme a mano.

**Interfaz de creación (`src/pricing/option-draft.ts`, `components/ProposalBuilder.tsx`).** `LineDraft` gana `manualFeeEuros`/`manualFeeReason` (vacío = automático), hilvanados por `toOptionInput` igual que el resto de campos de media buy. Nuevo componente `MediaFeeSplit`, con dos presentaciones sobre el MISMO modelo de datos subyacente:

- **ADS-01/02/03**: un checkbox "Forzar fee de gestión a mano" que, al marcarse, muestra los campos `manualFeeEuros`/`manualFeeReason` directamente como "Fee de gestión (€)" + motivo.
- **INF-01**: los campos se muestran SIEMPRE (nunca hay reparto automático que "activar" con un checkbox), pero enmarcados como pide el negocio — "Importe para el influencer (€)" en vez de "Fee de gestión" — con el motor recibiendo la resta (`manualFeeEuros = presupuesto - importe_influencer`) calculada por la propia interfaz. El comercial nunca teclea directamente "el fee de Weekendesk": teclea lo que se lleva el influencer, que es el dato que tiene delante en la negociación.

Ambas presentaciones muestran, en vivo, el desglose interno (fee calculado, importe real al medio) leído de la opción ya calculada (`priced.lines`) — nunca un cálculo aparte reimplementado en el componente. Es exactamente el desglose que **nunca debe llegar al cliente** (ver más abajo): interno, en la pantalla de creación, para que el comercial controle el margen antes de enviar.

**De cara al cliente: cierre defensivo, no solo omisión (`get_public_proposal`, §6).** La pantalla pública nunca mostró el fee ni el importe real al medio por separado — pero antes de esta ronda `get_public_proposal` SÍ mandaba `net_revenue_cents` en el JSON de cada opción, sin que la interfaz lo usara. En una opción con una sola línea de media buy, ese campo coincide exactamente con el fee de esa línea: exactamente el dato que la regla nueva de negocio prohíbe revelar, inspeccionable por la pestaña de red del navegador aunque nunca se pintara en pantalla. Se retira del JSON en la misma migración — cierre defensivo ahora que "nunca se muestra el desglose" es una regla explícita, no solo un hueco incidental que nadie había explotado todavía.

**Migración (`supabase/migrations/20260927090000_media_fee_split.sql`).** `supports.always_manual_media_split` (+ `update ... where id = 'INF-01'`); `proposal_option_lines.manual_fee_cents`/`manual_fee_reason`/`media_real_spend_cents`; nuevo valor `MEDIA_FEE_FORCED` en `override_kind`; nueva columna `overrides.support_id` (nullable, precedente: `availability_checks` ya referencia `option_id`+`support_id`+`market` — aquí basta `support_id`, el reparto forzado no varía por mercado). `create_and_send_proposal` reescrita: persiste las columnas nuevas de línea y, cuando `manual_fee_cents` no es null, inserta una fila en `overrides` **una vez por soporte** (`is_lead_market`, mismo truco de deduplicación que usa `duplicateProposal` al reconstruir desde `frozen_snapshot`) — kind `MEDIA_FEE_FORCED`, `support_id`, autor y marca de tiempo, con el motivo tecleado por el comercial (nunca un texto fijo, a diferencia de `VOLUME_DISCOUNT_DISABLED`: aquí el "por qué" no es obvio por el nombre de la excepción). `get_public_proposal` reescrita para dejar de mandar `net_revenue_cents`.

**Duplicar (ronda 8) traslada el reparto forzado sin recalcular**, igual que ya hacía con `volumeDiscountDisabled` y los descuentos manuales: es una decisión de negocio sobre una línea concreta, no un número derivado de parámetros vivos. `FrozenSnapshotLine` gana `manual_fee_cents`/`manual_fee_reason`; la reconstrucción en `duplicateProposal` los lee de la fila del mercado líder (igual que el resto de campos de media buy) y los pasa tal cual al `RawLine` reconstruido.

**Verificado contra un PostgreSQL 16 real** (`scripts/verify-media-fee-split.sh`, nuevo, mismo patrón que el resto de `scripts/verify-*.sh`): el reparto automático deja `billed_total_cents` en el presupuesto íntegro (no fee + medios) y no escribe nada en `overrides`; el reparto forzado a mano persiste `manual_fee_cents`/`manual_fee_reason` tal cual y escribe EXACTAMENTE una fila en `overrides` (kind, soporte, autor, marca de tiempo, motivo); un soporte vendido en dos mercados con el reparto forzado no duplica la fila de `overrides` (dedup por `is_lead_market`); y `get_public_proposal` ya no incluye `net_revenue_cents` ni ningún campo del desglose interno, solo `billed_total_cents`/`media_budget_cents`. Los seis scripts de verificación anteriores se repitieron tras esta migración para confirmar que ninguno queda roto — ninguno lo estaba.

**Tests**: `src/pricing/__tests__/engine.test.ts` gana un bloque `media buy — ronda 10` (el ejemplo exacto de la especificación con 2.000 € y mínimo 1.200 €; reparto forzado fijo e inmune al descuento por volumen, con `DISCOUNT_ABSORBED_BY_FLOOR`; el caso límite de presupuesto insuficiente, con `mediaRealSpendCents` negativo sin que el motor bloquee; que INF-01 tiene `alwaysManualMediaSplit` y los ADS-* no; un fee forzado a 0 € como entrada válida (barter); y que forzar el fee sin motivo lanza `PricingError`) y se actualizan los tests existentes que asumían el modelo aditivo antiguo (`billedTotalCents = netRevenueCents + mediaBudgetCents`, ya no cierto). `src/pricing/__tests__/checks.test.ts` gana tests para `MEDIA_FEE_EXCEEDS_BUDGET` y `MEDIA_SPLIT_REQUIRED` (bloquean, dejan de bloquear al forzar el reparto, nunca disparan en soportes de reparto automático), y dos tests preexistentes de antelación se actualizan para forzar el reparto de su línea INF-01 — si no, el nuevo bloqueo `MEDIA_SPLIT_REQUIRED` los hacía fallar por un motivo ajeno al que probaban. `src/pricing/__tests__/option-draft.test.ts` gana tests para el hilvanado de `manualFeeEuros`/`manualFeeReason` por `toOptionInput`. `app/(internal)/proposals/[id]/actions.test.ts` gana tests para que `duplicateProposal` traslada el reparto forzado sin recalcular, y que sin reparto forzado en el original la copia tampoco lo tiene. 227 tests en total (210 → 227).

**Verificado también en un navegador real** (Playwright, misma metodología que rondas anteriores: servidor de desarrollo real, ruta de prueba temporal y bypass de middleware eliminados antes de este commit, sin credenciales de Supabase): con ADS-01 y 2.000 € de medios, el desglose en vivo muestra "Fee: 1.200,00 € · Real al medio: 800,00 €"; al marcar "Forzar fee de gestión a mano", rellenar 900 € y un motivo, el desglose pasa a "Fee: 900,00 € · Real al medio: 1.100,00 €"; bajar el presupuesto a 800 € (por debajo del mínimo) hace aparecer el bloqueo de presupuesto insuficiente en el checklist; y al cambiar el soporte a INF-01 aparece el campo "Importe para el influencer (€)" con un badge de reparto pendiente en el checklist y en la línea, que desaparece en ambos sitios en cuanto se rellena el importe del influencer.

### 10.3 undecies — Ronda 11: el checklist se traduce, y solo la antelación se puede forzar

Dos correcciones de Vincent sobre los controles previos al envío (§5.3), tratadas por separado porque no tienen relación entre sí.

**1. Los mensajes del checklist estaban en español fijo, sin pasar por el sistema de idiomas.** `src/pricing/checks.ts` es un módulo puro (CLAUDE.md §10.1: "no lee de la base de datos", ni conoce React ni i18n) — antes de esta ronda construía directamente el texto final en español dentro de cada `CheckResult.message`. Arreglado separando cálculo de presentación, como el resto del motor separa cálculo de UI: `CheckResult` cambia `message: string` por `messageKey: CheckMessageKey` (una clave del diccionario `checklist.*` en `lib/i18n-internal.tsx`) + `messageVars?: Record<string, string>` (los valores a interpolar — soporte, mercado, cifras ya formateadas). `PreSendChecklist.tsx`, que ya usaba `useI18n()` para las etiquetas fijas del checklist ("Bloquea el envío", "Aviso"), es quien llama a `t(messageKey, messageVars)` con el idioma activo — reutiliza el mecanismo de interpolación `{variable}` que `t()` ya tenía (`lib/i18n-internal.tsx`, sustitución de `{nombre}` por el valor), sin necesidad de añadir ninguna librería nueva. Las diez claves nuevas (una por código de control, más `checklist.leadTimeForced` para el aviso del punto 2) se añaden en los tres idiomas (ES/FR/EN), igual que el resto del diccionario. Ninguna prueba existente dependía del texto de `.message` (comprobado antes de tocar nada: ningún test de `checks.test.ts` lo leía, todos comprobaban `.code`/`.severity`/`.supportId`/etc.), así que el cambio de forma no rompió ningún test — solo hizo falta actualizar los que construían `PreSendOptionContext` a mano para el nuevo campo `leadTimeOverrides` (punto 2).

**Bug real encontrado al verificar en un navegador real, no solo en tests: `t()` solo sustituía la PRIMERA aparición de una variable repetida.** `checklist.leadTimeInsufficient` usa `{market}` dos veces en la misma frase ("... en {market}: quedan ... (descontando festivos de {market})..."). `t()` interpolaba con `text.replace(`{${name}}`, value)` — `String.prototype.replace` con un patrón de cadena (no una regex global) solo sustituye la primera coincidencia, así que la segunda `{market}` llegaba a pantalla sin traducir, literal. Ninguna clave anterior del diccionario repetía la misma variable dos veces, por eso el bug llevaba desde que `t()` existe (ronda 2) sin manifestarse. Reproducido con Playwright contra un servidor de desarrollo real (no lo habría detectado ningún test unitario, que solo comprueba `messageKey`/`messageVars`, nunca el texto ya interpolado) y corregido cambiando `replace` por `replaceAll` en `lib/i18n-internal.tsx` — un cambio de una línea, sin efecto en ninguna clave existente (que no repetía variables), y que deja el mecanismo correcto para cualquier plantilla futura que sí las repita.

**2. De los cuatro bloqueos duros, solo la antelación insuficiente se puede forzar — decisión explícita de Vincent, con cada bloqueo tratado por separado, no como un lote homogéneo:**

- **Antelación insuficiente (`LEAD_TIME_INSUFFICIENT`): la ÚNICA forzable.** Es una decisión de negocio legítima — el ejemplo de Vincent: un cliente grande acepta el riesgo de un plazo ajustado. Nuevo `CheckResult.forcible: boolean`, `true` solo en este código; el resto de bloqueos no lo lleva (`undefined`, nunca `true`), y no hay ningún parámetro de entrada — ni en `checks.ts` ni en `create_and_send_proposal` — que pueda hacerles cambiar de bloqueo a aviso. Forzarla exige un motivo obligatorio: nuevo `PreSendOptionContext.leadTimeOverrides` (array de `{supportId, market, reason}`), comprobado en `runPreSendChecks` con la misma regla que el resto del proyecto (motivo vacío o solo espacios = sin efecto, CLAUDE.md §8) — doble comprobación, en el motor y no solo en la interfaz, para que un futuro cambio de la interfaz no pueda colar un forzado sin motivo. Cuando se fuerza, el bloqueo desaparece de `blockers` y aparece en `warnings` como `LEAD_TIME_FORCED`, con el motivo en `messageVars.reason` — visible, no silencioso.
- **Fechas de campaña invertidas (`CAMPAIGN_DATES_INVALID`): duro, no forzable.** Es un error de datos, no una decisión de negocio — no tiene ni ha tenido nunca ningún campo de contexto para saltárselo.
- **Presupuesto de medios vacío (`MEDIA_BUDGET_MISSING`): duro, no forzable.** Falta un dato obligatorio para calcular el precio; no hay ningún reparto que forzar aquí (eso es `MEDIA_FEE_EXCEEDS_BUDGET`/`manualFeeCents`, ronda 10, un control distinto).
- **Conflicto de disponibilidad con un presupuesto ya ACEPTADO: duro, no forzable.** El único de los cuatro que se revalida en el servidor (`has_accepted_availability_conflict`, dentro de `create_and_send_proposal`) — forzarlo prometería al cliente un hueco que físicamente pertenece a otra campaña ya confirmada; exige resolución humana fuera de la aplicación (renegociar con el otro cliente, esperar a que caduque, etc.), nunca un botón. Esta ronda no le añade ningún mecanismo — se verifica explícitamente que sigue bloqueando incondicionalmente, incluso con `lead_time_overrides` (de otro bloqueo) presente en el mismo payload, para que quede constancia de que no hay ningún parámetro que lo esquive por accidente.

**Registro con autor, motivo y marca de tiempo — la tabla `overrides`, reutilizando un valor de enum que llevaba sin usar desde la primera migración.** `override_kind.LEAD_TIME_FORCED` existe en `supabase/migrations/20260918120000_initial_schema.sql` desde el primer día del proyecto, junto a `MARGIN_BELOW_FLOOR` y `AVAILABILITY_FORCED` — ninguno de los tres se había implementado hasta ahora (§10.1.2: "hoy un bloqueo… impide enviar sin excepción; no hay UI para forzarlo"). Esta ronda es su primera implementación real. A diferencia de `MEDIA_FEE_FORCED` (ronda 10, por soporte, igual en todos los mercados de la opción), la antelación **varía por mercado** — el calendario de festivos es por mercado (§5.3) — así que `overrides` gana una columna `market` (nullable, solo para este kind) y el registro **no se deduplica por soporte**: un mismo soporte forzado en dos mercados de la misma opción genera dos filas independientes en `overrides`, cada una con su propio motivo si hiciera falta. `create_and_send_proposal` (`supabase/migrations/20260928090000_lead_time_force.sql`) inserta una fila por cada entrada de `lead_time_overrides` en el payload de la opción, y persiste `lead_time_forced`/`lead_time_force_reason` en la línea correspondiente de `proposal_option_lines` — denormalización de lectura para el detalle interno (mismo patrón que `manual_fee_cents`/`manual_fee_reason`, ronda 10), sin la cual el detalle tendría que hacer un join contra `overrides` solo para pintar un badge.

**Un límite deliberado en el guardado de `frozen_snapshot`, para que "Duplicar" (ronda 8) no pierda un forzado en un mercado no líder.** El array `lead_time_overrides` se guarda a nivel de OPCIÓN en el payload (igual que `discounts`), no intentando derivarse de `lines` — porque `lines` en `frozen_snapshot` tiene una fila por soporte+mercado, pero `duplicateProposal` (`app/(internal)/proposals/[id]/actions.ts`) al reconstruir el `RawOption` para recalcular solo conserva la fila del MERCADO LÍDER de cada soporte (`is_lead_market`, §10.3 octies) — si el forzado se hubiera intentado leer de ahí, un forzado en un mercado no líder se habría perdido silenciosamente al duplicar. Guardarlo aparte, como su propio array de opción, evita ese problema por construcción: se traslada tal cual al duplicar, sin recalcular, igual que el interruptor de descuento por volumen (ronda 9) y el reparto de medios forzado (ronda 10) — es una decisión de negocio, no un número derivado de parámetros vivos. Verificado explícitamente con un test dedicado (`actions.test.ts`) que fuerza un mercado no líder y confirma que sobrevive a la duplicación.

**Interfaz** (`components/PreSendChecklist.tsx`, `src/pricing/option-draft.ts`): cada bloqueo de antelación insuficiente lleva un botón "Forzar antelación" que despliega un campo de motivo + confirmar/cancelar; el botón de confirmar permanece deshabilitado con el motivo vacío, mismo patrón que el resto de motivos obligatorios de la interfaz (descuentos manuales, reparto de medios forzado). Una vez forzado, el aviso resultante (`LEAD_TIME_FORCED`) lleva su propio botón para deshacerlo (`clearLeadTimeOverride`), por si el comercial cambia de opinión antes de enviar. El estado vive en `OptionDraft.leadTimeOverrides` (`src/pricing/option-draft.ts`), con las mismas dos funciones puras y testeadas que el resto del módulo (`forceLeadTimeOverride`/`clearLeadTimeOverride`) — el checklist es global a las 2-3 opciones del envío (una sola tabla combinada, no una por pestaña), así que cada resultado enruta su forzado a la opción correcta por `CheckResult.optionId`.

**Verificado contra un PostgreSQL 16 real** (`scripts/verify-lead-time-force.sh`, nuevo, mismo patrón que el resto de `scripts/verify-*.sh`): forzar un soporte+mercado persiste `lead_time_forced`/`lead_time_force_reason` en la línea y escribe EXACTAMENTE una fila en `overrides` (kind, soporte, mercado, motivo, autor, marca de tiempo); sin forzado, ninguna fila; el mismo soporte forzado en dos mercados escribe DOS filas (a diferencia del reparto de medios, que se deduplica por soporte); y el conflicto de disponibilidad sigue bloqueando de forma incondicional un envío que choca con un presupuesto ya `ACCEPTED`, incluso llevando `lead_time_overrides` en el mismo payload. Los siete scripts de verificación anteriores se repitieron tras esta migración para confirmar que ninguno queda roto — ninguno lo estaba.

**Tests**: `src/pricing/__tests__/checks.test.ts` gana un bloque dedicado (que la antelación forzada con motivo quita el bloqueo y aparece como `LEAD_TIME_FORCED` con el motivo en `messageVars`; que un motivo vacío o solo espacios no tiene efecto; que un forzado para otro soporte o mercado no interfiere; que `CAMPAIGN_DATES_INVALID` y `MEDIA_BUDGET_MISSING` nunca llevan `forcible: true` y siguen bloqueando) y confirma explícitamente que `LEAD_TIME_INSUFFICIENT` es el único bloqueo con `forcible: true`. `src/pricing/__tests__/option-draft.test.ts` gana tests para `forceLeadTimeOverride`/`clearLeadTimeOverride` (motivo recortado de espacios, motivo vacío sin efecto, forzar de nuevo sustituye en vez de duplicar, el mismo soporte en dos mercados son dos forzados independientes). `app/(internal)/proposals/[id]/actions.test.ts` gana tests para que `duplicateProposal` traslada el array de forzados sin recalcular, incluido el caso de un forzado en un mercado no líder. Nuevo `lib/i18n-internal.test.ts` para la función pura `interpolate()` (extraída de `t()`), con un test dedicado a la variable repetida que descubrió el bug de `replace()`/`replaceAll` de más abajo. 248 tests en total (227 → 248).

**Verificado también en un navegador real** (Playwright, misma metodología que rondas anteriores: servidor de desarrollo real, ruta de prueba temporal y bypass de middleware eliminados antes de este commit, sin credenciales de Supabase): el checklist muestra los textos en el idioma de interfaz seleccionado; el bloqueo de antelación insuficiente lleva el botón "Forzar antelación"; rellenar un motivo y confirmar lo convierte en un aviso "forzado" con el motivo visible y un botón para deshacerlo, y el botón "Enviar al cliente" deja de estar deshabilitado por ese bloqueo.

---

## Nota sobre los prototipos de `/design`

Los prototipos HTML de `/design` son **referencia visual**: maquetación, jerarquía, componentes, tono. Sirven para saber cómo debe verse la interfaz.

**En caso de discrepancia entre un prototipo y este documento, manda este documento.** Cualquier cifra, regla de cálculo, campo, estado o control que aparezca en un prototipo y contradiga lo escrito aquí es obsoleto: los prototipos se hicieron antes de fijar 35 €/h y el 50 % de margen, y pueden arrastrar precios, porcentajes o pantallas que ya no son válidos. Un prototipo nunca es fuente de una cifra.
