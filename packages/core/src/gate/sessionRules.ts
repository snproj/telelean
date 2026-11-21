/**
 * Slice 2b1b (docs/slice2-plan.md sections 2.7 and 4.9): the gate's rules for an edit session, built on 2b1a's rule
 * helpers (`rules.ts`) and composed by review's `judgeState` (`review/judge.ts`). `evaluateRules` (M2, slice 1) never
 * calls them, so its behaviour is unchanged.
 *
 * What is new here, each rule returning its findings in the order it finds them:
 *  - the step limits (`existing-changed`, D2-41): every declaration of S₀ keeps its text, place and meaning (printed type
 *    and value, valueConsts and typeConsts sets) unless the scope opens it; token `session` for content proposed earlier
 *    in the session;
 *  - G5 against S₀ (B when no step runs): Claude changes no field; telelean's ledger writes and the scope cards' pins
 *    pass; `follows_from:` goes only through a ledger `mark-removed`; new blocks only for ledger premises;
 *  - B.3 (`arrow`) and B.4 (`holds-kind`);
 *  - `new-axiom` against B by name and type (token `type-changed` for a reused name);
 *  - `stray-command` (D2-52, AP-26);
 *  - B.1's footprints per inference, and B.2 (`undeclared-premise`) with E(T);
 *  - proof material stays with its Result (`undeclared-premise`, token `other-result`, D2-50).
 *
 * Messages are Claude's (exact, with `file:line:col`); the board's sentences are `describeFinding`'s.
 *
 * Pure TypeScript: no Node or vscode APIs (the webview bundles core).
 */
import type { ArrowEnds } from '../actions.js';
import { holdsName, SORRY_AXIOM, statementOfHolds, type DeclFacts } from '../facts.js';
import { relativeName } from '../markup/names.js';
import type { MarkupBlock, ParsedFile } from '../markup/types.js';
import { splitList } from '../markup/values.js';
import type { Range, TlNode } from '../model.js';
import { edgesOf } from '../project/build.js';
import type { ProjectModel } from '../project/types.js';
import { cutText, LineMap, normalizeWhitespace } from '../project/text.js';
import { constsOf, usesOrRefs } from '../review/closure.js';
import { compareTexts, otherBlockLines, type AddedTextUnit } from '../review/items.js';
import { arrowKey } from '../review/keys.js';
import { CLAUDE_SESSION_TEXTS } from '../review/texts.js';
import type { ItemRecord, LedgerEntry, PremiseDraft, SessionInference, StepScope } from '../review/types.js';
import { axiomNames, declTables, factsOf, isAxiom, isProof, type DeclTables } from './decls.js';
import { where } from './g0.js';
import { UNSEEN_PROOF, type Judged, type RuleContext } from './rules.js';
import type { FrozenSnapshot, GateFinding } from './types.js';

/** What a session judges a state for (`JudgeInput.purpose`). */
export type JudgePurpose = 'check' | 'freeze' | 'gate-proved' | 'gate-other' | 'stage' | 'final';
/** The purposes of a running step: its limits, S₀ and freeze apply. */
export const STEP_PURPOSES: ReadonlySet<JudgePurpose> = new Set(['check', 'freeze', 'gate-proved', 'gate-other']);

const quote = (text: string) => JSON.stringify(text);
const norm = (text: string | undefined) => (text === undefined ? undefined : normalizeWhitespace(text));
const sortedSet = (list: readonly string[]) => [...new Set(list)].sort().join('\u0000');
const sameArrow = (a: ArrowEnds, b: ArrowEnds) => a.source === b.source && a.target === b.target;

/** Raw values of one key's lines of a block, in order. */
function raws(block: MarkupBlock, key: string): string[] {
  return block.lines.filter((line) => line.key === key).map((line) => line.raw);
}

/** A list field's entries (the parser's split), across its lines. */
function entries(block: MarkupBlock, key: string): string[] {
  return raws(block, key).flatMap((raw) => splitList(raw).items);
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

/** A card has a statement bound to its block (adjacent or pinned). */
function bound(node: TlNode | undefined): string | undefined {
  return node !== undefined && node.lean.binding !== 'none' ? node.lean.statement : undefined;
}

/** What the session rules read of one judged state (`sessionRuleContext`). */
export interface SessionRuleContext {
  readonly purpose: JudgePurpose;
  readonly stage: 'formalise' | 'prove';
  /** A step purpose with its scope and S₀ (`STEP_PURPOSES`). */
  readonly step: boolean;
  readonly base: ProjectModel;
  readonly current: ProjectModel;
  /** S₀ at step purposes, else B: what G5, B.4, the stray-command rule and the step limits compare with. */
  readonly reference: ProjectModel;
  readonly stepStart?: ProjectModel;
  readonly scope?: StepScope;
  readonly freeze?: FrozenSnapshot;
  readonly inferences: readonly SessionInference[];
  readonly ledger: readonly LedgerEntry[];
  readonly items: readonly ItemRecord[];
  readonly premises: readonly PremiseDraft[];
  readonly rejectedArrows: readonly ArrowEnds[];
  /** 2b1a's context of B and the judged state (the declaration diff since B, the texts the findings use, footprints). */
  readonly ctx: RuleContext;
  readonly B: DeclTables;
  readonly S: DeclTables;
  readonly R: DeclTables;
  /** Every target of the session (and the active step's). */
  readonly targets: ReadonlySet<string>;
  /** The question each target is judged against: the active step's (its StepScope's) for its target, else the session's. */
  readonly questionOf: (target: string) => SessionInference['question'] | undefined;
  /**
   * The question an earlier step's declarations of `target`'s inference are judged against (fixer 2b1b r1,
   * C-V2B1B-C2), and what the target's `.holds` mentions (`other-result`, fixer 2b1b r2): `questionOf`, except for the
   * active step's target in a re-ask (§3.2, D2-46) when the step's question does not apply to them yet: then the
   * inference's question on the record, which a finish without a proof keeps. The step's question applies at a proved
   * finish, and by check_lean once T.holds changed since S₀ (as T.holds is judged).
   */
  readonly materialQuestionOf: (target: string) => SessionInference['question'] | undefined;
  /**
   * The step that created a declaration and its target and phase: the ledger's `created` entry (D2-43); for the active
   * step, which has none yet, its declarations new since S₀: `statements` when its freeze holds them, `proof` after a
   * freeze, and before one `proof` at a finish (as its end will record, §3.4) and `statements` otherwise (it is still
   * formalising). Undefined for B's declarations and unrecorded ones. `active`: the running step made it (no ledger
   * entry yet).
   */
  readonly creatorOf: (name: string) => { target: string; phase: 'statements' | 'proof'; active: boolean } | undefined;
  /** The cards whose `.holds` is a session proof in this state, by that `.holds`'s name (D2-50's "content in ws/"). */
  readonly sessionHolds: ReadonlyMap<string, string>;
  readonly sentence: (id: string) => string;
}

/** The context of one judged state (see `SessionRuleContext`). `ctx`: 2b1a's context on B and `current`. */
export function sessionRuleContext(i: {
  purpose: JudgePurpose;
  stage: 'formalise' | 'prove';
  base: ProjectModel;
  current: ProjectModel;
  stepStart?: ProjectModel;
  scope?: StepScope;
  freeze?: FrozenSnapshot;
  inferences: readonly SessionInference[];
  ledger: readonly LedgerEntry[];
  items: readonly ItemRecord[];
  premises: readonly PremiseDraft[];
  rejectedArrows: readonly ArrowEnds[];
  ctx: RuleContext;
  sessionProof: (target: string) => boolean;
  /**
   * The questions on the record (`JudgeInput.inferences` before the active step's question replaced its target's), and
   * whether the step's question applies to its target's earlier material (see `materialQuestionOf`).
   */
  recorded?: readonly SessionInference[];
  stepQuestionForMaterial?: boolean;
}): SessionRuleContext {
  const step = STEP_PURPOSES.has(i.purpose) && i.scope !== undefined && i.stepStart !== undefined;
  const scope = step ? i.scope : undefined;
  const stepStart = step ? i.stepStart : undefined;
  const reference = stepStart ?? i.base;
  const B = declTables(i.base);
  const S = declTables(i.current);
  const R = declTables(reference);
  const targets = new Set<string>([...i.inferences.map((inf) => inf.target), ...(scope ? [scope.target] : [])]);
  const questionOf = (target: string) => (scope !== undefined && scope.target === target ? scope.question : i.inferences.find((inf) => inf.target === target)?.question);
  const materialQuestionOf = (target: string) => {
    if (scope === undefined || scope.target !== target || i.stepQuestionForMaterial !== false) return questionOf(target);
    return (i.recorded ?? i.inferences).find((inf) => inf.target === target)?.question ?? questionOf(target);
  };
  const created = new Map<string, Extract<LedgerEntry, { kind: 'created' }>>();
  for (const entry of i.ledger) if (entry.kind === 'created' && !created.has(entry.name)) created.set(entry.name, entry);
  const stepTarget = new Map<string, string>();
  for (const inference of i.inferences) for (const s of inference.steps) stepTarget.set(s, inference.target);
  if (scope) stepTarget.set(scope.step, scope.target);
  const finish = i.purpose === 'gate-proved' || i.purpose === 'gate-other';
  const creatorOf = (name: string): { target: string; phase: 'statements' | 'proof'; active: boolean } | undefined => {
    const entry = created.get(name);
    if (entry !== undefined) {
      const target = stepTarget.get(entry.step);
      return target === undefined ? undefined : { target, phase: entry.phase, active: scope !== undefined && entry.step === scope.step };
    }
    if (scope === undefined || stepStart === undefined) return undefined;
    if (R.byName.has(name) || stepStart.declFacts.has(name) || !(S.byName.has(name) || i.current.declFacts.has(name))) return undefined;
    const phase = i.freeze !== undefined ? (i.freeze.declarations[name] !== undefined ? 'statements' : 'proof') : finish ? 'proof' : 'statements';
    return { target: scope.target, phase, active: true };
  };
  const sessionHolds = new Map<string, string>();
  for (const target of targets) {
    const statement = i.current.nodes.get(target)?.node.lean.statement;
    if (statement !== undefined && i.sessionProof(target)) sessionHolds.set(holdsName(statement), target);
  }
  return {
    purpose: i.purpose,
    stage: i.stage,
    step,
    base: i.base,
    current: i.current,
    reference,
    ...(stepStart !== undefined ? { stepStart } : {}),
    ...(scope !== undefined ? { scope } : {}),
    ...(i.freeze !== undefined ? { freeze: i.freeze } : {}),
    inferences: i.inferences,
    ledger: i.ledger,
    items: i.items,
    premises: i.premises,
    rejectedArrows: i.rejectedArrows,
    ctx: i.ctx,
    B,
    S,
    R,
    targets,
    questionOf,
    materialQuestionOf,
    creatorOf,
    sessionHolds,
    sentence: i.ctx.sentence,
  };
}

/** The `.holds` of a card's statement in the judged state (else in B), or `<id>.holds`. */
function holdsOfCard(c: SessionRuleContext, id: string): string {
  const statement = c.current.nodes.get(id)?.node.lean.statement ?? c.base.nodes.get(id)?.node.lean.statement;
  return statement !== undefined ? holdsName(statement) : `${id}.holds`;
}

/**
 * Slice 1's messages reused on S₀ speak of "the run"; in a session the reference is the step's start (2b1b): "before
 * the run" becomes "when this step started", "in this run" and "in the run" "in this step", "in this round" "in this
 * step".
 */
export function stepWording(findings: readonly GateFinding[]): GateFinding[] {
  return findings.map((f) => ({
    ...f,
    message: f.message
      .replace(/ before the run\b/g, ' when this step started')
      .replace(/ in (?:this|the) run\b/g, ' in this step')
      .replace(/ in this round\b/g, ' in this step'),
  }));
}

/**
 * Slice 1's `example` message reused in a session (fixer 2b1b r1, C-V2B1B-C5): it suggests `#check`, which the
 * session's `stray-command` rule refuses; in a session the advice is a named lemma only.
 */
export function sessionExampleWording(findings: readonly GateFinding[]): GateFinding[] {
  return findings.map((f) => ({ ...f, message: f.message.replace('(to try something out, use #check or a named lemma)', '(to try something out, use a named lemma)') }));
}

// ---------------------------------------------------------------------------------------------
// The step limits (ES-2's preset, D2-41)

/**
 * The step limits (step purposes): every declaration of S₀ keeps its text, its place and its meaning (printed type and
 * value, and the sets of valueConsts and typeConsts, where both states have them), unless the scope opens it: the
 * target's `.holds` under `openProof`, the declarations of `openNames` (those of `openItems`, and under `openProof` the
 * proof material of the target's Result but at a finish without a proof, judgeState's), and the fuzzy cards' fills,
 * which are new declarations. Code `existing-changed`: token `session` for content proposed earlier in this session (not
 * in B as it is in S₀; `coveredAtStart`: the names some item of S₀ provides, so the message says the person reviews it
 * only then, and token `uncovered` for the rest, fixer 2b1b r2, R1-3), `target` for the target's statement,
 * `closed-proof` for its `.holds` while the proof is closed, added, changed, removed or moved (fixer 2b1b r1, S-F4),
 * else `removed`, `changed` or `meaning`. Also a line of S₀'s text outside declarations that the step
 * removed or moved (`text`, S-F4): the person's text stays where it is, and computeItems would report it unowned
 * (builder 2b1b); the comment lines and enclosing lines of opened content are opened with it (fixer 2b1b r1, S-F2).
 */
export function stepLimitFindings(c: SessionRuleContext, openNames: ReadonlySet<string>, coveredAtStart?: ReadonlySet<string>): GateFinding[] {
  const scope = c.scope;
  const stepStart = c.stepStart;
  if (!c.step || scope === undefined || stepStart === undefined) return [];
  const { current, B, S, R, ctx } = c;
  const out: GateFinding[] = [];
  const texts = compareTexts(stepStart, current);
  const targetStatements = new Set([stepStart.nodes.get(scope.target)?.node.lean.statement, current.nodes.get(scope.target)?.node.lean.statement].filter((s): s is string => s !== undefined));
  const targetHolds = new Set([...targetStatements].map(holdsName));
  for (const [name, before] of R.byName) {
    if (openNames.has(name)) continue;
    const isHolds = targetHolds.has(name);
    if (isHolds && scope.openProof) continue;
    const entry = S.byName.get(name);
    const session = B.byName.get(name)?.text !== before.text;
    // A-ADV-3: session content that no item of S₀ provides is no proposal the person reviews (an anomaly): say so
    // plainly, to Claude and on the board (token `uncovered`, fixer 2b1b r2, R1-3).
    const covered = coveredAtStart === undefined || coveredAtStart.has(name);
    const token = session ? (covered ? 'session' : 'uncovered') : targetStatements.has(name) ? 'target' : isHolds ? 'closed-proof' : undefined;
    const owner = ctx.ownerOf(stepStart, name);
    const common = { step: 'G3' as const, code: 'existing-changed' as const, names: [name], ...(owner !== undefined ? { nodeId: owner } : {}) };
    const why = session
      ? covered
        ? `${name} was proposed earlier in this session, and the person reviews it: ${CLAUDE_SESSION_TEXTS.leaveAsIs}; restore it.`
        : `${name} was written earlier in this session, and no review item covers it: ${CLAUDE_SESSION_TEXTS.leaveAsIs}; restore it.`
      : CLAUDE_SESSION_TEXTS.stepLimit(name);
    const closed = isHolds ? ` (the target's proof is closed in this step${scope.statementsOnly !== undefined ? ': it only formalises the statements' : ''})` : '';
    if (entry === undefined) {
      out.push({ ...common, message: `${ctx.loc(before)}${why}${closed} It was removed.`, token: token ?? 'removed', file: before.file.path, range: before.decl.range });
      continue;
    }
    if (entry.text !== before.text) {
      out.push({ ...common, message: `${ctx.loc(entry)}${why}${closed}`, token: token ?? 'changed', ...ctx.at(entry) });
      continue;
    }
    if (texts.moved.has(name)) {
      out.push({ ...common, message: `${ctx.loc(entry)}${why} It was moved: a declaration stays where it is.`, token: token ?? 'changed', ...ctx.at(entry) });
      continue;
    }
    const was = factsOf(stepStart, name, before);
    const now = factsOf(current, name, entry);
    if (was === undefined || now === undefined) continue;
    const changed = meaningChange(was, now);
    if (changed === undefined) continue;
    out.push({
      ...common,
      message: `${ctx.loc(entry)}${why} Its text is unchanged, but its meaning changed (${changed}), e.g. through an \`open … in\` or a declaration placed before it.`,
      token: token ?? 'meaning',
      ...ctx.at(entry),
    });
  }
  // The target's `.holds` while its proof is closed: none may be added either.
  if (!scope.openProof) {
    for (const name of targetHolds) {
      if (R.byName.has(name) || stepStart.declFacts.has(name)) continue;
      const entry = S.byName.get(name);
      if (entry === undefined && !current.declFacts.has(name)) continue;
      out.push({
        step: 'G3',
        code: 'existing-changed',
        message: `${ctx.loc(entry)}${name} was added, but the target's proof is closed in this step${scope.statementsOnly !== undefined ? ` (it only formalises the statements: “${scope.statementsOnly}” was not proved)` : ''}: remove it, and leave the target's .holds as it was when this step started.`,
        names: [name],
        nodeId: scope.target,
        token: 'closed-proof',
        ...ctx.at(entry),
      });
    }
  }
  // The text outside declarations (commands, comments) that the step removed or moved: the person's stays where it is.
  // S-F2: a line that belongs to opened content goes with it, as computeItems attached it when it came (B -> S₀): a
  // comment attached to an opened declaration, and an enclosing line whose declarations are all opened.
  // The target's `.holds` under `openProof`, but at a finish without a proof, which leaves its Result as it was (ES-2).
  const opened = (name: string) => openNames.has(name) || (scope.openProof && c.purpose !== 'gate-other' && targetHolds.has(name));
  const ofContent = new Map<string, AddedTextUnit>();
  for (const file of compareTexts(c.base, stepStart).files) for (const unit of file.added) if (unit.kind === 'line') ofContent.set(`${file.path}\u0000${unit.span.start}`, unit);
  for (const file of texts.files) {
    const lines = new LineMap(stepStart.files.get(file.path)?.text ?? '');
    for (const unit of file.removed) {
      if (unit.kind !== 'line') continue;
      const came = ofContent.get(`${file.path}\u0000${unit.span.start}`);
      if (came?.attachedTo !== undefined && opened(came.attachedTo)) continue;
      if (came?.enclosing === true && (came.encloses ?? []).length > 0 && (came.encloses ?? []).every(opened)) continue;
      const position = lines.positionAt(unit.span.start);
      const text = cutText(unit.text ?? '', 80);
      out.push({
        step: 'G3',
        code: 'existing-changed',
        message: `${file.path}:${position.line + 1}: \`${text}\` stood here when this step started and was removed or moved: text outside declarations stays exactly as it is; restore it.`,
        names: [text],
        token: 'text',
        file: file.path,
      });
    }
  }
  return out;
}

/** D2-41 (exported for B.1's session proofs, fixer 2b1b r1): a `.holds` whose text is unchanged but whose meaning changed. */
export function meaningChanged(ref: ProjectModel, current: ProjectModel, name: string): boolean {
  const was = factsOf(ref, name, declTables(ref).byName.get(name));
  const now = factsOf(current, name, declTables(current).byName.get(name));
  return was !== undefined && now !== undefined && meaningChange(was, now) !== undefined;
}

/** D2-41: how a declaration's meaning changed (kind, printed type or value, value or type constants), or undefined. */
function meaningChange(was: DeclFacts, now: DeclFacts): string | undefined {
  if (was.kind !== undefined && now.kind !== undefined && was.kind !== now.kind) return `it was a ${was.kind}, now a ${now.kind}`;
  if (was.type !== undefined && now.type !== undefined && norm(was.type) !== norm(now.type)) return `its type was \`${norm(was.type)}\`, now \`${norm(now.type)}\``;
  if (was.value !== undefined && now.value !== undefined && norm(was.value) !== norm(now.value)) return `its value was \`${norm(was.value)}\`, now \`${norm(now.value)}\``;
  if (was.valueConsts !== undefined && now.valueConsts !== undefined && sortedSet(was.valueConsts) !== sortedSet(now.valueConsts)) return 'the constants its value uses changed';
  if (was.typeConsts !== undefined && now.typeConsts !== undefined && sortedSet(was.typeConsts) !== sortedSet(now.typeConsts)) return 'the constants its type uses changed';
  return undefined;
}

// ---------------------------------------------------------------------------------------------
// G5 in a session

/** Block fields compared raw (`type:` among them); `premises:`, `follows_from:`, `id` and `lean` have their own rules. */
const SESSION_FIELDS = ['natural_name', 'rationale', 'type', 'stance', 'source', 'asserted', 'supersedes', 'refines', 'tags', 'origin', 'session', 'worded_by'] as const;

/**
 * G5 against the reference (S₀ at step purposes, B otherwise, §4.9): Claude changes no field. The exceptions are
 * telelean's ledger writes and the scope cards' pins:
 *  - `premises:` (as entries): an entry the reference lacks only for a ledger `arrow` entry into this card (at a step,
 *    the step's own), or a ledger `premise` entry for it (B.3 judges those further); a ledger arrow whose item the
 *    person declined is B.3's `declined` alone (fixer 2b1b r2, R1-4); none removed;
 *  - `follows_from:` goes only through a ledger `mark-removed` for this card;
 *  - a `lean:` line only added, by normalisation, for a card in `pinnable` that the reference had bound to nothing,
 *    naming the new declaration directly below its block; a card bound in the reference keeps its statement, and no
 *    other card becomes bound (`formalised`);
 *  - `type:` and every other field, the markup version, the extensions and the notes: unchanged; ids as slice 1;
 *  - new blocks only for ledger premises; no block removed or moved.
 */
export function sessionMarkupFindings(c: SessionRuleContext, pinnable: ReadonlySet<string>): GateFinding[] {
  const { reference, current } = c;
  const out: GateFinding[] = [];
  const R = c.R;
  const idsOf = (model: ProjectModel) => new Map<MarkupBlock, string>([...model.nodes.values()].map((n) => [n.block, n.node.id]));
  const refIds = idsOf(reference);
  const curIds = idsOf(current);
  const keyOf = (ids: Map<MarkupBlock, string>, block: MarkupBlock) => ids.get(block) ?? block.id;
  const premiseCards = new Map<string, string>();
  for (const e of c.ledger) if (e.kind === 'premise') premiseCards.set(e.card, e.target);
  // At a step, only the step's own ledger arrows are telelean's to draw (its normalise writes them): an earlier step's
  // arrow missing from S₀ was taken out by a decision, and re-drawing it by hand skips propose_arrow (fixer 2b1b r1,
  // A-ADV-5). At a stage and at the end, any ledger arrow (a declined one is B.3's `declined`).
  const activeStep = c.step ? c.scope?.step : undefined;
  const arrowInto = (source: string, target: string) =>
    c.ledger.some((e) => e.kind === 'arrow' && e.source === source && e.target === target && (activeStep === undefined || e.step === activeStep));
  // A ledger arrow whose item the person declined, drawn again, is B.3's `declined` alone, which names the decline (B.3
  // reports exactly these: an entry added here is drawn): one finding per problem, at a step too (fixer 2b1b r2, R1-4).
  const declinedItems = new Set(c.items.filter((r) => r.status === 'declined').map((r) => r.key));
  const declinedArrow = (source: string, target: string) =>
    declinedItems.has(arrowKey(source, target)) && c.ledger.some((e) => e.kind === 'arrow' && e.source === source && e.target === target);
  const marked = (card: string) => c.ledger.some((e) => e.kind === 'mark-removed' && e.card === card);
  const byKey = new Map<ParsedFile, Map<string, MarkupBlock[]>>();
  const blocksOf = (file: ParsedFile | undefined, ids: Map<MarkupBlock, string>, key: string): MarkupBlock[] => {
    if (!file) return [];
    let table = byKey.get(file);
    if (!table) {
      table = new Map();
      for (const block of file.blocks) {
        const k = keyOf(ids, block);
        const list = table.get(k) ?? [];
        list.push(block);
        table.set(k, list);
      }
      byKey.set(file, table);
    }
    return table.get(key) ?? [];
  };
  const finding = (block: MarkupBlock, file: string, key: string, token: string, message: string, names?: string[]): GateFinding => ({
    step: 'G5',
    code: 'markup',
    message: `${where(file, block.range)}: ${message}`,
    nodeId: key,
    token,
    file,
    range: block.range,
    ...(names ? { names } : {}),
  });
  const matched = new Set<MarkupBlock>();
  const moved = new Set<string>();
  const files = [...reference.files.values()].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  for (const rFile of files) {
    const cFile = current.files.get(rFile.path);
    const seen = new Map<string, number>();
    for (const rBlock of rFile.blocks) {
      const key = keyOf(refIds, rBlock);
      const k = seen.get(key) ?? 0;
      seen.set(key, k + 1);
      const sBlock = blocksOf(cFile, curIds, key)[k];
      const label = `the block ${key} (${quote(rBlock.fields.naturalName ?? c.sentence(key))})`;
      if (!sBlock) {
        const elsewhere = [...current.files.values()].find((f) => f.path !== rFile.path && blocksOf(f, curIds, key).length > 0);
        if (elsewhere) moved.add(key);
        out.push(
          elsewhere
            ? finding(rBlock, rFile.path, key, 'moved', `${label} moved from ${rFile.path} to ${elsewhere.path}: blocks stay in their file; move it back.`)
            : finding(rBlock, rFile.path, key, 'removed', `${label} was removed: never add or delete blocks; restore it exactly.`),
        );
        continue;
      }
      matched.add(sBlock);
      const path = rFile.path;
      const found = out.length;
      for (const field of SESSION_FIELDS) {
        const was = raws(rBlock, field);
        const now = raws(sBlock, field);
        if (was.length === now.length && was.every((x, j) => x === now[j])) continue;
        const show = (list: string[]) => (list.length === 0 ? '(absent)' : list.map(quote).join(', '));
        const words = field === 'natural_name' || field === 'rationale';
        out.push(
          finding(sBlock, path, key, field, `${label} changed its \`${field}:\` (${show(was)} → ${show(now)}): ${words ? "the person's words are the specification and stay byte-identical" : 'never change any field of a block'}; restore it.`),
        );
      }
      // premises: telelean writes the ledger's arrows and premises; Claude proposes arrows with propose_arrow.
      const premisesWas = entries(rBlock, 'premises');
      const premisesNow = entries(sBlock, 'premises');
      const added = minus(premisesNow, premisesWas).filter((source) => !arrowInto(source, key) && !declinedArrow(source, key) && premiseCards.get(source) !== key);
      const removed = minus(premisesWas, premisesNow);
      if (added.length > 0 || removed.length > 0) {
        out.push(
          finding(
            sBlock,
            path,
            key,
            'premises',
            `${label} changed its \`premises:\` (${[...added.map((s) => `+${s}`), ...removed.map((s) => `-${s}`)].join(', ')}): never edit \`premises:\`; propose an arrow with propose_arrow (telelean writes it), and never remove one; restore it.`,
          ),
        );
      }
      const marksWas = raws(rBlock, 'follows_from');
      const marksNow = raws(sBlock, 'follows_from');
      const markGone = marksWas.length > 0 && marksNow.length === 0 && marked(key);
      if (!markGone && (marksWas.length !== marksNow.length || marksWas.some((x, j) => x !== marksNow[j]))) {
        out.push(
          finding(sBlock, path, key, 'follows_from', `${label} changed its \`follows_from:\`: only the person sets or removes "follows from nothing" (it goes when they accept a premise); restore it.`),
        );
      }
      if (rBlock.version !== sBlock.version) out.push(finding(sBlock, path, key, 'version', `${label} changed its markup version: restore \`@@ telelean v${rBlock.version}\`.`));
      if (JSON.stringify(rBlock.extensions) !== JSON.stringify(sBlock.extensions)) out.push(finding(sBlock, path, key, 'extension', `${label} changed its extension fields: restore them.`));
      if ((rBlock.body ?? '') !== (sBlock.body ?? '')) out.push(finding(sBlock, path, key, 'body', `${label} changed its notes (after \`---\`): restore them.`));
      const idWas = raws(rBlock, 'id');
      const idNow = raws(sBlock, 'id');
      const idOk = rBlock.idWritten ? idWas.length === idNow.length && idWas.every((x, j) => x === idNow[j]) : idNow.length === 0 || (idNow.length === 1 && (idNow[0] === key || idNow[0] === rBlock.id));
      if (!idOk) out.push(finding(sBlock, path, key, 'id', `${label} changed its \`id:\` line: ids are stable; restore it.`));
      const leanWas = raws(rBlock, 'lean');
      const leanNow = raws(sBlock, 'lean');
      const rNode = reference.nodes.get(key)?.node;
      const sNode = current.nodes.get(key)?.node;
      let leanFinding = false;
      if (leanWas.length > 0 && (leanWas.length !== leanNow.length || leanWas.some((x, j) => x !== leanNow[j]))) {
        leanFinding = true;
        out.push(
          finding(
            sBlock,
            path,
            key,
            'lean',
            `${label}'s \`lean:\` line changed (${leanWas.join(', ')} → ${leanNow.length > 0 ? leanNow.join(', ') : '(removed)'}): a \`lean:\` line is never changed or removed; restore it.`,
            [rNode?.lean.statement ?? leanWas[0], sNode?.lean.statement ?? leanNow[0]].filter((n): n is string => n !== undefined && n !== ''),
          ),
        );
      } else if (leanWas.length === 0 && leanNow.length > 0) {
        const pinned = sNode?.lean.statement;
        const adjacent = sBlock.binding.adjacentDecl !== undefined ? current.files.get(path)?.decls[sBlock.binding.adjacentDecl]?.fullName : undefined;
        const legal = pinnable.has(key) && rBlock.binding.mode === 'none' && pinned !== undefined && pinned === adjacent && !R.known.has(pinned);
        if (!legal) {
          leanFinding = true;
          out.push(
            finding(
              sBlock,
              path,
              key,
              'lean',
              `a \`lean:\` line was added to ${label}: telelean pins a statement itself, and only for the empty statements at the selected arrows, naming the declaration directly below the block; remove it.`,
              [pinned ?? leanNow[0]].filter((n): n is string => n !== undefined && n !== ''),
            ),
          );
        }
      }
      if (!leanFinding && rNode && sNode) {
        const was = bound(rNode);
        const now = bound(sNode);
        if (was !== undefined && was !== now) {
          out.push(
            finding(
              sBlock,
              path,
              key,
              'binding',
              `the card ${key} was bound to ${was} and is now bound to ${now ?? 'nothing'}: a formalised card keeps its statement; put any new declaration elsewhere (not directly below its block).`,
              now !== undefined ? [was, now] : [was],
            ),
          );
        } else if (was === undefined && now !== undefined && !pinnable.has(key)) {
          out.push(
            finding(
              sBlock,
              path,
              key,
              'formalised',
              `the card ${key} (${quote(sNode.naturalName)}) has no empty statement this step may fill, but is now bound to ${now}: formalise only the empty statements at the selected arrows; leave a blank line between its block and that declaration, or move the declaration.`,
              [now],
            ),
          );
        }
      }
      // Every other line of the block, as written and in order (computeItems' F1 rule): lines swapped between fields,
      // or a line that is no field, change no field above, yet no item can hold them (fixer 2b1b r1, A-ADV-3). Only
      // when no field rule above spoke for this block: one finding per problem.
      if (out.length === found) {
        const linesWas = otherBlockLines(rFile.text, rBlock).map((l) => l.text);
        const linesNow = otherBlockLines(cFile?.text ?? '', sBlock).map((l) => l.text);
        if (linesWas.length !== linesNow.length || linesWas.some((x, j) => x !== linesNow[j])) {
          out.push(finding(sBlock, path, key, 'lines', `${label}'s lines changed (moved, added or rewritten): a block's lines stay exactly as written, in their order; restore them.`));
        }
      }
    }
  }
  // New blocks: only the cards telelean wrote for accepted premises (ledger `premise`).
  for (const cFile of [...current.files.values()].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    for (const sBlock of cFile.blocks) {
      if (matched.has(sBlock)) continue;
      const key = keyOf(curIds, sBlock);
      if (moved.has(key) || premiseCards.has(key)) continue;
      out.push(finding(sBlock, cFile.path, key, 'block', `a new telelean block (${key}) was added: never add or delete blocks; propose a missing premise with propose_assumption instead.`));
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// B.3: arrows

/** Where arrows lead (source -> targets): the drawn ones (propositions' `premises:`) and the solid ones (verified edges). */
function arrowGraph(model: ProjectModel): Map<string, string[]> {
  const next = new Map<string, string[]>();
  const add = (source: string, target: string) => {
    if (source === target) return;
    const list = next.get(source) ?? [];
    if (!list.includes(target)) list.push(target);
    next.set(source, list);
  };
  for (const { node } of model.nodes.values()) {
    if (node.type !== 'PROPOSITION') continue;
    for (const premise of node.premises) if (model.nodes.has(premise)) add(premise, node.id);
  }
  for (const edge of edgesOf(model).edges) if (edge.type === 'verified') add(edge.source, edge.target);
  return next;
}

/** A shortest path `from` … `to` along the arrows, or undefined. */
function pathBetween(next: ReadonlyMap<string, readonly string[]>, from: string, to: string): string[] | undefined {
  const parent = new Map<string, string>();
  const seen = new Set([from]);
  const queue = [from];
  while (queue.length > 0) {
    const id = queue.shift() as string;
    if (id === to) {
      const path = [to];
      for (let at = to; at !== from; ) {
        at = parent.get(at) as string;
        path.unshift(at);
      }
      return path;
    }
    for (const target of next.get(id) ?? []) {
      if (seen.has(target)) continue;
      seen.add(target);
      parent.set(target, id);
      queue.push(target);
    }
  }
  return undefined;
}

/**
 * The cycle a new arrow `source -> target` would close in `model` (the path target … source, then source), named by
 * card ids, or undefined (AR-3; 1b's rule, over the drawn and solid arrows).
 */
export function cycleThrough(model: ProjectModel, source: string, target: string): string[] | undefined {
  const back = pathBetween(arrowGraph(model), target, source);
  return back === undefined ? undefined : [source, ...back];
}

/** One proposed arrow's problem (propose_arrow's and B.3's), with its token and its text for Claude, or undefined. */
export interface ArrowProblem {
  token: string;
  text: string;
}

/**
 * propose_arrow's checks of one arrow `source -> target` against the step's limits (§4.9, D2-21, D2-50), in order:
 * the step only formalises statements; another target than the step's; an unknown card, vocabulary, another subject or
 * a self-arrow; an arrow into an axiom; a target questioned by its mark; a source with no `.holds`; another target of
 * the session; an arrow the person declined; one drawn already (`model`'s, and a ledger arrow not declined); a cycle.
 * `drawnIn`: the state "drawn already" reads (S₀ at the gate, the working copy at a proposal). B.3 runs the same checks
 * on the arrows the step added, except `other-target` for an earlier step's (check 3's exception, §4.12).
 */
export function arrowProblems(i: {
  model: ProjectModel;
  drawnIn: ProjectModel;
  scope: StepScope;
  inferences: readonly SessionInference[];
  ledger: readonly LedgerEntry[];
  rejectedArrows: readonly ArrowEnds[];
  source: string;
  target: string;
  /** The arrow is already in the ledger (B.3 re-checks it): its own entry is no "drawn already". */
  inLedger: boolean;
}): ArrowProblem[] {
  const { model, scope, source, target } = i;
  const T = CLAUDE_SESSION_TEXTS;
  const out: ArrowProblem[] = [];
  const name = (id: string) => cutText(model.nodes.get(id)?.node.naturalName ?? id, 40);
  if (scope.statementsOnly !== undefined) out.push({ token: 'not-target', text: T.statementsOnly(scope.statementsOnly) });
  if (target !== scope.target) out.push({ token: 'not-target', text: T.arrowNotTarget(scope.target) });
  const targetNode = model.nodes.get(target)?.node;
  const sourceNode = model.nodes.get(source)?.node;
  if (source === target) out.push({ token: 'cycle', text: T.arrowSelf });
  if (targetNode === undefined) out.push({ token: 'unknown-card', text: T.arrowUnknown(target) });
  if (sourceNode === undefined) {
    out.push({ token: 'unknown-card', text: model.vocabulary.some((v) => v.name === source) ? T.arrowVocabulary(source) : T.arrowUnknown(source) });
  } else if (targetNode !== undefined && sourceNode.subject !== targetNode.subject) {
    out.push({ token: 'unknown-card', text: T.arrowOtherSubject(name(source), sourceNode.subject) });
  }
  if (targetNode?.type === 'AXIOM') out.push({ token: 'into-axiom', text: T.arrowIntoAxiom(target) });
  if (target === scope.target && (scope.question.fromNothing || (!scope.openArrows && scope.statementsOnly === undefined))) out.push({ token: 'mark', text: T.arrowMark(target) });
  if (sourceNode !== undefined && sourceNode.lean.justification === undefined) out.push({ token: 'no-holds', text: T.arrowNoHolds(source) });
  const targets = new Set(i.inferences.map((inf) => inf.target));
  if (source !== target && (targets.has(source) || source === scope.target) && !i.inLedger) out.push({ token: 'other-target', text: T.arrowOtherTarget(source, target) });
  if (i.rejectedArrows.some((a) => sameArrow(a, { source, target }))) out.push({ token: 'declined', text: T.arrowDeclined(source, target) });
  const drawnAt = i.drawnIn.nodes.get(target)?.node.premises.includes(source) === true;
  // A ledger arrow of this step that is not declined is proposed already (drawn at the next normalise); a declined one
  // is `declined` above. An earlier step's arrow that is not drawn was taken out by a decision (a cascade's revert), so
  // Claude may propose it again (fixer 2b1b r1, A-ADV-1); drawn, it is `drawn` by `drawnAt`.
  const rejected = i.rejectedArrows.some((a) => sameArrow(a, { source, target }));
  const proposed = !i.inLedger && !rejected && i.ledger.some((e) => e.kind === 'arrow' && e.source === source && e.target === target && e.step === scope.step);
  if (drawnAt || proposed) out.push({ token: 'drawn', text: T.arrowDrawn });
  if (!i.inLedger && sourceNode !== undefined && targetNode !== undefined && source !== target && !drawnAt) {
    const cycle = cycleThrough(model, source, target);
    if (cycle !== undefined) out.push({ token: 'cycle', text: T.arrowCycle(cycle.map(name)) });
  }
  return out;
}

/**
 * B.3 (`arrow`, §4.9):
 *  - the arrow of a ledger `arrow` entry whose item the person declined (DO-0) is not in the target's `premises:`
 *    (token `declined`; the entry stays, and B.3 ignores it otherwise);
 *  - each arrow the active step added (its ledger entries) passes `arrowProblems` against S₀ (an earlier step's arrow is
 *    not checked again for `other-target`: check 3's exception may later make its source a target, §4.12);
 *  - the drawn and solid arrows are acyclic; a cycle B already had is never counted (AP-13): only a cycle through an
 *    arrow B did not have (token `cycle`).
 * Additions to `premises:` that no ledger entry explains are G5's (`markup`, token `premises`).
 */
export function arrowFindings(c: SessionRuleContext): GateFinding[] {
  const { current, base } = c;
  const out: GateFinding[] = [];
  const blockAt = (id: string) => {
    const entry = current.nodes.get(id);
    return entry ? { file: entry.file, range: entry.block.range } : {};
  };
  const loc = (id: string) => {
    const entry = current.nodes.get(id);
    return entry ? `${where(entry.file, entry.block.range)}: ` : '';
  };
  const declined = new Set(c.items.filter((r) => r.status === 'declined').map((r) => r.key));
  const seen = new Set<string>();
  for (const e of c.ledger) {
    if (e.kind !== 'arrow') continue;
    const key = `${e.source}>${e.target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!declined.has(arrowKey(e.source, e.target))) continue;
    if (current.nodes.get(e.target)?.node.premises.includes(e.source) !== true) continue;
    // Builder 2b2 (carry-over R2-2): at a step, an arrow S₀ did not draw was drawn by the step itself, by hand (G5 leaves
    // it to this rule, R1-4): the message ends with what Claude must do, as G5's did.
    const drawnByStep = c.step && c.stepStart !== undefined && c.stepStart.nodes.get(e.target)?.node.premises.includes(e.source) !== true;
    out.push({
      step: 'G5',
      code: 'arrow',
      message: `${loc(e.target)}${CLAUDE_SESSION_TEXTS.arrowDeclined(e.source, e.target)} ${drawnByStep ? CLAUDE_SESSION_TEXTS.arrowDrawnByHand : `It is still drawn into “${e.target}”: it may not be used.`}`,
      nodeId: e.target,
      names: [e.source],
      token: 'declined',
      ...blockAt(e.target),
    });
  }
  const scope = c.scope;
  if (c.step && scope !== undefined && c.stepStart !== undefined) {
    const stepArrows = new Map<string, ArrowEnds>();
    for (const e of c.ledger) if (e.kind === 'arrow' && e.step === scope.step) stepArrows.set(`${e.source}>${e.target}`, { source: e.source, target: e.target });
    for (const arrow of stepArrows.values()) {
      const problems = arrowProblems({
        model: current,
        drawnIn: c.stepStart,
        scope,
        inferences: c.inferences,
        ledger: c.ledger,
        rejectedArrows: c.rejectedArrows,
        source: arrow.source,
        target: arrow.target,
        inLedger: true,
      });
      for (const p of problems) {
        // An arrow the person declined, proposed again by this step, is `rejected-repeat` (`arrow`, D2-66), a step rule
        // with the same condition: one finding per problem (fixer 2b1b r1, S-F7).
        if (p.token === 'declined') continue;
        out.push({ step: 'G5', code: 'arrow', message: `${loc(arrow.target)}${p.text}`, nodeId: arrow.target, names: [arrow.source], token: p.token, ...blockAt(arrow.target) });
      }
      // other-target for the active step's own arrows (never re-checked for an earlier step's).
      if (arrow.source !== scope.target && c.targets.has(arrow.source)) {
        out.push({
          step: 'G5',
          code: 'arrow',
          message: `${loc(arrow.target)}${CLAUDE_SESSION_TEXTS.arrowOtherTarget(arrow.source, arrow.target)}`,
          nodeId: arrow.target,
          names: [arrow.source],
          token: 'other-target',
          ...blockAt(arrow.target),
        });
      }
    }
  }
  // Acyclic, over the drawn and solid arrows; only cycles through an arrow B did not have.
  const now = arrowGraph(current);
  const before = arrowGraph(base);
  const counted = new Set<string>();
  for (const [source, targets] of now) {
    for (const target of targets) {
      if (before.get(source)?.includes(target) === true) continue;
      const back = pathBetween(now, target, source);
      if (back === undefined) continue;
      const cycle = [source, ...back];
      const id = [...new Set(cycle)].sort().join('\u0000');
      if (counted.has(id)) continue;
      counted.add(id);
      out.push({
        step: 'G5',
        code: 'arrow',
        message: `${loc(target)}the arrows, drawn and used by proofs, now form a cycle: ${cycle.map((x) => `“${x}”`).join(' → ')}. A card may never rest on itself (AR-3): change the proof so that it does not use what closes the cycle.`,
        nodeId: target,
        names: cycle,
        token: 'cycle',
        ...blockAt(target),
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// B.4: kinds

/**
 * B.4 (`holds-kind`, §4.9), every card's `.holds` against the reference: a theorem never becomes an axiom
 * (`theorem-to-axiom`); Claude never writes an axiom `.holds` for a proposition (`axiom-for-proposition`; the pending
 * claims telelean writes for accepted premises, ledger `premise`, pass); the only axiom → theorem change is a target's,
 * proved with the identical type (`type-changed` otherwise): the scope's target at step purposes, any target of the
 * session at a stage or the end.
 *
 * Fixer 2b1b r1 (S-F1, A-ADV-2, C-V2B1B-C3): only that target's proof may be written at all (ES-2: the Proofs of
 * non-targets stay closed; B.4: any other change between axiom and theorem is refused). On any other card, a theorem
 * `.holds` that the reference had as an axiom is `axiom-to-theorem` (an axiom card's claim, or a pending one, made a
 * proof), and one the reference lacked, or had with another text, is `not-target`. At a step, a `.holds` of S₀ is the
 * step limits' (`existing-changed`) unless the scope opened it (`openNames`), so each change is reported once.
 */
export function holdsKindFindings(c: SessionRuleContext, openNames: ReadonlySet<string> = new Set()): GateFinding[] {
  const { current, reference, ctx } = c;
  const out: GateFinding[] = [];
  /** The card whose proof may be written here: the step's target, or at a stage and the end any target of the session. */
  const provable = (id: string) => (c.step && c.scope !== undefined ? c.scope.target === id : c.targets.has(id));
  const onlyProof = c.step && c.scope !== undefined ? `in this step only the proof of “${c.scope.target}” may be written` : 'only the proof of a target of this session may be written';
  const premiseCards = new Set(c.ledger.filter((e) => e.kind === 'premise').map((e) => (e as Extract<LedgerEntry, { kind: 'premise' }>).card));
  const kindIn = (model: ProjectModel, tables: DeclTables, name: string): 'axiom' | 'theorem' | 'absent' => {
    const entry = tables.byName.get(name);
    const f = factsOf(model, name, entry);
    if (entry === undefined && f === undefined) return 'absent';
    return isAxiom(entry, f) ? 'axiom' : 'theorem';
  };
  const typeIn = (model: ProjectModel, tables: DeclTables, name: string) => norm(factsOf(model, name, tables.byName.get(name))?.type);
  for (const [id, entry] of [...current.nodes].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    const node = entry.node;
    const statement = node.lean.statement;
    if (statement === undefined) continue;
    const name = holdsName(statement);
    const now = kindIn(current, c.S, name);
    if (now === 'absent') continue;
    const was = kindIn(reference, c.R, name);
    const decl = c.S.byName.get(name);
    const common = { step: 'G3' as const, code: 'holds-kind' as const, names: [name], nodeId: id, ...ctx.at(decl) };
    const short = relativeName(statement, [node.subject]);
    if (was === 'theorem' && now === 'axiom') {
      out.push({ ...common, message: `${ctx.loc(decl)}${name} was a theorem and is now an axiom: a proof is never turned into an axiom; restore it.`, token: 'theorem-to-axiom' });
      continue;
    }
    if (was === 'absent' && now === 'axiom' && node.type === 'PROPOSITION' && !premiseCards.has(id)) {
      out.push({
        ...common,
        message: `${ctx.loc(decl)}${name} is an axiom for the proposition ${id} (${quote(node.naturalName)}): Claude never writes an axiom .holds for a proposition (only the person marks a claim pending); prove it with \`theorem ${short}.holds : ${short} := …\`, or remove it.`,
        token: 'axiom-for-proposition',
      });
      continue;
    }
    if (now === 'theorem' && !provable(id)) {
      // At a step, a `.holds` of S₀ that the scope did not open is the step limits' (`existing-changed`), which refuse
      // any change of it: one finding per problem. Unchanged, it is no change at all.
      const heldByLimits = c.step && c.R.byName.has(name) && !openNames.has(name);
      const unchanged = was === 'theorem' && c.R.byName.get(name)?.text === decl?.text;
      if (heldByLimits || unchanged) continue;
      if (was === 'axiom') {
        out.push({
          ...common,
          message: `${ctx.loc(decl)}${name}, the claim of the card ${id} (${quote(node.naturalName)}), was an axiom and is now a theorem: ${onlyProof}, and no other .holds changes between axiom and theorem (B.4); restore \`axiom ${short}.holds : ${short}\`.`,
          token: 'axiom-to-theorem',
        });
        continue;
      }
      const axiomCard = node.type === 'AXIOM' ? ` (an axiom card's .holds is its claim, \`axiom ${short}.holds : ${short}\`, never a proof)` : '';
      out.push({
        ...common,
        message: `${ctx.loc(decl)}${name} is a proof of the card ${id} (${quote(node.naturalName)}), which is not ${c.step ? "this step's target" : 'a target of this session'}: ${onlyProof}${axiomCard}; remove it.`,
        token: 'not-target',
      });
      continue;
    }
    if (was === 'axiom' && now === 'theorem' && provable(id)) {
      const before = typeIn(reference, c.R, name);
      const after = typeIn(current, c.S, name);
      if (before !== undefined && after !== undefined && before !== after) {
        out.push({
          ...common,
          message: `${ctx.loc(decl)}${name} was the pending claim \`axiom ${name} : ${before}\` and is now a theorem of type \`${after}\`: proving a pending target replaces its axiom by a theorem of exactly the same type.`,
          token: 'type-changed',
        });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// new-axiom in a session

/**
 * `new-axiom` against B, by name and type (§4.9). Allowed: (1) B's axioms with the same name and type; (2) shape-passing
 * vocabulary and (3) presuppositions, before the step's freeze (after it, as slice 1: `after-freeze`, or `belief`);
 * (4) the `.holds` of an AXIOM card whose statement is new in this session and states exactly that statement; (5) the
 * `.holds` of ledger premises. A reused name with another type or kind: `type-changed`. A proposition's axiom `.holds`
 * is B.4's (`axiom-for-proposition`). Everything else as slice 1: `belief` (a Prop axiom bound to no card, D2-40, or a
 * card's claim), `statement`, `unclassified`, `detached`.
 */
export function sessionNewAxiomFindings(c: SessionRuleContext): GateFinding[] {
  const { base, current, B, S, ctx } = c;
  const out: GateFinding[] = [];
  const premiseCards = new Set(c.ledger.filter((e) => e.kind === 'premise').map((e) => (e as Extract<LedgerEntry, { kind: 'premise' }>).card));
  const vocab = new Map(current.vocabulary.map((item) => [item.name, item]));
  const isPropValued = (f: DeclFacts | undefined) => f?.typeSort !== undefined && normalizeWhitespace(f.typeSort) === 'Prop';
  const frozenAxioms = c.step && c.freeze !== undefined ? new Set(c.freeze.axioms) : undefined;
  for (const name of axiomNames(current)) {
    const entry = S.byName.get(name);
    const f = factsOf(current, name, entry);
    const before = B.byName.get(name);
    const bf = factsOf(base, name, before);
    const owner = ctx.ownerOf(current, name);
    const holdsOf = statementOfHolds(name);
    const ownerNode = owner !== undefined ? current.nodes.get(owner)?.node : undefined;
    const isHolds = ownerNode !== undefined && holdsOf !== undefined && ownerNode.lean.statement === holdsOf;
    if (before !== undefined || bf !== undefined || base.declFacts.has(name)) {
      // (1): B's axiom with the same name and type; a reused name otherwise.
      const wasAxiom = isAxiom(before, bf);
      const sameType = bf?.type !== undefined && f?.type !== undefined ? norm(bf.type) === norm(f.type) : before !== undefined && entry !== undefined && before.text === entry.text;
      if (wasAxiom && sameType) continue;
      out.push({
        step: 'G3',
        code: 'new-axiom',
        message: `${ctx.loc(entry)}${name} is an axiom that reuses the name of a ${wasAxiom ? 'person’s axiom with another type' : `declaration of the person's files (a ${bf?.kind ?? before?.decl.keyword ?? 'declaration'})`}: an axiom keeps an existing name only with the same type; restore it.`,
        names: [name],
        token: 'type-changed',
        ...(owner !== undefined ? { nodeId: owner } : {}),
        ...ctx.at(entry),
      });
      continue;
    }
    // A proposition's axiom `.holds` is B.4's (`axiom-for-proposition`), the pending claim of a ledger premise included.
    if (isHolds && ownerNode?.type === 'PROPOSITION') continue;
    const item = vocab.get(name);
    const vocabulary = owner === undefined && item !== undefined && item.kind !== 'unmarked-axiom';
    if (frozenAxioms !== undefined) {
      // After the step's freeze, no axiom may be added (slice 1's rule, S₀'s axioms in the freeze).
      if (frozenAxioms.has(name)) continue;
      const belief = !vocabulary && (isHolds || isPropValued(f) || item?.kind === 'unmarked-axiom');
      out.push({
        step: 'G3',
        code: 'new-axiom',
        message: `${ctx.loc(entry)}${name} is an axiom added after freeze_statements: no axiom may be added after the freeze${belief ? ', and only the person adds beliefs (propose a missing premise with propose_assumption)' : ''}; remove it.`,
        names: [name],
        token: belief ? 'belief' : 'after-freeze',
        ...ctx.at(entry),
      });
      continue;
    }
    // (2), (3): vocabulary and presuppositions (any vocabulary but an unmarked axiom, as slice 1; its shape is
    // `vocabulary-shape`'s).
    if (vocabulary) continue;
    if (isHolds && ownerNode !== undefined && owner !== undefined) {
      // (5) a ledger premise's claim.
      if (premiseCards.has(owner)) continue;
      // (4) an AXIOM card whose statement is new in this session and states exactly that statement.
      const newStatement = bound(base.nodes.get(owner)?.node) !== ownerNode.lean.statement || B.byName.get(holdsOf ?? '')?.text !== S.byName.get(holdsOf ?? '')?.text;
      if (newStatement && !ownerNode.status.flags.includes('holds-mismatch')) continue;
      out.push({
        step: 'G3',
        code: 'new-axiom',
        message: `${ctx.loc(entry)}${name} asserts the card ${owner} (${quote(ownerNode.naturalName)}), whose statement is not new in this session or which it does not state exactly: only the .holds of an axiom card formalised in this session, stating exactly its statement, may be added; remove it.`,
        names: [name],
        token: 'belief',
        nodeId: owner,
        ...ctx.at(entry),
      });
      continue;
    }
    const type = f?.type !== undefined ? ` of type \`${normalizeWhitespace(f.type)}\`` : '';
    if (owner !== undefined) {
      out.push({
        step: 'G3',
        code: 'new-axiom',
        message: `${ctx.loc(entry)}${name} is an axiom${type} directly below the block of the card ${owner} (${quote(c.sentence(owner))}), so it would be that card's statement: a card's statement is \`abbrev <name> : Prop := …\`, never an axiom; remove it.`,
        names: [name],
        token: isPropValued(f) ? 'belief' : 'statement',
        nodeId: owner,
        ...ctx.at(entry),
      });
      continue;
    }
    if (isPropValued(f) || item?.kind === 'unmarked-axiom') {
      const detached = ctx.detachedHolds.get(name);
      if (detached !== undefined) {
        const statement = holdsOf ?? name;
        out.push({
          step: 'G3',
          code: 'new-axiom',
          message: `${ctx.loc(entry)}${name} would be the .holds of ${statement}, but a blank line separates ${statement} from the block of the card ${detached} (${quote(c.sentence(detached))}), so the card has no statement and this axiom asserts nothing the person holds: remove the blank line between the block and the statement (the statement goes directly below the block), and keep the axiom.`,
          names: [name],
          token: 'detached',
          nodeId: detached,
          ...ctx.at(entry),
        });
        continue;
      }
      out.push({
        step: 'G3',
        code: 'new-axiom',
        message: `${ctx.loc(entry)}${name} is a Prop-valued axiom (a belief${type}) bound to no card: only the person adds beliefs; propose a missing premise with propose_assumption instead; remove it.`,
        names: [name],
        token: 'belief',
        ...ctx.at(entry),
      });
      continue;
    }
    out.push({
      step: 'G3',
      code: 'new-axiom',
      message: `${ctx.loc(entry)}${name} is an axiom${type} that is neither vocabulary telelean can classify (sorts \`axiom T : Type\`, predicates \`axiom P : T₁ → … → Prop\`, presuppositions \`axiom T.exists : Nonempty T\`) nor the .holds of an axiom card formalised in this session; remove it.`,
      names: [name],
      token: 'unclassified',
      ...ctx.at(entry),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// stray-command (D2-52, AP-26)

/**
 * `stray-command` (§4.9, D2-52): a line the judged state adds outside declarations and blocks, against the reference,
 * that is a command (`open`, `variable`, `universe`, `omit`, `include`, `export`, `attribute […] …`, `#check`,
 * `#print`, an `open … in` before a declaration on its line or the line above, …). The `namespace`/`section`/`mutual`
 * and `end` lines that enclose only new declarations pass (F13), and so does an `example`'s text (the example rule's).
 * A new comment line passes only next to a new or changed declaration (below it, else above it; computeItems' rule),
 * else it is a stray comment (token `comment`, AP-26). At a step, a declaration the scope opens (`openNames`,
 * judgeState's) that is session content counts as changed for this: its comment is part of its content, which the step
 * may change, so a reworded comment of an opened declaration that stays as it was is no stray comment (fixer 2b1b r2,
 * R1-1). Session content is what computeItems attaches comments to at the stage (new or rewritten since B): a comment
 * next to the person's own declaration, opened or not, belongs to no item.
 *
 * Builder 2b2 (carry-over R2-1): at a step, a comment that passes against S₀ is also judged by the stage's attachment,
 * computeItems' own (B -> the judged state, the comment matched by its place in the judged file). It is refused when the
 * stage would attach it to a declaration the step may not change (in S₀, unchanged and in place since S₀, and not in
 * `openNames`): that declaration's content key would change, against ES-2's preset (`strayCommentOwner`, naming it).
 * When the stage would attach it to nothing, it is a stray comment as AP-26 says (computeItems would report it unowned).
 */
export function strayCommandFindings(c: SessionRuleContext, openNames: ReadonlySet<string> = new Set()): GateFinding[] {
  const out: GateFinding[] = [];
  const { base, B, S } = c;
  const sessionContent = (name: string) => (!B.byName.has(name) && !base.declFacts.has(name)) || B.byName.get(name)?.text !== S.byName.get(name)?.text;
  const texts = compareTexts(c.reference, c.current, c.step ? (name) => openNames.has(name) && sessionContent(name) : undefined);
  // R2-1: the lines the stage (B -> the judged state) sees added, by file and place in the judged file.
  const atStage = new Map<string, AddedTextUnit>();
  if (c.step) for (const file of compareTexts(base, c.current).files) for (const unit of file.added) if (unit.kind === 'line') atStage.set(`${file.path}\u0000${unit.span.start}`, unit);
  /** A declaration of S₀ the step may not change: in S₀ as it is now, in its place, and not opened by the scope. */
  const fixedForStep = (name: string) => c.R.byName.has(name) && c.R.byName.get(name)?.text === S.byName.get(name)?.text && !texts.moved.has(name) && !openNames.has(name);
  const examples = c.S.examples;
  for (const file of texts.files) {
    const text = c.current.files.get(file.path)?.text ?? '';
    const lines = new LineMap(text);
    const exampleSpans = examples.filter((e) => e.file.path === file.path).map((e) => e.decl.span);
    for (const unit of file.added) {
      if (unit.kind !== 'line' || unit.enclosing === true) continue;
      if (exampleSpans.some((span) => span.start <= unit.span.start && unit.span.end <= span.end)) continue;
      const position = lines.positionAt(unit.span.start);
      const range: Range = { start: position, end: lines.positionAt(unit.span.end) };
      const line = position.line + 1;
      if (unit.code === '') {
        if (unit.attachedTo !== undefined) {
          // R2-1: a line the stage sees added goes with the declaration computeItems attaches it to there, else with none.
          const stage = c.step ? atStage.get(`${file.path}\u0000${unit.span.start}`) : undefined;
          if (stage === undefined) continue;
          const owner = stage.attachedTo;
          if (owner === undefined) {
            out.push({ step: 'G3', code: 'stray-command', message: CLAUDE_SESSION_TEXTS.strayComment(file.path, line), token: 'comment', file: file.path, range });
          } else if (fixedForStep(owner)) {
            out.push({ step: 'G3', code: 'stray-command', message: CLAUDE_SESSION_TEXTS.strayCommentOwner(file.path, line, owner), token: 'comment', names: [owner], file: file.path, range });
          }
          continue;
        }
        out.push({ step: 'G3', code: 'stray-command', message: CLAUDE_SESSION_TEXTS.strayComment(file.path, line), token: 'comment', file: file.path, range });
        continue;
      }
      const command = cutText(unit.code ?? unit.text ?? '', 60);
      out.push({ step: 'G3', code: 'stray-command', message: CLAUDE_SESSION_TEXTS.strayCommand(file.path, line, command), names: [command], file: file.path, range });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Footprints (B.1) and no hidden edges (B.2), per inference

/** Allowed for a proof: the permitted set; for anything else also the existence presuppositions (slice 1's rule). */
function allowedFor(c: SessionRuleContext, permitted: ReadonlySet<string>, proof: boolean): ReadonlySet<string> {
  return proof ? permitted : new Set([...permitted, ...c.ctx.presuppositions]);
}

/** An axiom outside the permitted set, as Claude reads it: a card's claim names the card. */
function described(c: SessionRuleContext, axiom: string): string {
  const owner = c.ctx.ownerOf(c.current, axiom);
  return owner !== undefined ? `${axiom} (${quote(c.sentence(owner))}, not a source of this inference)` : axiom;
}

/**
 * footprint(T.holds) ⊆ permitted(T) (§4.9, per inference): T's proof rests only on the permitted set B.1 gives it.
 * `existing`: the proof of the active step's target as it was when the step started (judged at a proved finish only).
 * A theorem T.holds that Lean reported nothing about (`private`, or dropped) fails closed (`no-facts`, as slice 1's
 * footprint rule; fixer 2b1b r1, C-V2B1B-C4), unless the build failed and its file is not fresh (G1's then).
 */
export function targetFootprintFindings(c: SessionRuleContext, target: string, permitted: ReadonlySet<string>, existing: boolean, buildFailed = false): GateFinding[] {
  const holds = holdsOfCard(c, target);
  const entry = c.S.byName.get(holds);
  const f = factsOf(c.current, holds, entry);
  if (f === undefined) {
    if (entry === undefined || c.current.facts === undefined || !isProof(c.current, entry, undefined)) return [];
    if (buildFailed && !c.current.freshFiles.has(entry.file.path)) return [];
    const isPrivate = entry.decl.modifiers.includes('private');
    return [
      {
        step: 'G3',
        code: 'footprint',
        message: `${c.ctx.loc(entry)}Lean reported nothing about ${holds}${isPrivate ? ' (Lean does not report `private` declarations)' : ''}, so telelean cannot check what the proof of “${target}” rests on: ${isPrivate ? 'remove `private`' : 'make sure it is a plain top-level declaration of a module the library builds'}.`,
        names: [holds],
        token: 'no-facts',
        nodeId: target,
        inference: target,
        ...c.ctx.at(entry),
      },
    ];
  }
  if (!isProof(c.current, entry, f)) return [];
  const common = { step: 'G3' as const, code: 'footprint' as const, inference: target, ...c.ctx.at(entry) };
  const axioms = c.ctx.footprintOf(f);
  if (axioms === undefined) return [{ ...common, message: `${c.ctx.loc(entry)}Lean could not list the axioms of ${holds}, so it cannot be checked: make sure the files build.`, names: [holds], token: 'no-facts', nodeId: target }];
  const extra = axioms.filter((a) => a !== SORRY_AXIOM && !permitted.has(a));
  if (extra.length === 0) return [];
  const rule = `a proof of “${target}” may use only the claims and proofs of the sources of its arrows (the selected premises and the arrows you proposed), the vocabulary, the existence presuppositions of the statements and Lean's standard axioms`;
  return [
    {
      ...common,
      message: existing
        ? `${c.ctx.loc(entry)}${holds} is the proof of the target as it was when this step started, and it rests on ${extra.map((a) => described(c, a)).join(', ')}, outside the permitted set: ${rule}. Write a new proof (it replaces this one), or finish with status not_proved and leave it exactly as it is.`
        : `${c.ctx.loc(entry)}${holds} rests on ${extra.map((a) => described(c, a)).join(', ')}, outside the permitted set: ${rule}.`,
      names: extra,
      nodeId: target,
    },
  ];
}

/**
 * B.2 `undeclared-premise` for inference T (§4.9): direct(T), from the elaborated proof (core's walk, as the board
 * computes it), lies within `allowed` = sources(Q(T) ∪ E(T)), a source of Q(T) only while its arrow exists, T's
 * written premises included (token `unselected`, the message adding propose_arrow); B.2's cross-check (`unseen`);
 * without the elaborated values, refused (`source-only`), never the `.ilean` fallback. `existing`: the active step's
 * target proof as it was when the step started (judged at a proved finish only).
 */
export function noHiddenEdgeFindings(c: SessionRuleContext, target: string, allowed: ReadonlySet<string>, existing: boolean): GateFinding[] {
  const node = c.current.nodes.get(target)?.node;
  if (node === undefined || (node.status.proof.kind !== 'proved' && node.status.proof.kind !== 'conditional')) return [];
  const holds = holdsOfCard(c, target);
  const entry = c.S.byName.get(holds);
  const common = { step: 'G3' as const, code: 'undeclared-premise' as const, inference: target, ...c.ctx.at(entry) };
  const direct = node.status.direct;
  if (direct === undefined || direct.from !== 'proof' || node.status.flags.includes('stale')) return [{ ...common, message: UNSEEN_PROOF, names: [holds], nodeId: target, token: 'source-only' }];
  const out: GateFinding[] = [];
  const sources = 'the sources of its arrows (the selected premises and the arrows you proposed)';
  for (const id of direct.ids) {
    if (allowed.has(id) || id === target) continue;
    const used = holdsOfCard(c, id);
    out.push({
      ...common,
      message: existing
        ? `${c.ctx.loc(entry)}${holds} is the proof of the target as it was when this step started, and it uses ${used} directly: the card ${id} (${quote(c.sentence(id))}) is not one of ${sources}. Either ${CLAUDE_SESSION_TEXTS.proposeTheArrow}; or finish with status not_proved and leave the proof exactly as it is.`
        : `${c.ctx.loc(entry)}${holds} uses ${used} directly: the card ${id} (${quote(c.sentence(id))}) is not one of ${sources}, and the proof (with every lemma it uses) may use only those. Either ${CLAUDE_SESSION_TEXTS.proposeTheArrow}.`,
      names: [used],
      nodeId: id,
      token: 'unselected',
    });
  }
  for (const id of direct.unseen ?? []) {
    if (id === target) continue;
    const used = holdsOfCard(c, id);
    out.push({
      ...common,
      message: `${c.ctx.loc(entry)}${holds} rests on ${used} (the card ${id}, ${quote(c.sentence(id))}) in a way the arrows do not show: no card the proof uses directly rests on it (for example it is reached through another card's statement). Use only ${sources}, directly.`,
      names: [used],
      nodeId: id,
      token: 'unseen',
    });
  }
  return out;
}

/**
 * The footprint rule for declarations (§4.9 "footprint"): each new or changed declaration lies within the permitted set
 * of the inference whose step created it (`permitted`; undefined: only the fail-closed `no-facts` rule applies, as
 * slice 1 before a freeze). A declaration that is not a proof may also rest on the existence presuppositions. `inference`:
 * the creator's target, set on the findings. `buildFailed`: G1 found something, so a file Lean did not build is G1's.
 * `hint`: a sentence added to an outside-the-set finding (an earlier step's material judged on a re-ask's question).
 */
export function declarationFootprintFindings(
  c: SessionRuleContext,
  judged: readonly Judged[],
  permitted: ReadonlySet<string> | undefined,
  inference: string | undefined,
  buildFailed: boolean,
  hint?: string,
): GateFinding[] {
  const { ctx, current } = c;
  const out: GateFinding[] = [];
  const tag = inference !== undefined ? { inference } : {};
  for (const j of judged) {
    const owner = ctx.ownerOf(current, j.name);
    const node = owner !== undefined ? { nodeId: owner } : {};
    if (j.facts === undefined) {
      if (j.entry === undefined || current.facts === undefined) continue;
      if (buildFailed && !current.freshFiles.has(j.entry.file.path)) continue;
      const isPrivate = j.entry.decl.modifiers.includes('private');
      out.push({
        step: 'G3',
        code: 'footprint',
        message: `${ctx.loc(j.entry)}Lean reported nothing about ${j.name}${isPrivate ? ' (Lean does not report `private` declarations)' : ''}, so telelean cannot check what it rests on: ${isPrivate ? 'remove `private`' : 'make sure it is a plain top-level declaration of a module the library builds'}, or delete the declaration.`,
        names: [j.name],
        token: 'no-facts',
        ...node,
        ...tag,
        ...ctx.at(j.entry),
      });
      continue;
    }
    if (permitted === undefined) continue;
    const axioms = ctx.footprintOf(j.facts);
    if (axioms === undefined) {
      out.push({ step: 'G3', code: 'footprint', message: `${ctx.locOf(j)}Lean could not list the axioms of ${j.name}, so it cannot be checked: make sure the files build.`, names: [j.name], token: 'no-facts', ...node, ...tag, ...ctx.atOf(j) });
      continue;
    }
    const allowed = allowedFor(c, permitted, j.proof);
    const extra = axioms.filter((a) => a !== SORRY_AXIOM && !allowed.has(a));
    if (extra.length === 0) continue;
    const of = inference !== undefined ? `the inference of “${inference}”, whose step wrote it` : 'no inference (no step of this session recorded writing it)';
    out.push({
      step: 'G3',
      code: 'footprint',
      message:
        (j.proof
          ? `${ctx.locOf(j)}${j.name} rests on ${extra.map((a) => described(c, a)).join(', ')}, outside the permitted set of ${of}: it may use only the claims and proofs of that inference's sources, the vocabulary, the existence presuppositions and Lean's standard axioms.`
          : `${ctx.locOf(j)}${j.name} is not a theorem but carries a proof resting on ${extra.map((a) => described(c, a)).join(', ')}, outside the permitted set of ${of}: what you add (a definition, instance or structure too, and what it holds inside) may use only that inference's sources, the vocabulary, existence presuppositions and Lean's standard axioms; remove it or rest it on those.`) +
        (hint !== undefined ? ` ${hint}` : ''),
      names: extra,
      ...node,
      ...tag,
      ...ctx.atOf(j),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Proof material stays with its Result (D2-50)

/**
 * `undeclared-premise`, token `other-result` (§4.9, D2-50, F7): a declaration created in a proof phase belongs to that
 * step's Result (the definitions its premise drafts reach included). Such a declaration of Result(u) may be mentioned
 * only by u's own proof, proof material and premise drafts, and by T's proof and proof material when u is a source of
 * Q(T) (with its arrow in this state). Card statements, statement-phase content and other targets' premise drafts'
 * statements never may mention it, nor a target's `.holds` while its Result's content is in ws/ (a session proof).
 * Judged for every declaration new or changed since B, and every premise draft. `judged`: those declarations (2b1a's
 * `Judged`, names only Lean reports included, with the declaration that holds them). Each finding carries the
 * mentioner's inference when it has one (its creator, or the draft's target).
 *
 * Fixer 2b1b r1: the card telelean wrote for an accepted premise (ledger `premise`; its statement, `.holds` and the
 * docstring on them, which no ledger `created` entry records) is that target's premise draft, written: it may mention
 * its own target's proof material, as its draft did (C-V2B1B-C1). An earlier step's material of the active step's
 * target is judged with the question it was made under while a re-ask's question does not apply to it yet
 * (`materialQuestionOf`, C-V2B1B-C2), and so is the target's `.holds` (fixer 2b1b r2).
 *
 * Fixer 2c1 r2 (R1-1): a declaration a card of the judged state binds (its statement, its `.holds`, a pin) is that
 * card's visible content, whatever phase created it: computeItems owns it (`card:<c>`) and the base mask keeps it
 * (fixer 2c1 r1, A-ADV-1). So it is never proof material, and a card's statement or pin is judged as a statement even
 * when its creator's phase is `proof` (a step that finishes without freeze_statements records everything it wrote as
 * `proof`, D2-43; a card formalised after the freeze is too). Such a statement may not use what the step wrote for its
 * proof; when the step has no freeze, the message asks for one, which makes the statement and what it uses statement
 * content, as a proved finish (always frozen) records them.
 */
export function otherResultFindings(c: SessionRuleContext, judged: readonly Judged[], owners: ReadonlyMap<string, string>): GateFinding[] {
  const { ctx, current } = c;
  const out: GateFinding[] = [];
  /** Proof material of a Result: never what a card binds (a card's `.holds` B.2 and the footprint judge; its statement and pins are the card's). */
  const proofOwner = (name: string): string | undefined => {
    if (ctx.ownerOf(current, name) !== undefined) return undefined;
    const creator = c.creatorOf(name);
    return creator?.phase === 'proof' ? creator.target : undefined;
  };
  /** A statement's text for proof material `x` of `u`: the step that wrote `x` has no freeze yet (R1-1), or the usual one. */
  const statementText = (x: string, u: string): string => {
    const creator = c.creatorOf(x);
    return creator?.active === true && c.freeze === undefined ? CLAUDE_SESSION_TEXTS.otherResultNotFrozen(x) : CLAUDE_SESSION_TEXTS.otherResultStatement(x, u);
  };
  const sources = (target: string, stepQuestion: boolean): ReadonlySet<string> => {
    const question = stepQuestion ? c.questionOf(target) : c.materialQuestionOf(target);
    const premises = current.nodes.get(target)?.node.premises ?? [];
    return new Set((question?.sources ?? []).filter((s) => premises.includes(s)));
  };
  const premiseTargets = new Map<string, string>();
  for (const e of c.ledger) if (e.kind === 'premise') premiseTargets.set(e.card, e.target);
  const mentionsOf = (f: DeclFacts): string[] => constsOf(f, 'uses') ?? usesOrRefs(f).names;
  const seen = new Set<string>();
  const push = (key: string, finding: GateFinding) => {
    if (seen.has(key)) return;
    seen.add(key);
    out.push(finding);
  };
  for (const j of judged) {
    if (j.facts === undefined) continue;
    const holder = owners.get(j.name) ?? j.name;
    const holdsTarget = c.sessionHolds.get(holder);
    // A target's `.holds` is its Result's proof: what it mentions is judged with the question its Result's material is
    // judged with (`materialQuestionOf`, hence `active: false`), so in a re-ask an earlier step's proof keeps the
    // question it was made under until the step claims its new one: at a proved finish, or by check_lean once T.holds
    // changed (fixer 2b1b r2, C-V2B1B-C2). For every other target the two questions are the same.
    const creator = holdsTarget !== undefined ? { target: holdsTarget, phase: 'proof' as const, active: false } : c.creatorOf(holder);
    // A card's statement or pin is the card's visible content: judged as a statement whatever phase created it (R1-1).
    const cardContent = holdsTarget === undefined && statementOfHolds(holder) === undefined && ctx.ownerOf(current, holder) !== undefined;
    const proof = creator?.phase === 'proof' && !cardContent;
    const at = ctx.atOf(j);
    // A written premise's card: its draft's rule (below), as that target's.
    const card = creator === undefined ? ctx.ownerOf(current, holder) : undefined;
    const premiseTarget = card !== undefined ? premiseTargets.get(card) : undefined;
    if (premiseTarget !== undefined) {
      for (const x of mentionsOf(j.facts)) {
        if (x === j.name || x === holder) continue;
        const u = proofOwner(x) ?? c.sessionHolds.get(x);
        if (u === undefined || u === premiseTarget) continue;
        push(`${j.name}\u0000${x}`, {
          step: 'G3',
          code: 'undeclared-premise',
          message: `${ctx.locOf(j)}${CLAUDE_SESSION_TEXTS.otherResultStatement(x, u)}`,
          names: [x],
          nodeId: u,
          token: 'other-result',
          inference: premiseTarget,
          ...at,
        });
      }
      continue;
    }
    for (const x of mentionsOf(j.facts)) {
      if (x === j.name || x === holder) continue;
      const u = proofOwner(x);
      if (u !== undefined) {
        if (proof && creator !== undefined) {
          if (u === creator.target || sources(creator.target, creator.active).has(u)) continue;
          push(`${j.name}\u0000${x}`, {
            step: 'G3',
            code: 'undeclared-premise',
            message: `${ctx.locOf(j)}${CLAUDE_SESSION_TEXTS.otherResultProof(x, u, creator.target)}`,
            names: [x],
            nodeId: u,
            token: 'other-result',
            inference: creator.target,
            ...at,
          });
          continue;
        }
        push(`${j.name}\u0000${x}`, {
          step: 'G3',
          code: 'undeclared-premise',
          message: `${ctx.locOf(j)}${statementText(x, u)}`,
          names: [x],
          nodeId: u,
          token: 'other-result',
          ...(creator !== undefined ? { inference: creator.target } : {}),
          ...at,
        });
        continue;
      }
      const v = c.sessionHolds.get(x);
      if (v !== undefined && !proof) {
        push(`${j.name}\u0000${x}`, {
          step: 'G3',
          code: 'undeclared-premise',
          message: `${ctx.locOf(j)}${CLAUDE_SESSION_TEXTS.otherResultStatement(x, v)}`,
          names: [x],
          nodeId: v,
          token: 'other-result',
          ...(creator !== undefined ? { inference: creator.target } : {}),
          ...at,
        });
      }
    }
  }
  // Premise drafts: their statements may mention their own target's proof material only.
  for (const draft of c.premises) {
    for (const [name, f] of Object.entries(draft.facts)) {
      for (const x of mentionsOf(f)) {
        if (x === name || Object.hasOwn(draft.facts, x)) continue;
        const u = proofOwner(x) ?? c.sessionHolds.get(x);
        if (u === undefined || u === draft.target) continue;
        push(`${draft.target}\u0000${draft.leanName}\u0000${x}`, {
          step: 'G3',
          code: 'undeclared-premise',
          message: `the missing premise ${draft.leanName} (${quote(draft.naturalName)}): ${CLAUDE_SESSION_TEXTS.otherResultStatement(x, u)}`,
          names: [x],
          nodeId: u,
          token: 'other-result',
          inference: draft.target,
        });
      }
    }
  }
  return out;
}

/** 2b1a's `Judged` declarations new or changed since B (by text; names only Lean reports in changed files), and their holders. */
export function changedSinceBase(c: SessionRuleContext): { judged: Judged[]; owners: Map<string, string> } {
  const { ctx, current } = c;
  const judged: Judged[] = [];
  const owners = new Map<string, string>();
  const names = new Set<string>();
  for (const name of [...ctx.added, ...ctx.changed]) {
    const entry = c.S.byName.get(name);
    if (entry === undefined || names.has(name)) continue;
    names.add(name);
    const f = factsOf(current, name, entry);
    judged.push({ name, entry, ...(f ? { facts: f } : {}), proof: isProof(current, entry, f) });
  }
  for (const { name, facts: f, owner } of ctx.factsOnlySince(c.base, c.B)) {
    if (!ctx.changedFiles.has(f.file) || names.has(name)) continue;
    names.add(name);
    judged.push({ name, facts: f, proof: false });
    if (owner !== undefined) owners.set(name, owner.name);
  }
  return { judged, owners };
}

/** A judged declaration that the footprint rule judges: no axiom (new-axiom's), no card's `.holds` (its inference's). */
export function footprintJudged(c: SessionRuleContext, j: Judged): boolean {
  if (j.entry?.decl.keyword === 'axiom' || j.facts?.kind === 'axiom') return false;
  if (statementOfHolds(j.name) !== undefined && c.ctx.ownerOf(c.current, j.name) !== undefined && c.targets.has(c.ctx.ownerOf(c.current, j.name) as string)) return false;
  return true;
}

