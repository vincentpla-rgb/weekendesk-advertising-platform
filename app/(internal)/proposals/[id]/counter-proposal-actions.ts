'use server';

/**
 * Revisión interna de una contrapropuesta (CLAUDE.md, ronda 16, bloque 3):
 * el AM decide Aceptar o Rechazar. La comprobación de quién puede decidir
 * (el propietario del presupuesto original o un administrador) vive en las
 * funciones SQL (`accept_counter_proposal`/`reject_counter_proposal`,
 * `is_admin_or_proposal_owner`) — aquí solo se llama al RPC y, si rechaza,
 * se manda el email nuevo (CLAUDE.md, ronda 16, bloque 4). Ninguna de las
 * dos funciones recalcula ningún precio: los números de la línea que
 * sobrevive son los que tecleó el cliente, tal cual (CLAUDE.md §8).
 */

import { revalidatePath } from 'next/cache';

import type { ContentLanguage } from '@/lib/domain';
import { buildCounterProposalRejectionEmailContent } from '@/lib/email/counter-proposal-rejection-email';
import { buildCounterProposalAcceptedClientEmailContent } from '@/lib/email/counter-proposal-accepted-client-email';
import { CONTRACTING_BCC } from '@/lib/email/constants';
import { sendEmail } from '@/lib/email/resend-client';
import { createClient } from '@/lib/supabase/server';
import type { Json } from '@/lib/supabase/database.types.js';
import { translateText } from '@/lib/ai/translate-text';

export interface MarginOverrideInput {
  readonly supportId: string;
  readonly market: string;
  readonly reason: string;
}

export type AcceptCounterProposalResult =
  | { readonly ok: true; readonly newProposalId: string; readonly emailWarning?: string }
  | { readonly ok: false; readonly error: string };

/**
 * Aceptar (CLAUDE.md, ronda 16, bloque 3, punto 7): crea un presupuesto
 * nuevo, directamente ACCEPTED (`version`+1, `supersedes_id` al original),
 * con las líneas no eliminadas de la contrapropuesta. El margen por debajo
 * del suelo del 50% nunca bloquea aquí — si el AM lo fuerza, viaja en
 * `marginOverrides` y `accept_counter_proposal` lo registra en `overrides`
 * (kind `MARGIN_BELOW_FLOOR`) con autor y marca de tiempo.
 */
export async function acceptCounterProposal(
  proposalId: string,
  counterProposalId: string,
  marginOverrides: readonly MarginOverrideInput[],
): Promise<AcceptCounterProposalResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: 'No autenticado' };
  }

  const { data, error } = await supabase.rpc('accept_counter_proposal', {
    p_counter_proposal_id: counterProposalId,
    p_margin_overrides: marginOverrides.map((o) => ({
      support_id: o.supportId,
      market: o.market,
      reason: o.reason,
    })) as unknown as Json,
  });
  if (error) return { ok: false, error: error.message };

  const result = data as { new_proposal_id: string; acceptance_id: string };

  revalidatePath(`/proposals/${proposalId}`);
  revalidatePath(`/proposals/${result.new_proposal_id}`);
  revalidatePath('/proposals');

  // Email 6 (CLAUDE.md, ronda 17, bloque 1, punto 2): confirma al cliente
  // que su contrapropuesta fue aceptada — mismo patrón que el email de
  // rechazo más abajo, pero un fallo aquí nunca puede convertir un accept ya
  // persistido en un `ok: false` (el nuevo presupuesto ACCEPTED ya existe,
  // igual que `rejectCounterProposal` trata un fallo de email después de
  // `decided: true`): se devuelve `ok: true` con un `emailWarning` legible
  // para que la interfaz lo muestre sin fingir que todo salió perfecto.
  const emailWarning = await sendCounterProposalAcceptedEmail(supabase, result.new_proposal_id);

  return { ok: true, newProposalId: result.new_proposal_id, emailWarning };
}

async function sendCounterProposalAcceptedEmail(
  supabase: Awaited<ReturnType<typeof createClient>>,
  newProposalId: string,
): Promise<string | undefined> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromAddress = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !fromAddress) {
    return 'Falta la configuración de email (RESEND_API_KEY / RESEND_FROM_EMAIL): el cliente no ha recibido la confirmación de aceptación.';
  }

  const { data: proposal, error } = await supabase
    .from('proposals')
    .select('language, proposal_number, contacts(full_name, email)')
    .eq('id', newProposalId)
    .maybeSingle();
  if (error || !proposal || !proposal.contacts) {
    return 'No se pudo cargar el presupuesto nuevo para mandar la confirmación de aceptación al cliente.';
  }

  const { subject, html, text } = buildCounterProposalAcceptedClientEmailContent({
    contactFullName: proposal.contacts.full_name,
    proposalNumber: proposal.proposal_number,
    language: proposal.language as ContentLanguage,
  });

  const sendResult = await sendEmail(
    { to: [proposal.contacts.email], bcc: [CONTRACTING_BCC], from: fromAddress, subject, html, text },
    apiKey,
  );

  return sendResult.ok ? undefined : `La confirmación de aceptación no se pudo mandar al cliente (${sendResult.error}).`;
}

export type RejectCounterProposalResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: string; readonly decided: boolean };

/**
 * Rechazar (CLAUDE.md, ronda 16, bloque 3, punto 7 y bloque 4): motivo
 * obligatorio, distinto del que ya escribió el cliente al rechazar el
 * presupuesto original — `reject_counter_proposal` (SQL) valida esto y
 * marca `counter_proposals.status = 'REJECTED'` + el presupuesto original
 * en `REJECTED`. El email al cliente se manda DESPUÉS, desde aquí (igual
 * que el resto del proyecto nunca llama a Resend desde SQL) — si falla, la
 * decisión en base de datos YA se tomó (`decided: true`): no tiene sentido
 * ni es posible reintentar el RPC (ya no está en PENDING), así que la
 * interfaz debe reflejar el estado terminal aunque el email no saliera.
 */
export async function rejectCounterProposal(
  proposalId: string,
  counterProposalId: string,
  reason: string,
): Promise<RejectCounterProposalResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) {
    return { ok: false, error: 'No autenticado', decided: false };
  }

  const { error: rpcError } = await supabase.rpc('reject_counter_proposal', {
    p_counter_proposal_id: counterProposalId,
    p_reason: reason,
  });
  if (rpcError) return { ok: false, error: rpcError.message, decided: false };

  revalidatePath(`/proposals/${proposalId}`);
  revalidatePath('/proposals');

  const { data: proposal, error: proposalError } = await supabase
    .from('proposals')
    .select('language, proposal_number, accounts(legal_name), contacts(full_name, email)')
    .eq('id', proposalId)
    .maybeSingle();
  if (proposalError || !proposal || !proposal.accounts || !proposal.contacts) {
    return {
      ok: false,
      error: 'La contrapropuesta se rechazó correctamente, pero no se pudo cargar el presupuesto para mandar el email al cliente.',
      decided: true,
    };
  }

  const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle();
  const salesName = profile?.full_name ?? user.email;

  const apiKey = process.env.RESEND_API_KEY;
  const fromAddress = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !fromAddress) {
    return {
      ok: false,
      error:
        'La contrapropuesta se rechazó correctamente, pero falta la configuración de email (RESEND_API_KEY / RESEND_FROM_EMAIL): el cliente no ha recibido el email de rechazo.',
      decided: true,
    };
  }

  // Traducción automática del motivo (CLAUDE.md, ronda 17, bloque 1, punto
  // 4): el AM lo escribe en su propio idioma, pero el cliente debe recibirlo
  // en el idioma de SU presupuesto — `translateText` nunca lanza y cae al
  // texto original ante cualquier fallo (sin clave configurada, la API no
  // responde, etc.), así que esto nunca puede bloquear el envío del email.
  // Deliberadamente distinto de la vista previa (`EmailPreviewModal` más
  // abajo, vía `buildCounterProposalRejectionEmailContent` directamente):
  // esa vista previa sigue mostrando el motivo TAL CUAL se escribió — es lo
  // que el AM está a punto de enviar, no necesita una llamada de red para
  // renderizarse. Solo en el envío real, aquí, se traduce.
  const translatedReason = await translateText({ text: reason, targetLanguage: proposal.language as ContentLanguage });

  const { subject, html, text } = buildCounterProposalRejectionEmailContent({
    advertiserName: proposal.accounts.legal_name,
    contactFullName: proposal.contacts.full_name,
    proposalNumber: proposal.proposal_number,
    reason: translatedReason,
    salesName,
    language: proposal.language as ContentLanguage,
  });

  const sendResult = await sendEmail(
    {
      to: [proposal.contacts.email],
      cc: [user.email],
      bcc: [CONTRACTING_BCC],
      replyTo: user.email,
      from: fromAddress,
      subject,
      html,
      text,
    },
    apiKey,
  );

  if (!sendResult.ok) {
    return {
      ok: false,
      error: `La contrapropuesta se rechazó correctamente, pero el email no se pudo mandar (${sendResult.error}).`,
      decided: true,
    };
  }

  return { ok: true };
}
