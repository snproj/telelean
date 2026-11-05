/**
 * What leaves the machine (docs/m2-plan.md section 5): the static system prompt (5.1, ./systemPrompt.ts), the first
 * user turn of a run (5.2, the context bundle) and the later user turns (5.3). Pure functions over the project model
 * and the board graph; the RunManager sends their results verbatim and records them in the run's transcript.
 */
import { subjectDir, subjectRootFile, type DecisionRecord, type ModelNode, type ProjectModel, type RunCaps, type TlGraph, type TlNode, type VocabItem } from '@telelean/core';

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
      return 'Proved (re-prove from this selection).';
    case 'pending-promotion':
      return 'Promotion pending: its .holds is still an axiom.';
    default:
      return 'Not proved.';
  }
}

function premiseStatus(node: TlNode, statement: string): string {
  const holds = `${statement}.holds`;
  const proof = node.status.proof.kind;
  if (proof === 'assumed' || (node.type === 'ASSUMPTION' && node.lean.justificationKind === 'axiom')) return `assumed (axiom ${holds})`;
  if (proof === 'proved') return 'proved';
  if (proof === 'pending-promotion') return 'promotion pending';
  if (node.type === 'ASSUMPTION') return `assumed, but its axiom ${holds} is missing (add it)`;
  return 'not usable as a premise: no proof yet';
}

function quoted(sentence: string): string {
  return `"${sentence}"`;
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
  out.push(
    `Run: "These suffice" for the subject ${subject} (namespace ${subject}; the subject's folder is ${subjectDir(subject, library)}/, its root module ${subjectRootFile(subject, library)}).`,
  );
  out.push('');
  out.push('TARGET');
  out.push(...targetLines(model, target, subject));
  out.push('');
  out.push('SELECTED PREMISES (prove the target from exactly these)');
  if (premiseNodes.length === 0) out.push('(none: the person asks whether the target is self-evident: provable from no premises at all.)');
  for (const node of premiseNodes) out.push(...premiseLines(model, node, subject));
  out.push('');
  out.push(
    'Allowed besides these: Lean\'s standard axioms, the vocabulary, and the existence presuppositions of the things these statements mention (for example "there is at least one character"). freeze_statements tells you the exact list.',
  );
  out.push('');
  out.push('OTHER CARDS OF THIS SUBJECT (context only; never use them as premises)');
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
// Later user turns (section 5.3)

export function feedbackTurn(text: string, caps: RunCaps): string {
  return (
    `Feedback from the person on your previous result:\n"${text}"\n` +
    'This starts a new round. Your earlier changes are still in the files. If statements need to change, revise them, ' +
    'then call check_lean and freeze_statements again before proving: finish with status proved needs a freeze in this ' +
    `round. Budget for this round: ${budgetText(caps)}`
  );
}

export interface AdoptedGhostTurnInput {
  nodeId: string;
  sentence: string;
  /** Fully-qualified statement name, e.g. `Spyro.not_in_game_not_good`. */
  leanName: string;
  statement: string;
  caps: RunCaps;
}

export function adoptionTurn(g: AdoptedGhostTurnInput): string {
  return (
    `The person adopted your suggestion as an assumption:\n- ${g.nodeId} (ASSUMPTION, worded by you): ${quoted(g.sentence)}\n` +
    `  Lean: ${g.leanName} := ${g.statement}; axiom ${g.leanName}.holds (telelean wrote it right before the target's block).\n` +
    `The statements are frozen again with it selected, so you may use ${g.leanName}.holds. Prove the target now and call finish. ` +
    `Budget for this round: ${budgetText(g.caps)}`
  );
}

export function resumeTurn(frozen: boolean): string {
  return (
    "The session was interrupted (the person's editor reloaded) while you were working. Your files are as you left " +
    `them; the statements are ${frozen ? 'frozen' : 'not frozen yet'}. Continue the run from where you were.`
  );
}

export const NUDGE_TURN =
  'You ended your turn without calling finish. Call finish now: with status proved if the target is proved, otherwise with status not_proved and the gap.';
