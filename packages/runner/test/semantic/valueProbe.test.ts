/**
 * Slice 1d (spec v4.1 B.2, the review's S-1), end to end with Lean 4.35 (sandboxed, memory-capped, in a scratch
 * directory): a proof that reaches a card only through a `@[simp]` lemma `simp` used without the proof naming it, and
 * one that reaches it only through an instance found by type-class search. The `.ilean` references miss both; the
 * value probe's `valueConsts` find them, so core's direct(v) holds the card and its band may get the ✓. With the probe's
 * facts taken away (facts from before slice 1d), core falls back to the references and B.2's cross-check flags the use.
 * 1d fixer: a model whose own names clash with the probe's imports still got its facts (then by a second check without
 * the probe). Slice 2b3a (D2-75): the probe is its own Lean job that never imports the model beside Lean's modules, so
 * such a model gets every constant from one check and one probe job, and no second check runs (AP-21's is gone).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildProjectModel, parseLeanFile, type LeanFacts, type ProjectModel } from '@telelean/core';

import { runLean, type RunLeanOptions } from '../../src/lean/runLean.js';
import { readMemAvailableBytes, refreshLeanFacts } from '../../src/semantic/index.js';
import { refresh } from '../../src/semantic/refresh.js';
import { cleanupTempRoot, makeTempRoot, SEMANTIC_RUN_ID, SPYRO, unitsOfRun } from './helpers.js';

const MAIN = `namespace Simp

/-- Q, a proposition symbol. -/
axiom Q : Prop

/-
@@ telelean v1
id: a
type: AXIOM
natural_name: A holds
rationale: given
lean: Simp.a
-/
/-- A holds -/
abbrev a : Prop := Q
axiom a.holds : a

/-- A lemma without a card: \`simp\` uses it without the proof naming it. -/
@[simp] theorem q_true : Q = True := eq_true a.holds

/-
@@ telelean v1
id: v
type: PROPOSITION
natural_name: V holds
premises: a
lean: Simp.v
-/
/-- V holds -/
abbrev v : Prop := Q ∧ True
theorem v.holds : v := by show Q ∧ True; simp

/-- A class whose instance rests on the axiom card. -/
class Good : Prop where
  ok : Q

instance goodInst : Good := ⟨a.holds⟩

/-
@@ telelean v1
id: w
type: PROPOSITION
natural_name: W holds
premises: a
lean: Simp.w
-/
/-- W holds -/
abbrev w : Prop := Q
theorem w.holds : w := Good.ok

end Simp
`;

const FILES: Readonly<Record<string, string>> = { 'Model.lean': 'import Model.Simp.Main\n', 'Model/Simp/Main.lean': MAIN };

/** 1d fixer: a model declaring a name that the value probe's imports (Lean.Util.FoldConsts) declare too. */
const CLASH_FILES: Readonly<Record<string, string>> = {
  'Model.lean': 'import Model.Clash.Main\n',
  'Model/Clash/Main.lean': `/-- Also declared by Lean.Util.FoldConsts, which the model never imports. -/
def Lean.Expr.getUsedConstants : Nat := 0

namespace Clash

/-- Q, a proposition symbol. -/
axiom q : Prop

end Clash
`,
};

function writeProject(root: string, files: Readonly<Record<string, string>> = FILES): void {
  mkdirSync(root, { recursive: true });
  for (const name of ['lean-toolchain', 'lakefile.toml', 'lake-manifest.json']) writeFileSync(path.join(root, name), readFileSync(path.join(SPYRO, name)));
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
}

function modelOf(facts: LeanFacts): ProjectModel {
  const files = Object.entries(FILES).map(([file, text]) => parseLeanFile(file, text));
  const fileHashes = Object.fromEntries(facts.modules.map((m) => [m.file, m.sourceSha256]));
  return buildProjectModel({ files, fileHashes, facts, library: 'Model' });
}

const consts = (f: LeanFacts, name: string): string[] | undefined => f.decls.find((d) => d.name === name)?.valueConsts;
const refs = (f: LeanFacts, name: string): string[] | undefined => f.decls.find((d) => d.name === name)?.refs.map((r) => r.name);

describe('the value probe with Lean 4.35 (slice 1d, B.2)', () => {
  let tmp: string;
  beforeAll(() => {
    tmp = makeTempRoot('semantic-value');
  });
  afterAll(() => cleanupTempRoot(tmp));

  it('finds the card behind a simp lemma and behind an instance, which the references miss', async () => {
    const root = path.join(tmp, 'simp');
    writeProject(root);
    const f = await refreshLeanFacts({ root, runId: SEMANTIC_RUN_ID });
    console.log(`[value probe] status=${f.status}; check ${f.check.status} ${f.check.durationMs} ms, peak ${((f.check.peakMemoryBytes ?? 0) / 1024 ** 2).toFixed(0)} MiB`);
    expect(f.status).toBe('ok');
    expect(f.detail).toBeUndefined();

    // What the source names: no lemma, no instance.
    expect(refs(f, 'Simp.v.holds')).not.toContain('Simp.q_true');
    expect(refs(f, 'Simp.w.holds')).not.toContain('Simp.goodInst');
    // What elaboration put into the proofs.
    expect(consts(f, 'Simp.v.holds')).toContain('Simp.q_true');
    expect(consts(f, 'Simp.q_true')).toContain('Simp.a.holds');
    expect(consts(f, 'Simp.w.holds')).toContain('Simp.goodInst');
    expect(consts(f, 'Simp.goodInst')).toEqual(['Simp.a.holds']);
    expect(consts(f, 'Simp.a.holds')).toEqual([]);
    expect(f.decls.every((d) => d.valueConsts !== undefined)).toBe(true);
    // Slice 2b3a: from the isolated probe, with the type constants (the instance's class, the class's field type).
    expect(f.probe).toMatchObject({ status: 'ok' });
    expect(f.decls.every((d) => d.typeConsts !== undefined)).toBe(true);
    expect(f.decls.find((d) => d.name === 'Simp.goodInst')?.typeConsts).toEqual(['Simp.Good']);
    expect(f.decls.find((d) => d.name === 'Simp.Good')?.typeConsts).toEqual(['Simp.Q', 'Simp.Good']);

    const model = modelOf(f);
    for (const id of ['v', 'w']) {
      const node = model.nodes.get(id)?.node;
      expect(node?.status.proof, id).toEqual({ kind: 'proved', footprint: ['a'] });
      expect(node?.status.direct, id).toEqual({ ids: ['a'], from: 'proof' });
      expect(node?.status.flags, id).toEqual(['established']);
    }
    expect(model.diagnostics.filter((d) => d.code === 'TL107' || d.code === 'TL123')).toEqual([]);

    // The same facts without the probe's answers: the references find nothing, and the cross-check says so.
    const old: LeanFacts = { ...f, decls: f.decls.map(({ valueConsts: _c, ...rest }) => rest) };
    const fallback = modelOf(old);
    for (const id of ['v', 'w']) {
      const node = fallback.nodes.get(id)?.node;
      expect(node?.status.direct, id).toEqual({ ids: [], from: 'source', unseen: ['a'] });
      // Not established: the cross-check shows direct(v) incomplete (1d fixer).
      expect(node?.status.flags, id).toEqual(['uses-unseen']);
    }
    expect(await unitsOfRun(SEMANTIC_RUN_ID)).toEqual([]);
  });

  it("a model that declares a name Lean's modules declare too: one check and one probe job, every declaration with its constants (2b3a; 1d's second check is gone)", async () => {
    const root = path.join(tmp, 'clash');
    writeProject(root, CLASH_FILES);
    const jobs: string[] = [];
    const kind = (o: RunLeanOptions) => (o.argv.includes('build') ? 'build' : (o.stdin ?? '').includes('Lean.importModules') ? 'probe' : 'check');
    const f = await refresh({ root, runId: SEMANTIC_RUN_ID }, readMemAvailableBytes, { runLean: (o) => (jobs.push(kind(o)), runLean(o)) });
    console.log(`[value probe, clash] status=${f.status}; detail=${f.detail ?? ''}`);
    expect(jobs).toEqual(['build', 'check', 'probe']);
    expect(f.status).toBe('ok');
    expect(f.detail).toBeUndefined();
    expect(f.check).toMatchObject({ status: 'ok', probed: 2 });
    expect(f.probe).toMatchObject({ status: 'ok' });
    expect(f.decls.find((d) => d.name === 'Clash.q')).toMatchObject({ kind: 'axiom', type: 'Prop', valueConsts: [], typeConsts: [] });
    expect(f.decls.find((d) => d.name === 'Lean.Expr.getUsedConstants')).toMatchObject({ kind: 'def', type: 'Nat', valueConsts: [], typeConsts: [] });
    expect(f.decls.every((d) => d.valueConsts !== undefined && d.typeConsts !== undefined && d.error === undefined)).toBe(true);
    expect(await unitsOfRun(SEMANTIC_RUN_ID)).toEqual([]);
  });
});
