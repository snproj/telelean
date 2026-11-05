/**
 * A stand-in "extension host" for the host-crash test: starts one long sandboxed run and waits.
 * The test bundles this with esbuild, runs it with node, then SIGKILLs it.
 * argv: <shadowDir> <sleep seconds marker> <runId>
 */
import { runLean } from '../../../src/lean/runLean.js';

const [shadowDir, marker, runId] = process.argv.slice(2);
if (shadowDir === undefined || marker === undefined || runId === undefined) {
  console.error('usage: hostCrashChild <shadowDir> <marker> <runId>');
  process.exit(2);
}
void runLean({ shadowDir, argv: ['sleep', marker], runId, timeoutMs: 60_000 }).then((r) => {
  console.log(JSON.stringify({ status: r.status, unit: r.unit }));
});
