/**
 * A plan never changes another card's binding as a side effect: a code-less block left directly above a declaration
 * (the block below it was deleted with its declarations) gets a blank line, so it does not silently bind to the next
 * declaration. Real parser and primitives. (Slice 2i: the card-only delete, which left the declarations behind, is
 * gone, and so is its case here.)
 */
import { describe, expect, it } from 'vitest';
import { planAction, type PlanContext } from '../../src/edit/index.js';
import { parseLeanFile } from '../../src/markup/api.js';
import { buildProjectModel, type ProjectModel } from '../../src/project/index.js';

const CTX: PlanContext = { today: '2026-11-02', now: '2026-11-02T10:00:00.000Z', layouts: {} };
const MAIN = 'Model/S/Main.lean';
const VOCAB = 'namespace S\n\n/-- things -/\naxiom T : Type\n/-- is good -/\naxiom Good : T → Prop\n/-- a thing -/\naxiom t : T\n\nend S\n';

const STACKED = `import Model.S.Vocabulary

namespace S

/-
@@ telelean v1
id: upper
type: GOAL
natural_name: An informal goal written just above
-/
/-
@@ telelean v1
id: lower
type: ASSUMPTION
natural_name: T is good
rationale: news
-/
/-- T is good -/
abbrev t_good : Prop := Good t
axiom t_good.holds : t_good
theorem untracked : Good t := t_good.holds

end S
`;

function model(main: string): ProjectModel {
  const files = [parseLeanFile('Model/S/Vocabulary.lean', VOCAB), parseLeanFile(MAIN, main)];
  return buildProjectModel({ files, fileHashes: {}, library: 'Model' });
}

const bindings = (m: ProjectModel) => [...m.nodes.values()].map((n) => [n.node.id, n.node.lean.binding, n.node.lean.statement ?? null]);

describe('deleting a block keeps the block above it code-less', () => {
  it('starts with upper code-less and lower bound by adjacency', () => {
    expect(bindings(model(STACKED))).toEqual([
      ['upper', 'none', null],
      ['lower', 'adjacent', 'S.t_good'],
    ]);
  });

  it('"Delete anyway" (confirmed, with its Lean): a blank line separates upper from the next untracked declaration', () => {
    const plan = planAction(model(STACKED), { kind: 'delete-node', id: 'lower', confirmed: true }, CTX);
    const after = plan.changes.find((c) => c.path === MAIN)?.after ?? '';
    expect(after).not.toContain('t_good : Prop');
    expect(after).toContain('natural_name: An informal goal written just above\n-/\n\ntheorem untracked');
    expect(bindings(model(after))).toEqual([['upper', 'none', null]]);
  });
});
