/**
 * What leaves the machine (docs/m2-plan.md section 5): the static system prompt (5.1, ./systemPrompt.ts), the first
 * user turn of a run (5.2, the context bundle) and the later user turns (5.3). Pure functions over the project model
 * and the board graph; the RunManager sends their results verbatim and records them in the run's transcript.
 */
import {
  CLAUDE_SESSION_TEXTS,
  subjectDir,
  subjectRootFile,
  type DecisionRecord,
  type ModelNode,
  type NodeType,
  type ProjectModel,
  type RunCaps,
  type TlGraph,
  type TlNode,
  type VocabItem,
} from '@telelean/core';

import { SYSTEM_PROMPT } from './systemPrompt.js';
import type { ContextBundleInput } from './types.js';

export { SYSTEM_PROMPT };

// ---------------------------------------------------------------------------------------------
// Small text helpers

/** Every whitespace run becomes one space (Lean wraps long values onto indented lines). */
export function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Drops the subject namespace from fully-qualified names (`Spyro.GoodAddition Spyro.cynder` -> `GoodAddition cynder`). */
export function shortNames(text: string, subject: string): string {
  return text.replace(new RegExp(`(?<![A-Za-z0-9_.'!?»])${escapeRegExp(subject)}\\.`, 'gu'), '');
}

/** 1-based line of a UTF-16 offset in `text`. */
function lineOfOffset(text: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < text.length; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

/** The budget sentence of the later turns: `<checks> Lean checks, <turns> turns, <minutes> minutes.` */
export function budgetText(caps: RunCaps): string {
  return `${caps.maxChecks} Lean checks, ${caps.maxTurns} turns, ${minutesText(caps)}.`;
}

/** `20 minutes`, `1 minute`. */
export function minutesText(caps: RunCaps): string {
  const m = agentMinutes(caps);
  return `${m} minute${m === 1 ? '' : 's'}`;
}

export function agentMinutes(caps: RunCaps): number {
  return Math.max(1, Math.round(caps.maxAgentMs / 60_000));
}

// ---------------------------------------------------------------------------------------------
// Cards and their Lean

interface StatementInfo {
  /** Fully-qualified statement name. */
  name: string;
  /** `#print` value with short names, or the source text after `:=`. */
  value: string;
  file?: string;
  /** 1-based line of the statement declaration's keyword. */
  line?: number;
}

function statementInfo(model: ProjectModel, node: TlNode, subject: string): StatementInfo | undefined {
  const name = node.lean.statement;
  if (name === undefined || node.lean.binding === 'none') return undefined;
  const entry: ModelNode | undefined = model.nodes.get(node.id);
  const decl = entry?.statementDecl;
  const facts = model.declFacts.get(name);
  let value: string | undefined = facts?.value !== undefined ? shortNames(collapseWhitespace(facts.value), subject) : undefined;
  let file: string | undefined;
  let line: number | undefined;
  if (decl !== undefined) {
    file = decl.file;
    const text = model.files.get(decl.file)?.text;
    if (text !== undefined) {
      line = lineOfOffset(text, decl.decl.keywordSpan.start);
      if (value === undefined && decl.decl.valueStart !== undefined) {
        // The source text after the top-level `:=` (the statement as written), when Lean has not checked it yet.
        const raw = text.slice(decl.decl.valueStart, decl.decl.span.end).replace(/^:=/, '');
        value = collapseWhitespace(raw);
      }
    }
  }
  return { name, value: value ?? '(not readable yet)', ...(file !== undefined ? { file } : {}), ...(line !== undefined ? { line } : {}) };
}

function blockPlace(node: TlNode): string {
  if (node.loc === undefined) return 'its block is not written yet';
  return `its block is in ${node.loc.file}, line ${node.loc.range.start.line + 1}`;
}

function targetStatus(node: TlNode): string {
  switch (node.status.proof.kind) {
    case 'proved':
      // A11 (slice 1e fixer): check_lean does not judge the person's unchanged proof, so the bundle says what to do with it.
      return 'Proved already (prove it again from exactly this selection: a new proof replaces the existing one; if it does not follow, leave the existing proof as it is).';
    case 'pending':
      return 'Pending proof: its .holds is still an axiom.';
    default:
      return 'Not proved.';
  }
}

function premiseStatus(node: TlNode, statement: string): string {
  const holds = `${statement}.holds`;
  const proof = node.status.proof.kind;
  if (proof === 'assumed' || (node.type === 'AXIOM' && node.lean.justificationKind === 'axiom')) return `assumed (axiom ${holds})`;
  if (proof === 'proved') return 'proved';
  if (proof === 'pending') return 'pending proof';
  if (node.type === 'AXIOM') return `assumed, but its axiom ${holds} is missing (add it)`;
  return 'not usable as a premise: no proof yet';
}

function quoted(sentence: string): string {
  return `"${sentence}"`;
}

/** 2j2 (D2-92): a note for Claude, quoted as the feedback turn quotes every note (SHAKY's since 2e). */
export function personNote(note: string): string {
  return `  The person's note: ${quoted(note)}`;
}

/** 2j2 (D2-92): the overall comment at Submit review, right after the feedback turn's first line. */
export function overallComment(comment: string): string {
  return `The person's overall comment: ${quoted(comment)}`;
}

// ---------------------------------------------------------------------------------------------
// The context bundle (section 5.2)

function targetLines(model: ProjectModel, node: TlNode, subject: string): string[] {
  const lines = [`- ${node.id} (${node.type}): ${quoted(node.naturalName)}`];
  const st = statementInfo(model, node, subject);
  if (st === undefined) {
    lines.push(`  No Lean yet (${blockPlace(node)}).`);
  } else {
    const where = st.file !== undefined ? ` (${st.file}${st.line !== undefined ? `, line ${st.line}` : ''})` : '';
    lines.push(`  Lean: ${st.name} := ${st.value}${where}. ${targetStatus(node)}`);
  }
  return lines;
}

function premiseLines(model: ProjectModel, node: TlNode, subject: string): string[] {
  const attrs: string[] = [node.type];
  if (node.stance !== undefined) attrs.push(`stance: ${node.stance}`);
  if (node.asserted !== undefined) attrs.push(`asserted ${node.asserted}`);
  let head = `- ${node.id} (${attrs.join(', ')}): ${quoted(node.naturalName)}`;
  if (node.rationale !== undefined && node.rationale !== '') head += ` — because: ${node.rationale}`;
  if (node.source !== undefined) head += `; source: ${node.source}`;
  const lines = [head];
  const st = statementInfo(model, node, subject);
  if (st === undefined) lines.push(`  No Lean yet (${blockPlace(node)}).`);
  else lines.push(`  Lean: ${st.name} := ${st.value}; ${premiseStatus(node, st.name)}.`);
  return lines;
}

function otherCardLine(model: ProjectModel, node: TlNode, subject: string): string {
  const st = statementInfo(model, node, subject);
  return `- ${node.id} (${node.type}): ${quoted(node.naturalName)}${st !== undefined ? ` — Lean: ${st.name} := ${st.value}` : ''}`;
}

/** The type of a vocabulary item with short names, or its source signature when Lean has not checked it. */
function vocabType(item: VocabItem, subject: string): string | undefined {
  if (item.type !== undefined) return shortNames(collapseWhitespace(item.type), subject);
  if (item.code === undefined) return undefined;
  const code = collapseWhitespace(item.code.replace(/\/--[\s\S]*?-\//g, ' '));
  const colon = code.indexOf(' : ');
  if (colon < 0) return undefined;
  const rest = code.slice(colon + 3);
  const assign = rest.indexOf(':=');
  return (assign >= 0 ? rest.slice(0, assign) : rest).trim() || undefined;
}

function vocabularyLine(item: VocabItem, subject: string): string {
  const type = vocabType(item, subject);
  const gloss = item.gloss !== undefined && item.gloss !== '' ? ` — ${collapseWhitespace(item.gloss)}` : '';
  return `- ${item.shortName}${type !== undefined ? ` : ${type}` : ''}${gloss}`;
}

function decisionLine(d: DecisionRecord): string {
  return `- [${d.phenomenon}] ${quoted(d.question)} → ${d.answerText} (${d.date.slice(0, 10)}, scope: ${d.scope})`;
}

/**
 * The cards the target and the selected premises mention in their statements (`telelean.run.contextScope =
 * neighbourhood`): sources of `lean-ref` edges into them, plus statement refs that resolve to another card.
 */
function neighbourhood(graph: TlGraph, focus: ReadonlySet<string>): Set<string> {
  const out = new Set<string>();
  for (const edge of graph.edges) {
    if (edge.type === 'lean-ref' && focus.has(edge.target) && !focus.has(edge.source)) out.add(edge.source);
  }
  for (const node of graph.nodes) {
    if (!focus.has(node.id)) continue;
    for (const ref of node.lean.refs ?? []) {
      if (ref.nodeId !== undefined && !focus.has(ref.nodeId) && ref.name === graph.nodes.find((n) => n.id === ref.nodeId)?.lean.statement) out.add(ref.nodeId);
    }
  }
  return out;
}

/**
 * The run's name on the first line of its context bundle (slice 1g; it was M2's "These suffice"): the board's action
 * (spec v4.1 ES-2), or its empty question (a target marked "follows from nothing", AR-5). The same words as the run
 * panel's target line and the run's start activity.
 */
export const RUN_NAME = { formalize: 'Formalize for dependencies', fromNothing: 'Follows from nothing?' } as const;

/** The heading of the context bundle's other cards (A10; slice 2d: through an arrow proposed with propose_arrow, D2-1). */
export const OTHER_CARDS_HEADING =
  'OTHER CARDS OF THIS SUBJECT (context only: if the proof needs one that has a .holds, propose its arrow with propose_arrow; if it has none, finish not_proved and name its id in gap)';

/** The first user turn of a run (docs/m2-plan.md section 5.2). */
export function renderContextBundle(input: ContextBundleInput): string {
  const { model, graph, library, selection, decisions, caps, scope } = input;
  const subject = selection.subject;
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const target = byId.get(selection.target);
  if (target === undefined) throw new TypeError(`buildContextBundle: ${selection.target} is not a card of ${subject}`);
  const premises = [...selection.premises, ...selection.adoptedGhosts];
  const premiseNodes = premises.map((id) => {
    const node = byId.get(id);
    if (node === undefined) throw new TypeError(`buildContextBundle: premise ${id} is not a card of ${subject}`);
    return node;
  });
  const focus = new Set([target.id, ...premises]);
  const near = scope === 'neighbourhood' ? neighbourhood(graph, focus) : undefined;
  const others = graph.nodes.filter((n) => !focus.has(n.id) && (near === undefined || near.has(n.id)));

  const out: string[] = [];
  // The run's name, as the board and the run panel give it (spec v4.1 ES-2; slice 1g): "Formalize for dependencies", or,
  // for an empty question (the target's "follows from nothing" mark, AR-5), "Follows from nothing?". The FakeBackend
  // scripts of test-fixtures/ match this line (`Run: "Formalize for dependencies"`, `Run: "Follows from nothing?"`).
  out.push(
    `Run: "${premiseNodes.length === 0 ? RUN_NAME.fromNothing : RUN_NAME.formalize}" for the subject ${subject} (namespace ${subject}; the subject's folder is ${subjectDir(subject, library)}/, its root module ${subjectRootFile(subject, library)}).`,
  );
  out.push('');
  out.push('TARGET');
  out.push(...targetLines(model, target, subject));
  out.push('');
  // Spec v4.1 ES-2 (slice 1e): the selection is the arrows the person drew into the target, or its "follows from nothing" mark.
  out.push('SELECTED PREMISES (the person drew arrows from these to the target: prove it from exactly these)');
  if (premiseNodes.length === 0) out.push('(none: the person marked the target as following from nothing: prove it from no premises at all.)');
  for (const node of premiseNodes) out.push(...premiseLines(model, node, subject));
  out.push('');
  out.push(
    'Allowed besides these: Lean\'s standard axioms, the vocabulary, and the existence presuppositions of the things these statements mention (for example "there is at least one character"). freeze_statements tells you the exact list.',
  );
  out.push('');
  // A10 (slice 1e): a card the proof needs but nobody selected is named in `gap`. Slice 2 (D2-1): unless it has a `.holds`,
  // when Claude proposes its arrow with propose_arrow (the person reviews it as an item).
  out.push(OTHER_CARDS_HEADING);
  if (others.length === 0) out.push('(none)');
  for (const node of others) out.push(otherCardLine(model, node, subject));
  out.push('');
  out.push(`VOCABULARY (${subjectDir(subject, library)}/Vocabulary.lean and other declarations without a card)`);
  const vocabulary = graph.vocabulary.filter((v) => v.subject === subject);
  if (vocabulary.length === 0) out.push('(none)');
  for (const item of vocabulary) out.push(vocabularyLine(item, subject));
  out.push('');
  out.push('EARLIER ANSWERS IN FORCE');
  if (decisions.length === 0) out.push('(none)');
  for (const d of decisions) out.push(decisionLine(d));
  out.push('');
  out.push(
    `BUDGET: ${caps.maxChecks} Lean checks, ${caps.maxTurns} turns and ${minutesText(caps)} of work for this run; waiting for the person's answers does not count.`,
  );
  return `${out.join('\n')}\n`;
}

// ---------------------------------------------------------------------------------------------
// Later user turns (section 5.3). Slice 2h retired M2's Feedback and ghost-adoption turns with their actions (a
// session's Submit review sends `submitFeedbackTurn`, and an accepted Add premise is written by telelean, §3.8).

export function resumeTurn(frozen: boolean): string {
  return (
    "The session was interrupted (the person's editor reloaded) while you were working. Your files are as you left " +
    `them; the statements are ${frozen ? 'frozen' : 'not frozen yet'}. Continue the run from where you were.`
  );
}

export const NUDGE_TURN =
  'You ended your turn without calling finish. Call finish now: with status proved if the target is proved, otherwise with status not_proved and the gap.';

// ---------------------------------------------------------------------------------------------
// Slice 2 (docs/slice2-plan.md 2.8): an edit session's turns. Their first lines are fixed (core
// CLAUDE_SESSION_TEXTS), so FakeBackend scripts can match them; the session's first turn is the context bundle (its
// first line unchanged) plus the FORMALIZE PLAN and the first step's turn.

/** One inference of the plan, as the turns name it. */
export interface PlanTarget {
  id: string;
  sentence: string;
  /** The question's sources (card ids); empty with `fromNothing` for the "follows from nothing" mark. */
  sources: readonly string[];
  fromNothing: boolean;
}

/** The FORMALIZE PLAN of the session's first turn: the targets in order (sources first), each with its question. */
export function formalizePlan(targets: readonly PlanTarget[]): string {
  const lines = ['FORMALIZE PLAN (one step per target, in this order; each step proves its target from its own question)'];
  targets.forEach((t, k) => {
    const question = t.sources.length > 0 ? `from ${t.sources.join(', ')}` : 'follows from nothing (no premises at all)';
    lines.push(`${k + 1}. ${t.id}: ${quoted(t.sentence)} ← ${question}`);
  });
  return lines.join('\n');
}

export interface StepTurnInput {
  index: number;
  of: number;
  kind: 'formalize' | 'submit';
  target: { id: string; type: NodeType; sentence: string };
  question: { sources: ReadonlyArray<{ id: string; sentence: string }>; fromNothing: boolean };
  /** Claude's arrows into the target so far (earlier steps'), with their review status. */
  arrows: ReadonlyArray<{ source: string; status: string }>;
  /** A12 (D2-4): the earlier target of the queue, a source of the question, that has no `.holds` at the step's start. */
  statementsOnly?: string;
  fuzzyStatements: readonly string[];
  openProof: boolean;
  openArrows: boolean;
  /** A Submit step's items to rework (2e). */
  openItems?: readonly string[];
  /** The first step of a mid-stage Formalize or a Retry queue: the decisions made since the previous queue. */
  decisions?: readonly string[];
  caps: RunCaps;
}

/** One item of the feedback turn (§3.7): its label, its Lean text, and per section its note or what it relied on. */
export interface FeedbackItem {
  label: string;
  lean: string;
  /** The person's note for Claude on its decline (SHAKY since D2-13; REJECTED too since 2j2, D2-92), or, for an item to
   *  be redone (TO BE REDONE), its note while to be redone (`redo.note`). */
  note?: string;
  /** (2j2, D2-92) SHAKY: a Shaky item that is to be redone (Submit's take-out) and has a note of its own as such. */
  redoNote?: string;
  /** TO BE REDONE: what it relied on (the items that took it down), or why telelean took it out; SHAKY: the items whose
   *  rework Submit's take-out made it wait for (D2-57). */
  reliedOn?: readonly string[];
}

export interface SubmitFeedbackInput {
  /** The stage the person submitted. */
  stage: number;
  accepted: readonly FeedbackItem[];
  rejected: readonly FeedbackItem[];
  shaky: readonly FeedbackItem[];
  redo: readonly FeedbackItem[];
  /** The Submit steps, in the order they run (D2-57): each its inference's target and sentence. */
  steps: ReadonlyArray<{ id: string; sentence: string }>;
  /** (2j2, D2-92) The person's overall comment at Submit review. */
  comment?: string;
}

/**
 * §2.8, §3.7 (builder 2e): the feedback turn that precedes a Submit queue's first step, generated from the statuses,
 * with the items' labels and Lean texts: ACCEPTED (keep them exactly), REJECTED (never propose these exact versions
 * again), SHAKY (a different arrangement for the set, each note quoted; `no_alternative` when there is none), TO BE
 * REDONE (what each relied on) and STEPS PLANNED. Its first line is fixed (core `CLAUDE_SESSION_TEXTS.reviewSubmitted`).
 */
export function submitFeedbackTurn(i: SubmitFeedbackInput): string {
  const lines = [CLAUDE_SESSION_TEXTS.reviewSubmitted(i.stage), ...(i.comment !== undefined && i.comment.trim() !== '' ? [overallComment(i.comment)] : []), ''];
  const leanLines = (lean: string) => (lean.trim() === '' ? [] : lean.trim().split('\n').map((l) => `    ${l}`));
  const section = (title: string, items: readonly FeedbackItem[], tail: (x: FeedbackItem) => string[] = () => []) => {
    lines.push(title);
    if (items.length === 0) lines.push('(none)');
    for (const x of items) lines.push(`- ${x.label}`, ...leanLines(x.lean), ...tail(x));
    lines.push('');
  };
  // 2j2 (D2-92): every section but ACCEPTED quotes the person's notes, as SHAKY did.
  const notes = (x: FeedbackItem) => [...(x.note !== undefined ? [personNote(x.note)] : []), ...(x.redoNote !== undefined ? [personNote(x.redoNote)] : [])];
  section('ACCEPTED: keep them exactly as they are.', i.accepted);
  section('REJECTED: they were removed; never propose these exact versions again.', i.rejected, notes);
  const relied = (x: FeedbackItem) => (x.reliedOn !== undefined && x.reliedOn.length > 0 ? [`  It relied on: ${x.reliedOn.join('; ')}`] : []);
  section(
    'SHAKY: propose a different arrangement for these together. Any single one may come back unchanged, but not the whole set; if there is none, finish with no_alternative: true.',
    i.shaky,
    (x) => [...notes(x), ...relied(x)],
  );
  section('TO BE REDONE: propose them again; what each relied on:', i.redo, (x) => [...notes(x), ...relied(x)]);
  lines.push('STEPS PLANNED (one step per target, in this order):');
  i.steps.forEach((s, k) => lines.push(`${k + 1}. ${s.id}: ${quoted(s.sentence)}`));
  return `${lines.join('\n')}\n`;
}

/** A step's turn (§2.8, §3.3): its fixed first line, the target, its question, Claude's arrows, what is open and fixed. */
export function stepTurn(i: StepTurnInput): string {
  const t = i.target;
  const first =
    i.statementsOnly !== undefined
      ? CLAUDE_SESSION_TEXTS.stepStatementsOnly(i.index, i.of, t.id, i.statementsOnly)
      : i.kind === 'submit'
        ? CLAUDE_SESSION_TEXTS.stepRework(i.index, i.of, t.id)
        : CLAUDE_SESSION_TEXTS.stepFormalize(i.index, i.of, t.id);
  const out = [first, ''];
  if (i.decisions !== undefined) {
    out.push(CLAUDE_SESSION_TEXTS.decisionsSince);
    out.push(...(i.decisions.length > 0 ? i.decisions.map((d) => `- ${d}`) : ['(none)']));
    out.push('');
  }
  out.push(`TARGET: ${t.id} (${t.type}): ${quoted(t.sentence)}`);
  out.push(
    i.question.sources.length > 0
      ? `QUESTION: the person selected the arrows from ${i.question.sources.map((q) => `${q.id} (${quoted(q.sentence)})`).join(', ')}: prove the target from exactly these.`
      : 'QUESTION: the person marked the target as following from nothing: prove it from no premises at all.',
  );
  out.push(`YOUR ARROWS INTO IT SO FAR: ${i.arrows.length > 0 ? i.arrows.map((a) => `${a.source} (${a.status})`).join(', ') : '(none)'}`);
  const open: string[] = [];
  if (i.openProof) open.push("the target's proof (its .holds theorem) and the lemmas it needs");
  if (i.fuzzyStatements.length > 0) open.push(`the empty Lean statements of ${i.fuzzyStatements.join(', ')}`);
  if (i.openArrows) open.push('new arrows into the target, proposed with propose_arrow');
  if (i.openItems !== undefined && i.openItems.length > 0) open.push(`the items to rework: ${i.openItems.join(', ')}`);
  out.push(`OPEN IN THIS STEP: ${open.length > 0 ? open.join('; ') : 'the target\'s statement only'}.`);
  out.push('FIXED: everything else, also what earlier steps wrote and what the person is reviewing: leave it exactly as it is.');
  if (i.statementsOnly !== undefined) {
    out.push(
      `This step only formalises the statements: formalise them, call freeze_statements, then call finish with status not_proved and name ${i.statementsOnly} in gap. Do not try to prove the target.`,
    );
  }
  out.push(`BUDGET: ${budgetText(i.caps)}`);
  return `${out.join('\n')}\n`;
}
