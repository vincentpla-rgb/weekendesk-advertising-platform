import { notFound } from 'next/navigation';

import { formatCents, formatDate, formatPercent } from '@/lib/format';
import { createClient } from '@/lib/supabase/server';
import { FiscalStatusCard } from './FiscalStatusCard';

export const dynamic = 'force-dynamic';

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Borrador',
  SENT: 'Enviado',
  VIEWED: 'Visto',
  ACCEPTED: 'Aceptado',
  REJECTED: 'Rechazado',
  EXPIRED: 'Caducado',
};

/**
 * Ficha interna de un presupuesto. Existe sobre todo para que el régimen de
 * IVA `PENDING` (CLAUDE.md §7) sea visible en algún sitio y no se facture
 * sin resolverlo — no es (todavía) un listado ni un dashboard de
 * seguimiento (CLAUDE.md §10.1.2, fuera de esta pasada).
 */
export default async function ProposalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: proposal, error } = await supabase
    .from('proposals')
    .select(
      'id, status, language, brief, campaign_start, campaign_end, public_token, sent_at, expires_at, decided_at, accounts(legal_name, country_code)',
    )
    .eq('id', id)
    .maybeSingle();

  if (error || !proposal) {
    notFound();
  }

  const [{ data: options }, { data: acceptance }, { data: rejection }] = await Promise.all([
    supabase
      .from('proposal_options')
      .select('id, code, name, net_revenue_cents, media_budget_cents, billed_total_cents, margin_rate')
      .eq('proposal_id', id)
      .order('sort_order', { ascending: true }),
    supabase
      .from('acceptances')
      .select(
        'id, legal_name, vat_number, vat_regime_applied, purchase_order_reference, accepted_at, option_id',
      )
      .eq('proposal_id', id)
      .maybeSingle(),
    supabase.from('rejections').select('reason, rejected_at').eq('proposal_id', id).maybeSingle(),
  ]);

  const account = proposal.accounts as unknown as { legal_name: string; country_code: string } | null;

  return (
    <div className="wk-shell">
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ marginBottom: 4 }}>{account?.legal_name ?? '—'}</h1>
        <span className="wk-badge wk-badge-neutral">{STATUS_LABELS[proposal.status] ?? proposal.status}</span>
        {' · '}
        <a href={`/p/${proposal.public_token}`} target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>
          ver pantalla pública ↗
        </a>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="wk-card">
          <h3>Envío</h3>
          <table className="wk-table">
            <tbody>
              <tr>
                <td>Periodo de campaña</td>
                <td>
                  {proposal.campaign_start ? formatDate(proposal.campaign_start) : '—'}
                  {' – '}
                  {proposal.campaign_end ? formatDate(proposal.campaign_end) : '—'}
                </td>
              </tr>
              <tr>
                <td>Enviado</td>
                <td>{proposal.sent_at ? formatDate(proposal.sent_at) : '—'}</td>
              </tr>
              <tr>
                <td>Válido hasta</td>
                <td>{proposal.expires_at ? formatDate(proposal.expires_at) : '—'}</td>
              </tr>
              <tr>
                <td>Decidido</td>
                <td>{proposal.decided_at ? formatDate(proposal.decided_at) : '—'}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="wk-card">
          <h3>Opciones</h3>
          <table className="wk-table">
            <thead>
              <tr>
                <th>Opción</th>
                <th>Neto de medios</th>
                <th>Facturado</th>
                <th>Margen</th>
              </tr>
            </thead>
            <tbody>
              {(options ?? []).map((o) => (
                <tr key={o.id}>
                  <td>
                    {o.code} · {o.name}
                    {acceptance?.option_id === o.id && (
                      <span className="wk-badge wk-badge-success" style={{ marginLeft: 6 }}>
                        aceptada
                      </span>
                    )}
                  </td>
                  <td>{o.net_revenue_cents !== null ? formatCents(o.net_revenue_cents) : '—'}</td>
                  <td>{o.billed_total_cents !== null ? formatCents(o.billed_total_cents) : '—'}</td>
                  <td>{o.margin_rate !== null ? formatPercent(o.margin_rate) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {acceptance && (
        <div style={{ marginTop: 16 }}>
          <FiscalStatusCard
            proposalId={id}
            legalName={acceptance.legal_name}
            vatNumber={acceptance.vat_number}
            vatRegime={acceptance.vat_regime_applied}
            purchaseOrderReference={acceptance.purchase_order_reference}
            acceptedAt={acceptance.accepted_at}
          />
        </div>
      )}

      {rejection && (
        <div className="wk-card" style={{ marginTop: 16 }}>
          <h3>Rechazo</h3>
          <p style={{ margin: 0 }}>{rejection.reason || 'Sin motivo indicado.'}</p>
          <p style={{ fontSize: 12, color: 'var(--wk-text-muted)', marginTop: 6 }}>
            {formatDate(rejection.rejected_at)}
          </p>
        </div>
      )}
    </div>
  );
}
