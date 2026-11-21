/**
 * Slice 2a2: synthetic item records, review states and stage judgements for the reducer, reconcile and reveal tests.
 * Items are named by their keys; ids come from `reviewItemId(RUN, key)`, as reconcile makes them (AF7).
 */
import { reviewItemId } from '../../../src/review/hash.js';
import type {
  InferenceJudgement,
  ItemClass,
  ItemDraft,
  ItemKind,
  ItemRecord,
  ReviewOutcome,
  ReviewState,
  SessionInference,
  SessionRecords,
  StateJudgement,
} from '../../../src/review/types.js';

export const RUN = 'run-1';
export const AT = '2026-11-19T12:00:00.000Z';
export const idOf = (key: string): string => reviewItemId(RUN, key);

/** Not an RV-7 item. */
export const PLAIN: ItemClass = { belief: false, changesProved: false, reasons: [], complete: true };
/** A belief item (b4). */
export const BELIEF: ItemClass = { belief: true, changesProved: false, reasons: [{ code: 'b4' }], complete: true };
/** An item that changes what is proved (c4). */
export const CHANGES: ItemClass = { belief: false, changesProved: true, reasons: [{ code: 'c4' }], complete: true };

/** What reconcile records of a Result judged proved, resting on nothing, with no dependencies (V2A-S1). */
export const JUDGED: NonNullable<ItemRecord['judged']> = { verdict: 'proved', restsOn: [], deps: [] };

/** A record: in review, rev 1, origin step `s1` for target `t`; a Result carries `JUDGED` unless `over` says otherwise. */
export function record(key: string, kind: ItemKind, over: Partial<ItemRecord> = {}): ItemRecord {
  return {
    id: idOf(key),
    key,
    kind,
    rev: 1,
    origin: { step: 's1', target: 't', phase: kind === 'result' || kind === 'add-arrow' || kind === 'add-premise' ? 'proof' : 'statements' },
    status: 'in-review',
    markers: [],
    fingerprint: `fp:${key}`,
    content: { decls: [] },
    versions: [],
    rejectedFingerprints: [],
    ...(kind === 'result' ? { judged: { ...JUDGED } } : {}),
    ...over,
  };
}

export interface Scene {
  items: ItemRecord[];
  /** RV-5 edges by key. */
  deps?: Record<string, string[]>;
  /** By key; absent ones are PLAIN. */
  classes?: Record<string, ItemClass>;
  /** By key; absent ones are as in `classes`. */
  classesBeforeReveal?: Record<string, ItemClass>;
  forced?: ReviewState['forced'];
  inferences?: SessionInference[];
  /** Result key -> the arrow item keys its question selected. */
  questionArrows?: Record<string, string[]>;
  didNotPass?: boolean;
  rejectedArrows?: ReviewState['rejectedArrows'];
}

export function stateOf(scene: Scene): ReviewState {
  const classes = Object.fromEntries(scene.items.map((r) => [r.key, scene.classes?.[r.key] ?? PLAIN]));
  const before = Object.fromEntries(scene.items.map((r) => [r.key, scene.classesBeforeReveal?.[r.key] ?? classes[r.key] ?? PLAIN]));
  const deps = Object.fromEntries(scene.items.map((r) => [r.id, (scene.deps?.[r.key] ?? []).map(idOf)]));
  return {
    items: scene.items,
    deps,
    classes,
    classesBeforeReveal: before,
    forced: scene.forced ?? null,
    inferences: scene.inferences ?? [{ target: 't', question: { sources: ['a'], fromNothing: false }, order: 0, steps: ['s1'] }],
    rejectedArrows: scene.rejectedArrows ?? [],
    questionArrows: Object.fromEntries(Object.entries(scene.questionArrows ?? {}).map(([k, v]) => [idOf(k), v.map(idOf)])),
    didNotPass: scene.didNotPass ?? false,
    stack: { done: [], undone: [] },
    nextAction: 1,
  };
}

/** The state after an ok outcome (what the runner keeps). */
export function next(state: ReviewState, outcome: ReviewOutcome): ReviewState {
  if (!outcome.ok) throw new Error(`not ok: ${outcome.code} ${'error' in outcome ? outcome.error : ''}`);
  return {
    ...state,
    items: outcome.items,
    inferences: outcome.inferences,
    rejectedArrows: outcome.rejectedArrows,
    forced: outcome.forced,
    stack: outcome.stack,
    nextAction: outcome.nextAction,
  };
}

/** A record of the state, by key. */
export function item(state: Pick<ReviewState, 'items'>, key: string): ItemRecord {
  const found = state.items.find((r) => r.key === key);
  if (!found) throw new Error(`no record ${key}`);
  return found;
}

/** Status by key, for compact assertions. */
export const statuses = (state: Pick<ReviewState, 'items'>): Record<string, string> => Object.fromEntries(state.items.map((r) => [r.key, r.status]));

/** A draft for reconcile: content key `fp:<key>` unless given. */
export function draft(key: string, kind: ItemKind, over: Partial<ItemDraft> = {}): ItemDraft {
  return {
    key,
    kind,
    origin: { step: 's1', target: 't', phase: kind === 'result' || kind === 'add-arrow' || kind === 'add-premise' ? 'proof' : 'statements' },
    provides: { decls: [], arrows: [], cards: [] },
    mentions: [],
    contentKey: `fp:${key}`,
    content: { decls: [] },
    ...over,
  };
}

export function inferenceJudgement(target: string, over: Partial<InferenceJudgement> = {}): InferenceJudgement {
  return {
    target,
    passes: true,
    verdict: 'proved',
    flags: [],
    footprint: [],
    direct: [],
    extra: [],
    contrib: {},
    permitted: [],
    throughResults: [],
    restsOn: [],
    band: { used: [], notNeeded: [], complete: true, open: [] },
    missing: [],
    findings: [],
    ...over,
  };
}

/** A stage judgement over `drafts`: classes PLAIN unless given, deps by key. */
export function judgementOf(drafts: ItemDraft[], over: Partial<StateJudgement> = {}): StateJudgement {
  const classes = over.classes ?? Object.fromEntries(drafts.map((d) => [d.key, PLAIN]));
  return {
    commit: 'c1',
    filesKey: 'files-1',
    purpose: 'stage',
    ok: true,
    global: [],
    stepFindings: [],
    inferences: { t: inferenceJudgement('t') },
    drafts,
    classes,
    classesBeforeReveal: over.classesBeforeReveal ?? classes,
    deps: Object.fromEntries(drafts.map((d) => [d.key, []])),
    reach: {},
    problems: [],
    ...over,
  };
}

/** Session records holding `items` at stage 1, phase stage, one inference `t` with step `s1`. */
export function recordsOf(items: ItemRecord[], over: Partial<SessionRecords> = {}): SessionRecords {
  return {
    stage: 1,
    phase: 'stage',
    inferences: [{ target: 't', question: { sources: ['a'], fromNothing: false }, order: 0, steps: ['s1'] }],
    steps: [{ id: 's1', kind: 'formalize', target: 't', stage: 0, state: 'passed', question: { sources: ['a'], fromNothing: false } }],
    queue: [],
    retry: [],
    items,
    premises: [],
    ledger: [],
    rejectedArrows: [],
    stack: { done: [], undone: [] },
    nextAction: 1,
    events: [],
    ...over,
  };
}
