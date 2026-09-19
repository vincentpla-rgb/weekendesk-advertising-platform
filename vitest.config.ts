import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
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
