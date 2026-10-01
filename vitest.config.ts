import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // `tsconfig.json` deja `jsx: "preserve"` porque el JSX real lo transforma
  // Next.js (SWC) en la app — pero vitest compila con esbuild directamente,
  // que sin esto asume el runtime clásico (`React.createElement` sin
  // import). Hace falta desde que `lib/pdf/ProposalPdfDocument.tsx` (ronda
  // de generación de PDF, CLAUDE.md §1/§9) se importa directamente en un
  // test — ningún `.tsx` se había probado así antes en este proyecto.
  esbuild: { jsx: 'automatic' },
  resolve: {
    // Espeja el `paths` de tsconfig.json ("@/*": ["./*"]) para que los tests
    // puedan importar módulos de la app (p. ej. app/login/actions.ts) tal
    // como los importa el propio código con alias `@/...`.
    alias: {
      '@': rootDir,
    },
  },
  test: {
    globals: true,
    include: ['src/**/*.test.ts', 'lib/**/*.test.ts', 'app/**/*.test.ts'],
  },
});
