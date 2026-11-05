import { defineConfig } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromeTmpDir } from './test/harness/chrome-tmp';

const PORT = 41739;

/**
 * Chrome's environment: ours, with TMPDIR, HOME and the XDG base directories all inside this run's short temp
 * directory (see test/harness/chrome-tmp.ts), so nothing Chrome writes (profile, crash reports, NSS database,
 * caches) lands in the real home folder; the global teardown deletes the directory. test/harness/home-guard.ts
 * checks the real home folder afterwards (docs/m1-plan.md section 10).
 */
function chromeEnv(): Record<string, string> {
  const tmp = chromeTmpDir();
  const dirs = { HOME: join(tmp, 'home'), XDG_CONFIG_HOME: join(tmp, 'xdg-config'), XDG_CACHE_HOME: join(tmp, 'xdg-cache'), XDG_DATA_HOME: join(tmp, 'xdg-data') };
  for (const dir of Object.values(dirs)) mkdirSync(dir, { recursive: true });
  return {
    ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)),
    TMPDIR: tmp,
    ...dirs,
  };
}

/**
 * Browser tests of the built bundle (packages/extension/dist/webview) in a static harness page with a mock
 * acquireVsCodeApi. Uses the installed Google Chrome (channel "chrome"); never downloads browsers.
 * One worker: one browser at a time (RAM rule). The npm script runs it under `ulimit -c 0` (no core dumps).
 */
export default defineConfig({
  testDir: 'test/e2e',
  // Screenshots are written to test-results/ directly; Playwright's own artifacts go one level down so the
  // start-of-run cleanup does not delete them.
  outputDir: 'test-results/playwright',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: [['list']],
  globalSetup: './test/harness/home-guard.ts',
  globalTeardown: './test/harness/chrome-tmp.ts',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    channel: 'chrome',
    headless: true,
    launchOptions: {
      env: chromeEnv(),
      args: ['--disable-crash-reporter', '--disable-breakpad', '--no-first-run'],
    },
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  webServer: {
    command: `node test/harness/serve.mjs ${PORT}`,
    url: `http://127.0.0.1:${PORT}/harness/index.html`,
    reuseExistingServer: false,
    timeout: 15_000,
    stdout: 'ignore',
  },
});
