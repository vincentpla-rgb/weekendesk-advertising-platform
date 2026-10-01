import { notFound } from 'next/navigation';
import { headers } from 'next/headers';

import { createPublicClient } from '@/lib/supabase/server';
import type { ContentLanguage } from '@/lib/domain';
import { buildTransactionalEmailContent } from '@/lib/email/transactional-email';
import { sendEmail } from '@/lib/email/resend-client';
import { PublicProposalClient } from './PublicProposalClient';

export const dynamic = 'force-dynamic';

export interface PublicReach {
  value: number;
  metric: string;
  period_unit: string;
  source: string;
  measured_at: string;
}

export interface PublicLine {
  support_id: string;
  support_name: string;
  channel: string;
  unit: string;
  market: string;
  quantity: number;
  /** Precio de la línea (ronda 16): necesario para el formulario editable de "Proponer cambios". */
  billed_total_cents: number;
  reach: PublicReach | null;
}

export interface PublicOption {
  code: string;
  name: string;
  pitch: string | null;
  markets: string[];
  campaign_start: string | null;
  campaign_end: string | null;
  /** Modo "solo duración, sin fecha de inicio" (CLAUDE.md §5.3 bis). */
  campaign_duration_count: number | null;
  campaign_duration_unit: 'WEEK' | 'MONTH' | null;
  /**
   * Solo el presupuesto de medios que dio el cliente, informativo (nunca el
   * desglose real/fee — CLAUDE.md §4.4/§6, ronda 10). `get_public_proposal`
   * ya no manda `net_revenue_cents`: revelaría el fee de una línea de media
   * buy en una opción con una sola línea de ese tipo.
   */
  media_budget_cents: number;
  billed_total_cents: number;
  lines: PublicLine[];
}

export interface PublicProposal {
  brief: string | null;
  status: string;
  expired: boolean;
  advertiser: string | null;
  expires_at: string | null;
  language: string;
  options: PublicOption[] | null;
}

/**
 * Pantalla pública (CLAUDE.md §6). Sin índices (ver metadata), token largo
 * no adivinable en la URL. Todo el acceso pasa por get_public_proposal, una
 * función SECURITY DEFINER: nunca se leen tablas directamente desde aquí.
 */
export async function generateMetadata() {
  return { robots: { index: false, follow: false } };
}

export default async function PublicProposalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = createPublicClient();

  const { data, error } = await supabase.rpc('get_public_proposal', { token });
  if (error || !data) {
    notFound();
  }

  const proposal = data as unknown as PublicProposal;

  // Marca la primera apertura (SENT -> VIEWED). El seguimiento de apertura lo
  // captura la página, no el email (CLAUDE.md §2).
  if (proposal.status === 'SENT') {
    const { data: viewedData } = await supabase.rpc('mark_public_proposal_viewed', { token });
    // Email 14, "opened_am" (CLAUDE.md §9/§10.3, ronda 18, bloque 2): solo
    // se dispara la primera vez — `viewedData` es `null` en cualquier
    // apertura posterior (la función ya no encuentra la fila en SENT). Un
    // fallo al mandar este aviso nunca bloquea que el cliente vea la
    // página: se registra y ya.
    if (viewedData) {
      await sendOpenedAmEmail(viewedData as unknown as OpenedAmNotification);
    }
  }

  return <PublicProposalClient token={token} proposal={proposal} />;
}

interface OpenedAmNotification {
  readonly proposal_id: string;
  readonly proposal_number: string;
  readonly advertiser_name: string | null;
  readonly owner_email: string | null;
  readonly owner_full_name: string | null;
  readonly owner_language: string | null;
  readonly expires_at: string | null;
}

async function sendOpenedAmEmail(notification: OpenedAmNotification): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromAddress = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !fromAddress || !notification.owner_email || !notification.owner_full_name || !notification.advertiser_name) {
    return;
  }

  const h = await headers();
  const proto = h.get('x-forwarded-proto') ?? 'https';
  const origin = `${proto}://${h.get('host')}`;
  const amFirstName = notification.owner_full_name.trim().split(/\s+/)[0] ?? notification.owner_full_name;

  const { subject, html, text } = buildTransactionalEmailContent({
    key: 'opened_am',
    language: (notification.owner_language as ContentLanguage) ?? 'ES',
    amFirstName,
    clientCompany: notification.advertiser_name,
    proposalNumber: notification.proposal_number,
    validUntilIso: notification.expires_at,
    ctaUrl: `${origin}/proposals/${notification.proposal_id}`,
  });

  const result = await sendEmail({ from: fromAddress, to: [notification.owner_email], subject, html, text }, apiKey);
  if (!result.ok) {
    console.error(`[opened_am] no se pudo mandar el aviso: ${result.error}`);
  }
}
