import type { ContentLanguage } from '@/lib/domain';

/**
 * Datos de entrada para `ProposalPdfDocument` (CLAUDE.md §1/§9) — nunca un
 * recálculo de precio: todo viene ya computado y persistido (mismo
 * principio que `lib/email/`, el motor de precios es la única fuente).
 *
 * Dos variantes de un mismo documento, nunca mezcladas (CLAUDE.md §4.4/§6):
 *   - `client`: lo que YA ve la pantalla pública/el email al cliente — sin
 *     coste ni margen, sin desglose de medios. Se adjunta al email de
 *     aceptación del CLIENTE.
 *   - `internal`: añade coste/margen por opción (información interna, igual
 *     que ya muestra `/proposals/[id]`). Se adjunta al email interno del AM
 *     y es lo único que genera el botón "Descargar PDF" de esa pantalla
 *     (pantalla ya interna, sin la restricción de §4.4/§6).
 */
export type PdfAudience = 'client' | 'internal';

export interface PdfReach {
  readonly value: number;
  readonly metric: string;
  readonly periodUnit: string;
  readonly source: string;
  readonly measuredAt: string | null;
}

export interface PdfLine {
  readonly supportId: string;
  readonly supportName: string;
  readonly market: string;
  readonly quantity: number;
  readonly billedTotalCents: number;
  readonly reach: PdfReach | null;
}

export interface PdfOption {
  readonly code: string;
  readonly name: string;
  readonly pitch: string | null;
  readonly markets: readonly string[];
  readonly campaignStart: string | null;
  readonly campaignEnd: string | null;
  readonly campaignDurationCount: number | null;
  readonly campaignDurationUnit: 'WEEK' | 'MONTH' | null;
  readonly billedTotalCents: number;
  readonly lines: readonly PdfLine[];
  /** Solo variante `internal` (CLAUDE.md §4.4/§6) — `null` si no se calculó (p. ej. opción nacida de una contrapropuesta, ronda 16). */
  readonly costCents: number | null;
  readonly marginCents: number | null;
  readonly marginRate: number | null;
}

export interface PdfAcceptance {
  readonly optionCode: string;
  readonly legalName: string;
  readonly billingAddress: string;
  readonly vatNumber: string | null;
  readonly purchaseOrderReference: string | null;
  readonly vatRegime: 'FR_VAT_20' | 'REVERSE_CHARGE';
  readonly acceptedAt: string;
}

export interface ProposalPdfData {
  readonly proposalId: string;
  readonly proposalNumber: string;
  readonly language: ContentLanguage;
  readonly status: string;
  readonly advertiserLegalName: string;
  readonly contactFullName: string | null;
  readonly brief: string | null;
  readonly sentAt: string | null;
  readonly ownerFullName: string | null;
  readonly options: readonly PdfOption[];
  /** `null` si el envío todavía no se aceptó — ninguna opción lo tendrá. */
  readonly acceptance: PdfAcceptance | null;
}
