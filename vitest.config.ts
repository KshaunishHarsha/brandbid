import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Same "@/..." alias the web app uses (apps/web/tsconfig.json)
    alias: { '@': fileURLToPath(new URL('./apps/web', import.meta.url)) },
  },
  test: {
    passWithNoTests: true,
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts', 'deploy/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/.next/**', '**/.open-next/**'],
  },
});
