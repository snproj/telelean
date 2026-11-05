/**
 * D-11 kind changes with the Lean facts (docs/m1-plan.md section 6.2). S = the statement, H = `S.holds`,
 * hk = H's kind (`other` counts as `theorem`):
 *
 * | from->to  | code-less | hk absent           | hk axiom                         | hk theorem                         |
 * |-----------|-----------|---------------------|----------------------------------|------------------------------------|
 * | G->D      | type      | type                | type (pending promotion)         | type ("already proved")            |
 * | G->A, D->A| type      | type+add-holds-axiom| type                             | type+holds-theorem-to-axiom (*)    |
 * | A->D      | type      | type                | type (pending promotion)         | type                               |
 * | A->G, D->G| type      | type                | no deps: type+remove-holds; deps: needs a DependentsChoice (same, archived) |
 *
 * `mark-broken` removes H and lists what will no longer compile; `rewrite` (fresh facts only) gives every user a
 * hypothesis `(h_S : S)` as its first binder and passes it on (`(c h_S)`) to the other rewritten users.
 *
 * (*) A conditional H (`theorem S.holds (h : a) : S`, type `a → … → S`) takes arguments, while the axiom that replaces
 * it states S directly, so declarations that apply H (`(S.holds h)`) would break: with such users the change needs a
 * DependentsChoice too; `rewrite` drops the arguments (`(S.holds h)` becomes `S.holds`), `mark-broken` leaves them.
 * Likewise the A->G/D->G rewrite of a conditional H replaces each whole application `(S.holds h …)` by `h_S`.
 */
import { ActionError } from '../actions.js';
import { holdsName } from '../facts.js';
import { kindChangeImpact, proofDependents } from '../kindChange.js';
import type { LeanOp, Span } from '../markup/types.js';
import { relativeName } from '../markup/api.js';
import type { NodeType, SemanticSummary } from '../model.js';
import { subjectGraph } from '../project/index.js';
import type { ModelNode, ProjectModel } from '../project/types.js';
import { hasToken, LineMap, normalizeWhitespace, splitTopLevelArrows } from '../project/text.js';
import { signatureText } from '../project/vocabulary.js';
import { allFresh, axiomListUsers, locateDecl, usersOf } from './dependents.js';
import type { KindChangePlan, KindChangeRequest } from './types.js';

const NOUN: Readonly<Record<NodeType, string>> = { ASSUMPTION: 'Assumption', DERIVATION: 'Derivation', GOAL: 'Goal' };

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
  const graph = subjectGraph(model, node.subject, { version: 0, semantic: modelSemantic(model) });
  const impact = kindChangeImpact(graph, node.id, to);

  const plan: KindChangePlan = { id: node.id, from, to, impact, fieldChanges: [{ key: 'type', value: to }], leanOps: [], broken: [] };
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
  const dependentsOf = (names: readonly string[], first: readonly string[] = []): string[] => {
    const out: string[] = [...first];
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

  if (to === 'DERIVATION') return finish();
  if (to === 'ASSUMPTION') {
    if (hk === undefined) add(statementFile, { op: 'add-holds-axiom', statement });
    else if (hk !== 'axiom') {
      const args = holdsArguments(model, entry, statement);
      if (args.takes) planDropArguments(args.count);
      add(holdsFile, { op: 'holds-theorem-to-axiom', statement });
    }
    return finish();
  }

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
        `${short}.holds takes ${hypotheses}, but as an assumption it becomes \`axiom ${short}.holds : ${short}\`, so ${plural(dependents.length, 'dependent')} that pass${dependents.length === 1 ? 'es' : ''} it arguments must change: ${dependents.length === 1 ? 'rewrite that dependent to use it directly, or keep it and let it show as broken' : 'rewrite them to use it directly, or keep them and let them show as broken'}.`,
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

  // to === 'GOAL': a goal is not taken as given, so H must go.
  if (hk === undefined) return finish();
  const archive = hk !== 'axiom';
  const exclude = new Set([statement, holds]);
  const found = usersOf(model, [holds], exclude);
  // An axiom also breaks every declaration whose `#print axioms` lists it (uses the references do not show).
  const invisible = hk === 'axiom' ? axiomListUsers(model, holds, found.all, exclude) : [];
  const users = { all: [...found.all, ...invisible], fromFacts: found.fromFacts };
  const dependents = dependentsOf(users.all, proofDependents(graph, node.id));
  for (const d of dependents) if (!plan.impact.dependents.includes(d)) plan.impact.dependents.push(d);
  // Untracked users (found from the references, not the graph's arrows) need the confirmation too.
  if (users.all.length > 0) plan.impact.needsConfirmation = true;

  if (users.all.length === 0) {
    add(holdsFile, { op: 'remove-holds', statement, archive });
    return finish();
  }
  if (!request.dependents || !confirmedAll(dependents)) {
    throw new ActionError(
      'needs-confirmation',
      `Making it a Goal removes ${short}.holds, which ${plural(dependents.length, 'dependent')} use${dependents.length === 1 ? 's' : ''}: ${dependents.length === 1 ? 'rewrite that dependent to take it as a hypothesis, or keep it and let it show as broken' : 'rewrite them to take it as a hypothesis, or keep them and let them show as broken'}.`,
      dependents,
    );
  }
  if (request.dependents === 'mark-broken') {
    add(holdsFile, { op: 'remove-holds', statement, archive });
    plan.broken = [...users.all];
    return finish();
  }

  // rewrite: needs exact reference spans, so every touched file must be freshly checked.
  const closure = users.fromFacts;
  requireFresh(users.all, found.all.length === closure.length);
  const notTheorems = closure.filter((name) => model.declFacts.get(name)?.kind !== 'theorem');
  if (notTheorems.length > 0) {
    throw new ActionError(
      'unsafe',
      `${notTheorems.join(', ')} ${notTheorems.length === 1 ? 'is' : 'are'} not a theorem and cannot take a hypothesis without changing ${notTheorems.length === 1 ? 'its' : 'their'} type: choose "mark broken" instead.`,
      notTheorems,
    );
  }
  if (hk === 'axiom' && invisible.length > 0) {
    throw new ActionError(
      'unsafe',
      `${invisible.join(', ')} ${invisible.length === 1 ? 'depends' : 'depend'} on ${short}.holds in a way Lean's references do not show (e.g. through notation): choose "mark broken" instead.`,
      invisible,
    );
  }
  // A conditional H is used applied to its hypotheses: each whole application becomes the new hypothesis.
  const args = holdsArguments(model, entry, statement);
  if (args.takes && args.count === undefined) {
    throw new ActionError('unsafe', `The type of ${short}.holds is not \`… → ${short}\`, so its uses cannot be rewritten mechanically: choose "mark broken" instead.`, dependents);
  }
  const applied = args.count ?? 0;

  // The rewritten users, in file then source order.
  const members = closure
    .map(located)
    .sort((a, b) => (a.file.path < b.file.path ? -1 : a.file.path > b.file.path ? 1 : a.decl.span.start - b.decl.span.start));
  const base = `h_${short}`;
  let hypName = base;
  for (let n = 2; members.some((m) => hasToken(m.file.text.slice(m.decl.span.start, m.decl.span.end), hypName)); n++) hypName = `${base}_${n}`;
  for (const member of members) {
    const map = lineMap(member.file.path, member.file.text);
    const spansOf = (target: string): Span[] => referenceSpans(member.file.text, map, member.facts.refs, target);
    add(member.file.path, {
      op: 'add-hypothesis',
      decl: member.name,
      hypName,
      hypType: relativeName(statement, member.decl.namespace),
      replace: spansOf(holds),
      ...(applied > 0 ? { applied } : {}),
    });
    for (const other of members) {
      if (other.name === member.name) continue;
      const spans = spansOf(other.name);
      if (spans.length > 0) add(member.file.path, { op: 'apply-hypothesis', decl: member.name, hypName, replace: spans });
    }
  }
  add(holdsFile, { op: 'remove-holds', statement, archive });
  return finish();
}

export { NOUN };
