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
  outputFileTracingIncludes: {
    'app/api/proposals/[id]/pdf/route': ['./assets/fonts/**', './assets/images/**'],
    'app/api/public/proposals/[token]/accept/route': ['./assets/fonts/**', './assets/images/**'],
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
