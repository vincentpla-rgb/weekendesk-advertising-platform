import type { ContentLanguage } from '../domain';
import { buildProposalEmailContent, type EmailContent } from './proposal-email';

/**
 * Vista previa del email de envío, SIN enviar nada (CLAUDE.md §10.3
 * duodecies, ronda 12). Pedido de Vincent: un botón "Vista previa del
 * email" en el creador de presupuesto, junto al de enviar, que muestre el
 * email exactamente como se generaría — sin llamar a Resend ni consumir
 * cuota, y funcionando aunque el presupuesto todavía esté en borrador y no
 * se haya guardado.
 *
 * Reutiliza `buildProposalEmailContent` TAL CUAL — la misma función pura
 * que usa el envío real (`app/api/proposals/route.ts`) — en vez de
 * reimplementar la plantilla o la selección de idioma. Es la única forma de
 * que la vista previa y el email real no puedan divergir: no hay una
 * segunda copia de la lógica que mantener sincronizada.
 *
 * Dos campos del email real no existen para un borrador sin guardar: el
 * enlace público (`publicUrl`, del `public_token` que solo genera
 * `create_and_send_proposal` al persistir) y el número de presupuesto
 * (`proposalNumber`, del contador secuencial de la misma función). Nunca se
 * inventan como si fueran reales (CLAUDE.md §8): se sustituyen por
 * marcadores de posición, honestamente no numéricos y no parecidos a un
 * token o a un número real, para que no puedan confundirse con uno.
 */
export const DRAFT_EMAIL_PREVIEW_PUBLIC_URL =
  'https://[enlace-pendiente-de-generar-al-enviar]';
export const DRAFT_EMAIL_PREVIEW_PROPOSAL_NUMBER = '[pendiente de asignar]';

export interface ProposalDraftEmailPreviewInput {
  readonly advertiserName: string;
  readonly contactFullName: string;
  readonly brief: string | null;
  readonly numberOfOptions: number;
  readonly salesName: string;
  /** CLAUDE.md §7: validez de la oferta en días, del juego de parámetros activo. */
  readonly offerValidityDays: number;
  readonly language: ContentLanguage;
}

/**
 * Construye el contenido del email para un presupuesto TODAVÍA EN
 * CONSTRUCCIÓN, sin persistir nada ni tocar Resend. `expiresAtIso` se
 * calcula con la misma fórmula que `app/api/proposals/route.ts`
 * (`Date.now() + offerValidityDays días`) — la fecha de caducidad real
 * cambiará solo en el segundo exacto en que se envíe de verdad, nunca en el
 * cálculo en sí.
 */
export function buildDraftProposalEmailPreview(
  input: ProposalDraftEmailPreviewInput,
): EmailContent {
  const expiresAtIso = new Date(Date.now() + input.offerValidityDays * 86_400_000).toISOString();

  return buildProposalEmailContent({
    advertiserName: input.advertiserName,
    contactFullName: input.contactFullName,
    brief: input.brief,
    numberOfOptions: input.numberOfOptions,
    publicUrl: DRAFT_EMAIL_PREVIEW_PUBLIC_URL,
    expiresAtIso,
    salesName: input.salesName,
    proposalNumber: DRAFT_EMAIL_PREVIEW_PROPOSAL_NUMBER,
    language: input.language,
  });
}
