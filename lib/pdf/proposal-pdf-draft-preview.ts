import type { TypedSupabaseClient } from '@/lib/pricing-context';
import type { ContentLanguage } from '@/lib/domain';
import { loadReachForSupportMarketPairs } from './proposal-pdf-loader';
import type { ProposalPdfData, PdfOption, PdfLine } from './proposal-pdf-data';

/**
 * Vista previa del PDF del presupuesto, SIN enviar ni guardar nada (CLAUDE.md
 * §10.3, ronda 22) — mismo espíritu que la vista previa del email (ronda 12,
 * `lib/email/proposal-email-preview.ts`): un botón junto al de enviar que
 * muestra cómo quedaría el documento antes de pulsar "Enviar", reutilizando
 * el MISMO generador ya construido (`renderProposalPdf`, variante
 * `internal`) en vez de reimplementar el layout o el formato aparte.
 *
 * A diferencia del email, `@react-pdf/renderer` no puede ejecutarse en el
 * navegador (necesita leer las fuentes/el logo del disco, CLAUDE.md §10.3
 * undevicies) — por eso esta función es async y recibe `supabase`: el
 * cliente (`ProposalBuilder.tsx`) ya calculó el precio de cada opción con el
 * motor real (`priceOption`, el mismo que usa la vista previa en vivo) y
 * manda ese resultado tal cual a un endpoint de servidor
 * (`app/api/proposals/preview-pdf/route.ts`), que solo RENDERIZA — nunca
 * vuelve a calcular el precio con una segunda copia del motor.
 *
 * El reach SÍ se consulta de verdad (a diferencia del número de presupuesto,
 * más abajo): el reach no depende de que el presupuesto exista — solo del
 * soporte y el mercado (CLAUDE.md §3) — así que puede leerse igual para un
 * borrador sin persistir, con la MISMA consulta que ya usa el PDF real
 * (`loadReachForSupportMarketPairs`), nunca una reimplementación aparte.
 *
 * Dos campos del PDF real no existen todavía para un borrador sin guardar:
 * el número de presupuesto (del contador secuencial que solo asigna
 * `create_and_send_proposal` al persistir) y la fecha de envío. Nunca se
 * inventan como si fueran reales (CLAUDE.md §8): se sustituyen por un
 * marcador de posición honesto, que no puede confundirse con un número real.
 */
export const DRAFT_PDF_PREVIEW_PROPOSAL_NUMBER = '[pendiente de asignar]';

export interface DraftPdfLineInput {
  readonly supportId: string;
  readonly supportName: string;
  readonly market: string;
  readonly quantity: number;
  readonly billedTotalCents: number;
}

export interface DraftPdfOptionInput {
  readonly code: string;
  readonly name: string;
  readonly pitch: string | null;
  readonly markets: readonly string[];
  readonly campaignStart: string | null;
  readonly campaignEnd: string | null;
  readonly campaignDurationCount: number | null;
  readonly campaignDurationUnit: 'WEEK' | 'MONTH' | null;
  readonly billedTotalCents: number;
  readonly costCents: number | null;
  readonly marginCents: number | null;
  readonly marginRate: number | null;
  readonly lines: readonly DraftPdfLineInput[];
}

export interface DraftProposalPdfPreviewInput {
  readonly advertiserName: string;
  readonly contactFullName: string | null;
  readonly brief: string | null;
  readonly salesName: string;
  readonly language: ContentLanguage;
  readonly options: readonly DraftPdfOptionInput[];
}

/**
 * Construye `ProposalPdfData` para un presupuesto todavía en construcción,
 * sin persistir nada. Corre en el servidor (necesita `supabase` para el
 * reach), nunca en el navegador.
 */
export async function buildDraftProposalPdfData(
  supabase: TypedSupabaseClient,
  input: DraftProposalPdfPreviewInput,
): Promise<ProposalPdfData> {
  const supportMarketPairs = new Set<string>();
  for (const option of input.options) {
    for (const line of option.lines) {
      supportMarketPairs.add(`${line.supportId}::${line.market}`);
    }
  }

  const reachBySupportMarket = await loadReachForSupportMarketPairs(supabase, supportMarketPairs);

  const options: PdfOption[] = input.options.map((option) => {
    const lines: PdfLine[] = option.lines.map((line) => ({
      supportId: line.supportId,
      supportName: line.supportName,
      market: line.market,
      quantity: line.quantity,
      billedTotalCents: line.billedTotalCents,
      reach: reachBySupportMarket.get(`${line.supportId}::${line.market}`) ?? null,
    }));

    return {
      code: option.code,
      name: option.name,
      pitch: option.pitch,
      markets: option.markets,
      campaignStart: option.campaignStart,
      campaignEnd: option.campaignEnd,
      campaignDurationCount: option.campaignDurationCount,
      campaignDurationUnit: option.campaignDurationUnit,
      billedTotalCents: option.billedTotalCents,
      lines,
      costCents: option.costCents,
      marginCents: option.marginCents,
      marginRate: option.marginRate,
    };
  });

  return {
    proposalId: 'draft-preview',
    proposalNumber: DRAFT_PDF_PREVIEW_PROPOSAL_NUMBER,
    language: input.language,
    status: 'DRAFT',
    advertiserLegalName: input.advertiserName || '—',
    contactFullName: input.contactFullName,
    brief: input.brief,
    sentAt: null,
    ownerFullName: input.salesName || null,
    options,
    // Un borrador sin enviar nunca se ha aceptado (CLAUDE.md §5.4).
    acceptance: null,
  };
}
