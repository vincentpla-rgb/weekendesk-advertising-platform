import { renderToBuffer } from '@react-pdf/renderer';

import { registerPdfFonts } from './fonts';
import { ProposalPdfDocument } from './ProposalPdfDocument';
import type { PdfAudience, ProposalPdfData } from './proposal-pdf-data';

/**
 * Único punto que renderiza el PDF a bytes (CLAUDE.md §1/§9) — usado tanto
 * por el adjunto automático en los emails de aceptación como por la
 * descarga manual. Registra las fuentes una vez por proceso
 * (`registerPdfFonts`, idempotente) antes de renderizar.
 */
export async function renderProposalPdf(data: ProposalPdfData, audience: PdfAudience): Promise<Buffer> {
  registerPdfFonts();
  return renderToBuffer(ProposalPdfDocument({ data, audience }));
}

export function proposalPdfFileName(data: ProposalPdfData): string {
  const safeAdvertiser = data.advertiserLegalName
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `weekendesk-${data.proposalNumber}${safeAdvertiser ? `-${safeAdvertiser}` : ''}.pdf`;
}
