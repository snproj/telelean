/**
 * D-11 kind changes with the Lean facts (docs/m1-plan.md section 6.2; spec v4: docs/slice1-plan.md 2.4). S = the
 * statement, H = `S.holds`, hk = H's kind (`other` counts as `theorem`):
 *
 * | from->to | code-less | hk absent           | hk axiom | hk theorem                      |
 * |----------|-----------|---------------------|----------|---------------------------------|
 * | P->A     | type      | type+add-holds-axiom| type     | type+holds-theorem-to-axiom (*) |
 * | A->P     | refused: `invalid`, AXIOM_TO_PROPOSITION_REFUSAL (AR-6: an arrow or "follows from nothing" does it)  |
 *
 * P->A also removes the card's `premises:` and `follows_from:` lines in the same plan (AR-7: it loses its incoming
 * arrows and its "follows from nothing" mark); its outgoing arrows stay.
 *
 * (*) A conditional H (`theorem S.holds (h : a) : S`, type `a → … → S`) takes arguments, while the axiom that replaces
 * it states S directly, so declarations that apply H (`(S.holds h)`) would break: with such users the change needs a
 * DependentsChoice; `rewrite` (fresh facts only) drops the arguments (`(S.holds h)` becomes `S.holds`), `mark-broken`
 * leaves them and lists what will no longer compile.
 */
import { ActionError } from '../actions.js';
import { holdsName } from '../facts.js';
import { AXIOM_TO_PROPOSITION_REFUSAL, kindChangeImpact } from '../kindChange.js';
import type { LeanOp, Span } from '../markup/types.js';
import type { NodeType, SemanticSummary } from '../model.js';
import { subjectGraph } from '../project/index.js';
import type { ModelNode, ProjectModel } from '../project/types.js';
import { LineMap, normalizeWhitespace, splitTopLevelArrows } from '../project/text.js';
import { signatureText } from '../project/vocabulary.js';
import { allFresh, locateDecl, usersOf } from './dependents.js';
import type { KindChangePlan, KindChangeRequest } from './types.js';

const NOUN: Readonly<Record<NodeType, string>> = { AXIOM: 'Axiom', PROPOSITION: 'Proposition' };

/** The semantic state the planner previews kind changes with (the facts as the model knows them). */
export function modelSemantic(model: ProjectModel): SemanticSummary {
  if (!model.facts) return { state: 'unavailable' };
  return { state: allFresh(model) ? 'fresh' : 'stale' };
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** Statement not found (TL101) or not a Prop abbrev/def (TL113): kind changes then touch only `type:`. */
function bindingBroken(model: ProjectModel, id: string): boolean {
  return model.diagnostics.some((d) => d.nodeId === id && (d.code === 'TL101' || d.code === 'TL113'));
}

/**
 * Whether H takes explicit arguments before it states S, and how many: 0 when its type is S; k when its type is
 * `A₁ → … → Aₖ → S` (a conditional proof); `count` undefined when it takes arguments of another shape (a `∀` type,
 * or no facts and binders in the text), which no mechanical rewrite handles.
 */
export function holdsArguments(model: ProjectModel, entry: ModelNode, statement: string): { takes: boolean; count?: number } {
  const facts = model.declFacts.get(holdsName(statement));
  if (facts?.type !== undefined) {
    const type = normalizeWhitespace(facts.type);
    if (type === statement) return { takes: false, count: 0 };
    const parts = splitTopLevelArrows(type);
    if (parts.length > 1 && parts[parts.length - 1] === statement) return { takes: true, count: parts.length - 1 };
    return { takes: true };
  }
  const located = entry.holdsDecl;
  const file = located ? model.files.get(located.file) : undefined;
  const signature = located && file ? signatureText(file, located.decl) : undefined;
  return signature !== undefined && signature.binders !== '' ? { takes: true } : { takes: false, count: 0 };
}

/**
 * The spans of a declaration's references to `target`, as offsets of the current text. Lean's `.ilean` sometimes
 * records a reference with its parentheses (`(lem5)`), or twice, with and without a leading `@`: parentheses are
 * shrunk to the identifier and duplicates ending at the same place keep the widest (the `@` one).
 */
export function referenceSpans(text: string, map: LineMap, refs: ReadonlyArray<{ name: string; range: { start: { line: number; character: number }; end: { line: number; character: number } } }>, target: string): Span[] {
  const byEnd = new Map<number, Span>();
  for (const ref of refs) {
    if (ref.name !== target) continue;
    let start = map.offsetAt(ref.range.start);
    let end = map.offsetAt(ref.range.end);
    while (end - start >= 2 && text.charAt(start) === '(' && text.charAt(end - 1) === ')') {
      start++;
      end--;
      while (start < end && /\s/.test(text.charAt(start))) start++;
      while (end > start && /\s/.test(text.charAt(end - 1))) end--;
    }
    const known = byEnd.get(end);
    if (known === undefined || start < known.start) byEnd.set(end, { start, end });
  }
  return [...byEnd.values()].sort((a, b) => a.start - b.start);
}

export function planKind(model: ProjectModel, request: KindChangeRequest): KindChangePlan {
  const entry = model.nodes.get(request.id);
  if (!entry) throw new ActionError('not-found', `No card "${request.id}".`);
  const node = entry.node;
  const from = node.type;
  const to = request.to;
  if (from === to) throw new ActionError('invalid', 'Moving a card within its own column only re-orders it.');
  if (to === 'PROPOSITION') throw new ActionError('invalid', AXIOM_TO_PROPOSITION_REFUSAL);
  const graph = subjectGraph(model, node.subject, { version: 0, semantic: modelSemantic(model) });
  const impact = kindChangeImpact(graph, node.id, to);

  // P->A (AR-7): the type, and the card's incoming arrows and "follows from nothing" mark go in the same plan.
  const fieldChanges: KindChangePlan['fieldChanges'] = [{ key: 'type', value: to }];
  if (entry.block.lines.some((line) => line.key === 'premises')) fieldChanges.push({ key: 'premises', value: null });
  if (entry.block.lines.some((line) => line.key === 'follows_from')) fieldChanges.push({ key: 'follows_from', value: null });
  const plan: KindChangePlan = { id: node.id, from, to, impact, fieldChanges, leanOps: [], broken: [] };
  const statement = node.lean.statement;
  if (!statement || !entry.statementDecl || node.status.formal === 'informal' || bindingBroken(model, node.id)) return plan;

  const holds = holdsName(statement);
  const hk = node.lean.justificationKind;
  const statementFile = entry.statementDecl.file;
  const holdsFile = entry.holdsDecl?.file ?? model.declFacts.get(holds)?.file ?? statementFile;
  const short = statement.split('.').pop() ?? statement;
  const ops = new Map<string, LeanOp[]>();
  const add = (file: string, op: LeanOp) => ops.set(file, [...(ops.get(file) ?? []), op]);
  const finish = () => {
    plan.leanOps = [...ops.keys()].sort().map((file) => ({ file, ops: ops.get(file) ?? [] }));
    return plan;
  };
  /** Cards owning `names` (except this one), then the untracked names: what a confirmation lists. */
  const dependentsOf = (names: readonly string[]): string[] => {
    const out: string[] = [];
    for (const name of names) {
      const owner = model.ownerOfDecl.get(name);
      if (owner !== undefined && owner !== node.id && !out.includes(owner)) out.push(owner);
    }
    for (const name of names) if (model.ownerOfDecl.get(name) === undefined && !out.includes(name)) out.push(name);
    return out;
  };
  /** Every touched file must be freshly checked for a rewrite from the references. */
  const requireFresh = (names: readonly string[], complete: boolean) => {
    const touched = new Set<string>([holdsFile]);
    for (const name of names) touched.add(locateDecl(model, name)?.file ?? '');
    const staleFiles = [...touched].filter((file) => !model.freshFiles.has(file));
    if (staleFiles.length > 0 || !complete) {
      throw new ActionError('facts-stale', `Refresh Lean first: ${staleFiles.length > 0 ? staleFiles.join(', ') : 'some files'} changed since the last check, so the dependents cannot be rewritten exactly.`);
    }
  };
  /** A user's facts, parse and declaration (fresh files only), for spans from its references. */
  const located = (name: string) => {
    const facts = model.declFacts.get(name);
    const file = facts ? model.files.get(facts.file) : undefined;
    const decl = file?.decls.find((d) => d.fullName === name);
    if (!facts || !file || !decl) throw new ActionError('unsafe', `${name} could not be found in the files: refresh Lean first.`);
    return { name, facts, file, decl };
  };
  /**
   * M2 carry-over 3: a DependentsChoice applies only to the dependents the user saw listed (`confirmedDependents`,
   * absent = none); when the facts find more, the planner asks again with all of them.
   */
  const confirmedAll = (dependents: readonly string[]) => {
    const confirmed = new Set(request.confirmedDependents ?? []);
    return dependents.every((d) => confirmed.has(d));
  };
  const lineMaps = new Map<string, LineMap>();
  const lineMap = (path: string, text: string) => {
    let map = lineMaps.get(path);
    if (!map) lineMaps.set(path, (map = new LineMap(text)));
    return map;
  };

  // to === 'AXIOM'
  if (hk === undefined) add(statementFile, { op: 'add-holds-axiom', statement });
  else if (hk !== 'axiom') {
    const args = holdsArguments(model, entry, statement);
    if (args.takes) planDropArguments(args.count);
    add(holdsFile, { op: 'holds-theorem-to-axiom', statement });
  }
  return finish();

  /**
   * H takes arguments but becomes `axiom S.holds : S`: the declarations that apply it must drop the arguments
   * (only direct users: their own types do not change, so their users are unaffected).
   */
  function planDropArguments(count: number | undefined): void {
    const exclude = new Set([statement as string, holds]);
    const users = usersOf(model, [holds], exclude, { transitive: false });
    if (users.all.length === 0) return;
    const dependents = dependentsOf(users.all);
    for (const d of dependents) if (!plan.impact.dependents.includes(d)) plan.impact.dependents.push(d);
    plan.impact.needsConfirmation = true;
    const hypotheses = count === undefined ? 'arguments' : count === 1 ? 'a hypothesis' : `${count} hypotheses`;
    if (!request.dependents || !confirmedAll(dependents)) {
      throw new ActionError(
        'needs-confirmation',
        `${short}.holds takes ${hypotheses}, but as an axiom it becomes \`axiom ${short}.holds : ${short}\`, so ${plural(dependents.length, 'dependent')} that pass${dependents.length === 1 ? 'es' : ''} it arguments must change: ${dependents.length === 1 ? 'rewrite that dependent to use it directly, or keep it and let it show as broken' : 'rewrite them to use it directly, or keep them and let them show as broken'}.`,
        dependents,
      );
    }
    if (request.dependents === 'mark-broken') {
      plan.broken = [...users.all];
      return;
    }
    requireFresh(users.all, users.all.length === users.fromFacts.length);
    if (count === undefined) {
      throw new ActionError('unsafe', `The type of ${short}.holds is not \`… → ${short}\`, so its uses cannot be rewritten mechanically: choose "mark broken" instead.`, dependents);
    }
    for (const user of users.fromFacts.map(located)) {
      const replace = referenceSpans(user.file.text, lineMap(user.file.path, user.file.text), user.facts.refs, holds);
      if (replace.length > 0) add(user.file.path, { op: 'drop-arguments', decl: user.name, args: count, replace });
    }
  }
}

export { NOUN };
