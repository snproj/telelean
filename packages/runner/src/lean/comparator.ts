/**
 * Gate step G4: `lake comparator` against a frozen challenge, under runLean (03 §8.5, 02 D-26).
 *
 * Freeze (after phase A is signed off):
 *   a copy of the exact snapshot + a generated challenge module declaring `theorem n.holds : n := sorry`
 *   per target (the statement abbrevs are left untouched), built and exported with the toolchain's
 *   `leanexport` into `frozen.ndjson`, all inside the sandbox. The snapshot itself is never written to.
 * Judge (when the agent claims it is finished):
 *   `lake comparator --challenge-from-export frozen.ndjson` in the solution shadow, with
 *   `permitted_axioms` = std ∪ signature ∪ selected ∪ presuppositions ∪ footprints of selected derivations.
 *
 * comparator starts its own nested bwrap, which needs the `/root`, `/run/user` and `/var` mount points
 * that runLean's profile creates. A sandbox start-up failure is reported as `could-not-start`, never as
 * `rejected` (lake's own exit code 1 covers both, so the output is classified here).
 */
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { applyLeanOps, applyTextEdits, findDecl, parseLeanFile, type LeanOp } from '@telelean/core';

import { assertDeclName, assertModuleName, formatDeclName, modulePath } from './leanNames.js';
import { runLean, type RunLeanOptions, type RunLeanResult } from './runLean.js';
import { createShadow } from './shadow.js';
import { resolveToolchain, toolchainExe } from './toolchain.js';

/** The axioms `#print axioms` treats as a clean proof. */
export const STANDARD_AXIOMS: readonly string[] = ['propext', 'Classical.choice', 'Quot.sound'];

/** Mirrors Lake 5.0.0 `Lake.Check.primitiveTargets` (src/lean/lake/Lake/CLI/Check.lean). */
export const PRIMITIVE_TARGETS: readonly string[] = [
  'Nat.add', 'Nat.sub', 'Nat.mul', 'Nat.pow', 'Nat.gcd', 'Nat.div', 'Nat.mod', 'Nat.beq', 'Nat.ble',
  'Nat.land', 'Nat.lor', 'Nat.xor', 'Nat.shiftLeft', 'Nat.shiftRight', 'String.ofList', 'Char.ofNat',
  'List', 'eagerReduce', 'Nat', 'String', 'String.mk', 'Char', 'optParam', 'autoParam', 'semiOutParam',
  'outParam',
];

/** Mirrors Lake 5.0.0 `Lake.Check.builtinTargets`. */
export function builtinTargets(permittedAxioms: readonly string[]): string[] {
  return permittedAxioms.includes('Quot.sound') ? ['Quot', 'Quot.mk', 'Quot.lift', 'Quot.ind'] : [];
}

/**
 * The constants comparator exports from each side (Lake 5.0.0 `compareIt`). A frozen challenge export
 * must contain all of them, or comparator cannot compare the solution against it.
 */
export function comparatorExportTargets(spec: {
  readonly theoremNames: readonly string[];
  readonly permittedAxioms: readonly string[];
  readonly definitionNames?: readonly string[];
}): string[] {
  const all = [
    ...builtinTargets(spec.permittedAxioms),
    ...spec.theoremNames,
    ...spec.permittedAxioms,
    ...PRIMITIVE_TARGETS,
    ...(spec.definitionNames ?? []),
  ];
  return [...new Set(all)];
}

export interface ChallengeTarget {
  /** The theorem the solution must provide, e.g. `Spyro.cynder_not_good.holds`. */
  readonly theorem: string;
  /** The name of its statement abbrev, e.g. `Spyro.cynder_not_good` (D-2(b)). */
  readonly statement: string;
}

/** D-2(b): the target for a statement abbrev `n` is `theorem n.holds : n`. */
export function holdsTarget(statement: string): ChallengeTarget {
  return { theorem: `${statement}.holds`, statement };
}

export const CHALLENGE_MARKER = '-- telelean: generated comparator challenge';

/** The generated challenge module: the only place telelean ever writes `sorry`. */
export function generateChallengeModule(imports: readonly string[], targets: readonly ChallengeTarget[]): string {
  if (imports.length === 0) throw new TypeError('the challenge must import the frozen model');
  if (targets.length === 0) throw new TypeError('the challenge needs at least one target');
  for (const m of imports) assertModuleName(m);
  const lines = [
    `${CHALLENGE_MARKER} (02 D-26, gate step G4). Do not edit.`,
    '-- The frozen statements are left untouched; each target theorem is stated here with `sorry`.',
    ...imports.map((m) => `import ${m}`),
    '',
    ...targets.map((t) => `theorem ${formatDeclName(t.theorem)} : ${formatDeclName(t.statement)} := sorry`),
    '',
  ];
  return lines.join('\n');
}

/** What a frozen challenge pins down; everything comparator needs besides the solution. */
export interface Freeze {
  /** Host path of the NDJSON export of the challenge. */
  readonly exportPath: string;
  readonly challengeModule: string;
  readonly theoremNames: readonly string[];
  readonly permittedAxioms: readonly string[];
  readonly definitionNames: readonly string[];
}

type RunPassthrough = Omit<Partial<RunLeanOptions>, 'shadowDir' | 'argv' | 'stdin' | 'stdoutFile'>;

export interface FreezeOptions {
  /**
   * The approved (phase-A) snapshot. Only read: it is copied into `freezeDir` (with its `.lake/build`,
   * so building the challenge is incremental), and the challenge module goes into the copy.
   */
  readonly snapshotDir: string;
  /**
   * A fresh directory (absent or empty) for that copy. Keeping it apart from the agent's shadow means the
   * generated `sorry` never shows up in the agent's files, its proposal diff or G3's no-sorry scan. The
   * caller may delete it once the export is written.
   */
  readonly freezeDir: string;
  /** Modules the challenge imports, e.g. `['Model']`. */
  readonly imports: readonly string[];
  /** Must belong to one of the project's libraries, e.g. `Model.TeleleanChallenge`. */
  readonly challengeModule: string;
  readonly targets: readonly ChallengeTarget[];
  readonly permittedAxioms: readonly string[];
  readonly definitionNames?: readonly string[];
  /** Host path the export is written to. */
  readonly exportPath: string;
  /**
   * M2 (WP2, additive): fully-qualified declarations removed from the COPY before the challenge module is written,
   * each with its docstring (core `applyLeanOps` `remove-decl`; the snapshot itself is never touched): the target's
   * own `.holds` and every declaration that uses it, so the generated `theorem T.holds : T := sorry` neither clashes
   * with an existing `T.holds` nor leaves a dependent without it (docs/m2-plan.md section 7.1 step 4). Each name must
   * be declared in one of the copy's `.lean` files, else an Error is thrown before anything is built.
   */
  readonly removeDecls?: readonly string[];
  readonly run?: RunPassthrough;
}

/**
 * Removes `names` (with their docstrings) from the `.lean` files of a project copy, all or nothing per file. Throws
 * when a name is declared in no file or a removal is unsafe (applyLeanOps problems, e.g. a telelean block inside the
 * declaration). Returns the files it changed.
 */
export async function removeDeclarations(dir: string, files: readonly string[], names: readonly string[]): Promise<string[]> {
  for (const name of names) assertDeclName(name);
  const pending = new Set(names);
  const changed: string[] = [];
  for (const rel of files) {
    if (pending.size === 0) break;
    if (!rel.endsWith('.lean')) continue;
    const file = path.join(dir, rel);
    const text = await readFile(file, 'utf8');
    const parsed = parseLeanFile(rel.split(path.sep).join('/'), text);
    const here = [...pending].filter((name) => findDecl(parsed, name) !== undefined);
    if (here.length === 0) continue;
    const ops: LeanOp[] = here.map((name) => ({ op: 'remove-decl', name, archive: false }));
    const result = applyLeanOps(parsed, ops);
    if (result.problems.length > 0) throw new Error(`cannot remove ${here.join(', ')} from the frozen copy: ${result.problems.join(' ')}`);
    await writeFile(file, applyTextEdits(text, result.edits), 'utf8');
    for (const name of here) pending.delete(name);
    changed.push(rel);
  }
  if (pending.size > 0) throw new Error(`cannot remove ${[...pending].join(', ')} from the frozen copy: not declared in any module`);
  return changed;
}

export type FreezeResult =
  | { readonly ok: true; readonly freeze: Freeze; readonly build: RunLeanResult; readonly export: RunLeanResult }
  | {
      readonly ok: false;
      readonly stage: 'build' | 'export';
      readonly detail: string;
      readonly build: RunLeanResult;
      readonly export?: RunLeanResult;
    };

function tail(text: string, n = 12): string {
  return text.trim().split('\n').slice(-n).join('\n');
}

/**
 * Copies the snapshot into `freezeDir`, writes the challenge module into the copy, builds it and exports
 * it, all under runLean. Throws (`ShadowError`, `TypeError`) if the snapshot cannot be copied as a model
 * project or the names are unusable; build and export failures are returned.
 */
export async function freezeChallenge(options: FreezeOptions): Promise<FreezeResult> {
  assertModuleName(options.challengeModule);
  for (const t of options.targets) {
    assertDeclName(t.theorem);
    assertDeclName(t.statement);
  }
  for (const a of options.permittedAxioms) assertDeclName(a);
  for (const d of options.definitionNames ?? []) assertDeclName(d);
  for (const d of options.removeDecls ?? []) assertDeclName(d);

  const copy = await createShadow(options.snapshotDir, options.freezeDir);
  if (options.removeDecls !== undefined && options.removeDecls.length > 0) await removeDeclarations(copy.dir, copy.files, options.removeDecls);
  const challengeFile = path.join(copy.dir, modulePath(options.challengeModule));
  const existing = await readFile(challengeFile, 'utf8').catch(() => undefined);
  if (existing !== undefined && !existing.startsWith(CHALLENGE_MARKER)) {
    throw new Error(`${modulePath(options.challengeModule)} exists in the snapshot and was not generated by telelean; refusing to overwrite it`);
  }
  await mkdir(path.dirname(challengeFile), { recursive: true });
  await writeFile(challengeFile, generateChallengeModule(options.imports, options.targets), 'utf8');

  const toolchain = options.run?.toolchain ?? resolveToolchain();
  const lake = toolchainExe(toolchain, 'lake');
  const build = await runLean({ ...options.run, toolchain, shadowDir: copy.dir, argv: [lake, 'build', options.challengeModule] });
  if (build.status !== 'ok') {
    return { ok: false, stage: 'build', detail: `${build.status}: ${build.detail ?? tail(build.stdout + build.stderr)}`, build };
  }

  const theoremNames = options.targets.map((t) => t.theorem);
  const definitionNames = options.definitionNames ?? [];
  const exportTargets = comparatorExportTargets({ theoremNames, permittedAxioms: options.permittedAxioms, definitionNames });
  await mkdir(path.dirname(options.exportPath), { recursive: true });
  const exported = await runLean({
    ...options.run,
    toolchain,
    shadowDir: copy.dir,
    argv: [lake, 'env', 'leanexport', options.challengeModule, '--', ...exportTargets],
    env: { ...options.run?.env, LEAN_ABORT_ON_PANIC: '1' },
    stdoutFile: options.exportPath,
  });
  const size = await stat(options.exportPath).then((s) => s.size, () => 0);
  if (exported.status !== 'ok' || size === 0) {
    return {
      ok: false,
      stage: 'export',
      detail: `${exported.status}${size === 0 ? ' (empty export)' : ''}: ${exported.detail ?? tail(exported.stderr)}`,
      build,
      export: exported,
    };
  }
  return {
    ok: true,
    freeze: {
      exportPath: options.exportPath,
      challengeModule: options.challengeModule,
      theoremNames,
      permittedAxioms: [...options.permittedAxioms],
      definitionNames: [...definitionNames],
    },
    build,
    export: exported,
  };
}

// ---------------------------------------------------------------------------------------------
// Judging

export type RejectionReason =
  /** The solution uses an axiom outside `permitted_axioms` (smuggled, or an unselected assumption). */
  | 'illegal-axiom'
  /** A target theorem's or permitted axiom's own stated type differs from the frozen one. */
  | 'statement-mismatch'
  /**
   * A constant the frozen statements depend on differs from the frozen one: e.g. the goal's statement
   * abbrev weakened under the same name, or a same-name altered assumption abbrev (Lake's
   * "Const does not match between challenge and target", from the closure comparison).
   */
  | 'definition-mismatch'
  /** A target or permitted constant changed kind (e.g. theorem vs axiom). */
  | 'kind-mismatch'
  /** A target or permitted constant is missing from the solution, or is not a theorem. */
  | 'missing-declaration'
  /** Lean's kernel (or an external checker) rejected the solution's export. */
  | 'kernel-rejected'
  /** The solution does not build. */
  | 'build-failed'
  /** The solution built but could not be exported. */
  | 'export-failed';

export type ComparatorVerdict =
  | { readonly verdict: 'accepted' }
  | { readonly verdict: 'rejected'; readonly reason: RejectionReason; readonly names: readonly string[]; readonly message: string }
  /** The check itself could not run (sandbox, configuration, or telelean's own freeze). Not the solution's fault. */
  | { readonly verdict: 'could-not-start'; readonly message: string }
  /** Stopped before a verdict: the time or memory budget ran out, or the run was cancelled. */
  | { readonly verdict: 'incomplete'; readonly reason: 'timeout' | 'oom' | 'cancelled'; readonly message: string };

const quotedNames = (text: string, pattern: RegExp): string[] => [...text.matchAll(pattern)].map((m) => m[1] ?? '').filter((s) => s !== '');

/** comparator's progress lines on stdout, in the order it prints them. */
const PHASES = ['start', 'resolve', 'build', 'export', 'kernel', 'done'] as const;
type Phase = (typeof PHASES)[number];

function phaseOfLine(line: string): number {
  if (line.startsWith('Resolving dependencies')) return 1;
  if (line.startsWith('Building ')) return 2;
  if (line.startsWith('Exporting ')) return 3;
  if (/^Running .* kernel on solution/.test(line)) return 4;
  if (line.startsWith('Your solution is okay!')) return 5;
  return 0;
}

/**
 * The furthest phase comparator announced on stdout. The solution's build log goes to the same stdout
 * and may contain lines that look like an earlier phase's (seen: an info message ending in "Resolving
 * dependencies"), so a later line never moves the phase back.
 */
function furthestPhase(stdout: string): Phase {
  const furthest = Math.max(0, ...stdout.split('\n').map(phaseOfLine));
  return PHASES[furthest] ?? 'start';
}

/** Lean error lines from a failed build, for feeding back to the agent. */
function buildErrors(text: string): string[] {
  return text
    .split('\n')
    .filter((l) => /^error: /.test(l.trim()) && !/Child exited with/.test(l))
    .map((l) => l.trim())
    .slice(0, 20);
}

/**
 * Classifies a comparator run. Exit code 0 with "Your solution is okay!" is the only acceptance; a
 * sandbox or configuration failure is `could-not-start`; only a recognised judgement is `rejected`.
 *
 * Where the text comes from matters (Lake 5.0.0 `Lake/CLI/Check.lean`). comparator's judgements and its
 * own final error line go to stderr, and that final line is always the last line there: nothing runs
 * after it. The nested `lake build` of the solution writes its whole log (Lean messages, `#eval`
 * output) to stdout and only its own "error: build failed" to stderr. So judgements are read from stderr
 * only, and a nested sandbox counts as "could not start" only when a `bwrap:` line sits directly before
 * that final line. Text in the solution's build log, which lands on stdout, therefore cannot pass for
 * either (the `noisy-build-error` fixture checks this).
 */
export function classifyComparatorRun(run: RunLeanResult): ComparatorVerdict {
  if (run.status === 'timeout' || run.status === 'oom' || run.status === 'cancelled') {
    return { verdict: 'incomplete', reason: run.status, message: run.detail ?? run.status };
  }
  if (run.status === 'could-not-start') {
    return { verdict: 'could-not-start', message: `the sandbox could not start: ${run.detail ?? 'unknown reason'}` };
  }
  const out = run.stdout;
  const err = run.stderr;
  const phase = furthestPhase(out);
  if (run.exitCode === 0 && phase === 'done') return { verdict: 'accepted' };
  if (run.exitCode === 2) return { verdict: 'could-not-start', message: `lake comparator could not start: ${tail(err, 6)}` };
  if (run.exitCode !== 1) {
    return { verdict: 'could-not-start', message: `lake comparator ended unexpectedly (exit ${String(run.exitCode)}): ${tail(err, 6)}` };
  }

  // 1. A judgement from comparing the solution's export with the frozen one.
  const illegal = quotedNames(err, /Illegal axiom detected: '([^']+)'/g);
  if (illegal.length > 0) return { verdict: 'rejected', reason: 'illegal-axiom', names: illegal, message: `uses axioms outside the permitted set: ${illegal.join(', ')}` };
  const mismatch = quotedNames(err, /Challenge and solution theorem statement do not match: '([^']+)'/g);
  if (mismatch.length > 0) return { verdict: 'rejected', reason: 'statement-mismatch', names: mismatch, message: `statement differs from the frozen one: ${mismatch.join(', ')}` };
  const changed = quotedNames(err, /Const does not match between challenge and target '([^']+)'/g);
  if (changed.length > 0) {
    return { verdict: 'rejected', reason: 'definition-mismatch', names: changed, message: `a definition the frozen statements depend on was changed: ${changed.join(', ')}` };
  }
  const kind = quotedNames(err, /Challenge and solution constant kind don't match: '([^']+)'/g);
  if (kind.length > 0) return { verdict: 'rejected', reason: 'kind-mismatch', names: kind, message: `constant changed kind: ${kind.join(', ')}` };
  const missingInChallenge = quotedNames(err, /Const not found in challenge:? '([^']+)'/g);
  if (missingInChallenge.length > 0) {
    return { verdict: 'could-not-start', message: `the frozen challenge lacks ${missingInChallenge.join(', ')} (a freeze problem, not the solution's)` };
  }
  const missing = [
    ...quotedNames(err, /(?:Const|Constant) not found in solution:? '([^']+)'/g),
    ...quotedNames(err, /Solution constant is not a (?:theorem|definition): '([^']+)'/g),
  ];
  if (missing.length > 0) return { verdict: 'rejected', reason: 'missing-declaration', names: missing, message: `missing or not a theorem in the solution: ${missing.join(', ')}` };

  // 2. A nested sandbox (resolve, build, export or kernel step) that could not start: bwrap prints one
  //    "bwrap: ..." line and exits, and comparator's final line follows it at once ("error: Child exited
  //    with 1", or "error: Lean default exited with 1" for the kernel step).
  const lines = err.trimEnd().split('\n');
  const finalLine = lines.at(-1) ?? '';
  const beforeFinal = lines.at(-2) ?? '';
  const finalExit = /^error: (.+) exited with \d+$/.exec(finalLine);
  if (finalExit && beforeFinal.startsWith('bwrap: ')) {
    return { verdict: 'could-not-start', message: `comparator's own sandbox could not start: ${beforeFinal}` };
  }

  // 3. The kernel step rejected the export: comparator prints "<kernel> kernel rejected the solution" and
  //    ends with "error: <kernel> exited with <n>" (its nested steps end with "Child exited" instead).
  const kernel = /^(.*) kernel rejected the solution$/m.exec(out);
  if (kernel && finalExit && finalExit[1] !== 'Child') {
    return { verdict: 'rejected', reason: 'kernel-rejected', names: [], message: `${kernel[1] ?? 'a'} kernel rejected the solution: ${tail(err, 6)}` };
  }

  // 4. A nested step failed: which one is told by how far comparator got.
  switch (phase) {
    case 'build': {
      const errors = buildErrors(`${out}\n${err}`);
      return { verdict: 'rejected', reason: 'build-failed', names: [], message: errors.length > 0 ? errors.join('\n') : tail(`${out}\n${err}`, 12) };
    }
    case 'export': {
      const notFound = quotedNames(err, /Constant '?([^\s']+)'? not found in environment/g);
      if (notFound.length > 0) return { verdict: 'rejected', reason: 'missing-declaration', names: notFound, message: `missing in the solution: ${notFound.join(', ')}` };
      return { verdict: 'rejected', reason: 'export-failed', names: [], message: tail(err, 12) };
    }
    default:
      // Failing while resolving the workspace, or anything unrecognised, is not a judgement on the solution.
      return { verdict: 'could-not-start', message: `lake comparator failed before judging (${phase}): ${tail(err, 6)}` };
  }
}

export interface ComparatorOptions {
  /** The solution shadow (needs `lake-manifest.json`). */
  readonly solutionDir: string;
  readonly freeze: Freeze;
  /** The module whose environment holds the solution's theorems, e.g. `Model`. */
  readonly solutionModule: string;
  /** Host directory for `comparator.json`; bound read-only into the sandbox. */
  readonly workDir: string;
  readonly run?: RunPassthrough;
}

export interface ComparatorResult {
  readonly verdict: ComparatorVerdict;
  readonly run: RunLeanResult;
  readonly configPath: string;
}

/** Runs `lake comparator --challenge-from-export` under runLean and classifies the outcome. */
export async function runComparator(options: ComparatorOptions): Promise<ComparatorResult> {
  assertModuleName(options.solutionModule);
  const { freeze } = options;
  const workDir = path.resolve(options.workDir);
  await mkdir(workDir, { recursive: true });
  const configPath = path.join(workDir, 'comparator.json');
  const config = {
    challenge_module: freeze.challengeModule,
    solution_module: options.solutionModule,
    theorem_names: freeze.theoremNames,
    definition_names: freeze.definitionNames,
    permitted_axioms: freeze.permittedAxioms,
  };
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');

  const exportPath = path.resolve(freeze.exportPath);
  const exportDir = path.dirname(exportPath);
  const roBinds = [...(options.run?.roBinds ?? []), workDir];
  if (exportDir !== workDir && !exportDir.startsWith(workDir + path.sep)) roBinds.push(exportDir);

  const toolchain = options.run?.toolchain ?? resolveToolchain();
  const run = await runLean({
    ...options.run,
    toolchain,
    shadowDir: options.solutionDir,
    roBinds,
    argv: [toolchainExe(toolchain, 'lake'), 'comparator', `--config=${configPath}`, `--challenge-from-export=${exportPath}`],
  });
  return { verdict: classifyComparatorRun(run), run, configPath };
}
