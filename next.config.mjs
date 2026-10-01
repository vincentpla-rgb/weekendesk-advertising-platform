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
  outputFileTracingIncludes: {
    'app/api/proposals/[id]/pdf': ['./assets/fonts/**', './assets/images/**'],
    'app/api/public/proposals/[token]/accept': ['./assets/fonts/**', './assets/images/**'],
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
