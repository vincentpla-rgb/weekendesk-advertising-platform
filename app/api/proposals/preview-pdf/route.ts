import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { CONTENT_LANGUAGES, type ContentLanguage } from '@/lib/domain';
import {
  buildDraftProposalPdfData,
  type DraftPdfLineInput,
  type DraftPdfOptionInput,
  type DraftProposalPdfPreviewInput,
} from '@/lib/pdf/proposal-pdf-draft-preview';
import { renderProposalPdf } from '@/lib/pdf/render-proposal-pdf';

/**
 * Vista previa del PDF de un presupuesto TODAVÍA EN CONSTRUCCIÓN (CLAUDE.md
 * §10.3, ronda 22, botón "Vista previa del presupuesto" en
 * `ProposalBuilder.tsx`, junto a "Vista previa del email"). Nunca persiste
 * nada: recibe el resultado YA CALCULADO por el motor en el navegador (el
 * mismo `priceOption` que alimenta la vista previa en vivo) y solo renderiza
 * — mismo principio que la vista previa del email (ronda 12), pero con un
 * salto al servidor porque `@react-pdf/renderer` no puede ejecutarse en el
 * navegador (necesita leer fuentes/logo del disco, CLAUDE.md §10.3
 * undevicies).
 *
 * Siempre la variante INTERNA (coste/margen) — misma sesión de equipo que ya
 * ve esos números libremente en el propio creador de presupuestos; exige
 * sesión igual que la descarga manual de `/api/proposals/[id]/pdf`.
 */
export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo de la petición inválido' }, { status: 400 });
  }

  const input = parseDraftPdfPreviewInput(body);
  if (!input) {
    return NextResponse.json({ error: 'Datos de presupuesto incompletos para la vista previa' }, { status: 400 });
  }

  const pdfData = await buildDraftProposalPdfData(supabase, input);
  const buffer = await renderProposalPdf(pdfData, 'internal');

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      // Inline, no attachment: es una vista previa para abrir en una pestaña
      // nueva, no un fichero que el navegador deba ofrecer a descargar.
      'Content-Disposition': 'inline; filename="vista-previa-presupuesto.pdf"',
      'Cache-Control': 'private, no-store',
    },
  });
}

/**
 * Validación defensiva mínima del cuerpo recibido — este endpoint confía en
 * el propio comercial autenticado (el mismo que ya ve estos números en la
 * vista previa en vivo), pero el body es JSON de cliente, así que se
 * comprueba la forma antes de pasarlo a `buildDraftProposalPdfData` en vez
 * de asumirla.
 */
function parseDraftPdfPreviewInput(body: unknown): DraftProposalPdfPreviewInput | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;

  if (typeof b.advertiserName !== 'string') return null;
  if (b.contactFullName !== null && typeof b.contactFullName !== 'string') return null;
  if (b.brief !== null && typeof b.brief !== 'string') return null;
  if (typeof b.salesName !== 'string') return null;
  if (typeof b.language !== 'string' || !CONTENT_LANGUAGES.includes(b.language as ContentLanguage)) return null;
  if (!Array.isArray(b.options) || b.options.length === 0) return null;

  const options: DraftPdfOptionInput[] = [];
  for (const raw of b.options) {
    if (!raw || typeof raw !== 'object') return null;
    const o = raw as Record<string, unknown>;
    if (typeof o.code !== 'string' || typeof o.name !== 'string') return null;
    if (o.pitch !== null && typeof o.pitch !== 'string') return null;
    if (!Array.isArray(o.markets) || !o.markets.every((m) => typeof m === 'string')) return null;
    if (o.campaignStart !== null && typeof o.campaignStart !== 'string') return null;
    if (o.campaignEnd !== null && typeof o.campaignEnd !== 'string') return null;
    if (o.campaignDurationCount !== null && typeof o.campaignDurationCount !== 'number') return null;
    if (o.campaignDurationUnit !== null && o.campaignDurationUnit !== 'WEEK' && o.campaignDurationUnit !== 'MONTH') {
      return null;
    }
    if (typeof o.billedTotalCents !== 'number') return null;
    if (o.costCents !== null && typeof o.costCents !== 'number') return null;
    if (o.marginCents !== null && typeof o.marginCents !== 'number') return null;
    if (o.marginRate !== null && typeof o.marginRate !== 'number') return null;
    if (!Array.isArray(o.lines)) return null;

    const lines: DraftPdfLineInput[] = [];
    for (const rawLine of o.lines) {
      if (!rawLine || typeof rawLine !== 'object') return null;
      const l = rawLine as Record<string, unknown>;
      if (
        typeof l.supportId !== 'string' ||
        typeof l.supportName !== 'string' ||
        typeof l.market !== 'string' ||
        typeof l.quantity !== 'number' ||
        typeof l.billedTotalCents !== 'number'
      ) {
        return null;
      }
      lines.push({
        supportId: l.supportId,
        supportName: l.supportName,
        market: l.market,
        quantity: l.quantity,
        billedTotalCents: l.billedTotalCents,
      });
    }

    options.push({
      code: o.code,
      name: o.name,
      pitch: o.pitch as string | null,
      markets: o.markets as string[],
      campaignStart: o.campaignStart as string | null,
      campaignEnd: o.campaignEnd as string | null,
      campaignDurationCount: o.campaignDurationCount as number | null,
      campaignDurationUnit: o.campaignDurationUnit as 'WEEK' | 'MONTH' | null,
      billedTotalCents: o.billedTotalCents,
      costCents: o.costCents as number | null,
      marginCents: o.marginCents as number | null,
      marginRate: o.marginRate as number | null,
      lines,
    });
  }

  return {
    advertiserName: b.advertiserName,
    contactFullName: b.contactFullName as string | null,
    brief: b.brief as string | null,
    salesName: b.salesName,
    language: b.language as ContentLanguage,
    options,
  };
}
