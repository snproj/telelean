import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Sequential on purpose: Lean builds and CLI processes are memory-hungry (see the RAM rule in the design docs).
export default defineConfig({
  resolve: {
    alias: {
      '@telelean/core': fileURLToPath(new URL('../core/src/index.ts', import.meta.url)),
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
    // M2 quota tripwire (docs/m2-plan.md section 10.4): with this set, createClaudeBackend refuses to resolve a real
    // binary and ClaudeCliBackend.startSession refuses to spawn anything but M0's node double (WP3 implements both).
    env: { TELELEAN_NO_REAL_CLAUDE: '1' },
    fileParallelism: false,
    testTimeout: 180_000,
    hookTimeout: 180_000,
  },
});
