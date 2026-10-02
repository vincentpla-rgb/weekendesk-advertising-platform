/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    // Sin ESLint configurado en el MVP: no bloquear el build por su ausencia.
    ignoreDuringBuilds: true,
  },
  // Generación de PDF del presupuesto (CLAUDE.md §1/§9, `lib/pdf/`): las
  // fuentes (`assets/fonts/`) y el logo (`assets/images/`) se leen del
  // sistema de ficheros en tiempo de ejecución (`fs`/fontkit, nunca por
  // URL) — Next.js solo incluye en el bundle de una función serverless lo
  // que su análisis estático de imports detecta, y una ruta construida con
  // `path.join(process.cwd(), ...)` no se detecta así. Se declara explícito
  // para las dos rutas que generan el PDF, en vez de confiar en que el
  // tracer lo adivine.
  //
  // Bug real, ronda 21: la primera versión de estas claves (con el prefijo
  // `app/` Y el sufijo `/route` tal cual aparece el nombre del módulo) NUNCA
  // hacía match — causa raíz probable del 500 en producción al descargar el
  // PDF (sin esto, `assets/fonts/*.ttf`/el logo no entran en el bundle de la
  // función serverless, y `fontkit.open()` falla con ENOENT; en local
  // funciona porque el dev server lee el disco real, sin pasar por el
  // tracer). Confirmado leyendo `collect-build-traces.js`: la clave se
  // compara, con `picomatch(..., { contains: true })`, contra la ruta ya
  // NORMALIZADA (`normalizeAppPath`), que quita el segmento final `route` —
  // una clave que todavía lo lleva nunca coincide. Verificado de forma
  // reproducible con el picomatch real instalado en este repo
  // (`node -e "require('next/dist/compiled/picomatch')..."`): la clave con
  // `/route` da `false`; sin él, `true`. Corregido quitando el sufijo.
  //
  // Bug real #2, ronda 22 (CLAUDE.md §10.3, el 500 seguía tras el arreglo de
  // arriba — confirmado con el Runtime Log real de Vercel, no por análisis
  // estático): `@react-pdf/renderer` usa `pdfkit` por dentro, y `pdfkit`
  // resuelve sus 14 fuentes base (Helvetica, Times, Courier…) con un
  // subpath import de Node (`#standard-fonts/<Nombre>`, definido en el
  // `imports` del propio `package.json` de pdfkit) hacia ficheros reales en
  // `pdfkit/js/standard-fonts/` — `@react-pdf/font` abre SIEMPRE una de
  // estas fuentes base como referencia interna, aunque el documento solo use
  // las fuentes de marca registradas (Host Grotesk/Inter). El tracer de
  // Next.js (`@vercel/nft`) no sigue esa resolución de subpath import —
  // verificado inspeccionando el manifiesto real de rastreo
  // (`.next/server/app/.../route.js.nft.json`) de las tres rutas que
  // generan PDF tras un `next build` real: ninguna incluía
  // `pdfkit/js/standard-fonts/**`, y SÍ la ruta `app/api/proposals/preview-pdf`
  // faltaba por completo de este mapa (bug aparte, también corregido abajo:
  // las fuentes/el logo igualmente se colaban ahí por el propio grafo de
  // módulos de nft, pero sin ninguna garantía explícita). Reproducido de
  // forma aislada y verificable, sin asumir nada: moviendo
  // `node_modules/pdfkit/js/standard-fonts/` fuera del sitio (el estado
  // exacto de un bundle de función sin este arreglo) y llamando a
  // `renderProposalPdf()` real, el mismo `MODULE_NOT_FOUND` que reportó
  // Vincent — `Cannot find module '.../pdfkit/js/standard-fonts/Helvetica.cjs'`
  // en esta versión de pdfkit (0.20.1), `Helvetica.afm` en la que corre en
  // producción; la extensión exacta difiere según versión de pdfkit, pero el
  // mecanismo de fallo (el fichero no está en el bundle) es el mismo. Al
  // restaurar el directorio, los tests vuelven a pasar — confirmando causa y
  // arreglo contra el propio código real, no solo leyendo el mecanismo de
  // Next.js. `pdfkit/js/data/**` (los .afm de los otros 13 cuerpos base + el
  // perfil ICC sRGB) se incluye también, por el mismo motivo y con el mismo
  // patrón de "no confiar en el tracer para datos de terceros leídos con una
  // ruta calculada" — aunque el perfil ICC sí se rastreaba ya solo (usa
  // `new URL(ruta_relativa, ...)`, un patrón que `nft` sí reconoce), el resto
  // de `.afm` de ese directorio no, y es un coste de tamaño insignificante
  // (unos 630 KB) frente al riesgo de otro 500 si alguna vez se usa otro
  // cuerpo base.
  outputFileTracingIncludes: {
    'app/api/proposals/[id]/pdf': [
      './assets/fonts/**',
      './assets/images/**',
      './node_modules/pdfkit/js/standard-fonts/**',
      './node_modules/pdfkit/js/data/**',
    ],
    'app/api/proposals/preview-pdf': [
      './assets/fonts/**',
      './assets/images/**',
      './node_modules/pdfkit/js/standard-fonts/**',
      './node_modules/pdfkit/js/data/**',
    ],
    'app/api/public/proposals/[token]/accept': [
      './assets/fonts/**',
      './assets/images/**',
      './node_modules/pdfkit/js/standard-fonts/**',
      './node_modules/pdfkit/js/data/**',
    ],
  },
  webpack(config) {
    // src/pricing/ importa entre sí con extensión .js apuntando a ficheros
    // .ts (estilo NodeNext/Bundler, el que exige tsconfig.json). tsc y
    // vitest lo resuelven de forma nativa; el webpack de Next, no, por
    // defecto — solo mapea extensiones ausentes, no una .js explícita hacia
    // .ts. Sin esto, cualquier import (no solo de tipos) del motor de
    // precios rompe el build con "Module not found".
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.js', '.ts', '.tsx'],
    };
    return config;
  },
};

export default nextConfig;
