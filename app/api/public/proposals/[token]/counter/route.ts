import { NextResponse } from 'next/server';

import { checkVies } from '@/lib/vies';
import { createPublicClient } from '@/lib/supabase/server';
import type { Json } from '@/lib/supabase/database.types.js';

interface CounterProposalLineBody {
  supportId: string;
  market: string;
  originalPriceCents: number;
  originalQuantity: number;
  clientPriceCents: number;
  clientQuantity: number;
  deleted: boolean;
}

interface CounterProposalBody {
  optionCode: string;
  lines: CounterProposalLineBody[];
  campaignStart: string | null;
  campaignEnd: string | null;
  campaignDurationCount: number | null;
  campaignDurationUnit: string | null;
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
 * Contrapropuesta editable del cliente (CLAUDE.md, ronda 16, bloque 2):
 * segunda vía del flujo de rechazo, por opción. Igual que el accept,
 * verifica VIES aquí (salida de red) y persiste con `submit_counter_proposal`
 * — esa función SQL solo valida que ningún soporte sea ajeno a la opción
 * enviada y congela la contrapropuesta; el motor de precios nunca se toca.
 */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  let body: CounterProposalBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const requiredFiscal: (keyof CounterProposalBody)[] = [
    'legalName',
    'billingAddress',
    'billingContactName',
    'billingContactEmail',
    'signerName',
    'signerRole',
  ];
  for (const key of requiredFiscal) {
    const value = body[key];
    if (typeof value !== 'string' || value.trim() === '') {
      return NextResponse.json({ error: `Falta el campo ${key}` }, { status: 400 });
    }
  }
  if (!body.optionCode || !Array.isArray(body.lines) || body.lines.length === 0) {
    return NextResponse.json({ error: 'Faltan las líneas de la contrapropuesta' }, { status: 400 });
  }

  const vies = body.vatNumber?.trim()
    ? await checkVies(body.vatNumber)
    : { result: 'UNAVAILABLE' as const, raw: { note: 'Sin número de IVA aportado' } };

  const lines = body.lines.map((line) => ({
    support_id: line.supportId,
    market: line.market,
    deleted: line.deleted,
    original_price_cents: line.originalPriceCents,
    original_quantity: line.originalQuantity,
    client_price_cents: line.deleted ? 0 : line.clientPriceCents,
    client_quantity: line.deleted ? 0 : line.clientQuantity,
  }));

  const supabase = createPublicClient();
  const { data, error } = await supabase.rpc('submit_counter_proposal', {
    p_token: token,
    p_option_code: body.optionCode,
    p_lines: lines as unknown as Json,
    p_campaign_start: body.campaignStart,
    p_campaign_end: body.campaignEnd,
    p_campaign_duration_count: body.campaignDurationCount,
    p_campaign_duration_unit: body.campaignDurationUnit,
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

  return NextResponse.json(data);
}
