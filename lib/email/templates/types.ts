/**
 * Forma de una plantilla de email de envío de presupuesto, un fichero por
 * idioma (`proposal-email.<lang>.ts`). Puro contenido: la lógica de envío
 * (`lib/email/proposal-email.ts`) no sabe qué dice cada idioma, solo cómo
 * combinarlo con las variables del presupuesto — así se puede retocar el
 * texto sin tocar esa lógica.
 *
 * Tres reglas de contenido fijadas por Vincent para estas plantillas
 * (CLAUDE.md §2, §5.2):
 *   1. Sin mención de IVA — va en la pantalla comparativa, no en el email.
 *   2. Sin precios — ni total, ni "desde", ni rango. El cliente abre la pantalla.
 *   3. El asunto no lleva el nombre de la campaña, solo el anunciante.
 */
export interface ProposalEmailTemplate {
  /** CLAUDE.md §2 regla 3: el asunto lleva el anunciante, nunca el nombre de la campaña. */
  readonly subject: (advertiserName: string) => string;
  readonly greeting: (contactFirstName: string) => string;
  /**
   * Frase que presenta el número de opciones, con la concordancia de género y
   * número correcta en cada idioma (singular real: nunca ocurre en producción,
   * CLAUDE.md §5.1 exige 2–3 opciones, pero la plantilla es correcta igualmente).
   */
  readonly optionsLine: (numberOfOptions: number) => string;
  /** Etiqueta del enlace. En texto plano se muestra entre corchetes seguida de la URL; en HTML es el texto del botón. */
  readonly cta: string;
  /**
   * Número de presupuesto (CLAUDE.md §10.3 octies, ronda 8), p. ej.
   * "2026-014" — para poder mencionarlo en una llamada o un email interno
   * sin abrir la pantalla pública. No es un precio ni un dato sensible, así
   * que no rompe ninguna de las tres reglas de contenido de Vincent.
   */
  readonly referenceLine: (proposalNumber: string) => string;
  readonly postCtaLine: string;
  readonly validityLine: (formattedExpiryDate: string) => string;
  readonly closingLine: string;
  readonly signOff: string;
  /** Departamento fijo de la firma (sin cargo personal: no hay ese dato por comercial, ver CLAUDE.md §10.3). */
  readonly department: string;
  /** Locale de `Intl.DateTimeFormat` para la fecha de caducidad. */
  readonly dateLocale: string;
}

/**
 * Plantilla del email de rechazo de una contrapropuesta (CLAUDE.md, ronda
 * 16, bloque 4) — un fichero por idioma, mismo patrón que
 * `ProposalEmailTemplate`. A diferencia de esa plantilla, aquí NO se aplican
 * las tres reglas de contenido de §5.6 (sin IVA, sin precios, sin nombre de
 * campaña en el asunto): esa regla es específica del primer email de
 * propuesta, no de este, que es un email distinto sobre una decisión ya
 * tomada, con el motivo que escribió el advertising manager.
 */
export interface CounterProposalRejectionEmailTemplate {
  readonly subject: (advertiserName: string, proposalNumber: string) => string;
  readonly greeting: (contactFirstName: string) => string;
  readonly intro: string;
  /** Frase que precede al motivo tecleado por el AM (CLAUDE.md, ronda 16, bloque 3, punto 7 y bloque 4). */
  readonly reasonIntro: string;
  readonly closingLine: string;
  readonly signOff: string;
  readonly department: string;
}

/**
 * Email interno (email 5, ronda 17, bloque 1, punto 1): avisa al advertising
 * manager de que ha llegado una contrapropuesta. Idioma = `profiles.preferred_language`
 * del propio AM (ronda 17, bloque 3) — nunca el idioma del cliente, es un
 * email para el equipo. Solo ES/FR/EN tienen fichero propio (son los tres
 * idiomas de interfaz interna, `lib/i18n-internal.tsx`); el registro
 * (`templates/index.ts`) cae a ES para cualquier otro valor, no a EN — es el
 * idioma por defecto de la interfaz interna (`readStoredLanguage`), no el de
 * cara al cliente.
 */
export interface CounterProposalReceivedAmEmailTemplate {
  readonly subject: (advertiserName: string, proposalNumber: string) => string;
  readonly greeting: (ownerFirstName: string) => string;
  readonly body: (advertiserName: string, optionCode: string) => string;
  readonly cta: string;
  readonly department: string;
}

/**
 * Email al cliente (email 6, ronda 17, bloque 1, punto 2): confirma que su
 * contrapropuesta fue aceptada. Mismo criterio que
 * `CounterProposalRejectionEmailTemplate`: no se aplican las reglas de §5.6
 * (son del primer email de propuesta), pero por prudencia se sigue sin
 * mencionar precios ni IVA — no hace falta y evita cualquier duda.
 */
export interface CounterProposalAcceptedClientEmailTemplate {
  readonly subject: (proposalNumber: string) => string;
  readonly greeting: (contactFirstName: string) => string;
  readonly body: string;
  readonly closingLine: string;
  readonly signOff: string;
  readonly department: string;
}

/**
 * Email al cliente (email 9, ronda 17, bloque 1, punto 3): confirma que su
 * contrapropuesta se ha recibido y está pendiente de revisión — el mismo
 * papel que hoy hace `copy.counterProposalThankYou` en pantalla, pero
 * también por email.
 */
export interface CounterProposalSubmittedClientEmailTemplate {
  readonly subject: (proposalNumber: string) => string;
  readonly greeting: (contactFirstName: string) => string;
  readonly body: string;
  readonly closingLine: string;
  readonly signOff: string;
  readonly department: string;
}
