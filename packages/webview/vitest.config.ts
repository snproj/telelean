import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Unit tests for the DOM-free parts (edge geometry, store). Layout-dependent behaviour is covered by Playwright.
export default defineConfig({
  resolve: {
    alias: {
      '@telelean/core': fileURLToPath(new URL('../core/src/index.ts', import.meta.url)),
    },
  },
  test: {
    include: ['test/unit/**/*.test.ts'],
    fileParallelism: false,
  },
});
