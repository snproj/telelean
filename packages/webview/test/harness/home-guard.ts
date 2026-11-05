/**
 * Global setup (and, through its return value, teardown) of the Playwright run: proves that Chrome left the real
 * home folder alone (docs/m1-plan.md section 10, AT6.15).
 *
 * Chrome runs with HOME and XDG_* pointing into the run's short temp dir (playwright.config.ts), so crash reports,
 * NSS databases and caches land there and are deleted with it. This guard lists the real locations Chrome would
 * otherwise write to before the run and again after it (names, sizes, modification times; never file contents),
 * and fails the run if anything changed. Only a summary is printed: the listings are not stored anywhere.
 */
import { readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, relative } from 'node:path';

/**
 * Where Chrome writes in a home folder: profile and crash reports, cache, fontconfig cache, NSS certificate database
 * (Chrome 155 uses $XDG_DATA_HOME/pki/nssdb; older versions ~/.pki/nssdb).
 */
const WATCHED = ['.config/google-chrome', '.cache/google-chrome', '.cache/fontconfig', '.pki', '.local/share/pki'];

type Listing = Record<string, string[] | null>;

function walk(root: string, dir: string, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    const stat = statSync(path, { throwIfNoEntry: false });
    if (!stat) continue;
    out.push(`${relative(root, path)}\t${entry.isDirectory() ? 'dir' : stat.size}\t${Math.round(stat.mtimeMs)}`);
    if (entry.isDirectory() && !entry.isSymbolicLink()) walk(root, path, out);
  }
}

export function listHome(home: string = homedir()): Listing {
  const listing: Listing = {};
  for (const sub of WATCHED) {
    const root = join(home, sub);
    const stat = statSync(root, { throwIfNoEntry: false });
    if (!stat) {
      listing[sub] = null;
      continue;
    }
    const entries: string[] = [];
    walk(root, root, entries);
    listing[sub] = entries.sort();
  }
  return listing;
}

function differences(before: Listing, after: Listing): string[] {
  const out: string[] = [];
  for (const sub of WATCHED) {
    const a = before[sub] ?? null;
    const b = after[sub] ?? null;
    if (a === null && b === null) continue;
    if (a === null || b === null) {
      out.push(`${sub}: ${a === null ? 'appeared' : 'disappeared'}`);
      continue;
    }
    const setA = new Set(a);
    const setB = new Set(b);
    for (const line of b) if (!setA.has(line)) out.push(`${sub}: new or changed ${line.split('\t')[0]}`);
    for (const line of a) if (!setB.has(line)) out.push(`${sub}: removed or changed ${line.split('\t')[0]}`);
  }
  return out;
}

export default function homeGuard(): () => void {
  const before = listHome();
  return () => {
    const after = listHome();
    const changed = differences(before, after);
    if (changed.length > 0) throw new Error(`Chrome changed the real home folder:\n${changed.join('\n')}`);
    console.log(`home guard: ${WATCHED.map((sub) => `~/${sub} ${before[sub] === null ? 'absent' : `${before[sub]?.length} entries`}`).join(', ')}; unchanged`);
  };
}
