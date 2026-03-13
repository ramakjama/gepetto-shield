import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts', 'test/unit/**/*.spec.ts'],
    exclude: ['test/integration/**', 'test/red-team/**', 'test/e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/**/*.module.ts', 'src/main.ts'],
    },
  },
  resolve: {
    alias: {
      '@gepetto-shield/shared': path.resolve(__dirname, '../../packages/shared/src'),
    },
  },
});
