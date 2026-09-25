import { NextResponse } from 'next/server';

import { loadPricingContext } from '@/lib/pricing-context';
import { createClient } from '@/lib/supabase/server';
import type { Json } from '@/lib/supabase/database.types.js';
import type { ContentLanguage } from '@/lib/domain';
import { buildProposalEmailContent } from '@/lib/email/proposal-email';
import { CONTRACTING_BCC } from '@/lib/email/constants';
import { sendEmail } from '@/lib/email/resend-client';
import { buildProposalOptionsPayload, type RawOption } from '@/lib/proposals/build-options-payload';

interface RawBody {
  accountId: string | null;
  newAccount: { legal_name: string; country_code: string } | null;
  contactId: string | null;
  newContact: { full_name: string; email: string; language: string } | null;
  language: string;
  brief: string;
  options: RawOption[];
  /**
   * Modo "Editar" (CLAUDE.md §5.4, §10.3 ter decies, ronda 13): el DRAFT que
   * este envío sustituye, si lo hay — nunca uno que ya salió de DRAFT
   * (bloqueado desde el primer envío EXITOSO, no antes). Se borra DESPUÉS de
   * crear el reemplazo con éxito, nunca antes: si la creación fallara (p.
   * ej. un conflicto de disponibilidad nuevo), el borrador original no debe
   * perderse.
   */
  replacesDraftId?: string | null;
}

/**
 * Crea y envía un presupuesto. El motor puro (src/pricing) recalcula aquí,
 * en el servidor, a partir de los datos crudos que manda el navegador — los
 * números que ya venían calculados en el cliente son solo una vista previa y
 * NUNCA se confían. La persistencia atómica la hace create_and_send_proposal
 * (SECURITY INVOKER: exige ser miembro de equipo vía RLS).
 */
export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }
  const ownerEmail = user.email;

  let body: RawBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  // CLAUDE.md §5.1, ronda 13: 1 a 3 opciones (antes 2-3 — exigir un mínimo
  // de 2 era una validación de más, no una limitación real del modelo).
  if (!Array.isArray(body.options) || body.options.length < 1 || body.options.length > 3) {
    return NextResponse.json({ error: 'Un envío necesita entre 1 y 3 opciones' }, { status: 400 });
  }

  let ctx;
  try {
    ctx = await loadPricingContext(supabase);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'No se pudieron cargar los parámetros' },
      { status: 500 },
    );
  }

  const built = buildProposalOptionsPayload(body.options as readonly RawOption[], ctx);
  if (!built.ok) {
    return NextResponse.json({ error: built.error }, { status: 400 });
  }

  const payload = {
    ...(body.accountId ? { account_id: body.accountId } : { account: body.newAccount }),
    ...(body.contactId ? { contact_id: body.contactId } : { contact: body.newContact }),
    language: body.language,
    brief: body.brief,
    options: built.optionsJson,
  };

  // Crea el envío en DRAFT (congelado, con enlace público ya generado, pero
  // todavía invisible: get_public_proposal descarta DRAFT). Solo se marca
  // SENT más abajo, si Resend confirma el email — así, si el email falla, el
  // presupuesto no queda marcado como enviado (ver la migración
  // 20260919100000_email_send.sql).
  //
  // Esto pasa ANTES de comprobar la configuración de Resend, a propósito
  // (CLAUDE.md §10.3, ronda 4): la cuenta, el contacto y el cálculo no
  // dependen de que el email pueda salir — persistirlos es una cosa,
  // mandarlos por correo es otra. Antes esta ruta comprobaba
  // RESEND_API_KEY/RESEND_FROM_EMAIL primero y abortaba sin llamar aquí si
  // faltaban: sin esas variables en Vercel, NINGÚN presupuesto se llegaba a
  // crear nunca — ni la cuenta ni el contacto, aunque el comercial hubiera
  // rellenado el formulario bien. Verificado que create_and_send_proposal en
  // sí siempre ha funcionado (contra un PostgreSQL 16 real, varias rondas);
  // el bug estaba en que esta ruta no la llegaba a llamar.
  const { data, error } = await supabase.rpc('create_and_send_proposal', {
    payload: payload as unknown as Json,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const fromAddress = process.env.RESEND_FROM_EMAIL;

  const created = data as {
    proposal_id: string;
    proposal_number: string;
    public_token: string;
    contact_email: string;
    contact_full_name: string;
    account_legal_name: string;
  };

  // Modo "Editar" (CLAUDE.md §5.4, §10.3 ter decies, ronda 13): el
  // reemplazo YA se creó con éxito arriba — ahora se descarta el borrador
  // original. `.eq('status', 'DRAFT')` es una guarda defensiva, no la
  // autoridad: si alguien lo hubiera mandado con éxito mientras tanto, esta
  // llamada no borra nada (0 filas), y el fallo se ignora — el presupuesto
  // nuevo ya existe, que es lo que de verdad importa; un borrador huérfano
  // que se quede atrás no es un error que deba tumbar la respuesta.
  if (body.replacesDraftId) {
    await supabase.from('proposals').delete().eq('id', body.replacesDraftId).eq('status', 'DRAFT');
  }

  // Falta configuración de Resend: se trata igual que un envío de email
  // fallido (log_proposal_send_failure, el presupuesto se queda en DRAFT) —
  // nunca como un motivo para no haber persistido nada, que es lo que hacía
  // antes de moverse este chequeo (ver el comentario más arriba).
  if (!apiKey || !fromAddress) {
    await supabase.rpc('log_proposal_send_failure', {
      p_proposal_id: created.proposal_id,
      p_email: { error: 'Falta configuración de email (RESEND_API_KEY / RESEND_FROM_EMAIL)' } as unknown as Json,
    });
    return NextResponse.json(
      {
        error:
          'El presupuesto se ha calculado y guardado, pero falta la configuración de email ' +
          '(RESEND_API_KEY / RESEND_FROM_EMAIL) para mandarlo. El envío queda en borrador, sin ' +
          'marcar como enviado.',
      },
      { status: 500 },
    );
  }

  const publicUrl = `${new URL(request.url).origin}/p/${created.public_token}`;
  const expiresAtIso = new Date(Date.now() + ctx.offerValidityDays * 86_400_000).toISOString();

  const { data: ownerProfile, error: ownerProfileError } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single();
  if (ownerProfileError) {
    return NextResponse.json({ error: ownerProfileError.message }, { status: 500 });
  }

  const { subject, html, text } = buildProposalEmailContent({
    advertiserName: created.account_legal_name,
    contactFullName: created.contact_full_name,
    brief: body.brief || null,
    numberOfOptions: body.options.length,
    publicUrl,
    expiresAtIso,
    salesName: ownerProfile.full_name,
    proposalNumber: created.proposal_number,
    // El idioma del EMAIL es el mismo que el de la pantalla pública: el que
    // el comercial elige para ESTE envío en "Idioma del cliente"
    // (CLAUDE.md §5.6, ronda 2), no `contacts.language` — ese es un dato
    // persistente del contacto que puede venir de un envío anterior en otro
    // idioma y desincronizarse de lo elegido aquí.
    language: body.language as ContentLanguage,
  });

  const recipients = {
    to: [created.contact_email],
    cc: [ownerEmail],
    bcc: [CONTRACTING_BCC],
    replyTo: ownerEmail,
    from: fromAddress,
  };

  const sendResult = await sendEmail(
    { ...recipients, subject, html, text },
    apiKey,
  );

  if (!sendResult.ok) {
    await supabase.rpc('log_proposal_send_failure', {
      p_proposal_id: created.proposal_id,
      p_email: { ...recipients, error: sendResult.error } as unknown as Json,
    });
    return NextResponse.json(
      {
        error: `El envío no se pudo mandar por email (${sendResult.error}). El presupuesto no queda marcado como enviado.`,
      },
      { status: 502 },
    );
  }

  const { error: markError } = await supabase.rpc('mark_proposal_sent', {
    p_proposal_id: created.proposal_id,
    p_email: { ...recipients, resendMessageId: sendResult.id } as unknown as Json,
  });
  if (markError) {
    return NextResponse.json({ error: markError.message }, { status: 500 });
  }

  return NextResponse.json({
    proposalId: created.proposal_id,
    proposalNumber: created.proposal_number,
    publicToken: created.public_token,
  });
}
