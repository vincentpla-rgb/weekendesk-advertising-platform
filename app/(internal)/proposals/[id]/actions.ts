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
import { loadPricingContext } from '@/lib/pricing-context';
import { buildProposalOptionsPayload, type RawOption } from '@/lib/proposals/build-options-payload';
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
      'id, status, language, brief, public_token, parameter_set_id, proposal_number, accounts(legal_name), contacts(full_name, email), profiles(full_name), proposal_options(id)',
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
    proposalNumber: proposal.proposal_number,
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

/**
 * Duplicar un presupuesto (CLAUDE.md §10.3 octies, ronda 8): a partir de
 * cualquier presupuesto que ya salió de DRAFT (enviado, aceptado,
 * rechazado o caducado), crea un presupuesto NUEVO en DRAFT — mismas
 * opciones, líneas, mercados y fechas, pero:
 *   - sin ningún envío asociado (arranca en DRAFT, sin sent_at/decided_at);
 *   - sin enlace público propio todavía (se genera al enviar la copia, en
 *     create_and_send_proposal, igual que cualquier otro presupuesto nuevo);
 *   - con un `proposal_number` propio, nunca el del original;
 *   - RECALCULADO con los parámetros VIVOS (loadPricingContext siempre lee
 *     la base de datos, nunca cachea) — nunca una copia de los números
 *     congelados del original. Si la tarifa por hora cambió desde entonces,
 *     la copia lo refleja. Coherente con la inmutabilidad de §5.4: el
 *     original no se toca, la copia es un presupuesto nuevo de pleno derecho.
 *
 * Los datos de origen salen de `frozen_snapshot` — el mismo jsonb que
 * `create_and_send_proposal` guardó tal cual se le mandó (CLAUDE.md §10.1.1:
 * "el cálculo se congela en un solo paso, no se recalcula después"). Sus
 * opciones ya vienen con las líneas EXPANDIDAS por mercado (una fila por
 * soporte y mercado de la opción, CLAUDE.md §4.2): para reconstruir la
 * entrada cruda que espera `buildProposalOptionsPayload` (una fila por
 * SOPORTE, sin mercado — el motor expande según `option.markets`) basta con
 * quedarse con la fila del mercado líder de cada soporte (`is_lead_market`),
 * que existe exactamente una vez por soporte y lleva la cantidad y el
 * presupuesto de medios reales de la línea (CLAUDE.md §4.2: mismo
 * presupuesto de medios en cada mercado de la opción, así que da igual cuál
 * de los mercados se use como fuente).
 *
 * Los descuentos VOLUME no se copian: son automáticos y se recalculan solos
 * a partir de la base nueva (CLAUDE.md §4.5). Solo los MANUAL sobreviven a
 * la duplicación, con su motivo — igual que un comercial los introduciría a
 * mano de nuevo, pero sin tener que volver a escribirlos.
 */
export type DuplicateProposalResult =
  | { readonly ok: true; readonly newProposalId: string; readonly newProposalNumber: string }
  | { readonly ok: false; readonly error: string };

interface FrozenSnapshotLine {
  readonly support_id: string;
  readonly quantity: number;
  readonly media_budget_cents: number | null;
  readonly media_months: number | null;
  readonly is_lead_market: boolean;
  /** Reparto forzado a mano (CLAUDE.md §4.4, ronda 10): decisión de negocio, se traslada sin recalcular. */
  readonly manual_fee_cents: number | null;
  readonly manual_fee_reason: string | null;
}

interface FrozenSnapshotDiscount {
  readonly kind: 'VOLUME' | 'MANUAL';
  readonly rate: number;
  readonly reason: string | null;
}

interface FrozenSnapshotOption {
  readonly code: 'A' | 'B' | 'C';
  readonly name: string;
  readonly pitch: string | null;
  readonly markets: readonly string[];
  readonly campaign_start: string | null;
  readonly campaign_end: string | null;
  readonly campaign_duration_count: number | null;
  readonly campaign_duration_unit: 'WEEK' | 'MONTH' | null;
  readonly lines: readonly FrozenSnapshotLine[];
  readonly discounts: readonly FrozenSnapshotDiscount[];
  /** Interruptor "desactivar descuento por volumen" (CLAUDE.md §4.5, ronda 9). */
  readonly volume_discount_disabled: boolean;
}

export async function duplicateProposal(proposalId: string): Promise<DuplicateProposalResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: 'No autenticado' };
  }

  const { data: proposal, error: proposalError } = await supabase
    .from('proposals')
    .select('id, status, account_id, contact_id, language, brief, frozen_snapshot')
    .eq('id', proposalId)
    .maybeSingle();

  if (proposalError) return { ok: false, error: proposalError.message };
  if (!proposal) return { ok: false, error: 'Presupuesto no encontrado' };
  if (proposal.status === 'DRAFT') {
    return {
      ok: false,
      error: 'Solo se puede duplicar un presupuesto que ya se envió (no un borrador todavía pendiente).',
    };
  }

  const snapshot = proposal.frozen_snapshot as unknown as { options?: readonly FrozenSnapshotOption[] } | null;
  if (!snapshot || !Array.isArray(snapshot.options) || snapshot.options.length === 0) {
    return { ok: false, error: 'El presupuesto original no tiene datos de opciones que duplicar.' };
  }

  const rawOptions: RawOption[] = snapshot.options.map((opt) => ({
    code: opt.code,
    name: opt.name,
    pitch: opt.pitch ?? '',
    markets: opt.markets,
    campaignStart: opt.campaign_start,
    campaignEnd: opt.campaign_end,
    campaignDurationCount: opt.campaign_duration_count,
    campaignDurationUnit: opt.campaign_duration_unit,
    // Una fila por soporte, no por soporte+mercado: el motor vuelve a
    // expandir por `markets` él solo. La fila del mercado líder existe una
    // única vez por soporte y basta como fuente (ver comentario de arriba).
    lines: opt.lines
      .filter((l: FrozenSnapshotLine) => l.is_lead_market)
      .map((l: FrozenSnapshotLine) => ({
        supportId: l.support_id,
        quantity: l.quantity,
        mediaBudgetEuros: l.media_budget_cents ? l.media_budget_cents / 100 : null,
        mediaMonths: l.media_months,
        // El reparto forzado a mano es una decisión de negocio, no un
        // número derivado de parámetros vivos (CLAUDE.md §4.4, ronda 10):
        // se traslada tal cual, igual que el interruptor de descuento por
        // volumen y los descuentos manuales.
        manualFeeEuros: l.manual_fee_cents ? l.manual_fee_cents / 100 : null,
        manualFeeReason: l.manual_fee_reason,
      })),
    // Solo los descuentos MANUALES sobreviven; los de volumen (VOLUME) se
    // recalculan solos a partir de la base nueva (CLAUDE.md §4.5).
    discounts: opt.discounts
      .filter((d: FrozenSnapshotDiscount) => d.kind === 'MANUAL')
      .map((d: FrozenSnapshotDiscount) => ({ ratePercent: d.rate * 100, reason: d.reason ?? '' })),
    // El interruptor es una decisión de negocio sobre la opción, no un
    // número congelado: se traslada tal cual (CLAUDE.md §4.5, ronda 9).
    volumeDiscountDisabled: opt.volume_discount_disabled,
  }));

  let ctx;
  try {
    ctx = await loadPricingContext(supabase);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'No se pudieron cargar los parámetros' };
  }

  const built = buildProposalOptionsPayload(rawOptions, ctx);
  if (!built.ok) {
    return {
      ok: false,
      error: `No se pudo duplicar: con los parámetros actuales, ${built.error.toLowerCase()}`,
    };
  }

  const payload = {
    account_id: proposal.account_id,
    contact_id: proposal.contact_id,
    language: proposal.language,
    brief: proposal.brief,
    options: built.optionsJson,
  };

  const { data, error } = await supabase.rpc('create_and_send_proposal', {
    payload: payload as unknown as Json,
  });
  if (error) return { ok: false, error: error.message };

  const created = data as { proposal_id: string; proposal_number: string };

  revalidatePath('/proposals');
  revalidatePath(`/accounts/${proposal.account_id}`);

  return { ok: true, newProposalId: created.proposal_id, newProposalNumber: created.proposal_number };
}
