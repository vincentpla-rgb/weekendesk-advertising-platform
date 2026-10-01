import { NextResponse } from 'next/server';

import { createPublicClient } from '@/lib/supabase/server';
import type { ContentLanguage } from '@/lib/domain';
import { buildTransactionalEmailContent } from '@/lib/email/transactional-email';
import { sendEmail } from '@/lib/email/resend-client';
import { translateText } from '@/lib/ai/translate-text';

/**
 * Rechazo público (CLAUDE.md §5.4, §5.5). Registra el motivo; la
 * contrapropuesta es una acción interna posterior, no construida en este
 * MVP (ver README).
 */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  let body: { reason: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const supabase = createPublicClient();
  const { data, error } = await supabase.rpc('reject_public_proposal', {
    p_token: token,
    p_reason: body.reason,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Email 8 (AM: aviso de rechazo simple, con motivo) — CLAUDE.md §9/§10.3,
  // ronda 18, bloque 2. El motivo lo escribió el cliente en SU idioma;
  // `translateText` lo traduce al idioma preferido del AM antes de
  // construir el email (mismo patrón que `rejectCounterProposal`, ronda
  // 17 — nunca lanza, cae al texto original si falla). Un fallo al mandar
  // este email es una degradación, nunca deshace el rechazo ya persistido.
  const rejected = data as {
    proposal_id: string;
    proposal_number: string;
    advertiser_name: string | null;
    owner_email: string | null;
    owner_full_name: string | null;
    owner_language: string | null;
  };

  const apiKey = process.env.RESEND_API_KEY;
  const fromAddress = process.env.RESEND_FROM_EMAIL;

  if (apiKey && fromAddress && rejected.owner_email && rejected.owner_full_name && rejected.advertiser_name) {
    const origin = new URL(request.url).origin;
    const amFirstName = rejected.owner_full_name.trim().split(/\s+/)[0] ?? rejected.owner_full_name;
    const amLanguage = (rejected.owner_language as ContentLanguage) ?? 'ES';
    const reasonText =
      body.reason && body.reason.trim() !== '' ? await translateText({ text: body.reason, targetLanguage: amLanguage }) : null;

    const amEmail = buildTransactionalEmailContent({
      key: 'rejected_am',
      language: amLanguage,
      amFirstName,
      clientCompany: rejected.advertiser_name,
      proposalNumber: rejected.proposal_number,
      reasonText,
      ctaUrl: `${origin}/proposals/${rejected.proposal_id}`,
    });
    const amResult = await sendEmail(
      { from: fromAddress, to: [rejected.owner_email], subject: amEmail.subject, html: amEmail.html, text: amEmail.text },
      apiKey,
    );
    if (!amResult.ok) {
      console.error(`[reject] email 8 (AM) no se pudo mandar: ${amResult.error}`);
    }
  }

  return NextResponse.json(data);
}
