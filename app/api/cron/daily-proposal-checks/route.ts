import { NextResponse } from 'next/server';

import { createServiceClient } from '@/lib/supabase/service';
import type { ContentLanguage } from '@/lib/domain';
import { buildTransactionalEmailContent } from '@/lib/email/transactional-email';
import { sendEmail } from '@/lib/email/resend-client';

/**
 * Cron diario (CLAUDE.md §9/§10.3, ronda 18, bloque 2, punto 7): los dos
 * únicos emails de este catálogo que no dependen de que pase algo en la
 * app — el recordatorio de caducidad al cliente (email 10) y el aviso de
 * caducidad al AM (email 11). Mecanismo confirmado por Vincent: Vercel
 * Cron, configurado en `vercel.json` (una llamada diaria a esta ruta).
 *
 * **Protegido con `CRON_SECRET`** (convención de Vercel Cron): cualquier
 * llamada sin `Authorization: Bearer <CRON_SECRET>` se rechaza — sin esto,
 * esta ruta sería un endpoint público capaz de mandar emails a cualquier
 * cliente con un presupuesto a punto de caducar.
 *
 * **Caducidad, hallazgo real al implementar este bloque**: el enum
 * `proposal_status` incluye `EXPIRED` desde el primer día (y los filtros de
 * `/proposals` y `/dashboard` ya lo ofrecen como opción), pero NINGÚN flujo
 * de la aplicación lo escribía todavía — `get_public_proposal` solo lo
 * CALCULA al vuelo (`expired: expires_at <= now()`) para dejar de enseñar
 * precios, sin tocar la columna `status`. Esta ruta es la primera vez que
 * algo transiciona de verdad `SENT`/`VIEWED` a `EXPIRED` — cumple lo que el
 * enum y los filtros ya daban por hecho, no inventa un estado nuevo.
 *
 * **Deduplicación del recordatorio, sin columna nueva**: se reutiliza
 * `proposal_events` (ya existe desde el esquema inicial, con `event_type`
 * de texto libre) con un evento `'reminder_sent'` — la misma tabla que ya
 * registra 'viewed'/'accepted'/'rejected'. Una fila ahí para un
 * `proposal_id` significa "ya se avisó", así que no hace falta una columna
 * nueva en `proposals` ni ninguna migración para este bloque.
 */

// "p. ej. el día 10 de 14" — el propio ejemplo de `docs/emails/email-copy.json`
// (nota META del email 10) para una validez de 14 días: 4 días antes de
// caducar. Constante nombrada, no un número mágico (CLAUDE.md §8).
const REMINDER_DAYS_BEFORE_EXPIRY = 4;
const REMINDER_EVENT_TYPE = 'reminder_sent';

interface CandidateProposal {
  readonly id: string;
  readonly proposal_number: string;
  readonly public_token: string;
  readonly language: string;
  readonly expires_at: string;
  readonly accounts: { readonly legal_name: string } | null;
  readonly contacts: { readonly full_name: string; readonly email: string } | null;
  readonly profiles: { readonly full_name: string; readonly email: string; readonly preferred_language: string } | null;
}

export async function GET(request: Request): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const supabase = createServiceClient();
  const apiKey = process.env.RESEND_API_KEY;
  const fromAddress = process.env.RESEND_FROM_EMAIL;
  const origin = new URL(request.url).origin;

  const result = { remindersSent: 0, remindersFailed: 0, expired: 0, expiredNoticesFailed: 0 };
  const canSendEmail = Boolean(apiKey && fromAddress);
  if (!canSendEmail) {
    console.info(
      '[cron] RESEND_API_KEY/RESEND_FROM_EMAIL no configuradas — la transición a EXPIRED se hace igual, solo se omiten los emails.',
    );
  }

  // ── Recordatorio al cliente (email 10) ────────────────────────────────
  const reminderDeadline = new Date(Date.now() + REMINDER_DAYS_BEFORE_EXPIRY * 86_400_000).toISOString();
  const { data: reminderCandidates } = await supabase
    .from('proposals')
    .select(
      'id, proposal_number, public_token, language, expires_at, accounts(legal_name), contacts(full_name, email), profiles(full_name, email, preferred_language)',
    )
    .in('status', ['SENT', 'VIEWED'])
    .not('expires_at', 'is', null)
    .lte('expires_at', reminderDeadline)
    .gt('expires_at', new Date().toISOString());

  const candidates = (reminderCandidates ?? []) as unknown as CandidateProposal[];
  if (canSendEmail && candidates.length > 0) {
    const { data: alreadyReminded } = await supabase
      .from('proposal_events')
      .select('proposal_id')
      .eq('event_type', REMINDER_EVENT_TYPE)
      .in('proposal_id', candidates.map((p) => p.id));
    const remindedIds = new Set((alreadyReminded ?? []).map((e) => e.proposal_id));

    for (const proposal of candidates) {
      if (remindedIds.has(proposal.id)) continue;
      if (!proposal.contacts || !proposal.accounts || !proposal.profiles) continue;

      const contactFirstName = proposal.contacts.full_name.trim().split(/\s+/)[0] ?? proposal.contacts.full_name;
      const { subject, html, text } = buildTransactionalEmailContent({
        key: 'reminder',
        language: proposal.language as ContentLanguage,
        contactFirstName,
        clientCompany: proposal.accounts.legal_name,
        proposalNumber: proposal.proposal_number,
        validUntilIso: proposal.expires_at,
        creatorName: proposal.profiles.full_name,
        ctaUrl: `${origin}/p/${proposal.public_token}`,
      });
      const sendResult = await sendEmail({ from: fromAddress!, to: [proposal.contacts.email], subject, html, text }, apiKey!);
      if (sendResult.ok) {
        await supabase.from('proposal_events').insert({ proposal_id: proposal.id, event_type: REMINDER_EVENT_TYPE });
        result.remindersSent += 1;
      } else {
        result.remindersFailed += 1;
        console.error(`[cron] recordatorio (email 10) de ${proposal.proposal_number} no se pudo mandar: ${sendResult.error}`);
      }
    }
  }

  // ── Caducidad: transición real a EXPIRED + aviso al AM (email 11) ──────
  // Esto corre siempre, tenga o no Resend configurado: es un cambio de
  // estado real (CLAUDE.md §5.5), no una notificación — mismo principio ya
  // aplicado a `create_and_send_proposal` (ronda 4): lo que falte de email
  // nunca debe impedir que lo demás se persista.
  const { data: expiredCandidates } = await supabase
    .from('proposals')
    .select('id, proposal_number, expires_at, accounts(legal_name), profiles(full_name, email, preferred_language)')
    .in('status', ['SENT', 'VIEWED'])
    .not('expires_at', 'is', null)
    .lte('expires_at', new Date().toISOString());

  for (const proposal of (expiredCandidates ?? []) as unknown as Omit<CandidateProposal, 'public_token' | 'language' | 'contacts'>[]) {
    const { error: updateError } = await supabase
      .from('proposals')
      .update({ status: 'EXPIRED' })
      .eq('id', proposal.id)
      .in('status', ['SENT', 'VIEWED']);
    if (updateError) {
      console.error(`[cron] no se pudo marcar EXPIRED ${proposal.proposal_number}: ${updateError.message}`);
      continue;
    }
    await supabase.from('proposal_events').insert({ proposal_id: proposal.id, event_type: 'expired' });
    result.expired += 1;

    if (!canSendEmail || !proposal.profiles || !proposal.accounts) continue;
    const amFirstName = proposal.profiles.full_name.trim().split(/\s+/)[0] ?? proposal.profiles.full_name;
    const { subject, html, text } = buildTransactionalEmailContent({
      key: 'expired_am',
      language: (proposal.profiles.preferred_language as ContentLanguage) ?? 'ES',
      amFirstName,
      clientCompany: proposal.accounts.legal_name,
      proposalNumber: proposal.proposal_number,
      validUntilIso: proposal.expires_at,
      ctaUrl: `${origin}/proposals/${proposal.id}`,
    });
    const sendResult = await sendEmail({ from: fromAddress!, to: [proposal.profiles.email], subject, html, text }, apiKey!);
    if (!sendResult.ok) {
      result.expiredNoticesFailed += 1;
      console.error(`[cron] aviso de caducidad (email 11) de ${proposal.proposal_number} no se pudo mandar: ${sendResult.error}`);
    }
  }

  return NextResponse.json(result);
}
