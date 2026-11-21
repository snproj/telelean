/**
 * Slice 2c1 (docs/slice2-plan.md sections 2.9 and 4.7; D2-61, AF6): the RV-6 base mask. While the results of a stage are
 * hidden, the Proposed view shows every proof-derived datum as in B, the session's base, with statements and vocabulary
 * from the working copy:
 *  - `baseMask` reads it off B and the ledger (telelean's own record): each target's `.holds` as in B (B's text, or
 *    absent), every proof-phase declaration, Claude's arrows, and the written premise cards with their arrows and mark
 *    removals;
 *  - `maskFacts` masks the working copy's facts field by field: the left-out names and their messages go; a target's
 *    `.holds` takes B's DeclFacts, with B's messages for it placed at the start of the working copy's declaration; every
 *    other declaration B has with the same text keeps the working copy's DeclFacts, positions included, with only
 *    `axioms` and `usesSorry` from B, and B's messages for it moved by the line offset; the rest keeps the working copy's;
 *    every other message is dropped; the module entries stay the working copy's, so no file reads stale;
 *  - `projectMaskOf` turns it into the build's `ProjectMask` (`codeOverride` with B's text, range and keyword, and the
 *    text B's card code had between the statement and the `.holds`; B's layout of every other card B has; the comment
 *    and enclosing lines that go with a left-out declaration), and `maskedModel` builds the masked project: the working
 *    copy's texts and positions, so the build places refs, messages and anonymous instances as it does for the working
 *    copy, each block bound as the parser reads the file without what is left out, and nothing hidden reaches a graph.
 * Pure TypeScript: no Node or vscode APIs (the webview bundles core).
 */
import { ActionError, type ArrowEnds } from '../actions.js';
import { holdsName, type DeclFacts, type LeanFacts, type LeanMessageFact } from '../facts.js';
import { declTables, factsOf, type DeclEntry, type DeclTables } from '../gate/decls.js';
import type { Position, Range } from '../model.js';
import { moduleOfPath } from '../paths.js';
import { codeJoint } from '../project/build.js';
import { buildProjectModel } from '../project/index.js';
import { rangeContains } from '../project/text.js';
import type { ModelNode, ProjectInput, ProjectMask, ProjectModel } from '../project/types.js';
import type { Span } from '../markup/types.js';
import { compareTexts } from './items.js';
import type { BaseMask, LedgerEntry, SessionInference } from './types.js';

/** A record without a prototype, so no card id or name is read as one of Object's own keys (`__proto__`, …). */
const record = <T>(): Record<string, T> => Object.create(null) as Record<string, T>;

const own = <T>(map: Readonly<Record<string, T>>, key: string): T | undefined => (Object.prototype.hasOwnProperty.call(map, key) ? map[key] : undefined);

/**
 * §4.7 (2c1): the base mask, read off B and the ledger. `holds`: each target's `.holds` as B has it (B's declaration
 * text), or `absent` when B has none. `drop`: the names whose first ledger `created` entry is a proof phase's, but a name
 * B has (the ledger cannot have created it). `dropArrows`: every ledger `arrow` entry but one B draws. `dropNodes`: the
 * cards of the ledger's `premise` entries that B lacks. `restoreMarks`: the cards a `mark-removed` entry names that B
 * marked "follows from nothing". Each list sorted, without duplicates.
 */
export function baseMask(i: { base: ProjectModel; inferences: readonly SessionInference[]; ledger: readonly LedgerEntry[] }): BaseMask {
  const B = declTables(i.base);
  const holds = record<BaseMask['holds'][string]>();
  for (const inference of i.inferences) {
    const statement = i.base.nodes.get(inference.target)?.node.lean.statement;
    const name = statement !== undefined ? holdsName(statement) : undefined;
    const entry = name !== undefined ? B.byName.get(name) : undefined;
    holds[inference.target] = name !== undefined && entry !== undefined ? { kind: 'base', name, text: entry.text } : { kind: 'absent' };
  }
  const phase = new Map<string, 'statements' | 'proof'>();
  for (const e of i.ledger) if (e.kind === 'created' && !phase.has(e.name)) phase.set(e.name, e.phase);
  const inB = (name: string) => B.byName.has(name) || i.base.declFacts.has(name);
  const drop = [...phase].filter(([name, p]) => p === 'proof' && !inB(name)).map(([name]) => name);
  const arrows = new Map<string, ArrowEnds>();
  for (const e of i.ledger) {
    if (e.kind !== 'arrow' || (i.base.nodes.get(e.target)?.node.premises.includes(e.source) ?? false)) continue;
    arrows.set(JSON.stringify([e.target, e.source]), { source: e.source, target: e.target });
  }
  const dropNodes = new Set<string>();
  const restoreMarks = new Set<string>();
  for (const e of i.ledger) {
    if (e.kind === 'premise' && !i.base.nodes.has(e.card)) dropNodes.add(e.card);
    if (e.kind === 'mark-removed' && i.base.nodes.get(e.card)?.node.fromNothing === true) restoreMarks.add(e.card);
  }
  const sorted = (names: Iterable<string>) => [...new Set(names)].sort();
  return {
    holds,
    drop: sorted(drop),
    dropArrows: [...arrows.values()].sort((a, b) => (a.target < b.target ? -1 : a.target > b.target ? 1 : a.source < b.source ? -1 : a.source > b.source ? 1 : 0)),
    dropNodes: sorted(dropNodes),
    restoreMarks: sorted(restoreMarks),
  };
}

/** What the mask leaves out of the working copy, by name, and the targets' `.holds` that take B's (`base`). */
interface Masked {
  /** Proof-phase declarations no card of the working copy binds, and the declarations of the written premise cards. */
  drop: Set<string>;
  /** The working copy's `.holds` of targets B had none for (or under another name than B's). */
  absent: Set<string>;
  /** By name: the `.holds` B has, with B's declaration. */
  overrides: Map<string, DeclEntry>;
  /** By the name of such a `.holds`: its target's statement in the working copy, where B's messages for it go. */
  anchors: Map<string, string>;
}

function maskedNames(current: ProjectModel, base: ProjectModel, mask: BaseMask): Masked {
  const B = declTables(base);
  const dropped = new Set(mask.dropNodes);
  // A proof-phase declaration that a card of the working copy binds (its statement, an AXIOM card's `.holds`, a pin) is
  // that card's visible content, as computeItems owns it (`card:<c>`): a step that formalised statements and ended
  // without a freeze records them as `proof` (D2-43), and the other outcome freezes them (fixer 2c1 r1, A-ADV-1). A
  // target's `.holds` stays covered by `holds` below.
  const drop = new Set<string>();
  for (const name of mask.drop) if (!current.ownerOfDecl.has(name)) drop.add(name);
  // A written premise card's declarations: what it owns (its statement, its `.holds`, any other pinned name).
  for (const [name, owner] of current.ownerOfDecl) if (dropped.has(owner)) drop.add(name);
  const absent = new Set<string>();
  const overrides = new Map<string, DeclEntry>();
  const anchors = new Map<string, string>();
  for (const target of Object.keys(mask.holds)) {
    const holds = own(mask.holds, target);
    const statement = current.nodes.get(target)?.node.lean.statement;
    const now = statement !== undefined ? holdsName(statement) : undefined;
    if (holds?.kind === 'base') {
      const entry = B.byName.get(holds.name);
      if (entry !== undefined) overrides.set(holds.name, entry);
      if (statement !== undefined) anchors.set(holds.name, statement);
      if (now !== undefined && now !== holds.name) absent.add(now);
    } else if (now !== undefined) absent.add(now);
  }
  for (const name of overrides.keys()) {
    drop.delete(name);
    absent.delete(name);
  }
  return { drop, absent, overrides, anchors };
}

/** Every syntactic declaration of a model (named ones and anonymous instances), each file's sorted by position. */
function declsByFile(tables: DeclTables): Map<string, DeclEntry[]> {
  const out = new Map<string, DeclEntry[]>();
  for (const entry of tables.byName.values()) {
    const list = out.get(entry.file.path);
    if (list === undefined) out.set(entry.file.path, [entry]);
    else list.push(entry);
  }
  for (const list of out.values()) list.sort((a, b) => a.decl.span.start - b.decl.span.start);
  return out;
}

/** The declaration of `file` whose range holds `at`, if any. */
function declAt(byFile: ReadonlyMap<string, readonly DeclEntry[]>, file: string, at: Position): DeclEntry | undefined {
  return byFile.get(file)?.find((entry) => rangeContains(entry.decl.range, at));
}

/** A position moved from a declaration that starts at `from` to the same place of one that starts at `to`. */
function moved(p: Position, from: Position, to: Position): Position {
  return { line: p.line - from.line + to.line, character: p.line === from.line ? p.character - from.character + to.character : p.character };
}

/**
 * §4.7 (2c1, AF6): the working copy's facts under the mask, field by field (§2.9). `current` must have facts (the
 * stage judgement's, `judged-facts.json`): `maskedModel` builds without facts when it has none. A name only Lean reports
 * (a field, a constructor) goes with its parent: the facts' `parent`, else the declaration whose range holds it, else the
 * longest name prefix that is a declaration, as computeItems reads it. A target's `.holds` keeps B's DeclFacts as B has
 * them, positions included (the build places its refs against B's range, `codeOverride`), in the working copy's file;
 * B's messages for it go to the start of the target's statement in the working copy (fixer 2c1 r1, S-V2C1-S4). The
 * decls keep the working copy's order; `check.probed` counts the masked ones; no `detail` stays (A-ADV-6).
 */
export function maskFacts(i: { current: ProjectModel; base: ProjectModel; mask: BaseMask }): LeanFacts {
  const facts = i.current.facts;
  if (facts === undefined) throw new ActionError('invalid', 'The base mask needs the facts of the state it masks; build that state without facts instead.');
  const { drop, absent, overrides, anchors } = maskedNames(i.current, i.base, i.mask);
  const W = declTables(i.current);
  const B = declTables(i.base);
  const wByFile = declsByFile(W);
  const bByFile = declsByFile(B);
  const hidden = (name: string) => drop.has(name) || absent.has(name);
  /** W's declaration of a W DeclFacts: by name in its file, or an anonymous instance by its file and start line. */
  const entryOf = (f: DeclFacts): DeclEntry | undefined => {
    const named = W.byName.get(f.name);
    if (named !== undefined && named.file.path === f.file) return named;
    return wByFile.get(f.file)?.find((e) => e.decl.fullName === undefined && e.decl.keyword === 'instance' && e.decl.range.start.line === f.range.start.line);
  };
  /** The declaration a facts-only name goes with (computeItems' rule). */
  const parentOf = (f: DeclFacts): string | undefined => {
    if (f.parent !== undefined) return f.parent;
    const around = declAt(wByFile, f.file, f.range.start);
    if (around !== undefined) return around.name;
    let best: string | undefined;
    for (const name of W.byName.keys()) if (f.name.startsWith(`${name}.`) && (best === undefined || name.length > best.length)) best = name;
    return best;
  };
  /** A name B has with the same text in the working copy (and not left out): its proof-derived facts are B's. */
  const sameText = (entry: DeclEntry | undefined): DeclEntry | undefined => {
    if (entry === undefined || hidden(entry.name) || overrides.has(entry.name)) return undefined;
    const before = B.byName.get(entry.name);
    return before !== undefined && before.text === entry.text ? before : undefined;
  };
  const withBaseProof = (f: DeclFacts, b: DeclFacts | undefined): DeclFacts => {
    const { axioms: _axioms, usesSorry: _usesSorry, ...rest } = f;
    void _axioms;
    void _usesSorry;
    return { ...rest, ...(b?.axioms !== undefined ? { axioms: [...b.axioms] } : {}), ...(b?.usesSorry !== undefined ? { usesSorry: b.usesSorry } : {}) };
  };
  const baseFactsOf = (name: string, entry: DeclEntry | undefined) => factsOf(i.base, name, entry);
  /** B's DeclFacts of a target's `.holds`, in the working copy's file (the build matches facts to declarations by file). */
  const overridden = (name: string): DeclFacts | undefined => {
    const b = baseFactsOf(name, overrides.get(name));
    const now = W.byName.get(name);
    if (b === undefined) return undefined;
    return now !== undefined ? { ...b, file: now.file.path, module: moduleOfPath(now.file.path) ?? b.module } : { ...b };
  };

  const decls: DeclFacts[] = [];
  const emitted = new Set<string>();
  for (const f of facts.decls) {
    const entry = entryOf(f);
    const owner = entry?.name ?? parentOf(f) ?? f.name;
    if (hidden(f.name) || hidden(owner)) continue;
    if (overrides.has(f.name)) {
      const b = overridden(f.name);
      if (b !== undefined && !emitted.has(f.name)) decls.push(b);
      emitted.add(f.name);
      continue;
    }
    if (overrides.has(owner)) continue;
    const same = sameText(entry ?? W.byName.get(owner));
    if (same !== undefined) {
      decls.push(withBaseProof(f, entry !== undefined ? baseFactsOf(entry.name, same) : i.base.declFacts.get(f.name)));
      continue;
    }
    decls.push(f);
  }
  // A target's `.holds` the working copy has with no facts of its own still shows B's proof.
  for (const name of [...overrides.keys()].sort()) {
    if (emitted.has(name)) continue;
    const b = overridden(name);
    if (b !== undefined) decls.push(b);
  }

  const messages: LeanMessageFact[] = [];
  for (const m of facts.build.messages) {
    if (m.file === undefined || m.range === undefined) continue;
    const entry = declAt(wByFile, m.file, m.range.start);
    if (entry === undefined || hidden(entry.name) || overrides.has(entry.name) || sameText(entry) !== undefined) continue;
    messages.push(m);
  }
  for (const m of i.base.facts?.build.messages ?? []) {
    if (m.file === undefined || m.range === undefined) continue;
    const before = declAt(bByFile, m.file, m.range.start);
    if (before === undefined) continue;
    const now = W.byName.get(before.name);
    if (now === undefined) continue;
    const at = (entry: DeclEntry) => ({ file: entry.file.path, ...(moduleOfPath(entry.file.path) !== undefined ? { module: moduleOfPath(entry.file.path) as string } : {}) });
    if (overrides.has(before.name)) {
      // Placed at the start of the target's statement in the working copy, so it attaches to the same card wherever the
      // step put the `.holds`, and keeps its place among the other diagnostics (fixer 2c1 r1, S-V2C1-S4).
      const anchor = W.byName.get(anchors.get(before.name) ?? '') ?? now;
      const start = anchor.decl.range.start;
      messages.push({ ...withoutPlace(m), ...at(anchor), range: { start, end: start } });
    } else if (sameText(now) !== undefined) {
      const from = before.decl.range.start;
      const to = now.decl.range.start;
      const range: Range = { start: moved(m.range.start, from, to), end: moved(m.range.end, from, to) };
      messages.push({ ...withoutPlace(m), ...at(now), range });
    }
  }

  // The working copy's envelope, without any `detail`: Lean's own words (a failed probe's first error, a failed build's
  // or check's) can quote hidden proof material (fixer 2c1 r1, A-ADV-6; §4.7's last residual).
  const { detail: _detail, probe, ...envelope } = facts;
  void _detail;
  return {
    ...envelope,
    build: withoutDetail({ ...facts.build, messages }),
    check: withoutDetail({ ...facts.check, probed: decls.length }),
    ...(probe !== undefined ? { probe: withoutDetail(probe) } : {}),
    decls,
  };
}

/** A part of the facts without its `detail`. */
function withoutDetail<T extends { detail?: string }>(part: T): T {
  const { detail: _detail, ...rest } = part;
  void _detail;
  return rest as T;
}

/** A message without its file, module and range (they are set again). */
function withoutPlace(m: LeanMessageFact): LeanMessageFact {
  const { file: _file, module: _module, range: _range, ...rest } = m;
  void _file;
  void _module;
  void _range;
  return rest;
}

/**
 * The build's form of a base mask (`ProjectMask`, project/types.ts): the names left out (`drop`: proof-phase
 * declarations no card binds and the written premise cards' declarations; `absent`: the working copy's `.holds` of
 * targets B had none for), a `codeOverride` for each target's `.holds` B has that the working copy declares (B's text,
 * range and keyword, and the text B had between the card's statement and it when B's code held both as one stretch),
 * `codeLayout` (B's layout of every other card whose statement and `.holds` have B's texts), the `lines` that go with a
 * left-out declaration (its attached comments and enclosing lines, `compareTexts`), Claude's arrows, the written premise
 * cards, the marks to restore, and `derivedIds`: a card whose `id:` line telelean wrote back over B's derived id while
 * its `lean:` pins stayed B's, with that id (only a hidden write, current or taken out, writes such an id).
 */
export function projectMaskOf(i: { current: ProjectModel; base: ProjectModel; mask: BaseMask }): ProjectMask {
  const { drop, absent, overrides } = maskedNames(i.current, i.base, i.mask);
  const W = declTables(i.current);
  const B = declTables(i.base);
  /** B's text between a B card's statement and its `.holds` when B's code held both as one stretch. */
  const jointOf = (node: ModelNode | undefined): string | undefined => {
    const statement = node?.statementDecl;
    const holds = node?.holdsDecl;
    const statementFile = statement !== undefined ? i.base.files.get(statement.file) : undefined;
    const holdsFile = holds !== undefined ? i.base.files.get(holds.file) : undefined;
    return statement !== undefined && holds !== undefined && statementFile !== undefined && holdsFile !== undefined
      ? codeJoint({ file: statementFile, decl: statement.decl }, { file: holdsFile, decl: holds.decl })
      : undefined;
  };
  const codeOverride = record<ProjectMask['codeOverride'][string]>();
  for (const [name, entry] of [...overrides].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (!W.byName.has(name)) continue;
    const card = i.base.ownerOfDecl.get(name);
    const joined = jointOf(card !== undefined ? i.base.nodes.get(card) : undefined);
    codeOverride[name] = { text: entry.text, range: entry.decl.range, keyword: entry.decl.keyword, ...(joined !== undefined ? { joined } : {}) };
  }
  // B's layout of every other card the working copy has with B's statement and `.holds` (fixer 2c1 r1, C-V2C1-C3).
  const left = (name: string) => drop.has(name) || absent.has(name) || overrides.has(name);
  const sameText = (name: string) => W.byName.get(name)?.text !== undefined && W.byName.get(name)?.text === B.byName.get(name)?.text;
  const codeLayout = record<ProjectMask['codeLayout'][string]>();
  for (const [id, now] of [...i.current.nodes].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const before = i.base.nodes.get(id);
    const statement = now.node.lean.statement;
    if (before === undefined || statement === undefined || before.node.lean.statement !== statement) continue;
    const holds = holdsName(statement);
    if (left(statement) || left(holds) || now.holdsDecl === undefined || before.holdsDecl === undefined || before.statementDecl === undefined) continue;
    if (!sameText(statement) || !sameText(holds)) continue;
    const joined = jointOf(before);
    codeLayout[holds] = joined !== undefined ? { joined } : {};
  }
  // The lines that go with a left-out declaration, or with a target's `.holds` whose card shows B's (a proof's comment
  // goes with the Result): its attached comments, and enclosing lines around such declarations only.
  const leftOut = (name: string) => drop.has(name) || absent.has(name) || overrides.has(name);
  const lines = record<Span[]>();
  for (const file of compareTexts(i.base, i.current).files) {
    for (const unit of file.added) {
      if (unit.kind !== 'line') continue;
      const attached = unit.attachedTo !== undefined && leftOut(unit.attachedTo);
      const encloses = unit.enclosing === true && (unit.encloses ?? []).length > 0 && (unit.encloses ?? []).every(leftOut);
      if (attached || encloses) (lines[file.path] ??= []).push({ start: unit.span.start, end: unit.span.end });
    }
  }
  const derivedIds = record<string>();
  for (const [id, entry] of [...i.current.nodes].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const now = entry.block;
    const before = i.base.nodes.get(id)?.block;
    if (before === undefined || before.idWritten || !now.idWritten) continue;
    const pins = (blockLines: typeof now.lines) => blockLines.filter((l) => l.key === 'lean').map((l) => l.raw.trim());
    if (JSON.stringify(pins(now.lines)) !== JSON.stringify(pins(before.lines))) continue;
    derivedIds[now.id] = before.id;
  }
  return {
    absent: [...absent].sort(),
    codeOverride,
    codeLayout,
    lines,
    drop: [...drop].sort(),
    dropArrows: i.mask.dropArrows.map((a) => ({ source: a.source, target: a.target })),
    dropNodes: [...i.mask.dropNodes],
    restoreMarks: [...i.mask.restoreMarks],
    derivedIds,
  };
}

/**
 * The masked project (§4.7, D2-61): the working copy's files under `projectMaskOf`, with `maskFacts`' facts (none when
 * the working copy has none). Freshness is the working copy's: a file fresh there is fresh here, and every other file
 * keeps the state its module gives it. A file B lacks whose every declaration the mask leaves out, with no block, is left
 * out whole (a new module of proof material only). `endorsements` and `lakefile` (fixer 2c1 r1, S-V2C1-S6): the
 * working copy's build inputs a ProjectModel does not keep, passed through, so the masked board flags what the working
 * copy's flags. 2c2's `buildSessionView` builds the hidden view's graph from it.
 */
export function maskedModel(i: {
  current: ProjectModel;
  base: ProjectModel;
  mask: BaseMask;
  endorsements?: ProjectInput['endorsements'];
  lakefile?: ProjectInput['lakefile'];
}): ProjectModel {
  const mask = projectMaskOf(i);
  const left = new Set([...mask.drop, ...mask.absent]);
  const byFile = declsByFile(declTables(i.current));
  const files = [...i.current.files.values()].filter((file) => {
    if (i.base.files.has(file.path) || file.blocks.length > 0) return true;
    const decls = byFile.get(file.path) ?? [];
    return decls.length === 0 || !decls.every((e) => left.has(e.name));
  });
  const facts = i.current.facts !== undefined ? maskFacts(i) : undefined;
  const modules = new Map((i.current.facts?.modules ?? []).map((m) => [m.file, m.sourceSha256]));
  const fileHashes: Record<string, string> = {};
  for (const file of files) {
    const hash = modules.get(file.path) ?? '';
    fileHashes[file.path] = i.current.freshFiles.has(file.path) ? hash : `${hash}~not-fresh`;
  }
  return buildProjectModel({
    files,
    fileHashes,
    ...(facts !== undefined ? { facts } : {}),
    library: i.current.library,
    ...(i.endorsements !== undefined ? { endorsements: i.endorsements } : {}),
    ...(i.lakefile !== undefined ? { lakefile: i.lakefile } : {}),
    mask,
  });
}
