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
- Envío mediante enlace único + borrador de email prerellenado
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
| Auth | Supabase Auth, magic link + lista blanca de emails | Google SSO exige app interna en el Workspace = 1 semana de IT |
| Hosting | Vercel (Hobby) | Deploy desde GitHub |
| Repo | GitHub | — |

**Restricción central del proyecto:** nada que dependa del proceso IT interno de Weekendesk (una semana). Eso excluye del MVP: Google SSO, dominio propio, DNS, API de Docusign, GCP, envío automático de email desde dominio weekendesk.

El envío de email en el MVP es **un borrador prerellenado que abre el cliente de correo del usuario**. El usuario pulsa enviar. El seguimiento de apertura lo captura la página pública, no el email.

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

El brief se reutiliza en el cuerpo del email prerellenado y, más adelante, en el PDF. Empieza vacío, sin plantilla. Si está vacío al enviar: **aviso, no bloqueo**.

### 5.3 Controles antes del envío

Bloquean el botón de envío (forzables con motivo registrado):

1. Margen por debajo del 50 % en cualquier opción
2. Antelación insuficiente: días laborables entre hoy y el inicio de campaña < antelación del soporte más lento
3. Disponibilidad no confirmada con Marketing — checkbox manual con quién y cuándo, obligatorio para ON-01, ON-02, ON-03, CRM-03 y ADS-01
4. Brief vacío (solo aviso)

**Días laborables, resuelto (CLAUDE.md §9).** El cálculo excluye sábados, domingos y los festivos nacionales del mercado de cada línea (tabla `market_holidays`, editable en admin, sembrada con FR/ES/IT/BE-FR/BE-NL 2026-2027). BE-FR y BE-NL comparten calendario: son festivos federales belgas, no de comunidad lingüística.

El control 2 se evalúa **por línea, no por opción**: el calendario de festivos es por mercado, así que dos soportes con la misma antelación nominal pueden tener fecha límite real distinta según dónde se contraten. Motivo de la tabla: la primera campaña real es Navidad, y 15 días laborables desde diciembre cruzan el 25 de diciembre y el 1 de enero — sin festivos la calculadora decía que se llegaba a tiempo cuando no era así.

No incluye festivos regionales o municipales (2 por comunidad autónoma en España, patronales en Italia): solo el calendario nacional. Añadir eso, si hace falta, es una fila más en `market_holidays`.

### 5.4 Inmutabilidad

Al enviar, el envío se **congela**. Ningún cambio posterior altera lo que el cliente tiene delante. Cualquier modificación crea una **versión nueva** con su propio enlace.

La **contrapropuesta solo aparece detrás del botón de rechazo**, nunca junto a aceptar. Si se ofrece al lado, el cliente negocia a la baja de entrada.

### 5.5 Estados

`borrador` → `enviado` → `visto` → `aceptado` | `rechazado` | `caducado`

`rechazado` puede generar una versión nueva en estado `borrador` (contrapropuesta).

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


---

## 10. Estado de la implementación

### 10.1 Qué existe hoy

| Módulo | Ruta | Estado |
|---|---|---|
| Esquema PostgreSQL / Supabase | `supabase/migrations/` | Hecho |
| Motor de precios | `src/pricing/` | Hecho |
| Tests unitarios | `src/pricing/__tests__/` | Hecho — 81 tests |
| Interfaz (Next.js) | `app/`, `lib/`, `components/` | Hecho — 3 pantallas del MVP |

El motor es **puro**: no lee de la base de datos. Recibe el juego de parámetros y el catálogo como argumentos, para que los valores editables en admin (tarifa hora, suelo, coeficientes, escalas) lleguen desde `pricing_parameter_sets` y nunca estén hardcodeados en la lógica. Los valores de la sección 3 viven en `src/pricing/parameters.ts` y en la migración de seed únicamente como **estado inicial**, no como constantes de cálculo.

### 10.1.1 Pantallas construidas

| Pantalla | Ruta | Notas |
|---|---|---|
| Creación de presupuesto | `/proposals/new` | 2-3 opciones, líneas multimercado, descuentos manuales, vista previa en vivo con el motor, checklist de controles previos al envío |
| Pantalla pública comparativa | `/p/[token]` | `get_public_proposal` (SECURITY DEFINER), reach solo con dato medido, caduca a los 14 días, idioma del cliente |
| Aceptación con datos fiscales | Modal en `/p/[token]` | VIES verificado en servidor (`app/api/public/proposals/[token]/accept`), régimen de IVA decidido en `accept_public_proposal` |
| Rechazo | Modal en `/p/[token]` | Registra motivo; **no** construye la contrapropuesta (ver más abajo) |
| Login | `/login` | Magic link (Supabase Auth), lista blanca comprobada en `/auth/callback` contra `profiles` |

**Arquitectura de cálculo:** el navegador ejecuta el mismo motor (`src/pricing/`) para la vista previa en vivo mientras el comercial edita, pero esos números **nunca se persisten**. Al pulsar "Enviar", `app/api/proposals/route.ts` recibe los datos crudos (soportes, mercados, cantidades, descuentos) y **vuelve a calcular en el servidor** con los parámetros vivos de la base de datos — eso es lo único que se guarda, vía `create_and_send_proposal` (una función SQL `SECURITY INVOKER`, atómica: opción + líneas + descuentos + checks de disponibilidad en una sola transacción, con el envío ya congelado).

**Verificado end to end contra un PostgreSQL 16 real** (no solo tipado): crear y enviar un presupuesto con el motor real, leer la pantalla pública (reach con y sin dato, caducidad), aceptar con VIES simulado (régimen de IVA correcto), rechazar, y los bloqueos de estado (no se puede aceptar dos veces, ni aceptar un envío caducado).

### 10.1.2 Deliberadamente fuera de esta pasada

Explícito para no dar por hecho más de lo construido:

- **Dashboard de seguimiento** por persona y quarter fiscal (CLAUDE.md §1): no pedido en esta pasada, no construido.
- **Contrapropuesta** tras rechazo (§5.4, §5.5): el rechazo se registra; crear la versión nueva en `borrador` es una acción interna posterior, no implementada.
- **Forzar un bloqueo con motivo** (§5.3, tabla `overrides`): hoy un bloqueo (margen, antelación, disponibilidad) impide enviar sin excepción; no hay UI para forzarlo y registrar autor/motivo.
- **Gestión de cuentas y contactos** como pantallas propias: se crean inline al construir un presupuesto, sin un CRM dedicado.
- **Verificación VIES mientras se escribe**: se comprueba solo al enviar el formulario de aceptación, no en vivo. Probado que el endpoint construye la llamada REST correctamente; **no se ha podido probar contra la API real de la UE** porque la política de red de este entorno de desarrollo bloquea la salida a `ec.europa.eu` — funcionará en Vercel, pero conviene una prueba manual tras el primer despliegue.
- **Sin proyecto Supabase real conectado**: el código usa `@supabase/ssr` correctamente (`lib/supabase/`), pero no hay credenciales en este entorno. `lib/supabase/database.types.ts` está escrito a mano a partir de las migraciones; al crear el proyecto real, regenerar con `supabase gen types typescript` y revisar que coincide.

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

---

## Nota sobre los prototipos de `/design`

Los prototipos HTML de `/design` son **referencia visual**: maquetación, jerarquía, componentes, tono. Sirven para saber cómo debe verse la interfaz.

**En caso de discrepancia entre un prototipo y este documento, manda este documento.** Cualquier cifra, regla de cálculo, campo, estado o control que aparezca en un prototipo y contradiga lo escrito aquí es obsoleto: los prototipos se hicieron antes de fijar 35 €/h y el 50 % de margen, y pueden arrastrar precios, porcentajes o pantallas que ya no son válidos. Un prototipo nunca es fuente de una cifra.
