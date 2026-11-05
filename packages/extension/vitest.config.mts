import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const source = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// Unit tests for host code (src/logic, src/board/html.ts, the bundle check, and the board host's open/restore paths
// against test/unit/vscodeStub.ts, a small stand-in for the `vscode` module). Everything that needs a real VS Code
// runs in test/suite via @vscode/test-cli (npm run test:smoke). Core and runner resolve to their sources, as in
// tsconfig.json.
export default defineConfig({
  // vitest's results cache goes to out/ (build output, rebuilt anyway) rather than node_modules/.vite.
  cacheDir: source('./out/.vite'),
  resolve: {
    alias: [
      { find: /^@telelean\/core$/, replacement: source('../core/src/index.ts') },
      { find: /^@telelean\/runner$/, replacement: source('../runner/src/index.ts') },
      { find: /^@telelean\/runner\/(.*)$/, replacement: `${source('../runner/src/')}$1` },
      { find: /^vscode$/, replacement: source('./test/unit/vscodeStub.ts') },
    ],
  },
  test: {
    include: ['test/unit/**/*.test.ts'],
    fileParallelism: false,
    // M2 quota tripwire (docs/m2-plan.md section 10.4): with this set, the runner's createClaudeBackend refuses to
    // resolve a real binary and ClaudeCliBackend.startSession refuses to spawn anything but M0's node double. These
    // tests never construct the real backend anyway (fakes, and the host's Test-mode factory never calls it).
    env: { TELELEAN_NO_REAL_CLAUDE: '1' },
  },
});
