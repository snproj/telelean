/**
 * AT2.9 (two subjects: separate graphs, workspace-wide ids, TL006/TL120/TL121) and AT2.12 (diagnostics: LEAN
 * messages by containment with Lean's severity, markup diagnostics with node ids, per-subject filtering).
 */
import { describe, expect, it } from 'vitest';
import { emptyLayout, moveInLayout, orderByLayout } from '../../src/layout.js';
import type { LeanMessageFact } from '../../src/facts.js';
import { buildProjectModel, subjectGraph } from '../../src/project/index.js';
import { SPYRO_SEMANTIC, spyroGraph } from '../../src/samples/spyro.js';
import { fakeFacts, freshHashes } from './helpers/fakeFacts.js';
import { parseFixture } from './helpers/parseFixture.js';
import { SPYRO_TEXTS } from './helpers/spyro.js';

const ZELDA_VOCAB = `namespace Zelda

/-- heroes -/
axiom Hero : Type
/-- there is at least one hero -/
axiom Hero.exists : Nonempty Hero
instance : Nonempty Hero := Hero.exists
/-- is brave -/
axiom Brave : Hero → Prop
/-- Link -/
noncomputable opaque link : Hero

end Zelda
`;

const ZELDA_MAIN = `import Model.Zelda.Vocabulary

namespace Zelda

/-
@@ telelean v1
id: link-brave
type: ASSUMPTION
natural_name: Link is brave
rationale: he fights Ganon
lean: Zelda.link_brave
-/
abbrev link_brave : Prop := Brave link
theorem link_brave.holds : link_brave := sorry

/-
@@ telelean v1
type: GOAL
natural_name: Cynder dark past
premises: cynder-dark-past
-/

/-
@@ telelean v1
id: new-spyro-pg
type: ASSUMPTION
natural_name: Same id as a Spyro card
rationale: copied
-/

end Zelda
`;

const ROOT = `import Model.Spyro.Main
import Model.Zelda.Main

/-
@@ telelean v1
id: stray
type: GOAL
natural_name: A card in the library root
-/
`;

function twoSubjects(messages: LeanMessageFact[] = []) {
  const files = [
    parseFixture('Model.lean', ROOT),
    parseFixture('Model/Spyro/Main.lean', SPYRO_TEXTS.main),
    parseFixture('Model/Spyro/Vocabulary.lean', SPYRO_TEXTS.vocabulary),
    parseFixture('Model/Zelda/Main.lean', ZELDA_MAIN),
    parseFixture('Model/Zelda/Vocabulary.lean', ZELDA_VOCAB),
  ];
  const facts = fakeFacts(files, { messages });
  return buildProjectModel({ files, fileHashes: freshHashes(files), facts, library: 'Model' });
}

describe('AT2.9 two subjects', () => {
  const model = twoSubjects();

  it('lists both subjects with their files and node counts', () => {
    expect(model.subjects).toEqual([
      { name: 'Spyro', nodeCount: 4, files: ['Model/Spyro/Main.lean', 'Model/Spyro/Vocabulary.lean'] },
      { name: 'Zelda', nodeCount: 2, files: ['Model/Zelda/Main.lean', 'Model/Zelda/Vocabulary.lean'] },
    ]);
  });

  it('cuts separate subject graphs (nodes, vocabulary, edges)', () => {
    const spyro = subjectGraph(model, 'Spyro', { version: 3, semantic: SPYRO_SEMANTIC });
    const zelda = subjectGraph(model, 'Zelda', { version: 4, semantic: SPYRO_SEMANTIC });
    expect(spyro.nodes.map((n) => n.id)).toEqual(spyroGraph().nodes.map((n) => n.id));
    expect(zelda.nodes.map((n) => n.id)).toEqual(['link-brave', 'cynder-dark-past-2']);
    expect(spyro.vocabulary.every((v) => v.subject === 'Spyro')).toBe(true);
    expect(zelda.vocabulary.map((v) => v.name)).toEqual(['Zelda.Hero', 'Zelda.Brave', 'Zelda.link', 'Zelda.Hero.exists']);
    expect(zelda.vocabulary.find((v) => v.name === 'Zelda.Hero')?.shortName).toBe('Hero');
    // The cross-subject premise is reported, but no edge leaves the subject.
    expect(zelda.edges).toEqual([]);
    expect(spyro.edges).toHaveLength(3);
    expect(subjectGraph(model, 'Nope', { version: 5, semantic: SPYRO_SEMANTIC }).nodes).toEqual([]);
  });

  it('a duplicate written id is TL006 (the first file in path order keeps it); a derived-id collision is suffixed silently', () => {
    const dup = model.diagnostics.filter((d) => d.code === 'TL006');
    expect(dup).toMatchObject([{ file: 'Model/Zelda/Main.lean', severity: 'error' }]);
    expect(model.nodes.get('new-spyro-pg')?.file).toBe('Model/Spyro/Main.lean');
    expect(model.nodes.get('cynder-dark-past-2')?.node.naturalName).toBe('Cynder dark past');
    expect(model.nodes.get('cynder-dark-past')?.file).toBe('Model/Spyro/Main.lean');
    expect(model.diagnostics.filter((d) => d.code === 'TL006')).toHaveLength(1);
  });

  it('a premise in another subject is TL121; a block outside every subject is TL120', () => {
    expect(model.diagnostics.find((d) => d.code === 'TL121')).toMatchObject({ nodeId: 'cynder-dark-past-2', file: 'Model/Zelda/Main.lean' });
    expect(model.diagnostics.find((d) => d.code === 'TL120')).toMatchObject({ file: 'Model.lean', severity: 'warning' });
    expect(model.nodes.has('stray')).toBe(false);
  });

  it('orders a subject\'s nodes by its layout first, then file order', () => {
    const current = orderByLayout(subjectGraph(model, 'Spyro', { version: 1, semantic: SPYRO_SEMANTIC }).nodes);
    const layout = moveInLayout(emptyLayout(), current, 'new-spyro-pg', 'ASSUMPTION', 'pg-no-dark-past');
    const graph = subjectGraph(model, 'Spyro', { version: 1, semantic: SPYRO_SEMANTIC, layout });
    expect(graph.nodes.map((n) => n.id)).toEqual(['new-spyro-pg', 'pg-no-dark-past', 'cynder-dark-past', 'cynder-not-good']);
  });
});

describe('AT2.12 diagnostics', () => {
  it('LEAN messages get their node by containment and their severity from Lean; vocabulary messages name the item', () => {
    const zeldaMainLines = ZELDA_MAIN.split('\n');
    const sorryLine = zeldaMainLines.findIndex((l) => l.startsWith('theorem link_brave.holds'));
    const vocabLine = SPYRO_TEXTS.vocabulary.split('\n').findIndex((l) => l.startsWith('axiom HasDarkPast'));
    const model = twoSubjects([
      { severity: 'warning', file: 'Model/Zelda/Main.lean', module: 'Model.Zelda.Main', range: { start: { line: sorryLine, character: 8 }, end: { line: sorryLine, character: 8 } }, text: "declaration uses 'sorry'" },
      { severity: 'information', file: 'Model/Spyro/Vocabulary.lean', module: 'Model.Spyro.Vocabulary', range: { start: { line: vocabLine, character: 6 }, end: { line: vocabLine, character: 6 } }, text: 'a note\n  with a continuation line' },
    ]);
    const lean = model.diagnostics.filter((d) => d.code === 'LEAN');
    expect(lean).toEqual([
      { code: 'LEAN', severity: 'info', message: 'a note\n  with a continuation line', file: 'Model/Spyro/Vocabulary.lean', range: { start: { line: vocabLine, character: 6 }, end: { line: vocabLine, character: 6 } }, vocab: 'Spyro.HasDarkPast' },
      { code: 'LEAN', severity: 'warning', message: "declaration uses 'sorry'", file: 'Model/Zelda/Main.lean', range: { start: { line: sorryLine, character: 8 }, end: { line: sorryLine, character: 8 } }, nodeId: 'link-brave' },
    ]);
    // A warning does not make the node ill-formed (an error would).
    expect(model.nodes.get('link-brave')?.node.status.formal).toBe('formalized');
    expect(model.nodes.get('link-brave')?.node.status.flags).toContain('uses-sorry');
  });

  it('markup diagnostics carry the (workspace-resolved) node id', () => {
    const files = [parseFixture('Model/Zelda/Main.lean', ZELDA_MAIN), parseFixture('Model/Zelda/Vocabulary.lean', ZELDA_VOCAB), parseFixture('Model/Spyro/Main.lean', SPYRO_TEXTS.main), parseFixture('Model/Spyro/Vocabulary.lean', SPYRO_TEXTS.vocabulary)];
    const zelda = files[0];
    if (!zelda) throw new Error('fixture');
    const derived = zelda.blocks[1];
    if (!derived) throw new Error('fixture');
    zelda.diagnostics.push({ code: 'TL112', severity: 'info', message: 'block without id', span: derived.markerSpan, range: derived.range, nodeId: derived.id });
    const model = buildProjectModel({ files, fileHashes: freshHashes(files), facts: fakeFacts(files), library: 'Model' });
    expect(model.diagnostics.find((d) => d.code === 'TL112')).toMatchObject({ nodeId: 'cynder-dark-past-2', file: 'Model/Zelda/Main.lean', severity: 'info' });
  });

  it('a subject graph carries its own diagnostics (and project-level ones), never another subject\'s', () => {
    const model = twoSubjects();
    const spyro = subjectGraph(model, 'Spyro', { version: 1, semantic: SPYRO_SEMANTIC });
    const zelda = subjectGraph(model, 'Zelda', { version: 1, semantic: SPYRO_SEMANTIC });
    expect(spyro.diagnostics.map((d) => d.code).sort()).toEqual(['TL011', 'TL120']);
    expect(zelda.diagnostics.map((d) => d.code).sort()).toEqual(['TL006', 'TL115', 'TL120', 'TL121']);
    expect(spyro.diagnostics.every((d) => d.file !== 'Model/Zelda/Main.lean')).toBe(true);
  });
});

describe('D-10 cross-subject vocabulary (explicit import)', () => {
  const OTHER_MAIN = `import Model.Zelda.Vocabulary

namespace Other

/-
@@ telelean v1
id: other-brave
type: GOAL
natural_name: Link is brave, seen from another subject
lean: Other.other_brave
-/
/-- Link is brave, seen from another subject -/
abbrev other_brave : Prop := Zelda.Brave Zelda.link

end Other
`;
  const texts = { 'Model/Zelda/Vocabulary.lean': ZELDA_VOCAB, 'Model/Other/Main.lean': OTHER_MAIN };
  const files = Object.entries(texts).map(([path, text]) => parseFixture(path, text));
  const model = buildProjectModel({ files, fileHashes: freshHashes(files), facts: fakeFacts(files), library: 'Model' });

  it("a card's uses and refs name the other subject's items, and that board lists them (read-only, full names) so glosses resolve", () => {
    const graph = subjectGraph(model, 'Other', { version: 1, semantic: SPYRO_SEMANTIC });
    const card = graph.nodes.find((n) => n.id === 'other-brave');
    expect(card?.lean.uses).toEqual(['Zelda.Brave', 'Zelda.link']);
    const byName = new Map(graph.vocabulary.map((v) => [v.name, v]));
    for (const ref of card?.lean.refs ?? []) if (!ref.nodeId) expect(byName.get(ref.name)?.gloss, ref.name).toBeDefined();
    expect(byName.get('Zelda.Brave')).toMatchObject({ subject: 'Zelda', shortName: 'Zelda.Brave', gloss: 'is brave', usedBy: ['other-brave'] });
    expect(byName.get('Zelda.link')).toMatchObject({ subject: 'Zelda', shortName: 'Zelda.link', usedBy: ['other-brave'] });
    // The presupposition behind `link` and its sort come along (the tray chip reads the sort's gloss).
    expect(card?.lean.presupposes).toEqual(['Zelda.Hero.exists']);
    expect([...byName.keys()]).toEqual(expect.arrayContaining(['Zelda.Hero.exists', 'Zelda.Hero']));
  });

  it("the other subject's own board keeps its items with short names and its own users only", () => {
    const zelda = subjectGraph(model, 'Zelda', { version: 1, semantic: SPYRO_SEMANTIC });
    expect(zelda.vocabulary.find((v) => v.name === 'Zelda.Brave')).toMatchObject({ shortName: 'Brave', usedBy: [] });
    expect(zelda.vocabulary.every((v) => v.subject === 'Zelda')).toBe(true);
  });
});
