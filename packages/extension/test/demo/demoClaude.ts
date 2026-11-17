/**
 * The dry run's "Claude" (scripts/demo-driver.mjs --dry-run; docs/DEMO.md): a FakeBackend whose steps are computed
 * while they play, from the run's first message and the files of Claude's working copy, so the user's own simple
 * example runs end to end through the real board, RunManager, Lean checks and proposal without any model.
 *
 *   recognised syllogisms   "All A are B" (or "Every A is B"), "s is a(n) A" ⊢ "s is B", also chains of universals:
 *                           a sort, one predicate per class or property, a constant per individual. It asks one
 *                           genericity question about the first universal sentence of the chain. Answered "every A, no
 *                           exceptions" (or "Decide for me" / "Leave it open"): proved in round 1. Answered "As in
 *                           general" (or in your own words with "general", "typical", "usually", ...): that sentence
 *                           is read generically (`∀ x, A x → Typical x → B x`), not proved, and Claude suggests the
 *                           missing premise "s is a typical A"; adopting it ("I hold this") proves the goal in round 2.
 *   anything else           each sentence becomes one proposition (`axiom … : Prop` in the vocabulary), asked about
 *                           once (granularity); not proved, and Claude suggests "If <premises>, then <goal>", which
 *                           closes the gap; adopting it proves the goal in round 2.
 *
 * It never contacts anything: the steps run against the run's working copy through the FakeBackend (the same path
 * guard as the CLI's hook) and the RunManager's real tool host. Steps are produced lazily (FakeSession iterates them
 * with `for…of`, one step after the previous one finished), so an edit is computed from the file as it is at that
 * moment and the formalisation can follow the answer to the question.
 */
import { readFileSync } from 'node:fs';
import * as path from 'node:path';

import { FakeBackend, type FakeStep } from '@telelean/runner/llm/fake.js';
import type { AgentToolHost, Answers, AskUserArgs, BackendCaps, FinishArgs, LlmBackend, LlmSession, SessionConfig } from '@telelean/runner/llm/types.js';

// ---------------------------------------------------------------------------------------------
// The first message

export interface ContextCard {
  id: string;
  type: string;
  sentence: string;
  /** Repository-relative file of its block (when it has no Lean yet). */
  file?: string;
  /** Its statement's short name when it has Lean already. */
  statement?: string;
}

export interface RunContext {
  subject: string;
  /** e.g. Model/Demo */
  folder: string;
  target: ContextCard;
  premises: ContextCard[];
}

const CARD_LINE = /^- ([A-Za-z0-9][A-Za-z0-9-]*) \(([A-Z]+)[^)]*\): "(.*)"/;

function cardOf(lines: readonly string[], i: number, subject: string): ContextCard | undefined {
  const match = CARD_LINE.exec(lines[i] ?? '');
  if (!match) return undefined;
  let sentence = match[3] ?? '';
  // The line may go on with ` — because: …` / `; source: …` after the quoted sentence.
  const because = sentence.lastIndexOf('" — because: ');
  if (because >= 0) sentence = sentence.slice(0, because);
  const source = sentence.lastIndexOf('"; source: ');
  if (source >= 0) sentence = sentence.slice(0, source);
  const card: ContextCard = { id: match[1] ?? '', type: match[2] ?? '', sentence };
  const next = lines[i + 1] ?? '';
  const place = /^ {2}No Lean yet \(its block is in (.+), line \d+\)\.$/.exec(next);
  if (place?.[1]) card.file = place[1];
  const lean = /^ {2}Lean: (\S+) := /.exec(next);
  if (lean?.[1]) card.statement = lean[1].startsWith(`${subject}.`) ? lean[1].slice(subject.length + 1) : lean[1];
  return card;
}

/** Parses the context bundle (runner run/prompts.ts renderContextBundle); undefined when the turn is not one. */
export function parseContext(turn: string): RunContext | undefined {
  const head = /^Run: "These suffice" for the subject (\S+) \(namespace \S+; the subject's folder is (\S+)\/, its root module \S+\)\./.exec(turn);
  if (!head?.[1] || !head[2]) return undefined;
  const subject = head[1];
  const lines = turn.split('\n');
  const targetAt = lines.indexOf('TARGET');
  const premisesAt = lines.findIndex((l) => l.startsWith('SELECTED PREMISES'));
  const othersAt = lines.findIndex((l) => l.startsWith('OTHER CARDS OF THIS SUBJECT'));
  if (targetAt < 0 || premisesAt < 0) return undefined;
  const target = cardOf(lines, targetAt + 1, subject);
  if (!target) return undefined;
  const premises: ContextCard[] = [];
  for (let i = premisesAt + 1; i < (othersAt > 0 ? othersAt : lines.length); i++) {
    const card = cardOf(lines, i, subject);
    if (card) premises.push(card);
  }
  return { subject, folder: head[2], target, premises };
}

// ---------------------------------------------------------------------------------------------
// Names

const RESERVED = new Set([
  'Type', 'Prop', 'Sort', 'Nonempty', 'True', 'False', 'Not', 'And', 'Or', 'Iff', 'Eq', 'Entity', 'Typical',
  'at', 'by', 'do', 'end', 'fun', 'have', 'show', 'from', 'then', 'else', 'if', 'let', 'in', 'match', 'with', 'where',
  'theorem', 'def', 'axiom', 'abbrev', 'opaque', 'instance', 'structure', 'inductive', 'class', 'example', 'open',
  'namespace', 'section', 'variable', 'universe', 'import', 'export', 'private', 'protected', 'noncomputable',
  'partial', 'unsafe', 'macro', 'syntax', 'notation', 'calc', 'forall', 'exists', 'deriving', 'mutual', 'local',
]);

function words(text: string): string[] {
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .split(/[^A-Za-z0-9]+/)
    .filter((w) => w !== '');
}

function safe(name: string, fallback: string): string {
  let out = name === '' ? fallback : name;
  if (/^[0-9]/.test(out)) out = `${fallback}${out}`;
  if (RESERVED.has(out)) out = `${out}_`;
  return out;
}

const pascal = (text: string, fallback: string): string =>
  safe(
    words(text)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(''),
    fallback,
  );

const camel = (text: string, fallback: string): string =>
  safe(
    words(text)
      .map((w, i) => (i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
      .join(''),
    fallback,
  );

/** The statement name of a card: its id in snake_case (ids are lower-case words joined by `-`). */
export function statementName(id: string): string {
  return safe(id.replace(/-/g, '_'), 'card_');
}

/** A docstring-safe copy of a sentence. */
const doc = (sentence: string): string => sentence.replace(/-\//g, '- /').replace(/\/-/g, '/ -');

function unique(name: string, used: Set<string>): string {
  let out = name;
  while (used.has(out)) out = `${out}_`;
  used.add(out);
  return out;
}

// ---------------------------------------------------------------------------------------------
// The syllogism reading

export interface Phrase {
  /** Lower case, singular: what is compared. */
  key: string;
  /** As the user wrote it (singular). */
  display: string;
  /** Written as a noun ("a human", "humans"), not as an adjective ("mortal"). */
  noun: boolean;
}

export type Analysis = { kind: 'universal'; from: Phrase; to: Phrase } | { kind: 'fact'; individual: Phrase; property: Phrase };

function singular(phrase: string): { text: string; plural: boolean } {
  const parts = phrase.split(' ');
  const last = parts[parts.length - 1] ?? '';
  if (last.length > 3 && /s$/i.test(last) && !/ss$/i.test(last)) {
    parts[parts.length - 1] = /ies$/i.test(last) ? `${last.slice(0, -3)}y` : last.slice(0, -1);
    return { text: parts.join(' '), plural: true };
  }
  return { text: phrase, plural: false };
}

function phrase(original: string, article: boolean): Phrase {
  const s = singular(original.trim());
  return { key: s.text.toLowerCase(), display: s.text, noun: article || s.plural };
}

/** "All humans are mortal" -> universal human -> mortal; "Socrates is a human" -> fact (Socrates, human); else undefined. */
export function analyse(sentence: string): Analysis | undefined {
  const s = sentence.trim().replace(/[.!]+$/, '').replace(/\s+/g, ' ');
  const universal = /^(?:all|every|each)\s+(.+?)\s+(?:are|is)\s+(an?\s+)?(.+)$/i.exec(s);
  if (universal?.[1] && universal[3]) return { kind: 'universal', from: phrase(universal[1], true), to: phrase(universal[3], universal[2] !== undefined) };
  const fact = /^(.+?)\s+is\s+(an?\s+)?(.+)$/i.exec(s);
  if (fact?.[1] && fact[3] && !/^(all|every|each|no|some|not)\b/i.test(fact[1]) && !/\bnot\b/i.test(fact[3])) {
    return { kind: 'fact', individual: { key: fact[1].toLowerCase(), display: fact[1], noun: true }, property: phrase(fact[3], fact[2] !== undefined) };
  }
  return undefined;
}

interface Syllogism {
  /** The fact the chain starts from. */
  fact: ContextCard;
  /** The goal's individual. */
  individual: Phrase;
  /** The universal premises in proof order. */
  chain: Array<{ card: ContextCard; from: Phrase; to: Phrase }>;
}

/** A chain from a fact about the goal's individual through universal premises to the goal's property, if any. */
export function findSyllogism(context: RunContext): Syllogism | undefined {
  const goal = analyse(context.target.sentence);
  if (goal?.kind !== 'fact') return undefined;
  if (context.premises.some((p) => p.statement !== undefined || p.file === undefined) || context.target.file === undefined) return undefined;
  const analysed = context.premises.map((card) => ({ card, a: analyse(card.sentence) }));
  if (analysed.some((x) => x.a === undefined)) return undefined;
  const universals = analysed.flatMap((x) => (x.a?.kind === 'universal' ? [{ card: x.card, a: x.a }] : []));
  const facts = analysed.flatMap((x) => (x.a?.kind === 'fact' && x.a.individual.key === goal.individual.key ? [{ card: x.card, a: x.a }] : []));
  for (const start of facts) {
    // Breadth-first over the universals from the fact's property to the goal's property.
    const queue: Array<{ at: string; chain: Syllogism['chain'] }> = [{ at: start.a.property.key, chain: [] }];
    const seen = new Set<string>([start.a.property.key]);
    for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
      if (next.at === goal.property.key && next.chain.length > 0) return { fact: start.card, individual: goal.individual, chain: next.chain };
      for (const u of universals) {
        if (u.a.from.key !== next.at || seen.has(u.a.to.key)) continue;
        seen.add(u.a.to.key);
        queue.push({ at: u.a.to.key, chain: [...next.chain, { card: u.card, from: u.a.from, to: u.a.to }] });
      }
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------------------------
// Plans

type Reading = 'universal' | 'generic' | 'whole-claims';

interface Plan {
  context: RunContext;
  syllogism?: Syllogism;
  /** Vocabulary declarations (Lean lines) for Vocabulary.lean. */
  vocabulary: string[];
  /** Statement per card id (premises and target). */
  statements: Map<string, string>;
  /** Statement name per card id. */
  names: Map<string, string>;
  /** Syllogism: the constant of each individual (by key). */
  constants: Map<string, string>;
  question: AskUserArgs['questions'][number];
  reading?: Reading;
  /** Set once the run suggested a premise: the name the adoption round's message names otherwise. */
  ghostName?: string;
  lastFinish?: FinishArgs;
}

const GENERIC_WORDS = /\b(general|generic|generally|typical|typically|usual|usually|normally|most|exceptions? (are )?(allowed|possible))\b/i;
const UNIVERSAL_WORDS = /\b(no exceptions?|without exceptions?|every single|all of them|always)\b/i;

function cardNames(context: RunContext): Map<string, string> {
  const names = new Map<string, string>();
  const used = new Set<string>();
  for (const card of [...context.premises, context.target]) names.set(card.id, unique(card.statement ?? statementName(card.id), used));
  return names;
}

function capitalised(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function syllogismPlan(context: RunContext, s: Syllogism, names: Map<string, string>): Plan {
  const used = new Set(names.values());
  const analyses = [...context.premises, context.target].map((card) => ({ card, a: analyse(card.sentence) }));
  const predicates = new Map<string, { name: string; phrase: Phrase }>();
  const constants = new Map<string, { name: string; phrase: Phrase }>();
  const predicate = (p: Phrase) => {
    const known = predicates.get(p.key);
    if (known) {
      if (p.noun) known.phrase = p;
      return known.name;
    }
    const name = unique(pascal(p.key, 'Is'), used);
    predicates.set(p.key, { name, phrase: p });
    return name;
  };
  const constant = (p: Phrase) => {
    const known = constants.get(p.key);
    if (known) return known.name;
    const name = unique(camel(p.key, 'c'), used);
    constants.set(p.key, { name, phrase: p });
    return name;
  };
  const statements = new Map<string, string>();
  for (const { card, a } of analyses) {
    if (a?.kind === 'universal') statements.set(card.id, `∀ x : Entity, ${predicate(a.from)} x → ${predicate(a.to)} x`);
    else if (a?.kind === 'fact') statements.set(card.id, `${predicate(a.property)} ${constant(a.individual)}`);
  }
  const vocabulary = ['/-- the individuals these sentences talk about -/', 'axiom Entity : Type', '/-- there is at least one individual -/', 'axiom Entity.exists : Nonempty Entity', 'instance : Nonempty Entity := Entity.exists'];
  for (const { name, phrase: p } of predicates.values()) vocabulary.push(`/-- ${p.noun ? `is ${/^[aeiou]/i.test(p.display) ? 'an' : 'a'} ${p.display}` : `is ${p.display}`} -/`, `axiom ${name} : Entity → Prop`);
  for (const { name, phrase: p } of constants.values()) vocabulary.push(`/-- ${capitalised(p.display)} -/`, `noncomputable opaque ${name} : Entity`);
  const first = s.chain[0];
  const cls = first?.from.display ?? 'thing';
  const who = capitalised(s.individual.display);
  return {
    context,
    syllogism: s,
    vocabulary,
    statements,
    names,
    constants: new Map([...constants].map(([key, c]) => [key, c.name])),
    question: {
      phenomenon: 'genericity',
      question: `Does "${first?.card.sentence ?? ''}" mean every single ${cls} without exception, or ${cls}s in general (typical ones; exceptions allowed)?`,
      options: [
        { label: `Every ${cls}, no exceptions`, consequence: `It then covers ${who} too, as soon as ${who} is ${/^[aeiou]/i.test(cls) ? 'an' : 'a'} ${cls}.` },
        { label: `${capitalised(cls)}s in general`, consequence: `It covers typical ${cls}s only, so it says nothing about ${who} unless ${who} is a typical one.` },
      ],
      claudesGuess: { option: 0, note: 'In a syllogism the universal sentence is usually meant without exceptions.' },
      affectedNodes: first ? [first.card.id] : [],
    },
  };
}

function wholeClaimsPlan(context: RunContext, names: Map<string, string>): Plan {
  const used = new Set(names.values());
  const vocabulary: string[] = [];
  const statements = new Map<string, string>();
  for (const card of [...context.premises, context.target]) {
    if (card.statement !== undefined) continue;
    const atom = unique(pascal(words(card.sentence).slice(0, 5).join(' '), 'Claim'), used);
    vocabulary.push(`/-- it holds that: ${doc(card.sentence)} -/`, `axiom ${atom} : Prop`);
    statements.set(card.id, atom);
  }
  return {
    context,
    vocabulary,
    statements,
    names,
    constants: new Map(),
    question: {
      phenomenon: 'granularity',
      question: 'Should I read each of your sentences as one whole claim, without analysing what is inside it?',
      options: [
        { label: 'Yes, as whole claims', consequence: 'Each sentence becomes one proposition; the goal then needs a premise that links the others to it.' },
        { label: 'No, analyse them', consequence: 'This dry run cannot analyse them further: it reads them as whole claims anyway.' },
      ],
      claudesGuess: { option: 0 },
      affectedNodes: context.premises.map((p) => p.id),
    },
  };
}

function readingOf(plan: Plan, answers: Answers | undefined): Reading {
  if (!plan.syllogism) return 'whole-claims';
  const choice = answers?.answers[0]?.choice;
  if (!choice) return 'universal';
  if (choice.kind === 'option') return choice.option === 1 ? 'generic' : 'universal';
  if (choice.kind === 'free-text') return GENERIC_WORDS.test(choice.text) && !UNIVERSAL_WORDS.test(choice.text) ? 'generic' : 'universal';
  return 'universal';
}

function assumedWithoutAsking(plan: Plan, answers: Answers | undefined): string[] {
  const choice = answers?.answers[0]?.choice;
  const about = plan.syllogism?.chain[0]?.card.sentence;
  if (!about) return [];
  if (choice?.kind === 'decide-for-me') return [`I read "${about}" as covering every case without exception (you asked me to decide).`];
  if (choice?.kind === 'leave-open') return [`"${about}" was left open; I read it as covering every case, the reading the proof needs.`];
  return [];
}

// ---------------------------------------------------------------------------------------------
// Edits computed from the working copy

interface Files {
  read(rel: string): string;
}

/** The block of card `id` in `text`: from its opening `/-` to its closing `-/` and newline. */
function blockOf(text: string, id: string): string | undefined {
  const start = text.indexOf(`/-\n@@ telelean v1\nid: ${id}\n`);
  if (start < 0) return undefined;
  const end = text.indexOf('\n-/\n', start);
  if (end < 0) return undefined;
  return text.slice(start, end + 4);
}

function statementEdit(files: Files, card: ContextCard, name: string, statement: string, assumption: boolean): FakeStep {
  const file = card.file ?? '';
  const block = blockOf(files.read(file), card.id);
  if (!block) return { kind: 'text', text: `(dry run) I could not find the block of ${card.id} in ${file}.` };
  const lines = [`/-- ${doc(card.sentence)} -/`, `abbrev ${name} : Prop := ${statement}`, ...(assumption ? [`axiom ${name}.holds : ${name}`] : [])];
  return { kind: 'edit', path: file, oldString: block, newString: `${block}${lines.join('\n')}\n` };
}

function vocabularyEdit(files: Files, plan: Plan): FakeStep {
  const file = `${plan.context.folder}/Vocabulary.lean`;
  const text = files.read(file);
  const end = `\nend ${plan.context.subject}\n`;
  const at = text.lastIndexOf(end);
  if (at < 0 || text.indexOf(end) !== at) return { kind: 'text', text: `(dry run) ${file} does not end with one "end ${plan.context.subject}".` };
  const tail = text.slice(at);
  return { kind: 'edit', path: file, oldString: tail, newString: `\n${plan.vocabulary.join('\n')}\n${tail}` };
}

function proofEdit(files: Files, plan: Plan, proof: string): FakeStep {
  const target = plan.context.target;
  const file = target.file ?? '';
  const name = plan.names.get(target.id) ?? statementName(target.id);
  const line = `abbrev ${name} : Prop := ${plan.statements.get(target.id) ?? ''}\n`;
  if (!files.read(file).includes(line)) return { kind: 'text', text: `(dry run) the statement of ${target.id} is not in ${file} as written.` };
  return { kind: 'edit', path: file, oldString: line, newString: `${line}theorem ${name}.holds : ${name} :=\n  ${proof}\n` };
}

/** The proof term of the target along the syllogism's chain; `typical` proves `Typical c` (the generic reading). */
function chainProof(plan: Plan, typical?: string): string {
  const s = plan.syllogism;
  if (!s) return '';
  const c = plan.constants.get(s.individual.key) ?? 'c';
  let term = `${plan.names.get(s.fact.id)}.holds`;
  s.chain.forEach((step, i) => {
    const holds = `${plan.names.get(step.card.id)}.holds`;
    const arg = term.includes(' ') ? `(${term})` : term;
    term = i === 0 && typical !== undefined ? `${holds} ${c} ${arg} ${typical}` : `${holds} ${c} ${arg}`;
  });
  return term;
}

// ---------------------------------------------------------------------------------------------
// The backend

export interface DemoRunRecord {
  target: string;
  premises: string[];
  recognised: 'syllogism' | 'whole-claims';
  question: string;
  answer?: unknown;
  reading?: Reading;
  checks: Array<{ ok: boolean; violations: string[]; errors: string[] }>;
  freeze?: { frozen: boolean; refusals: string[] };
  proposal?: { natural_name: string; lean_statement: string; status: string; gateChecked: boolean };
  finishes: Array<{ status: string; passed: boolean; failures: string[] }>;
  /** First lines of the later user turns (adoption, feedback, retries, reminders). */
  turns: string[];
  problems: string[];
}

export class DemoClaude implements LlmBackend {
  readonly id = 'fake' as const;
  readonly caps: BackendCaps = { builtinFileTools: true, subscriptionAuth: false, resume: true, interrupt: true };
  readonly runs: DemoRunRecord[] = [];
  private plan: Plan | undefined;
  private record: DemoRunRecord | undefined;
  private answers: Answers | undefined;
  private readonly log: (message: string) => void;

  constructor(log: (message: string) => void = () => undefined) {
    this.log = log;
  }

  async startSession(cfg: SessionConfig): Promise<LlmSession> {
    const host = cfg.toolHost;
    const toolHost: AgentToolHost = {
      ask_user: async (args, ctx) => {
        const answers = await host.ask_user(args, ctx);
        this.answers = answers;
        if (this.record) this.record.answer = answers.answers;
        return answers;
      },
      check_lean: async (args, ctx) => {
        const result = await host.check_lean(args, ctx);
        this.record?.checks.push({
          ok: result.ok,
          violations: result.violations,
          errors: result.diagnostics.filter((d) => d.severity === 'error').map((d) => `${d.file}:${d.line}: ${d.message}`),
        });
        return result;
      },
      freeze_statements: async (args, ctx) => {
        const result = await host.freeze_statements(args, ctx);
        if (this.record) this.record.freeze = { frozen: result.frozen, refusals: result.refusals };
        return result;
      },
      propose_assumption: async (args, ctx) => {
        const result = await host.propose_assumption(args, ctx);
        if (this.record) this.record.proposal = { natural_name: args.natural_name, lean_statement: args.lean_statement, status: result.status, gateChecked: result.gateChecked };
        return result;
      },
      finish: async (args, ctx) => {
        const verdict = await host.finish(args, ctx);
        if (this.plan) this.plan.lastFinish = args;
        this.record?.finishes.push({ status: args.status, passed: verdict.passed, failures: verdict.failures.map((f) => `${f.check}: ${f.detail}`) });
        return verdict;
      },
    };
    const files: Files = { read: (rel) => readFileSync(path.join(cfg.cwd, rel), 'utf8') };
    // A lazy sequence where FakeBackend expects an array: FakeSession only iterates it (module comment).
    const backend = new FakeBackend((turn) => this.turn(turn, files) as unknown as FakeStep[]);
    return backend.startSession({ ...cfg, toolHost });
  }

  /** The steps of one user turn; a problem of this scripted Claude ends the turn with a message instead of throwing. */
  private *turn(text: string, files: Files): Generator<FakeStep> {
    try {
      const context = parseContext(text);
      if (context) yield* this.firstRound(context, files);
      else yield* this.laterTurn(text, files);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.record?.problems.push(message);
      this.log(`dry-run Claude: ${message}`);
      yield { kind: 'text', text: `(dry run) I cannot go on: ${message}` };
    }
  }

  private *laterTurn(text: string, files: Files): Generator<FakeStep> {
    this.record?.turns.push(text.split('\n')[0] ?? '');
    const plan = this.plan;
    if (!plan) return;
    if (text.startsWith('The person adopted your suggestion')) {
      const name = /\n {2}Lean: (?:[A-Za-z0-9_]+\.)?([A-Za-z0-9_]+) := /.exec(text)?.[1] ?? plan.ghostName ?? 'suggested';
      yield { kind: 'usage', usage: { inputTokens: 60, outputTokens: 90, cacheReadInputTokens: 12_000, cacheCreationInputTokens: 300 } };
      yield { kind: 'text', text: 'With the premise you adopted the goal follows. Proving it now.' };
      yield proofEdit(files, plan, this.proofWithGhost(plan, name));
      yield { kind: 'callTool', tool: 'check_lean', args: {} };
      yield { kind: 'callTool', tool: 'finish', args: { status: 'proved', summary: 'Proved with the premise you adopted.', assumed_without_asking: [] } };
      yield { kind: 'result', costEstimateUsd: 0.03 };
      return;
    }
    if (text.startsWith('Feedback from the person')) {
      yield { kind: 'text', text: 'I checked the statements again; this dry run keeps them as they are.' };
      yield { kind: 'callTool', tool: 'check_lean', args: {} };
      yield { kind: 'callTool', tool: 'freeze_statements', args: { targets: [plan.context.target.id] } };
      yield { kind: 'callTool', tool: 'finish', args: plan.lastFinish ?? { status: 'not_proved', summary: 'Unchanged.', gap: 'Unchanged.', assumed_without_asking: [] } };
      yield { kind: 'result' };
    }
    // Retries after a failed check, reminders, resumes: this scripted Claude has nothing more to say.
  }

  private *firstRound(context: RunContext, files: Files): Generator<FakeStep> {
    const names = cardNames(context);
    const syllogism = findSyllogism(context);
    const plan = syllogism ? syllogismPlan(context, syllogism, names) : wholeClaimsPlan(context, names);
    this.plan = plan;
    this.answers = undefined;
    const record: DemoRunRecord = {
      target: context.target.id,
      premises: context.premises.map((p) => p.id),
      recognised: syllogism ? 'syllogism' : 'whole-claims',
      question: plan.question.question,
      checks: [],
      finishes: [],
      turns: [],
      problems: [],
    };
    this.record = record;
    this.runs.push(record);
    this.log(`dry-run Claude: target ${context.target.id}, ${context.premises.length} premise(s), read as ${record.recognised}`);

    yield { kind: 'usage', usage: { inputTokens: 40, outputTokens: 120, cacheReadInputTokens: 9_000, cacheCreationInputTokens: 3_000 } };
    yield { kind: 'text', text: 'Reading your cards first.' };
    if (context.target.file) yield { kind: 'read', path: context.target.file };
    yield { kind: 'callTool', tool: 'ask_user', args: { questions: [plan.question] } };
    // (FakeSession pulls the next step only after the answer arrived.)
    const reading = readingOf(plan, this.answers);
    plan.reading = reading;
    record.reading = reading;
    const first = syllogism?.chain[0];
    if (reading === 'generic' && first) {
      // The universal sentence the question was about, read generically: only typical members are covered.
      const statement = plan.statements.get(first.card.id);
      if (statement) plan.statements.set(first.card.id, statement.replace(/ → (\S+) x$/, ' → Typical x → $1 x'));
      plan.vocabulary.push('/-- is a typical member of its kind -/', 'axiom Typical : Entity → Prop');
    }
    yield { kind: 'usage', usage: { inputTokens: 45, outputTokens: 400, cacheReadInputTokens: 10_000, cacheCreationInputTokens: 200 } };
    yield { kind: 'text', text: reading === 'whole-claims' ? 'I formalise each sentence as one claim.' : `I formalise the sentences (${reading} reading).` };
    yield vocabularyEdit(files, plan);
    for (const card of context.premises) {
      if (card.statement !== undefined) continue;
      yield statementEdit(files, card, plan.names.get(card.id) ?? statementName(card.id), plan.statements.get(card.id) ?? 'True', card.type === 'ASSUMPTION');
    }
    if (context.target.statement === undefined) {
      yield statementEdit(files, context.target, plan.names.get(context.target.id) ?? statementName(context.target.id), plan.statements.get(context.target.id) ?? 'True', false);
    }
    yield { kind: 'callTool', tool: 'check_lean', args: {} };
    yield { kind: 'usage', usage: { inputTokens: 50, outputTokens: 150, cacheReadInputTokens: 11_000, cacheCreationInputTokens: 200 } };
    yield { kind: 'callTool', tool: 'freeze_statements', args: { targets: [context.target.id] } };
    if (reading === 'universal') {
      yield proofEdit(files, plan, chainProof(plan));
      yield { kind: 'callTool', tool: 'check_lean', args: {} };
      yield { kind: 'usage', usage: { inputTokens: 55, outputTokens: 160, cacheReadInputTokens: 11_500, cacheCreationInputTokens: 200 } };
      yield {
        kind: 'callTool',
        tool: 'finish',
        args: { status: 'proved', summary: 'Proved from your premises: the universal premise(s) applied to the fact give the goal.', assumed_without_asking: assumedWithoutAsking(plan, this.answers) },
      };
      yield { kind: 'result', costEstimateUsd: 0.02 };
      return;
    }
    const ghost = this.ghost(plan);
    plan.ghostName = ghost.lean_name;
    yield { kind: 'callTool', tool: 'propose_assumption', args: ghost };
    yield { kind: 'usage', usage: { inputTokens: 55, outputTokens: 160, cacheReadInputTokens: 11_500, cacheCreationInputTokens: 200 } };
    yield {
      kind: 'callTool',
      tool: 'finish',
      args: {
        status: 'not_proved',
        summary: reading === 'generic' ? 'Read generically, your premises do not give the goal.' : 'As whole claims, your premises do not give the goal.',
        gap: reading === 'generic' && syllogism ? `Nothing says that ${capitalised(syllogism.individual.display)} is a typical ${first?.from.display ?? 'case'}.` : 'Nothing links your premises to the goal.',
        assumed_without_asking: [],
      },
    };
    yield { kind: 'result', costEstimateUsd: 0.02 };
  }

  /** The suggested missing premise of a round that does not prove the goal (one Lean line, existing vocabulary). */
  private ghost(plan: Plan): { natural_name: string; lean_statement: string; why_needed: string; proof: string; lean_name: string } {
    const s = plan.syllogism;
    if (plan.reading === 'generic' && s) {
      const c = plan.constants.get(s.individual.key) ?? 'c';
      const cls = s.chain[0]?.from.display ?? 'thing';
      const who = capitalised(s.individual.display);
      const base = c.replace(/[A-Z]/g, (x) => `_${x.toLowerCase()}`).replace(/^_+/, '').replace(/_+$/, '');
      return {
        natural_name: `${who} is a typical ${cls}`,
        lean_statement: `Typical ${c}`,
        why_needed: `Read generically, "${s.chain[0]?.card.sentence ?? ''}" covers typical ${cls}s only; nothing says ${who} is one.`,
        proof: `fun h => ${chainProof(plan, 'h')}`,
        lean_name: `${/^[a-z]/.test(base) ? base : `c_${base}`}`.slice(0, 48).replace(/_+$/, '') + '_is_typical',
      };
    }
    const premises = plan.context.premises;
    const atoms = premises.map((p) => plan.statements.get(p.id) ?? 'True');
    const goal = plan.statements.get(plan.context.target.id) ?? 'True';
    const quoted = (text: string) => `“${text.replace(/[.!]+$/, '')}”`;
    const given = premises.map((p) => quoted(p.sentence));
    const together = given.length === 1 ? given[0] : `${given.slice(0, -1).join(', ')} and ${given.at(-1)}`;
    return {
      natural_name: `${given.length === 1 ? '' : 'Together, '}${together} give${given.length === 1 ? 's' : ''} ${quoted(plan.context.target.sentence)}`.slice(0, 300),
      lean_statement: [...atoms, goal].join(' → '),
      why_needed: 'Read as whole claims, nothing connects your premises to the goal.',
      proof: `fun h => h${premises.map((p) => ` ${plan.names.get(p.id)}.holds`).join('')}`,
      lean_name: 'premises_give_goal',
    };
  }

  private proofWithGhost(plan: Plan, ghostName: string): string {
    if (plan.reading === 'generic' && plan.syllogism) return chainProof(plan, `${ghostName}.holds`);
    return `${ghostName}.holds${plan.context.premises.map((p) => ` ${plan.names.get(p.id)}.holds`).join('')}`;
  }
}
