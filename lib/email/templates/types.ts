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
