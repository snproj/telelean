/**
 * Slice 2b2 (docs/slice2-plan.md section 4.11): taking content out. `planItemRevert` restores B's version of each
 * item's content, from the items' drafts on the current state (their `provides`), as whole-file changes of `current`,
 * with core's markup primitives (`EditSession`) and the LeanOp `replace-decl`, which puts back B's text of a
 * declaration:
 *  - a card's statement (Formalize, Change): B's statement, or none (the card is code-less again, its pin and docstring
 *    mirror removed), with an AXIOM's `.holds`: every declaration the item provides goes, or gets B's text back, and
 *    the card's `lean:` line and binding are B's again;
 *  - a Result: T.holds as in B (a theorem, a pending axiom, or none), with its proof material removed;
 *  - an arrow: its source leaves the target's `premises:`; the line goes when it is empty;
 *  - a written premise: its block, statement, `.holds` and arrow are removed, and the mark it removed comes back (ledger
 *    `mark-removed` for its key) when no arrow into the card stays (fixer 2b2 r1: another written premise's arrow keeps
 *    it removed, TL023); a completion it made (ledger `completion` for its key) goes with it: T.holds as in B, the only
 *    text it can have had before (AF2), while T.holds still rests on the premise (fixer 2b2 r1: a later step's rework
 *    without it is its Result's). A premise draft that is not written is outside ws/: nothing to do;
 *  - vocabulary and declarations: removed; an existing one gets B's text back;
 *  - a declaration B has that the current text moved (a step may move the target's `.holds` its scope opens) or lacks:
 *    it goes from where it is, and B's text goes back in B's place, next to the nearest unit around it that stayed in
 *    place (fixer 2b2 r1, `baseDeclPlace`); several that go back next to the same unit go in B's order, each right
 *    after the one before it (fixer 2b2 r2, R1-2);
 *  - the comment lines `compareTexts` attaches to a declaration that goes or gets B's text back go with it (fixer 2a1's
 *    hand-off: a leftover would join a neighbouring item, or be unowned);
 *  - enclosing lines (`namespace`/`section`/`mutual` and `end`) go with the last declaration they enclose, whichever
 *    item it belongs to: when every declaration they enclose goes (§4.2).
 * Add, Delete, Remove arrow and Proof broken items, which no slice-2 step can make, are refused (`invalid`).
 *
 * The result is checked before it is returned, fail closed (`unsafe`): every declaration that goes is gone, every one
 * put back has exactly B's text (and, put back in its place, stands there, with nothing else moved), every premise
 * card that goes is gone, every reverted card is bound as in B, no card it edits both follows from nothing and has
 * arrows, and no other card's binding changed (EditSession). Reverting an item that is the only difference from B
 * gives B's text back, so a decision commit's inverse patch re-applies it (§3.6's un-reject).
 *
 * Pure TypeScript: no Node or vscode APIs (the webview bundles core).
 */
import { ActionError, type FileChange } from '../actions.js';
import { holdsName } from '../facts.js';
import { EditSession } from '../edit/session.js';
import { declTables, type DeclEntry, type DeclTables } from '../gate/decls.js';
import { deletionEdit } from '../markup/edits.js';
import { parseLeanFile } from '../markup/parser.js';
import { Lines } from '../markup/text.js';
import type { LeanOp, MarkupBlock, Span, TextEdit } from '../markup/types.js';
import { splitList } from '../markup/values.js';
import { buildProjectModel } from '../project/index.js';
import { hasToken } from '../project/text.js';
import type { ProjectModel } from '../project/types.js';
import { anonymousInstanceName } from '../project/vocabulary.js';
import { reach } from './closure.js';
import { baseDeclPlace, compareTexts } from './items.js';
import { parseItemKey } from './keys.js';
import type { ItemDraft, LedgerEntry } from './types.js';

/** A list field's entries (the parser's split), across its lines. */
function entries(block: MarkupBlock, key: string): string[] {
  return block.lines.filter((line) => line.key === key).flatMap((line) => splitList(line.raw).items);
}

/** The multiset difference `a - b`. */
function minus(a: readonly string[], b: readonly string[]): string[] {
  const left = new Map<string, number>();
  for (const x of b) left.set(x, (left.get(x) ?? 0) + 1);
  const out: string[] = [];
  for (const x of a) {
    const n = left.get(x) ?? 0;
    if (n > 0) left.set(x, n - 1);
    else out.push(x);
  }
  return out;
}

const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, k) => x === b[k]);

/** What taking the items out does to ws/, collected before anything is written. */
interface Plan {
  /** Declarations of the current state's text that go (B lacks them). */
  remove: Set<string>;
  /**
   * Of those, the anonymous instances (no name the parser reads, so no LeanOp finds them): they go by their span, with
   * the lines that go with the content.
   */
  anonymous: Map<string, { path: string; span: Span }>;
  /** Declarations of the current state's text, in B's place, that get B's text back, by name. */
  restore: Map<string, string>;
  /**
   * Declarations B has that the current text moved or lacks (fixer 2b2 r1: a step may move what its scope opens, the
   * target's `.holds` under `openProof`): they go from where they are, and B's text goes back in B's place
   * (`baseDeclPlace`), by name.
   */
  back: Map<string, string>;
  /** Premise cards (new blocks) that go. */
  cards: Set<string>;
  /** Sources that leave each target card's `premises:`. */
  arrows: Map<string, string[]>;
  /** Cards whose `follows_from` mark the ledger says a premise taken out removed (B's comes back when no arrow stays). */
  marks: Set<string>;
  /** Cards whose statement goes back to B's: their `lean:` line and binding. */
  statements: Set<string>;
}

/**
 * §4.11 (2b2): B's version of the given items' content, as whole-file changes of `current`. `drafts`: the items'
 * drafts on `current` (their `provides`); `ledger`: a premise's completion and the mark it removed (AF2); the
 * enclosing lines' declarations come from `compareTexts` (AF8).
 */
export function planItemRevert(i: { base: ProjectModel; current: ProjectModel; drafts: readonly ItemDraft[]; ledger: readonly LedgerEntry[] }): FileChange[] {
  const { base, current } = i;
  const B = declTables(base);
  const W = declTables(current);
  const texts = compareTexts(base, current);
  const plan: Plan = {
    remove: new Set(),
    anonymous: new Map(),
    restore: new Map(),
    back: new Map(),
    cards: new Set(),
    arrows: new Map(),
    marks: new Set(),
    statements: new Set(),
  };

  /**
   * A declaration the item takes out: removed when B lacks it, else B's text back (B has it with another text), in B's
   * place when the current text moved it (fixer 2b2 r1, S-V2B2-S1, C-V2B2-C1, A-V2B2-ADV-2: the step limits let a step
   * move the target's `.holds` its scope opens, e.g. a pending claim's axiom proved below a later declaration).
   */
  const takeDecl = (name: string, key: string) => {
    const now = W.byName.get(name);
    // A name only Lean reports (a field, a constructor) goes with its parent.
    if (now === undefined) return;
    const before = B.byName.get(name);
    if (before === undefined) {
      plan.remove.add(name);
      if (now.decl.fullName === undefined) plan.anonymous.set(name, { path: now.file.path, span: now.decl.span });
      return;
    }
    if (texts.moved.has(name)) {
      if (now.decl.fullName === undefined || before.decl.fullName === undefined) {
        throw new ActionError('unsafe', `${name}, an instance without a name, moved since the session started, so “${key}” cannot be taken out mechanically: edit it by hand.`);
      }
      plan.back.set(name, before.text);
      return;
    }
    if (before.text === now.text) return;
    if (now.decl.fullName === undefined) throw new ActionError('unsafe', `${name}, an instance without a name, changed, so “${key}” cannot be taken out mechanically: edit it by hand.`);
    plan.restore.set(name, before.text);
  };
  /** A card's `.holds` as in B (T.holds of a Result, or under a completion): its statement's in either state. */
  const holdsAsInB = (card: string, key: string) => {
    const statements = [base.nodes.get(card)?.node.lean.statement, current.nodes.get(card)?.node.lean.statement].filter((s): s is string => s !== undefined);
    for (const statement of [...new Set(statements)]) {
      const holds = holdsName(statement);
      if (W.byName.has(holds)) takeDecl(holds, key);
      else {
        // B's text back in B's place (right after its statement, where B had it there).
        const before = B.byName.get(holds);
        if (before !== undefined) plan.back.set(holds, before.text);
      }
    }
  };
  /**
   * Whether the card's `.holds` in the current state still rests on what the premise draft `d` provides (fixer 2b2 r1,
   * A-V2B2-ADV-1): the completion the premise made, or a proof built on it, which cannot stand without it. A later step
   * that reworked T.holds without the premise made it its Result's own, which a premise's take-out leaves (its Result
   * is taken out only with the premise's dependents, RV-5). Read from its `uses` closure; without complete facts, from
   * its text, which names the premise's `.holds` (the completion's term does). A card with no `.holds` now: B's comes back.
   */
  const restsOnPremise = (card: string, d: ItemDraft): boolean => {
    const statement = current.nodes.get(card)?.node.lean.statement;
    const holds = statement !== undefined ? holdsName(statement) : undefined;
    const entry = holds !== undefined ? W.byName.get(holds) : undefined;
    if (holds === undefined || entry === undefined) return true;
    const own = d.provides.decls;
    const reached = reach(current, [holds], 'uses');
    if (reached.complete) return own.some((name) => reached.names.has(name));
    return own.some((name) => nameForms(name).some((form) => hasToken(entry.text, form)));
  };

  for (const d of i.drafts) {
    const parsed = parseItemKey(d.key);
    switch (d.kind) {
      case 'result': {
        for (const name of d.provides.decls) takeDecl(name, d.key);
        if (parsed?.kind === 'proof') holdsAsInB(parsed.node, d.key);
        break;
      }
      case 'formalize':
      case 'change': {
        const card = parsed?.kind === 'card' ? parsed.node : undefined;
        if (card === undefined) throw new ActionError('invalid', `“${d.key}” is no card's statement.`);
        for (const name of d.provides.decls) takeDecl(name, d.key);
        // A declaration bound to the card in B that the current state lacks would need a place: none in slice 2. A
        // proposition's `.holds` is its Result's, never its statement's (computeItems' rule).
        const axiomCard = (current.nodes.get(card) ?? base.nodes.get(card))?.node.type === 'AXIOM';
        const holds = new Set(
          [base.nodes.get(card)?.node.lean.statement, current.nodes.get(card)?.node.lean.statement].filter((s): s is string => s !== undefined).map(holdsName),
        );
        for (const [name, id] of base.ownerOfDecl) {
          if (id !== card || (!axiomCard && holds.has(name))) continue;
          if (!W.byName.has(name) && B.byName.has(name)) throw new ActionError('unsafe', `${name} was removed from “${card}”, so “${d.key}” cannot be taken out mechanically: edit it by hand.`);
        }
        plan.statements.add(card);
        break;
      }
      case 'add-arrow': {
        for (const arrow of d.provides.arrows) plan.arrows.set(arrow.target, [...(plan.arrows.get(arrow.target) ?? []), arrow.source]);
        break;
      }
      case 'add-premise': {
        // Not written: outside ws/ (§3.1), nothing to take out.
        if (d.provides.cards.length === 0 && d.provides.decls.length === 0 && d.provides.arrows.length === 0) break;
        for (const card of d.provides.cards) if (!base.nodes.has(card)) plan.cards.add(card);
        for (const name of d.provides.decls) takeDecl(name, d.key);
        for (const arrow of d.provides.arrows) plan.arrows.set(arrow.target, [...(plan.arrows.get(arrow.target) ?? []), arrow.source]);
        for (const e of i.ledger) {
          if (e.kind === 'mark-removed' && e.item === d.key) plan.marks.add(e.card);
          // The completion it made goes with it (AF2): T.holds as in B, while T.holds still rests on it (fixer 2b2 r1).
          if (e.kind === 'completion' && e.item === d.key && restsOnPremise(e.target, d)) holdsAsInB(e.target, d.key);
        }
        break;
      }
      case 'vocabulary-term':
      case 'declaration': {
        for (const name of d.provides.decls) takeDecl(name, d.key);
        break;
      }
      default:
        throw new ActionError('invalid', `A ${d.kind} item (“${d.key}”) cannot be taken out: no step of this slice makes one.`);
    }
  }

  const session = new EditSession(current);
  const pathOf = (tables: DeclTables, name: string) => tables.byName.get(name)?.file.path;

  // 1. Declarations, first in each file (EditSession checks Lean's ranges against the spans before any other edit); a
  // moved one goes from where it is now.
  const ops = new Map<string, LeanOp[]>();
  const op = (path: string, leanOp: LeanOp) => ops.set(path, [...(ops.get(path) ?? []), leanOp]);
  const leaving = [...plan.remove].filter((name) => !plan.anonymous.has(name)).concat([...plan.back.keys()].filter((name) => W.byName.has(name)));
  for (const name of leaving.sort()) op(pathOf(W, name) as string, { op: 'remove-decl', name, archive: false });
  for (const [name, text] of [...plan.restore].sort(([a], [b]) => (a < b ? -1 : 1))) op(pathOf(W, name) as string, { op: 'replace-decl', name, text });
  for (const [path, list] of [...ops].sort(([a], [b]) => (a < b ? -1 : 1))) session.leanOps(path, list);

  // 2. B's text back in B's place for a declaration the current text moved or lacks: after the nearest unit before it in
  // B that stayed in place (`baseDeclPlace`), in B's order, so two that go back next to each other keep it. Those that
  // go back next to the same unit, on the same side (adjacent in B, or with only units between them in B that did not
  // stay in place), come one after another in that order, and each after the first starts where the previous one's own
  // text ends (fixer 2b2 r2, R1-2; builder 2c1, carry-over R2-1): where B's declaration text ends in the inserted text,
  // its trailing spaces included, so its B lead replaces only the previous one's whitespace after that, the same stretch
  // of B's text. (After a unit, the unit's end is the start of the previous edit, which `mapOffset` cannot place; before
  // a unit, the unit's start maps past the previous edit, and the place starts at the previous one's end instead of
  // walking back over whitespace, which would eat that declaration's trailing spaces.)
  const places = [...plan.back.keys()].map((name) => ({ name, at: B.byName.get(name) as DeclEntry, place: baseDeclPlace(base, current, name) }));
  places.sort((x, y) => (x.at.file.path < y.at.file.path ? -1 : x.at.file.path > y.at.file.path ? 1 : x.at.decl.span.start - y.at.decl.span.start));
  /** The last declaration put back: its unit (path, side and offset), and where its own text (B's) ends now. */
  let run: { path: string; side: 'after' | 'before'; offset: number; end: number } | undefined;
  for (const { name, at, place } of places) {
    if (place === undefined) throw new ActionError('unsafe', `${name} cannot be put back where it was when the session started: edit it by hand.`);
    const follows = run !== undefined && run.side === place.side && run.path === place.path && run.offset === place.offset;
    const mapped = session.mapOffset(place.path, place.offset);
    const offset = follows && place.side === 'after' ? run?.end : mapped;
    if (offset === undefined) throw new ActionError('unsafe', `${name} cannot be put back where it was when the session started: edit it by hand.`);
    // It takes the place of the whitespace there, with B's own around it.
    const text = session.text(place.path) ?? '';
    let start = offset;
    let end = offset;
    if (place.side === 'after') while (end < text.length && /\s/.test(text.charAt(end))) end++;
    else if (follows && run !== undefined) start = run.end;
    else while (start > 0 && /\s/.test(text.charAt(start - 1))) start--;
    // On lines of its own, whatever stands next to it now.
    let lines = place.text;
    if (start > 0 && !/^\s*\n/.test(lines)) lines = `\n${lines}`;
    if (end < text.length && !/\n\s*$/.test(lines)) lines = `${lines}\n`;
    const eol = session.parsed(place.path).eol;
    const newText = lines.split(/\r?\n/).join(eol);
    session.apply(place.path, [{ span: { start, end }, newText }]);
    // The run ends where B's declaration text ends in what went in, its trailing spaces included (carry-over R2-1).
    const own = at.text.split(/\r?\n/).join(eol);
    const k = newText.indexOf(own);
    run = { path: place.path, side: place.side, offset: place.offset, end: start + (k >= 0 ? k + own.length : newText.trimEnd().length) };
  }

  // 3. The lines that go with them: comments attached to a declaration that goes, gets B's text back or goes back to B's
  // place, and enclosing lines all of whose declarations go; and the anonymous instances that go.
  const gone = (name: string) => plan.remove.has(name);
  const lineSpans = new Map<string, Span[]>();
  for (const file of texts.files) {
    for (const unit of file.added) {
      if (unit.kind !== 'line') continue;
      const attached = unit.attachedTo !== undefined && (plan.remove.has(unit.attachedTo) || plan.restore.has(unit.attachedTo) || plan.back.has(unit.attachedTo));
      const encloses = unit.enclosing === true && (unit.encloses ?? []).length > 0 && (unit.encloses ?? []).every(gone);
      if (attached || encloses) lineSpans.set(file.path, [...(lineSpans.get(file.path) ?? []), unit.span]);
    }
  }
  for (const { path, span } of plan.anonymous.values()) lineSpans.set(path, [...(lineSpans.get(path) ?? []), span]);
  for (const [path, original] of [...lineSpans].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const spans: Span[] = [];
    for (const span of original) {
      const start = session.mapOffset(path, span.start);
      const end = session.mapOffset(path, span.end);
      if (start === undefined || end === undefined) throw new ActionError('unsafe', `A line of ${path} that goes with the content taken out could not be found again: edit it by hand.`);
      spans.push({ start, end });
    }
    const text = session.text(path) ?? '';
    const lines = new Lines(text);
    // Lines separated only by whitespace go in one deletion, so the spacing stays tidy (as LeanOps' removals).
    const merged: Span[] = [];
    for (const span of spans.sort((a, b) => a.start - b.start)) {
      const last = merged[merged.length - 1];
      if (last !== undefined && span.start >= last.end && text.slice(last.end, span.start).trim() === '') merged[merged.length - 1] = { start: last.start, end: Math.max(last.end, span.end) };
      else merged.push(span);
    }
    const edits: TextEdit[] = merged.map((span) => deletionEdit(text, span, lines));
    session.apply(path, edits);
  }

  // 4. Premise cards that go, then the fields of the cards that stay.
  for (const card of [...plan.cards].sort()) {
    const entry = current.nodes.get(card);
    if (entry === undefined) throw new ActionError('unsafe', `The premise card “${card}” is not in the working copy.`);
    session.removeBlock(entry.file, entry.block);
  }
  const fieldCards = [...new Set([...plan.arrows.keys(), ...plan.marks, ...plan.statements])].sort();
  for (const card of fieldCards) {
    if (plan.cards.has(card)) continue;
    const entry = current.nodes.get(card);
    const before = base.nodes.get(card);
    if (entry === undefined) throw new ActionError('unsafe', `The card “${card}” is not in the working copy.`);
    const sources = plan.arrows.get(card);
    const now = entries(entry.block, 'premises');
    const kept = sources !== undefined ? minus(now, sources) : now;
    if (!sameList(kept, now)) session.setField(entry.file, entry.block, card, 'premises', kept.length > 0 ? kept : null);
    // The mark comes back only when no arrow into the card stays (fixer 2b2 r1, C-V2B2-C2, A-V2B2-ADV-3): a second
    // written premise's arrow keeps it removed, since a card cannot both follow from nothing and have arrows (TL023);
    // its take-out write then moves the ledger's `mark-removed` to that premise (2f, §3.8).
    if (plan.marks.has(card) && kept.length === 0 && before?.block.fields.followsFrom === 'nothing' && entry.block.fields.followsFrom !== 'nothing') {
      session.setField(entry.file, entry.block, card, 'follows_from', 'nothing');
    }
    if (plan.statements.has(card)) {
      const was = before !== undefined ? entries(before.block, 'lean') : [];
      const now = entries(entry.block, 'lean');
      if (!sameList(was, now)) session.setField(entry.file, entry.block, card, 'lean', was.length > 0 ? was : null);
      const binding = before?.block.binding;
      session.expectBinding(entry.block, binding !== undefined && binding.mode !== 'none' ? binding.statement : undefined);
    }
  }

  const changes = session.changes();
  verify(i, plan, changes, fieldCards, texts.moved);
  return changes;
}

/** The result is what §4.11 says, or nothing is returned (fail closed). */
function verify(
  i: { base: ProjectModel; current: ProjectModel },
  plan: Plan,
  changes: readonly FileChange[],
  fieldCards: readonly string[],
  movedBefore: ReadonlySet<string>,
): void {
  const after = new Map<string, string>([...i.current.files.values()].map((f) => [f.path, f.text]));
  for (const change of changes) {
    if (change.after === null) after.delete(change.path);
    else after.set(change.path, change.after);
  }
  const parsed = [...after].map(([path, text]) => parseLeanFile(path, text));
  const declText = new Map<string, string>();
  for (const file of parsed) {
    for (const d of file.decls) {
      if (d.keyword === 'mutual' || d.keyword === 'example') continue;
      const name = d.fullName ?? (d.keyword === 'instance' ? anonymousInstanceName(file, d) : undefined);
      if (name !== undefined && !declText.has(name)) declText.set(name, file.text.slice(d.span.start, d.span.end));
    }
  }
  const blocks = new Map<string, MarkupBlock>();
  for (const file of parsed) for (const b of file.blocks) if (!blocks.has(b.id)) blocks.set(b.id, b);
  const eolFree = (text: string) => text.replace(/\r\n/g, '\n');
  const problems: string[] = [];
  for (const name of plan.remove) if (declText.has(name)) problems.push(`${name} is still there`);
  for (const [name, text] of [...plan.restore, ...plan.back]) {
    const now = declText.get(name);
    if (now === undefined || eolFree(now) !== eolFree(text)) problems.push(`${name} does not read as it did when the session started`);
  }
  for (const card of plan.cards) if (blocks.has(card)) problems.push(`the card “${card}” is still there`);
  for (const card of plan.statements) {
    const was = i.base.nodes.get(card)?.block.binding;
    const now = blocks.get(card)?.binding;
    const statementOf = (b: MarkupBlock['binding'] | undefined) => (b === undefined || b.mode === 'none' ? undefined : b.statement);
    if (statementOf(was) !== statementOf(now)) problems.push(`the card “${card}” is not bound as it was when the session started`);
  }
  // Fixer 2b2 r1 (A-V2B2-ADV-3): no card the revert edits ends with both the mark and arrows (TL023) unless it had both.
  // Read from the lines: the parser drops such a block's mark (the arrows win).
  const markAndArrows = (b: MarkupBlock | undefined) => b !== undefined && entries(b, 'follows_from').includes('nothing') && entries(b, 'premises').length > 0;
  for (const card of fieldCards) {
    if (markAndArrows(blocks.get(card)) && !markAndArrows(i.current.nodes.get(card)?.block)) problems.push(`the card “${card}” would both follow from nothing and have arrows`);
  }
  // Fixer 2b2 r1 (S-V2B2-S1): what goes back to B's place stands there, and nothing else moved (compareTexts' reading).
  if (plan.back.size > 0) {
    const model = buildProjectModel({ files: parsed, fileHashes: {}, library: i.current.library });
    for (const name of compareTexts(i.base, model).moved) {
      if (plan.back.has(name) || !movedBefore.has(name)) problems.push(`${name} is not where it was when the session started`);
    }
  }
  if (problems.length > 0) throw new ActionError('unsafe', `telelean could not take the content out cleanly (${problems.join('; ')}): nothing was written.`);
}

/** The forms in which a proof's text may name a declaration: its full name and each shorter one an `open` or a namespace allows. */
function nameForms(name: string): string[] {
  const parts = name.split('.');
  const out: string[] = [];
  for (let k = 0; k < parts.length; k++) {
    const form = parts.slice(k).join('.');
    if (form !== 'holds') out.push(form);
  }
  return out;
}
