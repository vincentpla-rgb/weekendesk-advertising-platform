'use server';

/**
 * Reintentar el envío de un presupuesto que se quedó en DRAFT porque el
 * email falló (CLAUDE.md §10.1.2, §10.3): hasta la ronda 7 esto era una
 * limitación conocida y documentada — "no hay ninguna pantalla que liste
 * esos borradores ni un botón de 'reintentar envío'". Las funciones SQL que
 * lo necesitan (`mark_proposal_sent`, `log_proposal_send_failure`) ya
 * existían desde la primera implementación del envío real; solo faltaba
 * esta ruta.
 *
 * No se recalcula el precio: el presupuesto ya se congeló en
 * `create_and_send_proposal` (frozen_snapshot, opciones y líneas ya
 * persistidas) — reintentar es solo el paso de "mandar el email", igual que
 * hace `app/api/proposals/route.ts` la primera vez. Recalcular aquí
 * arriesgaría números distintos si `pricing_parameter_sets`/`supports`
 * cambiaron entre la creación y el reintento, exactamente lo que la
 * inmutabilidad de CLAUDE.md §5.4 prohíbe.
 */

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';

import type { ContentLanguage } from '@/lib/domain';
import { buildProposalEmailContent } from '@/lib/email/proposal-email';
import { CONTRACTING_BCC } from '@/lib/email/constants';
import { sendEmail } from '@/lib/email/resend-client';
import { createClient } from '@/lib/supabase/server';
import type { Json } from '@/lib/supabase/database.types.js';

export type RetrySendResult = { readonly ok: true } | { readonly ok: false; readonly error: string };

export async function retryProposalSend(proposalId: string): Promise<RetrySendResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) {
    return { ok: false, error: 'No autenticado' };
  }

  // Select en un único literal (no concatenado): postgrest-js necesita un
  // string literal para tipar el embed (lib/pricing-context.ts ya deja este
  // mismo aviso).
  const { data: proposal, error: proposalError } = await supabase
    .from('proposals')
    .select(
      'id, status, language, brief, public_token, parameter_set_id, accounts(legal_name), contacts(full_name, email), profiles(full_name), proposal_options(id)',
    )
    .eq('id', proposalId)
    .maybeSingle();

  if (proposalError) return { ok: false, error: proposalError.message };
  if (!proposal) return { ok: false, error: 'Presupuesto no encontrado' };
  if (proposal.status !== 'DRAFT') {
    return { ok: false, error: 'Este presupuesto ya no está pendiente de envío (ya se mandó o se descartó).' };
  }
  if (!proposal.accounts || !proposal.contacts || !proposal.profiles) {
    return { ok: false, error: 'Faltan datos de cuenta, contacto o comercial del presupuesto.' };
  }

  // offer_validity_days del juego de parámetros que estaba activo cuando se
  // creó ESTE presupuesto (proposals.parameter_set_id), no el que esté
  // activo ahora mismo — mark_proposal_sent hace la misma lectura por el
  // mismo motivo (join sobre parameter_set_id, no sobre is_active).
  const { data: paramSet, error: paramError } = await supabase
    .from('pricing_parameter_sets')
    .select('offer_validity_days')
    .eq('id', proposal.parameter_set_id)
    .maybeSingle();
  if (paramError) return { ok: false, error: paramError.message };
  if (!paramSet) return { ok: false, error: 'No se encontró el juego de parámetros de este presupuesto.' };

  const apiKey = process.env.RESEND_API_KEY;
  const fromAddress = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !fromAddress) {
    await supabase.rpc('log_proposal_send_failure', {
      p_proposal_id: proposalId,
      p_email: { error: 'Falta configuración de email (RESEND_API_KEY / RESEND_FROM_EMAIL)' } as unknown as Json,
    });
    return {
      ok: false,
      error: 'Falta la configuración de email (RESEND_API_KEY / RESEND_FROM_EMAIL). El presupuesto sigue en borrador.',
    };
  }

  const h = await headers();
  const proto = h.get('x-forwarded-proto') ?? 'https';
  const publicUrl = `${proto}://${h.get('host')}/p/${proposal.public_token}`;
  const expiresAtIso = new Date(Date.now() + paramSet.offer_validity_days * 86_400_000).toISOString();

  const { subject, html, text } = buildProposalEmailContent({
    advertiserName: proposal.accounts.legal_name,
    contactFullName: proposal.contacts.full_name,
    brief: proposal.brief,
    numberOfOptions: proposal.proposal_options.length,
    publicUrl,
    expiresAtIso,
    salesName: proposal.profiles.full_name,
    // El idioma del email es proposals.language, igual que en el envío
    // original (CLAUDE.md §5.6, ronda 2) — nunca contacts.language.
    language: proposal.language as ContentLanguage,
  });

  const recipients = {
    to: [proposal.contacts.email],
    cc: [user.email],
    bcc: [CONTRACTING_BCC],
    replyTo: user.email,
    from: fromAddress,
  };

  const sendResult = await sendEmail({ ...recipients, subject, html, text }, apiKey);

  if (!sendResult.ok) {
    await supabase.rpc('log_proposal_send_failure', {
      p_proposal_id: proposalId,
      p_email: { ...recipients, error: sendResult.error } as unknown as Json,
    });
    return { ok: false, error: `El envío no se pudo mandar por email (${sendResult.error}).` };
  }

  const { error: markError } = await supabase.rpc('mark_proposal_sent', {
    p_proposal_id: proposalId,
    p_email: { ...recipients, resendMessageId: sendResult.id } as unknown as Json,
  });
  if (markError) return { ok: false, error: markError.message };

  revalidatePath(`/proposals/${proposalId}`);
  revalidatePath('/proposals');
  return { ok: true };
}
