import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/integration/**/*.spec.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    coverage: {
      provider: 'v8',
      reporter: ['text'],
    },
  },
  resolve: {
    alias: {
      '@gepetto-shield/shared': path.resolve(__dirname, '../../packages/shared/src'),
    },
  },
});
