import { notFound } from 'next/navigation';

import { createPublicClient } from '@/lib/supabase/server';
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
  net_revenue_cents: number;
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
    await supabase.rpc('mark_public_proposal_viewed', { token });
  }

  return <PublicProposalClient token={token} proposal={proposal} />;
}
