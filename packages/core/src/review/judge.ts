/**
 * Slice 2b1b (docs/slice2-plan.md sections 2.7 and 4.9): judging a state of an edit session (`judgeState`), and
 * propose_arrow's refusals (`proposeArrowProblems`).
 *
 * `judgeState` runs every rule of its purpose over every inference, sources first, and computes what reconcile (§3.5),
 * the view (2c2) and the end (§3.10) read of the state: the items (`computeItems`), both class maps (`classify`), the
 * RV-5 dependencies (`itemDeps`), R_stmt's `by`, and the problems.
 *  - Global rules, every purpose: G1 against B (G0 stays the engine's: it judges every file of the root, which a
 *    ProjectModel does not hold); `sorry` and `example`; the vocabulary shape rule for new and changed items;
 *    `new-axiom` against B by name and type; G5 (against S₀, or B when no step runs); B.3 (`arrow`); B.4 (`holds-kind`);
 *    `stray-command`; and `other-result` for content no inference created.
 *  - Step purposes (check, freeze, gate-proved, gate-other, with the scope and S₀): the step limits
 *    (`existing-changed`), `proof-before-freeze` with R = S₀, `rejected-repeat` for content the step created or changed,
 *    and the active inference's own rules (not-proved, status-mismatch against S₀, statement-changed against its freeze,
 *    readiness, not-frozen), with slice 1's messages in the step's words (`stepWording`).
 *  - Per inference, sources first (`order`): B.1 (`permittedFor`); footprint(T.holds) ⊆ permitted(T) and B.2 with E(T),
 *    for a proof of this session (T.holds differs from B's, in text or meaning), and for the active step's target as
 *    slice 1 judged it against S₀ (a proved finish always; check in stage prove and a not-proved finish when T.holds
 *    changed since S₀, in text or meaning); the footprint of every declaration the inference's steps created (ledger
 *    `created`, or the active step's new ones); `other-result` for its proof and proof material, statements and premise
 *    drafts.
 *  - `stepFindings`: the global findings, the active inference's and the step-purpose rules; for `stage` and `final`,
 *    the global findings. Other inferences feed RV-11 only (their `passes`). A step whose rules find nothing else still
 *    fails while it leaves a difference no review item can hold that S₀ did not have (fixer 2b1b r1, A-ADV-3).
 *  - A step purpose without its scope and S₀ throws (fixer 2b1b r1, S-F3): judging it as a stage would skip the step's
 *    rules and pass what they refuse.
 *
 * Pure TypeScript: no Node or vscode APIs (the webview bundles core).
 */
import { ActionError, type ArrowEnds } from '../actions.js';
import { holdsName, probeFailure, STANDARD_AXIOM_NAMES } from '../facts.js';
import { declTables, factsOf } from '../gate/decls.js';
import {
  buildFindings,
  exampleFindings,
  malformedBindingFindings,
  notFrozenFindings,
  notProvedFindings,
  orderFindings,
  proofBeforeFreezeFindings,
  readinessFindings,
  readyCards,
  ruleContext,
  sorryAxiomFindings,
  statementChangedFindings,
  statusMismatchFindings,
  vocabularyShapeFindings,
  type RuleContext,
} from '../gate/rules.js';
import {
  arrowFindings,
  arrowProblems,
  changedSinceBase,
  declarationFootprintFindings,
  footprintJudged,
  holdsKindFindings,
  meaningChanged,
  noHiddenEdgeFindings,
  otherResultFindings,
  sessionExampleWording,
  sessionMarkupFindings,
  sessionNewAxiomFindings,
  sessionRuleContext,
  stepLimitFindings,
  stepWording,
  STEP_PURPOSES,
  strayCommandFindings,
  targetFootprintFindings,
} from '../gate/sessionRules.js';
import type { GateFinding, RulePurpose } from '../gate/types.js';
import { signatureAxioms } from '../gate/permitted.js';
import type { ProjectModel } from '../project/types.js';
import { normalizeWhitespace } from '../project/text.js';
import { where } from '../gate/g0.js';
import { classify } from './classify.js';
import { statementReach } from './closure.js';
import { itemDeps } from './deps.js';
import { computeItems, premiseDraftKey } from './items.js';
import { premiseKey, proofKey } from './keys.js';
import { isSessionProof, permittedFor } from './permitted.js';
import { fallbackLabel, inferenceOf, isShaky } from './records.js';
import { CLAUDE_SESSION_TEXTS, REVIEW_TEXTS } from './texts.js';
import type { InferenceJudgement, ItemDraft, JudgeInput, LedgerEntry, SessionInference, StateJudgement, StepScope } from './types.js';

const quote = (text: string) => JSON.stringify(text);
const byTarget = (a: SessionInference, b: SessionInference) => a.order - b.order || (a.target < b.target ? -1 : a.target > b.target ? 1 : 0);

/**
 * `rejected-repeat` (D2-66, step purposes only), for content the step created or changed since S₀ (`changed`: the keys
 * whose content key differs from S₀'s or that S₀ did not have):
 *  - `rejected`: an item whose content key is one of its rejected keys (DO-1);
 *  - `premise`: a premise draft of the step whose draft key a rejected premise holds (§4.3);
 *  - `arrow`: an arrow the step added that the person declined (DO-0);
 *  - `shaky-identical`: the inference's Shaky set back unchanged (every item of it with its own content key), unless the
 *    finish said `no_alternative` (DO-3); judged by check_lean and at a finish, never at the freeze (the set's proofs
 *    can change only after it).
 * Content the person brought back (Undo, un-reject) was not made by the step, so no stage or final judgement refuses it
 * (F4).
 */
function rejectedRepeatFindings(i: {
  input: JudgeInput;
  scope: StepScope;
  drafts: readonly ItemDraft[];
  startKeys: ReadonlyMap<string, string>;
}): GateFinding[] {
  const { input, scope } = i;
  const out: GateFinding[] = [];
  const records = new Map(input.items.map((r) => [r.key, r]));
  const now = new Map(i.drafts.map((d) => [d.key, d]));
  const rejectedPremises = new Set(input.items.filter((r) => r.kind === 'add-premise').flatMap((r) => r.rejectedFingerprints));
  const premiseRepeats = input.premises.filter((p) => p.step === scope.step && rejectedPremises.has(premiseDraftKey(p)));
  // A premise draft `premise` reports below is not `rejected` too: one finding per problem (fixer 2b1b r1, S-F7).
  const saidByPremise = new Set(premiseRepeats.map((p) => premiseKey(p.target, p.leanName)));
  for (const d of i.drafts) {
    if (i.startKeys.get(d.key) === d.contentKey) continue;
    if (d.kind === 'add-premise' && saidByPremise.has(d.key)) continue;
    const r = records.get(d.key);
    if (r === undefined || !r.rejectedFingerprints.includes(d.contentKey)) continue;
    out.push({
      step: 'G3',
      code: 'rejected-repeat',
      message: `${fallbackLabel(r)} is exactly a version the person rejected in this session: never propose it again; propose something else, or leave it out.`,
      names: d.provides.decls.length > 0 ? [...d.provides.decls] : [d.key],
      token: 'rejected',
      inference: scope.target,
    });
  }
  for (const p of premiseRepeats) {
    out.push({
      step: 'G3',
      code: 'rejected-repeat',
      message: `The missing premise ${p.leanName} (${quote(p.naturalName)}) is one the person rejected in this session: do not propose it again.`,
      names: [p.leanName],
      token: 'premise',
      inference: scope.target,
    });
  }
  const seen = new Set<string>();
  for (const e of input.ledger) {
    if (e.kind !== 'arrow' || e.step !== scope.step || seen.has(`${e.source}>${e.target}`)) continue;
    seen.add(`${e.source}>${e.target}`);
    if (!input.rejectedArrows.some((a) => a.source === e.source && a.target === e.target)) continue;
    out.push({
      step: 'G3',
      code: 'rejected-repeat',
      message: `The person declined “${e.source}” → “${e.target}” in this session: do not propose it again.`,
      names: [e.source],
      nodeId: e.target,
      token: 'arrow',
      inference: scope.target,
    });
  }
  if (input.purpose !== 'freeze' && input.noAlternative !== true) {
    const shaky = input.items.filter((r) => isShaky(r) && inferenceOf(r) === scope.target && scope.openItems.includes(r.key));
    if (shaky.length > 0 && shaky.every((r) => now.get(r.key)?.contentKey === r.fingerprint)) {
      out.push({
        step: 'G3',
        code: 'rejected-repeat',
        message: `The person declined ${shaky.map(fallbackLabel).join(', ')} as Shaky, and this step left all of them as they were: propose a different arrangement for them together (any single one may stay), or, if there is none, finish with no_alternative: true.`,
        names: shaky.map((r) => r.key),
        token: 'shaky-identical',
        inference: scope.target,
      });
    }
  }
  return out;
}

/** A Result's verdict, flags, footprint, direct uses, Rests on, band and missing arrows in this state (§2.9). */
function resultOf(
  base: ProjectModel,
  current: ProjectModel,
  target: string,
  sources: ReadonlySet<string>,
): Pick<InferenceJudgement, 'verdict' | 'flags' | 'footprint' | 'direct' | 'restsOn' | 'band' | 'missing'> {
  const node = current.nodes.get(target)?.node;
  const proof = node?.status.proof;
  const proved = proof?.kind === 'proved' || proof?.kind === 'conditional';
  const none = { verdict: 'not-proved' as const, flags: [], footprint: [], direct: [], restsOn: [], band: { used: [], notNeeded: [], complete: false, open: [] }, missing: [] };
  if (node === undefined || proof === undefined || !proved) return none;
  const statement = node.lean.statement;
  const holds = statement !== undefined ? holdsName(statement) : undefined;
  const facts = holds !== undefined ? current.declFacts.get(holds) : undefined;
  const footprint = facts !== undefined && facts.kind !== 'axiom' ? [...(facts.axioms ?? [])] : [];
  const steps = proof.kind === 'proved' ? proof.footprint : (proof.footprint ?? []);
  const restsOn = steps.filter((x) => current.nodes.has(x));
  const direct = [...(node.status.direct?.ids ?? [])];
  const drawn = node.premises;
  const verdict = proof.kind === 'proved' ? (node.status.flags.includes('established') ? ('established' as const) : ('proved' as const)) : ('not-proved' as const);
  const flags: InferenceJudgement['flags'] = [];
  if (proof.kind === 'proved' && node.status.flags.includes('self-evident')) flags.push('proved-from-nothing');
  const before = base.nodes.get(target)?.node;
  const tablesB = declTables(base);
  const tablesW = declTables(current);
  if (holds !== undefined && before?.lean.justificationKind === 'theorem' && tablesB.byName.get(holds)?.text !== tablesW.byName.get(holds)?.text) flags.push('replaces-your-proof');
  const was = before?.lean.statement;
  if (proof.kind === 'proved' && was !== undefined && statement !== undefined) {
    const bf = base.declFacts.get(was);
    const cf = current.declFacts.get(statement);
    const norm = (t: string | undefined) => (t === undefined ? undefined : normalizeWhitespace(t));
    const changed = was !== statement || tablesB.byName.get(was)?.text !== tablesW.byName.get(statement)?.text || (bf !== undefined && cf !== undefined && norm(bf.value) !== norm(cf.value));
    if (changed) flags.push('proves-changed-statement');
  }
  const on = proof.kind === 'conditional' ? proof.on : [];
  const open = [...new Set([...direct.filter((d) => !drawn.includes(d)), ...on])];
  const OUT_OF_DATE = ['stale', 'not-checked'];
  const fresh = [target, ...direct].every((id) => !(current.nodes.get(id)?.node.status.flags ?? []).some((f) => OUT_OF_DATE.includes(f)));
  const mismatch = [target, ...direct].some((id) => current.nodes.get(id)?.node.status.flags.includes('holds-mismatch') === true);
  const complete =
    proof.kind === 'proved' &&
    open.length === 0 &&
    !steps.some((x) => x.startsWith('axiom:')) &&
    node.status.direct?.from === 'proof' &&
    (node.status.direct?.unseen ?? []).length === 0 &&
    fresh &&
    !mismatch;
  return {
    verdict,
    flags,
    footprint,
    direct,
    restsOn,
    band: { used: drawn.filter((s) => direct.includes(s)), notNeeded: [...sources].filter((s) => !direct.includes(s)), complete, open },
    missing: direct.filter((d) => d !== target && !sources.has(d)).map((source) => ({ source, drawn: drawn.includes(source) })),
  };
}

/** §2.7, §4.9 (2b1b): every rule of the purpose over every inference, sources first, with computeItems, both class maps and RV-5. */
export function judgeState(input: JudgeInput): StateJudgement {
  const { purpose, base, current } = input;
  // Fixer 2b1b r1 (S-F3): a step purpose without its scope or S₀ would be judged as a stage, without the step's rules
  // (its limits, not-proved, status-mismatch, rejected-repeat): a green that fails open on a caller's mistake.
  if (STEP_PURPOSES.has(purpose) && (input.scope === undefined || input.stepStart === undefined)) {
    throw new ActionError('invalid', `judgeState: “${purpose}” judges a running step, and needs its scope and the state it started from (S₀).`);
  }
  const step = STEP_PURPOSES.has(purpose) && input.scope !== undefined && input.stepStart !== undefined;
  const scope = step ? input.scope : undefined;
  const stepStart = step ? input.stepStart : undefined;

  // The inferences, sources first; the active step asks its own question (its StepScope's) of its target. `recorded`
  // keeps the questions on the record (a re-ask's old question, §3.2).
  const recorded = [...input.inferences].sort(byTarget);
  const ordered = recorded.map((inf) => (scope !== undefined && inf.target === scope.target ? { ...inf, question: scope.question } : inf));
  if (scope !== undefined && !ordered.some((inf) => inf.target === scope.target)) {
    ordered.push({ target: scope.target, question: scope.question, order: Number.MAX_SAFE_INTEGER, steps: [scope.step] });
  }
  const firstTarget = scope?.target ?? ordered[0]?.target ?? '';
  const subject = current.nodes.get(firstTarget)?.node.subject ?? base.nodes.get(firstTarget)?.node.subject ?? '';
  const questionCards = [...new Set(ordered.flatMap((inf) => inf.question.sources))];
  const rulePurpose: RulePurpose = step ? (purpose as RulePurpose) : 'check';
  const ctxB: RuleContext = ruleContext({
    purpose: rulePurpose,
    selection: { subject, target: firstTarget, premises: questionCards, adoptedGhosts: [] },
    stage: input.stage,
    base,
    current,
    roundStart: stepStart ?? base,
    ...(step && input.freeze !== undefined ? { freeze: input.freeze } : {}),
    teleleanBlocks: [],
  });
  // The active step's context against S₀, and whether its target's `.holds` changed since S₀: its text, or (fixer 2b1b
  // r1, A-ADV-4) its meaning, e.g. the person's proof elaborated through a `@[simp]` lemma the step added.
  const activeCtx: RuleContext | undefined =
    scope !== undefined && stepStart !== undefined
      ? ruleContext({
          purpose: rulePurpose,
          selection: { subject, target: scope.target, premises: [...scope.question.sources], adoptedGhosts: [] },
          stage: input.stage,
          base: stepStart,
          current,
          roundStart: stepStart,
          ...(input.freeze !== undefined ? { freeze: input.freeze } : {}),
          teleleanBlocks: [],
        })
      : undefined;
  const targetChanged =
    activeCtx !== undefined &&
    stepStart !== undefined &&
    (activeCtx.targetProofNew || (activeCtx.targetHolds !== undefined && meaningChanged(stepStart, current, activeCtx.targetHolds)));
  // A re-ask's question applies to the material earlier steps made for its target only once the step claims it: at a
  // proved finish, and by check_lean once T.holds changed; a finish without a proof keeps the old question (C-V2B1B-C2).
  const stepQuestionForMaterial = purpose === 'gate-proved' || (purpose === 'check' && targetChanged);
  const sc = sessionRuleContext({
    purpose,
    stage: input.stage,
    base,
    current,
    ...(stepStart !== undefined ? { stepStart } : {}),
    ...(scope !== undefined ? { scope } : {}),
    ...(step && input.freeze !== undefined ? { freeze: input.freeze } : {}),
    inferences: ordered,
    ledger: input.ledger,
    items: input.items,
    premises: input.premises,
    rejectedArrows: input.rejectedArrows,
    ctx: ctxB,
    sessionProof: (target) => isSessionProof(base, current, target),
    recorded,
    stepQuestionForMaterial,
  });

  // ---- the items of this state (§4.2), and S₀'s when a step's rules need them
  const items = computeItems({
    base,
    current,
    ledger: input.ledger,
    premises: input.premises,
    inferences: input.inferences,
    ended: input.ended,
    ...(scope !== undefined && stepStart !== undefined ? { active: { step: scope.step, target: scope.target, stepStart, ...(input.freeze !== undefined ? { freeze: input.freeze } : {}) } } : {}),
  });
  let start: ReturnType<typeof computeItems> | undefined;
  const atStart = (): ReturnType<typeof computeItems> => {
    if (start !== undefined || scope === undefined || stepStart === undefined) return start ?? { drafts: [], problems: [] };
    start = computeItems({
      base,
      current: stepStart,
      ledger: input.ledger,
      premises: input.premises.filter((p) => p.step !== scope.step),
      inferences: input.inferences,
      ended: input.ended,
    });
    return start;
  };
  const draftsAtStart = (): ItemDraft[] => atStart().drafts;

  // ---- what the scope opens (ES-2): the declarations of `openItems`; under `openProof`, the target's Result at S₀ (its
  // `.holds` and its proof material: the target's Proof is open), but at a finish without a proof, which leaves it as
  // it was (fixer 2b1b r1, C-V2B1B-C2: a re-ask may drop a lemma that rests on a source it no longer asks for).
  const openNames = new Set<string>();
  if (scope !== undefined && stepStart !== undefined) {
    const open = new Set(scope.openItems);
    if (scope.openProof && purpose !== 'gate-other') open.add(proofKey(scope.target));
    for (const d of draftsAtStart()) if (open.has(d.key)) for (const name of d.provides.decls) openNames.add(name);
  }

  // ---- global rules
  const built = buildFindings(ctxB);
  const buildFailed = built.length > 0;
  const changedNames = new Set([...ctxB.added, ...ctxB.changed]);
  const pinnable = new Set<string>(
    scope !== undefined
      ? [...scope.fuzzyStatements, ...(stepStart?.nodes.get(scope.target)?.node.lean.statement === undefined ? [scope.target] : [])]
      : [...ordered.map((inf) => inf.target), ...questionCards],
  );
  const global: GateFinding[] = [
    ...built,
    ...sorryAxiomFindings(ctxB),
    ...sessionExampleWording(exampleFindings(ctxB)),
    // The shape rule for new and changed items (Appendix B): a changed name counts as new here.
    ...vocabularyShapeFindings({ ...ctxB, inBase: (name: string) => ctxB.inBase(name) && !changedNames.has(name) }),
    ...sessionNewAxiomFindings(sc),
    ...holdsKindFindings(sc, openNames),
    ...sessionMarkupFindings(sc, pinnable),
    ...arrowFindings(sc),
    ...strayCommandFindings(sc, openNames),
  ];
  if (scope !== undefined && stepStart !== undefined && activeCtx !== undefined) {
    const coveredAtStart = new Set(draftsAtStart().flatMap((d) => d.provides.decls));
    global.push(...stepLimitFindings(sc, openNames, coveredAtStart), ...stepWording(proofBeforeFreezeFindings(activeCtx)));
  }

  // ---- what each inference's steps created, for its footprints; `other-result` by the mentioner's inference
  const { judged, owners } = changedSinceBase(sc);
  const holderOf = (name: string) => owners.get(name) ?? name;
  const creatorTarget = (name: string): string | undefined => sc.creatorOf(holderOf(name))?.target;
  const declsOf = new Map<string | undefined, typeof judged>();
  for (const j of judged) {
    if (!footprintJudged(sc, j)) continue;
    const t = creatorTarget(j.name);
    const key = t !== undefined && sc.targets.has(t) ? t : undefined;
    const list = declsOf.get(key) ?? [];
    list.push(j);
    declsOf.set(key, list);
  }
  const otherResult = otherResultFindings(sc, judged, owners);
  const otherOf = new Map<string | undefined, GateFinding[]>();
  for (const f of otherResult) {
    const key = f.inference !== undefined && sc.targets.has(f.inference) ? f.inference : undefined;
    const list = otherOf.get(key) ?? [];
    list.push(key === undefined ? withoutInference(f) : f);
    otherOf.set(key, list);
  }
  global.push(...(otherOf.get(undefined) ?? []));
  // Declarations no inference created may rest on the vocabulary layer only (fail closed).
  const vocabularyLayer = new Set([...STANDARD_AXIOM_NAMES, ...signatureAxioms(current)]);
  global.push(...declarationFootprintFindings(sc, declsOf.get(undefined) ?? [], vocabularyLayer, undefined, buildFailed));

  // ---- per inference, sources first
  const judgements: Record<string, InferenceJudgement> = {};
  const proveStage = purpose === 'gate-proved' || purpose === 'gate-other' || (purpose === 'check' && input.stage === 'prove');
  const activeStep = scope !== undefined ? { activeStep: scope.step } : {};
  for (const inference of ordered) {
    const target = inference.target;
    const b1 = permittedFor({ base, current, target, inferences: ordered, ledger: input.ledger, items: input.items, earlier: judgements, ...activeStep });
    const permitted = new Set(b1.permitted);
    const sources = new Set(Object.keys(b1.contrib));
    const active = scope?.target === target;
    const findings: GateFinding[] = [];
    let judgeProof: boolean;
    let existing = false;
    if (active && stepStart !== undefined && activeCtx !== undefined) {
      existing = !targetChanged;
      judgeProof = purpose === 'gate-proved' || ((purpose === 'gate-other' || (purpose === 'check' && input.stage === 'prove')) && targetChanged);
      const ready = readyCards(activeCtx);
      findings.push(
        ...stepWording([
          ...notProvedFindings(activeCtx),
          ...statusMismatchFindings(activeCtx),
          ...statementChangedFindings(activeCtx),
          ...readinessFindings(activeCtx, ready),
          ...malformedBindingFindings(activeCtx, ready),
          ...notFrozenFindings(activeCtx),
        ]),
      );
    } else judgeProof = isSessionProof(base, current, target);
    if (judgeProof) findings.push(...targetFootprintFindings(sc, target, permitted, existing, buildFailed), ...noHiddenEdgeFindings(sc, target, sources, existing));
    // The active step's declarations are judged, as slice 1 judged a run's, once a footprint can be asked of them.
    const decls = declsOf.get(target) ?? [];
    const judgedHere = active && !proveStage ? undefined : permitted;
    const question = recorded.find((inf) => inf.target === target)?.question;
    const reasked = active && scope !== undefined && question !== undefined && !sameQuestion(question, scope.question);
    if (reasked) {
      // C-V2B1B-C2: what an earlier step made for this target is judged with the question it was made under, until the
      // step claims its new question (a proved finish, or check_lean on a changed T.holds); then with that question,
      // saying why (the proof is open, so the step may drop or rework it).
      const earlier = decls.filter((j) => sc.creatorOf(holderOf(j.name))?.active === false);
      const own = decls.filter((j) => sc.creatorOf(holderOf(j.name))?.active !== false);
      const before = stepQuestionForMaterial ? permitted : new Set(permittedFor({ base, current, target, inferences: recorded, ledger: input.ledger, items: input.items, earlier: judgements, ...activeStep }).permitted);
      const hint = stepQuestionForMaterial
        ? `An earlier step wrote it for “${target}” under a question this step no longer asks: the target's proof is open in this step, so remove it, or rest it on this step's sources.`
        : undefined;
      findings.push(...declarationFootprintFindings(sc, own, judgedHere, target, buildFailed));
      findings.push(...declarationFootprintFindings(sc, earlier, judgedHere === undefined ? undefined : before, target, buildFailed, hint));
    } else findings.push(...declarationFootprintFindings(sc, decls, judgedHere, target, buildFailed));
    findings.push(...(otherOf.get(target) ?? []));
    const tagged = orderFindings(findings.map((f) => ({ ...f, inference: target })));
    judgements[target] = { target, passes: tagged.length === 0, ...resultOf(base, current, target, sources), ...b1, findings: tagged };
  }

  // ---- step purposes: rejected-repeat
  const stepRules: GateFinding[] = [];
  if (scope !== undefined && stepStart !== undefined) {
    const startKeys = new Map(draftsAtStart().map((d) => [d.key, d.contentKey]));
    stepRules.push(...rejectedRepeatFindings({ input, scope, drafts: items.drafts, startKeys }));
  }

  // ---- items, classes, dependencies, problems
  const drafts = items.drafts;
  const classes = classify({ base, current, drafts, premises: input.premises, inferences: input.inferences, withDrafts: true });
  const classesBeforeReveal = classify({ base, current, drafts, premises: input.premises, inferences: input.inferences, withDrafts: false });
  const deps = itemDeps({ base, current, drafts, inferences: judgements });
  const problems: StateJudgement['problems'] = [...items.problems, ...buildProblems(current, drafts)];
  const missingFacts = drafts.filter((d) => d.factsMissing === true).map((d) => d.key);
  // 2b2 (§2.1, D2-75): a state whose probe failed is refused at every purpose, naming the cause; with no draft lacking
  // facts too (nothing to key), since its constants are missing everywhere. Without the probe's detail (fixer 2b2 r1,
  // A-V2B2-ADV-7): the stage's problems show while the results may be hidden, and Lean's error can name hidden proof
  // material (§4.7); the classes in force while they are shown, and the backstop at Apply, carry the detail.
  const failedProbe = probeFailure(current.facts, { detail: false });
  if (current.facts === undefined) problems.push({ code: 'facts', text: REVIEW_TEXTS.factsMissing });
  else if (failedProbe !== undefined) problems.push({ code: 'facts', text: REVIEW_TEXTS.factsProbeFailed(failedProbe), ...(missingFacts.length > 0 ? { keys: missingFacts } : {}) });
  else if (missingFacts.length > 0) problems.push({ code: 'facts', text: REVIEW_TEXTS.factsMissing, keys: missingFacts });

  const orderedGlobal = orderFindings(global);
  const activeFindings = scope !== undefined ? (judgements[scope.target]?.findings ?? []) : [];
  let stepFindings = step ? orderFindings([...orderedGlobal, ...activeFindings, ...stepRules]) : orderedGlobal;
  // Fixer 2b1b r1 (A-ADV-3): AP-26's reasoning, made total. A step that its rules pass may still leave a difference no
  // review item can hold (computeItems reports it unowned, and Apply stays disabled for the rest of the session, since
  // later steps may not touch it). Each one S₀ did not have is then a step finding, so Claude restores it while it can.
  // Only when no other rule spoke: those name the same differences more precisely (one finding per problem).
  if (step && stepFindings.length === 0) {
    const fresh = minusTexts(
      items.problems.filter((p) => p.code === 'unowned'),
      atStart().problems.filter((p) => p.code === 'unowned'),
    );
    stepFindings = fresh.map((p) => ({
      step: 'G3',
      code: 'existing-changed',
      message: CLAUDE_SESSION_TEXTS.unownedChange(p.text),
      token: 'unowned',
      ...(p.declaration !== undefined ? { names: [p.declaration] } : {}),
    }));
    // Fixer 2b2 r1 (A-V2B2-ADV-4): ES-2's preset as reconcile reads it. Every item of S₀ the scope does not open keeps
    // its content key, which the stage compares; a change no rule named (e.g. a comment S₀ attached to one declaration
    // that now goes with another, because the step wrote a declaration next to it or removed the one it described)
    // would return an accepted item to review as "updated", with its accepted dependents. Not for an item whose facts
    // are missing in either state (a failed probe, a module that did not build), whose key cannot be compared, nor when
    // the two states' facts come from different probes (one with the marker, one without: §2.1's approximate case).
    // Nor for a premise draft that is not written (fixer 2b2 r2, R1-1): it is outside ws/, and a step may propose it
    // again under its key (S13, §3.5), which reconcile versions.
    const sameProbe = stepStart?.facts?.probe?.status === current.facts?.probe?.status;
    if (stepFindings.length === 0 && scope !== undefined && sameProbe) stepFindings = frozenItemFindings(atStart().drafts, items.drafts, scope, input.ledger);
  }
  return {
    commit: input.commit,
    filesKey: input.filesKey,
    purpose,
    ok: !buildFailed && orderedGlobal.length === 0 && !problems.some((p) => p.code === 'facts'),
    global: orderedGlobal,
    stepFindings,
    inferences: judgements,
    drafts,
    classes,
    classesBeforeReveal,
    deps,
    reach: statementReach(current, input.premises).by,
    problems,
  };
}

/**
 * Fixer 2b2 r1 (A-V2B2-ADV-4): the items of S₀ that the scope does not open (its `openItems`; under `openProof` the
 * active target's Result, which its own rules govern at every purpose) whose content key the judged state changed, or
 * which it lost; one finding each, naming its declarations (`existing-changed`, token `session`: content an earlier step
 * proposed). Fixer 2b2 r2 (R1-1): not a premise draft that no ledger `premise` entry names (computeItems makes its item
 * from the draft, outside ws/): a draft of the same key from the step is its newer proposal (S13: a reworded repeat
 * passes; §3.5), whose new version reconcile records ("updated"). A written premise is content in ws/, frozen as any.
 */
function frozenItemFindings(atStart: readonly ItemDraft[], now: readonly ItemDraft[], scope: StepScope, ledger: readonly LedgerEntry[]): GateFinding[] {
  const open = new Set([...scope.openItems, ...(scope.openProof ? [proofKey(scope.target)] : [])]);
  const written = new Set(ledger.flatMap((e) => (e.kind === 'premise' ? [e.item] : [])));
  const byKey = new Map(now.map((d) => [d.key, d]));
  const out: GateFinding[] = [];
  for (const d of atStart) {
    if (open.has(d.key) || d.factsMissing === true) continue;
    if (d.kind === 'add-premise' && !written.has(d.key)) continue;
    const later = byKey.get(d.key);
    if (later !== undefined && (later.factsMissing === true || later.contentKey === d.contentKey)) continue;
    const what = d.provides.decls.length > 0 ? d.provides.decls.join(', ') : d.key;
    out.push({
      step: 'G3',
      code: 'existing-changed',
      message: CLAUDE_SESSION_TEXTS.frozenItemChanged(what),
      token: 'session',
      ...(d.provides.decls.length > 0 ? { names: [...d.provides.decls] } : {}),
    });
  }
  return out;
}

/** Two questions ask the same: the same sources (as sets) and the same mark. */
function sameQuestion(a: SessionInference['question'], b: SessionInference['question']): boolean {
  const x = [...new Set(a.sources)].sort();
  const y = [...new Set(b.sources)].sort();
  return a.fromNothing === b.fromNothing && x.length === y.length && x.every((s, k) => s === y[k]);
}

/** The problems of `now` that `before` lacks, by text, as multisets (each of `before` cancels one of `now`). */
function minusTexts<P extends { text: string }>(now: readonly P[], before: readonly P[]): P[] {
  const left = new Map<string, number>();
  for (const p of before) left.set(p.text, (left.get(p.text) ?? 0) + 1);
  const out: P[] = [];
  for (const p of now) {
    const n = left.get(p.text) ?? 0;
    if (n > 0) left.set(p.text, n - 1);
    else out.push(p);
  }
  return out;
}

/** A finding without its `inference` (one the session judges globally). */
function withoutInference(f: GateFinding): GateFinding {
  const { inference: _inference, ...rest } = f;
  void _inference;
  return rest;
}

/**
 * Lean's errors mapped to the items that own the declarations they are in (§3.6 "the errors are mapped to the items
 * owning the failing declarations"): one `no-longer-builds` problem per error inside a declaration an item provides.
 */
function buildProblems(current: ProjectModel, drafts: readonly ItemDraft[]): StateJudgement['problems'] {
  const facts = current.facts;
  if (facts === undefined) return [];
  const owner = new Map<string, string>();
  for (const d of drafts) for (const name of d.provides.decls) if (!owner.has(name)) owner.set(name, d.key);
  const tables = declTables(current);
  const out: StateJudgement['problems'] = [];
  for (const m of facts.build.messages) {
    if (m.severity !== 'error' || m.file === undefined || m.range === undefined) continue;
    const at = m.range.start;
    for (const [name, entry] of tables.byName) {
      if (entry.file.path !== m.file) continue;
      const r = entry.decl.range;
      const inside = (r.start.line < at.line || (r.start.line === at.line && r.start.character <= at.character)) && (at.line < r.end.line || (at.line === r.end.line && at.character <= r.end.character));
      if (!inside) continue;
      const key = owner.get(name) ?? owner.get(factsOf(current, name, entry)?.name ?? '');
      if (key === undefined) continue;
      out.push({ code: 'no-longer-builds', text: `${where(m.file, m.range)}: error: ${m.text}`, keys: [key], declaration: name });
      break;
    }
  }
  return out;
}

/** §4.9 (2b1b): propose_arrow's refusals, each with its `arrow` token and its text for Claude; [] accepts the arrow (AF8). */
export function proposeArrowProblems(i: {
  current: ProjectModel;
  scope: StepScope;
  inferences: readonly SessionInference[];
  ledger: readonly LedgerEntry[];
  rejectedArrows: readonly ArrowEnds[];
  source: string;
  target: string;
}): Array<{ token: string; text: string }> {
  return arrowProblems({
    model: i.current,
    drawnIn: i.current,
    scope: i.scope,
    inferences: i.inferences,
    ledger: i.ledger,
    rejectedArrows: i.rejectedArrows,
    source: i.source,
    target: i.target,
    inLedger: false,
  });
}

