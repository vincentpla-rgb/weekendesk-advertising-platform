import { NextResponse } from 'next/server';

import { createPublicClient } from '@/lib/supabase/server';

/**
 * Rechazo público (CLAUDE.md §5.4, §5.5). Registra el motivo; la
 * contrapropuesta es una acción interna posterior, no construida en este
 * MVP (ver README).
 */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  let body: { reason: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const supabase = createPublicClient();
  const { data, error } = await supabase.rpc('reject_public_proposal', {
    p_token: token,
    p_reason: body.reason,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data);
}
