import { NextResponse } from 'next/server';

import { checkVies } from '@/lib/vies';
import { createPublicClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import type { Json } from '@/lib/supabase/database.types.js';
import type { ContentLanguage } from '@/lib/domain';
import { buildTransactionalEmailContent } from '@/lib/email/transactional-email';
import { sendEmail, type SendEmailAttachment } from '@/lib/email/resend-client';
import { loadProposalPdfData } from '@/lib/pdf/proposal-pdf-loader';
import { renderProposalPdf, proposalPdfFileName } from '@/lib/pdf/render-proposal-pdf';
import type { PdfAudience } from '@/lib/pdf/proposal-pdf-data';

/**
 * PDF del presupuesto aceptado (CLAUDE.md §1/§9, propuesta confirmada por
 * Vincent) — adjunto a los dos emails de aceptación. Igual criterio que el
 * resto de este endpoint: la aceptación ya se persistió por el RPC de
 * arriba, así que un fallo aquí (datos, render) nunca debe impedir que los
 * emails salgan — se manda sin adjunto y se registra, nunca se bloquea.
 * El propio `createServiceClient()` hace falta porque esta ruta corre sin
 * sesión de equipo (acepta un cliente externo, vía token público) — RLS
 * (`team_all`) no dejaría leer `proposals`/`proposal_option_lines` con el
 * cliente público/anon que ya usa el resto de esta ruta.
 */
async function loadPdfAttachment(proposalId: string, audience: PdfAudience): Promise<SendEmailAttachment | null> {
  try {
    const service = createServiceClient();
    const pdfData = await loadProposalPdfData(service, proposalId);
    if (!pdfData) return null;
    const buffer = await renderProposalPdf(pdfData, audience);
    return { filename: proposalPdfFileName(pdfData), content: buffer.toString('base64') };
  } catch (err) {
    console.error(`[accept] no se pudo generar el PDF (${audience}): ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

interface AcceptBody {
  optionCode: string;
  legalName: string;
  billingAddress: string;
  vatNumber: string;
  billingContactName: string;
  billingContactEmail: string;
  signerName: string;
  signerRole: string;
  purchaseOrderReference: string;
}

/**
 * Aceptación pública (CLAUDE.md §6, §7). Verifica el número contra VIES aquí
 * (esta ruta tiene salida de red; la función SQL no) y persiste el resultado
 * llamando a accept_public_proposal, que decide el régimen de IVA.
 */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  let body: AcceptBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const required: (keyof AcceptBody)[] = [
    'optionCode',
    'legalName',
    'billingAddress',
    'billingContactName',
    'billingContactEmail',
    'signerName',
    'signerRole',
  ];
  for (const key of required) {
    if (!body[key] || body[key].trim() === '') {
      return NextResponse.json({ error: `Falta el campo ${key}` }, { status: 400 });
    }
  }

  // Sin número de IVA no hay nada que verificar: se trata como sin dato, no
  // como inválido (un organismo público puede no tener uno y aun así ser
  // francés, con IVA francés directo).
  const vies = body.vatNumber.trim()
    ? await checkVies(body.vatNumber)
    : { result: 'UNAVAILABLE' as const, raw: { note: 'Sin número de IVA aportado' } };

  const supabase = createPublicClient();
  const { data, error } = await supabase.rpc('accept_public_proposal', {
    p_token: token,
    p_option_code: body.optionCode,
    p_legal_name: body.legalName,
    p_billing_address: body.billingAddress,
    p_vat_number: body.vatNumber || null,
    p_billing_contact_name: body.billingContactName,
    p_billing_contact_email: body.billingContactEmail,
    p_signer_name: body.signerName,
    p_signer_role: body.signerRole,
    p_purchase_order_reference: body.purchaseOrderReference || null,
    p_vies_result: vies.result,
    p_vies_raw: vies.raw as Json,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Emails 3 (cliente: confirmación de aceptación) y 4 (AM: aviso con
  // rentabilidad) — CLAUDE.md §9/§10.3, ronda 18, bloque 2. Igual criterio
  // que el resto del proyecto: la aceptación ya se persistió arriba, un
  // fallo de Resend aquí nunca deshace nada, solo se registra.
  const accepted = data as {
    proposal_id: string;
    proposal_number: string;
    proposal_language: string;
    option_name: string | null;
    markets: string[] | null;
    sale_cents: number | null;
    cost_cents: number | null;
    margin_cents: number | null;
    margin_rate: number | null;
    advertiser_name: string | null;
    contact_full_name: string | null;
    contact_email: string | null;
    owner_email: string | null;
    owner_full_name: string | null;
    owner_language: string | null;
  };

  const apiKey = process.env.RESEND_API_KEY;
  const fromAddress = process.env.RESEND_FROM_EMAIL;

  if (apiKey && fromAddress) {
    const origin = new URL(request.url).origin;

    if (
      accepted.contact_email &&
      accepted.contact_full_name &&
      accepted.advertiser_name &&
      accepted.option_name &&
      accepted.markets &&
      accepted.sale_cents !== null
    ) {
      const clientFirstName = accepted.contact_full_name.trim().split(/\s+/)[0] ?? accepted.contact_full_name;
      const clientEmail = buildTransactionalEmailContent({
        key: 'accepted_client',
        language: accepted.proposal_language as ContentLanguage,
        contactFirstName: clientFirstName,
        clientCompany: accepted.advertiser_name,
        proposalNumber: accepted.proposal_number,
        optionName: accepted.option_name,
        markets: accepted.markets.join(' · '),
        amountCents: accepted.sale_cents,
        billedTo: body.legalName,
        creatorName: accepted.owner_full_name ?? 'Weekendesk Advertising',
      });
      const clientAttachment = await loadPdfAttachment(accepted.proposal_id, 'client');
      const clientResult = await sendEmail(
        {
          from: fromAddress,
          to: [accepted.contact_email],
          subject: clientEmail.subject,
          html: clientEmail.html,
          text: clientEmail.text,
          attachments: clientAttachment ? [clientAttachment] : undefined,
        },
        apiKey,
      );
      if (!clientResult.ok) {
        console.error(`[accept] email 3 (cliente) no se pudo mandar: ${clientResult.error}`);
      }
    }

    if (
      accepted.owner_email &&
      accepted.owner_full_name &&
      accepted.advertiser_name &&
      accepted.option_name &&
      accepted.markets &&
      accepted.sale_cents !== null &&
      accepted.cost_cents !== null &&
      accepted.margin_cents !== null
    ) {
      const amFirstName = accepted.owner_full_name.trim().split(/\s+/)[0] ?? accepted.owner_full_name;
      const amEmail = buildTransactionalEmailContent({
        key: 'accepted_am',
        language: (accepted.owner_language as ContentLanguage) ?? 'ES',
        amFirstName,
        clientCompany: accepted.advertiser_name,
        proposalNumber: accepted.proposal_number,
        optionName: accepted.option_name,
        markets: accepted.markets.join(' · '),
        saleCents: accepted.sale_cents,
        costCents: accepted.cost_cents,
        marginCents: accepted.margin_cents,
        marginRate: accepted.margin_rate,
        ctaUrl: `${origin}/proposals/${accepted.proposal_id}`,
      });
      const amAttachment = await loadPdfAttachment(accepted.proposal_id, 'internal');
      const amResult = await sendEmail(
        {
          from: fromAddress,
          to: [accepted.owner_email],
          subject: amEmail.subject,
          html: amEmail.html,
          text: amEmail.text,
          attachments: amAttachment ? [amAttachment] : undefined,
        },
        apiKey,
      );
      if (!amResult.ok) {
        console.error(`[accept] email 4 (AM) no se pudo mandar: ${amResult.error}`);
      }
    }
  }

  return NextResponse.json(data);
}
