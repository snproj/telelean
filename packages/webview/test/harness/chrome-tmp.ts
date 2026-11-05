/**
 * A short temporary directory for Chrome, one per Playwright run.
 *
 * Chrome creates its singleton socket and some fetcher directories under $TMPDIR, and leaves the fetcher
 * directories (com.google.Chrome.chrome_chrome_url_fetcher_*) behind when it exits. A Unix socket path must stay
 * under 108 bytes, so a long TMPDIR (such as an agent's scratchpad) stops Chrome from starting at all:
 *   FATAL:process_singleton_posix.cc:313] Socket path too long: <TMPDIR>/com.google.Chrome.XXXXXX/SingletonSocket
 * playwright.config.ts therefore points Chrome at a fresh short directory (in os.tmpdir() when that is short,
 * otherwise in /tmp), and the global teardown below deletes it with whatever Chrome left in it.
 */
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative } from 'node:path';

const ENV = 'TL_PLAYWRIGHT_CHROME_TMPDIR';
const PREFIX = 'tl-pw-chrome-';
/** Leaves room for "/tl-pw-chrome-XXXXXX/com.google.Chrome.XXXXXX/SingletonSocket" within the 107-byte limit. */
const MAX_BASE_LENGTH = 40;

const base = () => (tmpdir().length <= MAX_BASE_LENGTH ? tmpdir() : '/tmp');

/**
 * The run's directory, created on first use. Playwright loads the config in the runner and again in each worker;
 * the workers inherit the variable from the runner, so they reuse the runner's directory instead of making their own.
 */
export function chromeTmpDir(): string {
  let dir = process.env[ENV];
  if (!dir) {
    dir = mkdtempSync(join(base(), PREFIX));
    process.env[ENV] = dir;
  }
  return dir;
}

/** Paths (relative to `root`) of the files under `dir`, at most `limit`. */
function filesUnder(root: string, dir: string, limit: number, out: string[] = []): string[] {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (out.length >= limit) break;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) filesUnder(root, path, limit, out);
    else out.push(relative(root, path));
  }
  return out;
}

/**
 * Global teardown: says what Chrome wrote into the isolated HOME and XDG directories (evidence that it used them
 * instead of the real home folder), then removes the run's directory (only one this module created: name and parent
 * are checked).
 */
export default function removeChromeTmpDir(): void {
  const dir = process.env[ENV];
  if (!dir || !basename(dir).startsWith(PREFIX) || dirname(dir) !== base()) return;
  const written = ['home', 'xdg-config', 'xdg-cache', 'xdg-data'].flatMap((sub) => filesUnder(dir, join(dir, sub), 20));
  console.log(`isolated Chrome HOME/XDG (deleted now): ${written.length > 0 ? written.join(', ') : 'nothing written'}`);
  rmSync(dir, { recursive: true, force: true });
}
