/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    // Sin ESLint configurado en el MVP: no bloquear el build por su ausencia.
    ignoreDuringBuilds: true,
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
