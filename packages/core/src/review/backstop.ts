/**
 * Slice 2b2 (docs/slice2-plan.md section 4.10; Appendix B's "Backstop at Apply"; spec §14 item 5): the backstop, run
 * by 2f on every Apply and never reused. It stands alone: ownership is re-derived from B, F and the ledger (telelean's
 * own record, kept outside ws/), and B.2, B.3 and B.4 are restated on F, independently of the item records' history.
 * It refuses Apply, naming the declaration, arrow or item, on any of these codes:
 *  - `facts`: F's facts lack valueConsts or typeConsts where R_stmt or the B.2 walks need them (D2-25); when F's probe
 *    failed (§2.1, D2-75), one refusal with `probeFailure`'s sentence, which names the cause;
 *  - `unowned`: a difference no item owns (computeItems' rule; enclosing lines pass when every declaration they enclose
 *    belongs to an item, which `not-accepted` then judges);
 *  - `not-accepted`: an owner that is not accepted, a declined item's leftovers and an owner with no record included
 *    (D2-24, stricter than Appendix B);
 *  - `not-written`: an accepted Add premise with no ledger `premise` entry for its key, or whose card is not in F (AF2);
 *  - `own-accept`: Appendix B (a)-(c), each declaration of an item accepted only with a group: a new or type-changed
 *    Lean axiom other than shape-passing vocabulary; a new or changed definition, instance or coercion in R_stmt(F),
 *    the cards' statement abbrevs (with their docstring mirrors) excepted; an existing name whose kind, type or value
 *    changed. Exempt: a presupposition's helper instance, and the axiom -> theorem change of a `.holds` that an accepted
 *    Result proves;
 *  - `content-changed`: F's content key of an accepted item differs from its accepted key (absent included), or an
 *    accepted Result's verdict or Rests on differs on F (the final judgement's) from the accepted one; not for an item
 *    whose facts are missing on F (its key cannot be computed: `facts` refuses it);
 *  - `class`: an item that is RV-7 on F but was accepted with a group (one `own-accept` refusal of it is enough);
 *  - `arrow` / `mark`: an added arrow with no accepted Add arrow or Add premise owning it (the ledger names it), a
 *    removed arrow with no accepted Remove arrow or Delete, an added arrow into an AXIOM card; a `follows_from` change
 *    other than an accepted premise's ledger `mark-removed`;
 *  - `b2`, `cycle`, `kind`: B.2 for every proposition whose `.holds` or Dependencies differ between B and F (a target's
 *    allowed sources are its question's, only while their arrow is in F, D2-59, and E(T); another proposition's are
 *    its drawn arrows), B.3's acyclicity (only cycles through an arrow B did not have, AP-13) and B.4, restated on F;
 *  - `scc`: an SCC of items (the final judgement's RV-5 edges) with an accepted member that is not wholly accepted.
 * Slice 3's hook (frozen and held declarations still elaborate to their frozen terms) has nothing to check in slice 2.
 *
 * Pure TypeScript: no Node or vscode APIs (the webview bundles core).
 */
import { holdsName, probeFailure, type DeclFacts } from '../facts.js';
import { declTables, factsOf, isAxiom, isPresuppositionInstance, type DeclEntry } from '../gate/decls.js';
import { ruleContext } from '../gate/rules.js';
import { arrowFindings, holdsKindFindings, meaningChanged, noHiddenEdgeFindings, sessionRuleContext } from '../gate/sessionRules.js';
import { keywordKind } from '../project/factsIndex.js';
import { cutText, normalizeWhitespace } from '../project/text.js';
import type { ProjectModel } from '../project/types.js';
import { splitList } from '../markup/values.js';
import { classify } from './classify.js';
import { statementReach } from './closure.js';
import { computeItems } from './items.js';
import { arrowKey, cardKey, unarrowKey } from './keys.js';
import { extraSources, isSessionProof, questionSources } from './permitted.js';
import { fallbackLabel } from './records.js';
import { stronglyConnected } from './scc.js';
import { REVIEW_TEXTS } from './texts.js';
import type { BackstopInput, BackstopRefusal, ItemDraft, ItemRecord } from './types.js';

/** Appendix B (b)'s kinds: definitions (abbrevs as `def`), opaques, instances, structures, inductives, classes. */
const DEFINITION_KINDS: ReadonlySet<string> = new Set(['def', 'opaque', 'instance', 'structure', 'inductive', 'class']);
/** Vocabulary kinds of a shape-passing term. */
const TERM_KINDS: ReadonlySet<string> = new Set(['sort', 'predicate', 'constant', 'function']);

const norm = (text: string | undefined) => (text === undefined ? undefined : normalizeWhitespace(text));
const sameSet = (a: readonly string[], b: readonly string[]) => [...new Set(a)].sort().join('\u0000') === [...new Set(b)].sort().join('\u0000');

/** A list field's entries (the parser's split), across its lines. */
function entries(lines: ReadonlyArray<{ key: string; raw: string }>, key: string): string[] {
  return lines.filter((line) => line.key === key).flatMap((line) => splitList(line.raw).items);
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

interface Decl {
  entry?: DeclEntry;
  facts?: DeclFacts;
}

function declOf(model: ProjectModel, name: string): Decl | undefined {
  const entry = declTables(model).byName.get(name);
  const facts = factsOf(model, name, entry) ?? model.declFacts.get(name);
  if (entry === undefined && facts === undefined) return undefined;
  return { ...(entry !== undefined ? { entry } : {}), ...(facts !== undefined ? { facts } : {}) };
}

function kindOf(d: Decl): string | undefined {
  if (d.facts?.kind !== undefined) return d.facts.kind;
  const keyword = d.entry?.decl.keyword;
  return keyword === undefined ? undefined : keyword === 'instance' ? 'instance' : keywordKind(keyword);
}

/** §4.10 (2b2): refuses Apply on any refusal code, naming the declaration, arrow or item. */
export function applyBackstop(i: BackstopInput): { ok: boolean; refusals: BackstopRefusal[] } {
  const { base, final, items, ledger, inferences, judgement } = i;
  const refusals: BackstopRefusal[] = [];
  const records = new Map(items.map((r) => [r.key, r]));
  const accepted = (key: string): ItemRecord | undefined => {
    const r = records.get(key);
    return r?.status === 'accepted' ? r : undefined;
  };
  const sentence = (id: string) => cutText(final.nodes.get(id)?.node.naturalName ?? base.nodes.get(id)?.node.naturalName ?? id, 60);
  const targets = inferences.map((inf) => inf.target);

  // ---- facts (D2-25; §2.1, D2-75)
  const failedProbe = probeFailure(final.facts);
  if (failedProbe !== undefined) refusals.push({ code: 'facts', text: failedProbe });
  else if (final.facts === undefined) refusals.push({ code: 'facts', text: REVIEW_TEXTS.factsMissing });
  const factsGap = (name?: string, item?: string) => {
    if (failedProbe !== undefined || final.facts === undefined) return;
    if (refusals.some((r) => r.code === 'facts' && r.name === name && r.item === item)) return;
    refusals.push({ code: 'facts', text: REVIEW_TEXTS.factsMissing, ...(name !== undefined ? { name } : {}), ...(item !== undefined ? { item } : {}) });
  };
  const rStmt = statementReach(final, []);
  for (const name of rStmt.missing) factsGap(name);

  // ---- ownership, re-derived from B, F and the ledger
  const { drafts, problems } = computeItems({ base, current: final, ledger, premises: [], inferences, ended: targets });
  for (const p of problems) if (p.code === 'unowned') refusals.push({ code: 'unowned', text: p.text, ...(p.declaration !== undefined ? { name: p.declaration } : {}) });
  for (const d of drafts) if (d.factsMissing === true) factsGap(undefined, records.get(d.key)?.id);
  const labelOf = (d: ItemDraft) => {
    const r = records.get(d.key);
    return r !== undefined ? fallbackLabel(r) : fallbackLabel(d);
  };
  const subjectOf = (d: ItemDraft): { text: string; name?: string; arrow?: { source: string; target: string } } => {
    const name = d.provides.decls[0];
    if (name !== undefined) return { text: name, name };
    const arrow = d.provides.arrows[0];
    if (arrow !== undefined) return { text: REVIEW_TEXTS.unownedArrow(sentence(arrow.source), sentence(arrow.target)), arrow: { ...arrow } };
    const card = d.provides.cards[0];
    return { text: REVIEW_TEXTS.unownedCard(sentence(card ?? d.key)) };
  };
  const owned = drafts.filter((d) => d.asInBase !== true);
  for (const d of owned) {
    if (accepted(d.key) !== undefined) continue;
    const subject = subjectOf(d);
    const r = records.get(d.key);
    refusals.push({
      code: 'not-accepted',
      text: REVIEW_TEXTS.notAccepted(subject.text, labelOf(d)),
      ...(subject.name !== undefined ? { name: subject.name } : {}),
      ...(subject.arrow !== undefined ? { arrow: subject.arrow } : {}),
      ...(r !== undefined ? { item: r.id } : {}),
    });
  }

  // ---- not-written (AF2)
  const notWritten = new Set<string>();
  for (const r of items) {
    if (r.kind !== 'add-premise' || r.status !== 'accepted') continue;
    const entry = ledger.find((e) => e.kind === 'premise' && e.item === r.key);
    if (entry !== undefined && entry.kind === 'premise' && final.nodes.has(entry.card)) continue;
    notWritten.add(r.key);
    refusals.push({ code: 'not-written', text: REVIEW_TEXTS.notWritten(fallbackLabel(r)), item: r.id });
  }

  // ---- own-accept: Appendix B (a)-(c), for the declarations of items accepted only with a group
  const statements = new Set<string>();
  for (const model of [base, final]) for (const n of model.nodes.values()) if (n.node.lean.statement !== undefined) statements.add(n.node.lean.statement);
  const proofOf = new Map<string, string>();
  for (const n of final.nodes.values()) if (n.node.lean.statement !== undefined) proofOf.set(holdsName(n.node.lean.statement), n.node.id);
  const vocab = new Map(final.vocabulary.map((v) => [v.name, v]));
  const isTerm = (name: string) => {
    const v = vocab.get(name);
    return v !== undefined && TERM_KINDS.has(v.kind) && !v.flags.includes('shape-violation');
  };
  const needsOwn = (name: string): boolean => {
    const before = declOf(base, name);
    const after = declOf(final, name);
    if (after === undefined) return false;
    const changedText = before?.entry?.text !== after.entry?.text;
    const factsDiffer = (field: 'kind' | 'type' | 'value') => {
      const a = field === 'kind' ? before?.facts?.kind : norm(before?.facts?.[field]);
      const b = field === 'kind' ? after.facts?.kind : norm(after.facts?.[field]);
      return a !== undefined && b !== undefined && a !== b;
    };
    // (a) a new or type-changed Lean axiom, other than shape-passing vocabulary.
    if (isAxiom(after.entry, after.facts) && !isTerm(name)) {
      const same = before !== undefined && isAxiom(before.entry, before.facts) && (norm(before.facts?.type) !== undefined && norm(after.facts?.type) !== undefined ? norm(before.facts?.type) === norm(after.facts?.type) : !changedText);
      if (!same) return true;
    }
    // (c) an existing name whose kind, type or value changed; exempt: a `.holds` an accepted Result proves (axiom -> theorem).
    if (before !== undefined && (factsDiffer('kind') || factsDiffer('type') || factsDiffer('value'))) {
      const card = proofOf.get(name);
      const proved = card !== undefined && isAxiom(before.entry, before.facts) && !isAxiom(after.entry, after.facts) && accepted(`proof:${card}`) !== undefined;
      if (!proved) return true;
    }
    // (b) a new or changed definition, instance or coercion in R_stmt(F); the cards' statement abbrevs and a
    // presupposition's helper instance excepted.
    const isNewOrChanged = before === undefined || changedText || factsDiffer('kind') || factsDiffer('type') || factsDiffer('value');
    if (isNewOrChanged && DEFINITION_KINDS.has(kindOf(after) ?? '') && !statements.has(name) && !isPresuppositionInstance(final, after.entry, after.facts)) {
      if (rStmt.names.has(name)) return true;
    }
    return false;
  };
  const ownRefused = new Set<string>();
  for (const d of owned) {
    const r = accepted(d.key);
    if (r === undefined || r.accepted?.how !== 'group') continue;
    for (const name of d.provides.decls) {
      if (!needsOwn(name)) continue;
      ownRefused.add(d.key);
      refusals.push({ code: 'own-accept', text: REVIEW_TEXTS.backstopOwnAccept(name, fallbackLabel(r)), name, item: r.id });
    }
  }

  // ---- content-changed: the accepted key, and an accepted Result's verdict and Rests on
  const draftByKey = new Map(drafts.map((d) => [d.key, d]));
  for (const r of items) {
    if (r.status !== 'accepted' || notWritten.has(r.key)) continue;
    const d = draftByKey.get(r.key);
    // Its declarations lack facts (a failed probe, a module that did not build): its key cannot be compared, and the
    // `facts` refusal names why.
    if (d?.factsMissing === true) continue;
    let changed = d === undefined || r.accepted?.fingerprint === undefined || d.contentKey !== r.accepted.fingerprint;
    if (!changed && r.kind === 'result') {
      const target = r.key.slice('proof:'.length);
      const now = Object.hasOwn(judgement.inferences, target) ? judgement.inferences[target] : undefined;
      const was = r.accepted?.result;
      changed = now === undefined || was === undefined || was.verdict !== now.verdict || !sameSet(was.restsOn, now.restsOn);
    }
    if (changed) refusals.push({ code: 'content-changed', text: REVIEW_TEXTS.changedAfterAccept(fallbackLabel(r)), item: r.id });
  }

  // ---- class: RV-7 on F, accepted only with a group
  const classes = classify({ base, current: final, drafts, premises: [], inferences, withDrafts: false });
  for (const d of owned) {
    const r = accepted(d.key);
    if (r === undefined || r.accepted?.how !== 'group' || ownRefused.has(d.key)) continue;
    const cls = Object.hasOwn(classes, d.key) ? classes[d.key] : undefined;
    if (cls === undefined || cls.belief || cls.changesProved) refusals.push({ code: 'class', text: REVIEW_TEXTS.backstopClass(fallbackLabel(r)), item: r.id });
  }

  // ---- arrow and mark, from F's blocks against B's
  const premiseEntries = new Map<string, { card: string; item: string }[]>();
  for (const e of ledger) if (e.kind === 'premise') premiseEntries.set(e.target, [...(premiseEntries.get(e.target) ?? []), { card: e.card, item: e.item }]);
  const ownedArrow = (source: string, target: string): boolean => {
    if (accepted(arrowKey(source, target)) !== undefined && ledger.some((e) => e.kind === 'arrow' && e.source === source && e.target === target)) return true;
    return (premiseEntries.get(target) ?? []).some((e) => e.card === source && accepted(e.item) !== undefined);
  };
  const removedOwned = (source: string, target: string) =>
    accepted(unarrowKey(source, target)) !== undefined || [source, target].some((card) => records.get(cardKey(card))?.kind === 'delete' && accepted(cardKey(card)) !== undefined);
  const cards = [...new Set([...base.nodes.keys(), ...final.nodes.keys()])].sort();
  for (const id of cards) {
    const was = base.nodes.get(id);
    const now = final.nodes.get(id);
    const before = was !== undefined ? entries(was.block.lines, 'premises') : [];
    const after = now !== undefined ? entries(now.block.lines, 'premises') : [];
    for (const source of [...new Set(minus(after, before))]) {
      const arrow = { source, target: id };
      if (now?.node.type === 'AXIOM') refusals.push({ code: 'arrow', text: REVIEW_TEXTS.backstopArrowIntoAxiom(sentence(source), sentence(id)), arrow });
      else if (!ownedArrow(source, id)) refusals.push({ code: 'arrow', text: REVIEW_TEXTS.backstopArrowAdded(sentence(source), sentence(id)), arrow });
    }
    for (const source of [...new Set(minus(before, after))]) {
      if (!removedOwned(source, id)) refusals.push({ code: 'arrow', text: REVIEW_TEXTS.backstopArrowRemoved(sentence(source), sentence(id)), arrow: { source, target: id } });
    }
    const markBefore = was?.block.lines.filter((l) => l.key === 'follows_from').map((l) => normalizeWhitespace(l.raw)) ?? [];
    const markAfter = now?.block.lines.filter((l) => l.key === 'follows_from').map((l) => normalizeWhitespace(l.raw)) ?? [];
    if (markBefore.join('\u0000') === markAfter.join('\u0000') || now === undefined) continue;
    const removedByPremise =
      markAfter.length === 0 && ledger.some((e) => e.kind === 'mark-removed' && e.card === id && accepted(e.item) !== undefined && records.get(e.item)?.kind === 'add-premise');
    if (!removedByPremise) refusals.push({ code: 'mark', text: REVIEW_TEXTS.backstopMark(sentence(id)), name: id });
  }

  // ---- B.2, B.3 and B.4, restated on F
  const firstTarget = targets[0] ?? '';
  const subject = final.nodes.get(firstTarget)?.node.subject ?? base.nodes.get(firstTarget)?.node.subject ?? '';
  const ctx = ruleContext({
    purpose: 'check',
    selection: { subject, target: firstTarget, premises: [...new Set(inferences.flatMap((inf) => inf.question.sources))], adoptedGhosts: [] },
    stage: 'prove',
    base,
    current: final,
    roundStart: base,
    teleleanBlocks: [],
  });
  const sc = sessionRuleContext({
    purpose: 'final',
    stage: 'prove',
    base,
    current: final,
    inferences,
    ledger,
    items,
    premises: [],
    rejectedArrows: [],
    ctx,
    sessionProof: (t) => isSessionProof(base, final, t),
  });
  const B = declTables(base);
  const F = declTables(final);
  for (const id of [...final.nodes.keys()].sort()) {
    const now = final.nodes.get(id)?.node;
    if (now === undefined || now.type !== 'PROPOSITION') continue;
    const was = base.nodes.get(id);
    const holds = now.lean.statement !== undefined ? holdsName(now.lean.statement) : undefined;
    const holdsChanged = holds !== undefined && (B.byName.get(holds)?.text !== F.byName.get(holds)?.text || base.declFacts.has(holds) !== final.declFacts.has(holds) || meaningChanged(base, final, holds));
    const depsChanged =
      was === undefined ||
      !sameSet(entries(was.block.lines, 'premises'), entries(final.nodes.get(id)?.block.lines ?? [], 'premises')) ||
      (was.node.fromNothing === true) !== (now.fromNothing === true);
    if (!holdsChanged && !depsChanged) continue;
    const inference = inferences.find((inf) => inf.target === id);
    const allowed = new Set(
      inference !== undefined ? [...questionSources(final, id, inference.question), ...extraSources(id, ledger, items, final)] : now.premises,
    );
    for (const f of noHiddenEdgeFindings(sc, id, allowed, false)) {
      if (f.token === 'source-only') factsGap(holds);
      else if (f.nodeId !== undefined) {
        const text = f.token === 'unseen' ? REVIEW_TEXTS.backstopUnseen(sentence(id), sentence(f.nodeId)) : REVIEW_TEXTS.backstopUnselected(sentence(id), sentence(f.nodeId));
        refusals.push({ code: 'b2', text, ...(f.names?.[0] !== undefined ? { name: f.names[0] } : {}), arrow: { source: f.nodeId, target: id } });
      }
    }
  }
  for (const f of arrowFindings(sc)) {
    if (f.token !== 'cycle') continue;
    const cycle = f.names ?? [];
    refusals.push({ code: 'cycle', text: REVIEW_TEXTS.backstopCycle(cycle.map(sentence)), ...(cycle.length > 1 ? { arrow: { source: cycle[0] as string, target: cycle[1] as string } } : {}) });
  }
  for (const f of holdsKindFindings(sc)) {
    const card = f.nodeId ?? '';
    refusals.push({ code: 'kind', text: REVIEW_TEXTS.backstopKind(f.token ?? '', sentence(card)), ...(f.names?.[0] !== undefined ? { name: f.names[0] } : {}) });
  }

  // ---- scc: a cycle of items with an accepted member is wholly accepted (§4.5)
  const present = owned.map((d) => d.key).filter((k) => Object.hasOwn(judgement.deps, k));
  for (const component of stronglyConnected(present, (k) => (judgement.deps[k] ?? []).filter((x) => present.includes(x)))) {
    if (component.length < 2) continue;
    const members = component.map((k) => records.get(k));
    const acceptedMembers = members.filter((r) => r?.status === 'accepted').length;
    if (acceptedMembers === 0 || acceptedMembers === members.length) continue;
    refusals.push({ code: 'scc', text: REVIEW_TEXTS.acceptOrRejectTogether(component.map((k) => labelOf(draftByKey.get(k) as ItemDraft))) });
  }

  return { ok: refusals.length === 0, refusals };
}
