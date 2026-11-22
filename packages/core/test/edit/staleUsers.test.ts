/**
 * While a file is not freshly checked, the guard "never remove a `.holds` others use" rests on a text scan of the
 * declarations (dependents.ts textUsers). Uses written through `open` must count too. (Spec v4: no kind change removes
 * a `.holds` any more, so the guard is exercised by deleting the card with its Lean code, D-18.)
 */
import { describe, expect, it } from 'vitest';
import { ActionError } from '../../src/actions.js';
import { planAction, type PlanContext } from '../../src/edit/index.js';
import { parseLeanFile } from '../../src/markup/api.js';
import { buildProjectModel } from '../../src/project/index.js';
import { fakeFacts, freshHashes } from '../project/helpers/fakeFacts.js';
import { block, mainS, VOCAB_S } from '../project/helpers/build.js';

const CTX: PlanContext = { today: '2026-11-02', now: '2026-11-02T10:00:00.000Z', layouts: {} };
const BODY = [block({ id: 'a1', type: 'ASSUMPTION', name: 'A1', rationale: 'r', lean: 'S.a1' }), 'abbrev a1 : Prop := Good t', 'axiom a1.holds : a1'].join('\n');

/** Delete a1 with its Lean code while `Model/S/Uses.lean` (new, never checked) holds `uses`. */
function attempt(uses: string): string[] | 'removed' {
  const checked = { 'Model/S/Vocabulary.lean': VOCAB_S, 'Model/S/Main.lean': mainS(BODY) };
  const checkedFiles = Object.entries(checked).map(([path, text]) => parseLeanFile(path, text));
  const facts = fakeFacts(checkedFiles);
  const files = [...checkedFiles, parseLeanFile('Model/S/Uses.lean', `import Model.S.Main\n\n${uses}\n`)];
  const model = buildProjectModel({ files, fileHashes: { ...freshHashes(checkedFiles), 'Model/S/Uses.lean': 'sha-new' }, facts, library: 'Model' });
  try {
    planAction(model, { kind: 'delete-node', id: 'a1' }, CTX);
    return 'removed';
  } catch (error) {
    if (error instanceof ActionError && error.code === 'needs-confirmation') return [...error.dependents];
    throw error;
  }
}

describe('stale-file dependents: uses through `open` are found', () => {
  it('inside the namespace, fully qualified elsewhere (as before)', () => {
    expect(attempt('namespace S\ntheorem uses_it : a1 := a1.holds\nend S')).toEqual(['S.uses_it']);
    expect(attempt('namespace Other\ntheorem uses_it : S.a1 := S.a1.holds\nend Other')).toEqual(['Other.uses_it']);
  });

  it('`open S in`, `open S` and `namespace Other` + `open S`', () => {
    expect(attempt('open S in\ntheorem uses_it : a1 := a1.holds')).toEqual(['uses_it']);
    expect(attempt('open S\ntheorem uses_it : a1 := a1.holds')).toEqual(['uses_it']);
    expect(attempt('namespace Other\nopen S\ntheorem uses_it : a1 := a1.holds\nend Other')).toEqual(['Other.uses_it']);
  });

  it('a two-component suffix of the `.holds` counts however it came into scope; an unrelated file asks nothing', () => {
    expect(attempt('export S (a1)\ntheorem uses_it : True := (a1.holds).elim')).toEqual(['uses_it']);
    expect(attempt('theorem unrelated : True := trivial')).toBe('removed');
  });
});
