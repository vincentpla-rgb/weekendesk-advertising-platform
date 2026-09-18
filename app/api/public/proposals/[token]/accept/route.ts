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

  // Sin número de IVA no hay nada que verificar: se trata como sin dato, no
  // como inválido (un organismo público puede no tener uno y aun así ser
  // francés, con IVA francés directo).
  const vies = body.vatNumber.trim()
    ? await checkVies(body.vatNumber)
    : { result: 'UNAVAILABLE' as const, raw: { note: 'Sin número de IVA aportado' } };

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
