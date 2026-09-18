import { NextResponse } from 'next/server';

import { checkVies } from '@/lib/vies';
import { createPublicClient } from '@/lib/supabase/server';
import type { Json } from '@/lib/supabase/database.types.js';

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
 *
 * La aceptación nunca se bloquea por un fallo de VIES: es un compromiso
 * comercial, no depende de la disponibilidad de un servicio externo. Si VIES
 * no responde, el envío queda `ACCEPTED` igualmente y el régimen de IVA
 * queda `PENDING` — visible en la ficha interna del presupuesto
 * (`/proposals/[id]`), con un botón para reintentar la verificación.
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

  // Sin número de IVA no hay nada que verificar: se trata como INVALID, no
  // como UNAVAILABLE. La diferencia importa desde que UNAVAILABLE significa
  // "fallo técnico, reintentar" (régimen PENDING) — no proporcionar ningún
  // número no es un fallo técnico que reintentar, es una ausencia de base
  // para la autoliquidación, y resuelve igual de definitivo que un número
  // inválido: IVA francés 20 % (salvo que la cuenta ya sea francesa).
  const vies = body.vatNumber.trim()
    ? await checkVies(body.vatNumber)
    : { result: 'INVALID' as const, raw: { note: 'Sin número de IVA aportado' } };

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

  return NextResponse.json(data);
}
