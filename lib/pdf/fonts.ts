import { join } from 'node:path';

import { Font } from '@react-pdf/renderer';

/**
 * Generación de PDF del presupuesto (CLAUDE.md §1/§9, propuesta confirmada
 * por Vincent): `@react-pdf/renderer`, sin headless browser ni servicio
 * externo nuevo — JS puro, ya aprobado antes de escribir código.
 *
 * Fuentes de marca (CLAUDE.md §2: Host Grotesk + Inter) registradas desde
 * ficheros locales (`assets/fonts/`, bajados una vez de Google Fonts, los
 * mismos pesos que ya carga `app/globals.css` vía `@import`) — nunca por
 * URL en tiempo de render: evita una llamada de red durante la generación
 * del PDF dentro de una función serverless, y evita depender de que el
 * esquema de `outputFileTracingIncludes` de Next.js funcione con una URL
 * remota. `Font.register` acepta una ruta de fichero local tal cual
 * (`fontkit.open`, sin red) — comprobado leyendo el propio paquete
 * `@react-pdf/font` antes de escribir esto, no asumido.
 */

const FONTS_DIR = join(process.cwd(), 'assets', 'fonts');

let registered = false;

export function registerPdfFonts(): void {
  if (registered) return;
  registered = true;

  Font.register({
    family: 'Host Grotesk',
    fonts: [
      { src: join(FONTS_DIR, 'HostGrotesk-Medium.ttf'), fontWeight: 500 },
      { src: join(FONTS_DIR, 'HostGrotesk-SemiBold.ttf'), fontWeight: 600 },
      { src: join(FONTS_DIR, 'HostGrotesk-Bold.ttf'), fontWeight: 700 },
    ],
  });

  Font.register({
    family: 'Inter',
    fonts: [
      { src: join(FONTS_DIR, 'Inter-Regular.ttf'), fontWeight: 400 },
      { src: join(FONTS_DIR, 'Inter-Medium.ttf'), fontWeight: 500 },
      { src: join(FONTS_DIR, 'Inter-SemiBold.ttf'), fontWeight: 600 },
      { src: join(FONTS_DIR, 'Inter-Bold.ttf'), fontWeight: 700 },
    ],
  });

  // Sin esto, @react-pdf/renderer parte las palabras largas con guiones
  // (hyphenation en inglés) — con razones sociales y nombres de soporte en
  // varios idiomas, el resultado es ruidoso o directamente incorrecto.
  // Desactivado globalmente, como recomienda la propia librería para texto
  // no inglés.
  Font.registerHyphenationCallback((word) => [word]);
}
