import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { loadProposalPdfData } from '@/lib/pdf/proposal-pdf-loader';
import { renderProposalPdf, proposalPdfFileName } from '@/lib/pdf/render-proposal-pdf';

/**
 * Descarga manual del PDF del presupuesto (CLAUDE.md §1/§9, botón
 * "Descargar PDF" en `/proposals/[id]`) — siempre la variante INTERNA
 * (coste/margen): esta ruta exige la sesión del equipo, la misma pantalla
 * que ya muestra esos números libremente (CLAUDE.md §4.4/§6 solo restringe
 * de cara al CLIENTE). Con la sesión del propio usuario (no la clave de
 * servicio): RLS (`team_all`) ya decide el acceso exactamente igual que
 * `/proposals/[id]` — ningún miembro de equipo puede descargar lo que no
 * podría ya leer en esa pantalla, y nadie sin sesión puede descargar nada.
 *
 * `?disposition=inline` (ronda 23, botón "Vista previa del presupuesto" en
 * `/proposals/[id]`): mismo PDF, mismos datos, sin ninguna llamada ni
 * cálculo distinto — un único `<a target="_blank">` basta (sin el baile de
 * `window.open` + `fetch` + blob que sí hace falta en `ProposalBuilder.tsx`,
 * porque ahí el presupuesto todavía no existe y el POST necesita un cuerpo
 * con los datos ya calculados en el navegador). Por defecto (sin el
 * parámetro, o con cualquier otro valor) sigue siendo `attachment`, para no
 * cambiar el comportamiento de "Descargar PDF".
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const pdfData = await loadProposalPdfData(supabase, id);
  if (!pdfData) {
    return NextResponse.json({ error: 'Presupuesto no encontrado' }, { status: 404 });
  }

  const buffer = await renderProposalPdf(pdfData, 'internal');
  const disposition = new URL(request.url).searchParams.get('disposition') === 'inline' ? 'inline' : 'attachment';

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${disposition}; filename="${proposalPdfFileName(pdfData)}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
