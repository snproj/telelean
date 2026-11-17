/**
 * `evaluateRules` (docs/m2-plan.md section 3.3, with the reviewer's corrected table): G1 Lean errors, G3, G5 and the
 * stage/readiness rules for one purpose, the flagged definitions, footprints, the run's new statements and the
 * declaration diff. Pure, never throws for a malformed model: problems become findings.
 *
 * B (`input.base`) is exactly the user's files (base or accept-base commit); A (`input.adopted`) the shadow at its newest
 * `adopt` commit, which telelean's own ghost blocks and declarations are held to; S (`input.current`) the shadow now.
 *
 * Finding conventions (WP1-internal, read by `describeFinding`): `file`/`range` point at the declaration or block in S
 * (in B for something removed), `names` holds fully-qualified Lean names, `nodeId` the card concerned, and `token` a
 * short marker of the variant where the board's sentence depends on it (see each rule).
 */
import { holdsName, SORRY_AXIOM, STANDARD_AXIOM_NAMES, statementOfHolds, type DeclFacts } from '../facts.js';
import { relativeName } from '../markup/names.js';
import type { MarkupBlock, ParsedFile } from '../markup/types.js';
import type { Position, Range, TlNode } from '../model.js';
import type { ModelNode, ProjectModel } from '../project/types.js';
import { LineMap, normalizeWhitespace } from '../project/text.js';
import { axiomNames, declTables, factsOf, isAxiom, isProof, type DeclEntry, type DeclTables } from './decls.js';
import { where } from './g0.js';
import { permittedAxioms, signatureAxioms } from './permitted.js';
import type { FlaggedDefinition, GateFinding, GateFindingCode, PermittedAxioms, RuleInput, RuleReport } from './types.js';

/** Order of the G3 codes in a report: root causes before their consequences. */
const G3_ORDER: readonly GateFindingCode[] = ['new-axiom', 'existing-changed', 'not-proved', 'status-mismatch', 'statement-changed', 'footprint', 'sorry-axiom', 'vocabulary-shape'];
/** Readiness and stage codes come after G5. */
const LATE_ORDER: readonly GateFindingCode[] = ['not-formalised', 'missing-holds', 'proof-before-freeze', 'not-frozen'];

/**
 * Lean's facts kinds whose `#print axioms` does not cover everything the declaration's source holds: a structure or
 * class keeps each field's default value in an auxiliary definition `S.f._default` that neither `#print axioms S` nor
 * Lean's index (`.ilean`) lists, so its footprint also takes in the constants its source mentions (`refs`). Verified
 * on Lean 4.35: `structure H where h : p := p.holds` prints `'H' depends on axioms: [...]` without `p.holds`, while
 * `#print axioms H.h._default` lists it and `.ilean` attributes the usage of `p.holds` to `H`. (An inductive's
 * constructor defaults are `optParam`s of the constructor's type, which `#print axioms` does follow.)
 */
const SOURCE_REF_KINDS: ReadonlySet<string> = new Set(['structure', 'class']);

/** A declaration the footprint rules judge: the parser's entry, or a name only Lean reports (`entry` absent). */
interface Judged {
  name: string;
  entry?: DeclEntry;
  facts?: DeclFacts;
  /** A proof (`isProof`): held to the permitted set exactly; anything else may also use the existence presuppositions. */
  proof: boolean;
}

/** A name Lean reports that the header parser does not list (a structure's field, a `where`/`let rec` declaration, …). */
interface FactsOnly {
  name: string;
  facts: DeclFacts;
  /** The parser's declaration whose source contains it, if any. */
  owner?: DeclEntry;
}

const notAfter = (a: Position, b: Position) => a.line < b.line || (a.line === b.line && a.character <= b.character);
const contains = (range: Range, at: Position) => notAfter(range.start, at) && notAfter(at, range.end);

/** Block fields compared raw between B and S (G5); `id` and `lean` have their own rules. */
const COMPARED_FIELDS = ['natural_name', 'rationale', 'type', 'premises', 'stance', 'source', 'asserted', 'supersedes', 'refines', 'tags', 'origin', 'session', 'worded_by'] as const;

const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
const norm = (text: string | undefined) => (text === undefined ? undefined : normalizeWhitespace(text));
const quote = (text: string) => JSON.stringify(text);

/** Raw values of one key's lines of a block, in order. */
function raws(block: MarkupBlock, key: string): string[] {
  return block.lines.filter((line) => line.key === key).map((line) => line.raw);
}

/** The node id of each block that is a card (workspace ids may differ from a block's file-local derived id). */
function nodeIdsOfBlocks(model: ProjectModel): Map<MarkupBlock, string> {
  const out = new Map<MarkupBlock, string>();
  for (const entry of model.nodes.values()) out.set(entry.block, entry.node.id);
  return out;
}

/** A card has a statement bound to its block (adjacent or pinned), whether or not Lean accepted it. */
function bound(node: TlNode | undefined): string | undefined {
  return node !== undefined && node.lean.binding !== 'none' ? node.lean.statement : undefined;
}

/** A card is formalised for the readiness rules: bound to a declaration that exists and is a Prop abbrev/def. */
function formalised(model: ProjectModel, node: TlNode): boolean {
  if (bound(node) === undefined) return false;
  return !model.diagnostics.some((d) => d.nodeId === node.id && (d.code === 'TL101' || d.code === 'TL113'));
}

/** Why a bound card is not formalised, in a few words for Claude (TL101 / TL113; the board's own texts suggest a `.holds`). */
function malformedReason(model: ProjectModel, node: TlNode): string {
  const codes = new Set(model.diagnostics.filter((d) => d.nodeId === node.id).map((d) => d.code));
  if (codes.has('TL101')) return 'Lean has no declaration of that name';
  return 'it is not an `abbrev`/`def` of type `Prop`';
}

export function evaluate(input: RuleInput): RuleReport {
  const { purpose, selection, stage, base, current } = input;
  const roundStart = input.roundStart ?? base;
  const freeze = input.freeze;
  const subject = selection.subject;
  const B = declTables(base);
  const S = declTables(current);
  const R = declTables(roundStart);
  const checkProve = purpose === 'check' && stage === 'prove';
  const checkFormalise = purpose === 'check' && stage === 'formalise';
  const gate = purpose === 'gate-proved' || purpose === 'gate-other';

  const nodeIn = (model: ProjectModel, id: string): ModelNode | undefined => model.nodes.get(id);
  const curTarget = nodeIn(current, selection.target)?.node;
  const baseTarget = nodeIn(base, selection.target)?.node;
  const targetStatement = curTarget?.lean.statement ?? baseTarget?.lean.statement ?? freeze?.targetStatement;
  const targetHolds = targetStatement !== undefined ? holdsName(targetStatement) : undefined;
  /** T's `.holds` may be added, changed or turned from axiom into theorem (D-11 pending promotion). */
  const exempt = new Set<string>(
    [baseTarget?.lean.statement, curTarget?.lean.statement, freeze?.targetStatement].filter((s): s is string => s !== undefined).map(holdsName),
  );
  const targetStatements = new Set([baseTarget?.lean.statement, curTarget?.lean.statement, freeze?.targetStatement].filter((s): s is string => s !== undefined));
  const ghosts = [...new Set(selection.adoptedGhosts)];
  const chosen = new Set<string>([selection.target, ...selection.premises, ...ghosts]);
  /**
   * A chosen card left code-less only because a blank line separates its block from the declaration below it (TL013):
   * that declaration's full name. Turn 13: on a fresh model the agent formalises code-less cards, and one stray blank
   * line made the gate call the card unformalised and the assumption's `.holds` a belief, which told Claude to remove
   * it; the findings now name the blank line instead (the verdicts are unchanged).
   */
  const detachedStatementOf = (id: string): string | undefined => {
    const entry = current.nodes.get(id);
    if (entry === undefined || entry.node.lean.binding !== 'none') return undefined;
    const gap = entry.block.binding.gapDecl;
    return gap === undefined ? undefined : current.files.get(entry.file)?.decls[gap]?.fullName;
  };
  /** `.holds` of a detached statement of a chosen card -> that card. */
  const detachedHolds = new Map<string, string>();
  for (const id of chosen) {
    const statement = detachedStatementOf(id);
    if (statement !== undefined) detachedHolds.set(holdsName(statement), id);
  }

  const short = (name: string) => relativeName(name, [subject]);
  const at = (entry: DeclEntry | undefined): { file?: string; range?: Range } => (entry ? { file: entry.file.path, range: entry.decl.range } : {});
  const loc = (entry: DeclEntry | undefined) => (entry ? `${where(entry.file.path, entry.decl.range)}: ` : '');
  /** The same for a judged declaration, which may be a name only Lean reports (its facts' range). */
  const locOf = (j: Judged) => (j.entry ? loc(j.entry) : j.facts ? `${where(j.facts.file, j.facts.range)}: ` : '');
  const atOf = (j: Judged) => (j.entry ? at(j.entry) : j.facts ? { file: j.facts.file, range: j.facts.range } : {});
  const sentence = (id: string) => current.nodes.get(id)?.node.naturalName ?? base.nodes.get(id)?.node.naturalName ?? id;

  // ---- declaration diff (syntactic, by name and text)
  const added: string[] = [];
  const changed: string[] = [];
  const removed: string[] = [];
  for (const [name, entry] of S.byName) {
    const before = B.byName.get(name);
    if (!before) added.push(name);
    else if (before.text !== entry.text) changed.push(name);
  }
  for (const name of B.byName.keys()) if (!S.byName.has(name)) removed.push(name);
  const addedOrChanged = new Set([...added, ...changed]);
  const inBase = (name: string) => B.known.has(name);

  const changedFiles = new Set<string>();
  for (const [path, file] of current.files) if (base.files.get(path)?.text !== file.text) changedFiles.add(path);

  // ---- names only Lean reports (fixer round 2): a structure's fields, `where`/`let rec` declarations, … each with the
  // parser's declaration that contains it; computed once, for the footprint and proof-before-freeze rules.
  let factsOnlyCache: FactsOnly[] | undefined;
  const factsOnly = (): FactsOnly[] => {
    if (factsOnlyCache) return factsOnlyCache;
    const claimed = new Set<string>();
    const byFile = new Map<string, DeclEntry[]>();
    for (const [name, entry] of S.byName) {
      claimed.add(name);
      const f = factsOf(current, name, entry);
      if (f) claimed.add(f.name);
      const list = byFile.get(entry.file.path) ?? [];
      list.push(entry);
      byFile.set(entry.file.path, list);
    }
    const out: FactsOnly[] = [];
    for (const [name, f] of current.declFacts) {
      if (claimed.has(name) || f.kind === 'axiom') continue;
      const owner = (byFile.get(f.file) ?? []).find((e) => contains(e.decl.range, f.selectionRange.start));
      out.push({ name, facts: f, ...(owner ? { owner } : {}) });
    }
    factsOnlyCache = out;
    return out;
  };
  /**
   * Names only Lean reports that are new or changed relative to `refModel` (tables `ref`): the declaration holding one
   * was added or changed; without such a declaration, a name `refModel` does not know. A reference without facts (a
   * round start, Accept's base) knows only the parser's names, so there such a name is new only if its source is not
   * already in the reference's version of its file.
   */
  const factsOnlySince = (refModel: ProjectModel, ref: DeclTables): FactsOnly[] =>
    factsOnly().filter(({ name, facts: f, owner }) => {
      if (owner !== undefined) return ref.byName.get(owner.name)?.text !== owner.text;
      if (ref.known.has(name)) return false;
      if (refModel.facts !== undefined) return true;
      const was = refModel.files.get(f.file)?.text;
      const now = current.files.get(f.file)?.text;
      if (was === undefined || now === undefined) return true;
      if (was === now) return false;
      const lines = new LineMap(now);
      const source = now.slice(lines.offsetAt(f.range.start), lines.offsetAt(f.range.end));
      return source.trim() === '' || !was.includes(source);
    });
  /**
   * The axioms a declaration rests on: Lean's `#print axioms`, and for a structure or class also what the constants
   * its source mentions rest on (`SOURCE_REF_KINDS`: field defaults). Undefined when Lean listed no axioms.
   */
  const footprintOf = (f: DeclFacts | undefined): string[] | undefined => {
    if (f?.axioms === undefined) return undefined;
    const out = new Set(f.axioms);
    if (f.kind !== undefined && SOURCE_REF_KINDS.has(f.kind)) {
      for (const ref of f.refs) {
        const rf = current.declFacts.get(ref.name);
        if (rf === undefined || ref.name === f.name) continue;
        if (isAxiom(S.byName.get(ref.name), rf)) out.add(ref.name);
        else for (const a of rf.axioms ?? []) out.add(a);
      }
    }
    return [...out];
  };
  /** The vocabulary's existence presuppositions (`axiom T.exists : Nonempty T`). */
  const presuppositions = new Set(current.vocabulary.filter((item) => item.kind === 'presupposition').map((item) => item.name));

  const findings = new Map<GateFindingCode, GateFinding[]>();
  const push = (finding: GateFinding) => {
    const list = findings.get(finding.code) ?? [];
    list.push(finding);
    findings.set(finding.code, list);
  };
  const ownerOf = (model: ProjectModel, name: string) => model.ownerOfDecl.get(name);
  const node = (id: string | undefined) => (id === undefined ? {} : { nodeId: id });

  // ---- G1: Lean errors, and changed files Lean never builds
  const facts = current.facts;
  if (facts) {
    const errors = facts.build.messages.filter((m) => m.severity === 'error');
    for (const m of errors) {
      push({
        step: 'G1',
        code: 'build',
        message: `${m.file ? `${where(m.file, m.range)}: ` : ''}error: ${m.text}`,
        ...(m.file ? { file: m.file } : {}),
        ...(m.range ? { range: m.range } : {}),
      });
    }
    if (errors.length === 0) {
      for (const module of facts.build.failedModules) {
        push({ step: 'G1', code: 'build', message: `Lean could not build ${module}${facts.build.detail ? ` (${facts.build.detail})` : ''}.` });
      }
    }
  }
  const unbuilt = new Set<string>();
  for (const module of facts?.modules ?? []) if (module.state === 'not-built' && changedFiles.has(module.file)) unbuilt.add(module.file);
  for (const d of current.diagnostics) if (d.code === 'TL118' && d.file !== undefined && changedFiles.has(d.file)) unbuilt.add(d.file);
  for (const file of [...unbuilt].sort()) {
    push({
      step: 'G1',
      code: 'build',
      message: `${file} is not imported by the library, so Lean never checks it: import it from the subject's root module (${current.library}/${subject}.lean) or from a module the library already imports.`,
      file,
      token: 'not-built',
    });
  }

  // ---- new-axiom
  // Before the freeze, an axiom added since B is allowed only as the `.holds` of a selected ASSUMPTION or ghost, or as
  // vocabulary of its own (a declaration bound to no card; its shape is judged by `vocabulary-shape`). Everything else
  // is a finding, whatever its type (fixer round 1): a belief, a card's "statement" written as an axiom directly below
  // its block (bound to the card, so it is not vocabulary and would otherwise escape every rule; `axiom x : Empty`
  // proves anything), or an axiom telelean cannot classify.
  const allowedHolds = new Set<string>();
  for (const id of [...selection.premises, ...ghosts]) {
    const n = current.nodes.get(id)?.node;
    if (n && n.lean.statement !== undefined && (n.type === 'ASSUMPTION' || ghosts.includes(id))) allowedHolds.add(holdsName(n.lean.statement));
  }
  const vocabKind = new Map(current.vocabulary.map((item) => [item.name, item.kind]));
  const isPropValued = (f: DeclFacts | undefined) => f?.typeSort !== undefined && normalizeWhitespace(f.typeSort) === 'Prop';
  /** Why an axiom is not vocabulary: `holds` (a card's claim), `statement` (bound to a card), `belief`, `unclassified`; undefined for vocabulary. */
  const notVocabulary = (name: string, f: DeclFacts | undefined): 'holds' | 'statement' | 'belief' | 'unclassified' | undefined => {
    const owner = ownerOf(current, name);
    if (owner !== undefined) {
      const holdsOf = statementOfHolds(name);
      return holdsOf !== undefined && current.nodes.get(owner)?.node.lean.statement === holdsOf ? 'holds' : 'statement';
    }
    const kind = vocabKind.get(name);
    if (kind !== undefined) return kind === 'unmarked-axiom' ? 'belief' : undefined;
    return isPropValued(f) ? 'belief' : 'unclassified';
  };
  const frozenAxioms = freeze ? new Set(freeze.axioms) : undefined;
  for (const name of axiomNames(current)) {
    const entry = S.byName.get(name);
    const f = factsOf(current, name, entry);
    const why = notVocabulary(name, f);
    const belief = why === 'holds' || why === 'belief' || (why !== undefined && isPropValued(f));
    if (frozenAxioms) {
      if (frozenAxioms.has(name)) continue;
      push({
        step: 'G3',
        code: 'new-axiom',
        message: `${loc(entry)}${name} is an axiom added after freeze_statements: no axiom may be added after the freeze${belief ? ', and only the person adds beliefs (propose a missing premise with propose_assumption)' : ''}; remove it.`,
        names: [name],
        token: belief ? 'belief' : 'after-freeze',
        ...at(entry),
      });
      continue;
    }
    if (inBase(name) || allowedHolds.has(name) || why === undefined) continue;
    const owner = ownerOf(current, name);
    const type = f?.type !== undefined ? ` of type \`${normalizeWhitespace(f.type)}\`` : '';
    let what: string;
    let token: string;
    if (why === 'holds') {
      what = `asserts the card ${owner} (${quote(sentence(owner ?? ''))}), which is not a selected assumption: only the .holds of the selected ASSUMPTION cards may be axioms`;
      token = 'belief';
    } else if (why === 'statement') {
      what = `is an axiom${type} directly below the block of the card ${owner} (${quote(sentence(owner ?? ''))}), so it would be that card's statement: a card's statement is \`abbrev <name> : Prop := …\`, never an axiom, and the only axioms you may add are the .holds of the selected ASSUMPTION cards and vocabulary (in Vocabulary.lean, not directly below a block)`;
      token = belief ? 'belief' : 'statement';
    } else if (why === 'belief' && detachedHolds.has(name)) {
      const id = detachedHolds.get(name) ?? '';
      const statement = statementOfHolds(name) ?? name;
      push({
        step: 'G3',
        code: 'new-axiom',
        message: `${loc(entry)}${name} would be the .holds of ${statement}, but a blank line separates ${statement} from the block of the card ${id} (${quote(sentence(id))}), so the card has no statement and this axiom asserts nothing the person holds: remove the blank line between the block and the statement (the statement goes directly below the block), and keep the axiom.`,
        names: [name],
        token: 'detached',
        nodeId: id,
        ...at(entry),
      });
      continue;
    } else if (why === 'belief') {
      what = `is a Prop-valued axiom (a belief${type}): only the person adds beliefs; propose a missing premise with propose_assumption instead`;
      token = 'belief';
    } else {
      what = `is an axiom${type} that is neither vocabulary telelean can classify (sorts \`axiom T : Type\`, predicates \`axiom P : T₁ → … → Prop\`, presuppositions \`axiom T.exists : Nonempty T\`) nor the .holds of a selected ASSUMPTION card`;
      token = 'unclassified';
    }
    push({ step: 'G3', code: 'new-axiom', message: `${loc(entry)}${name} ${what}; remove it.`, names: [name], token, ...node(owner), ...at(entry) });
  }

  // ---- existing-changed: every declaration of B keeps its text (docstring included) and, with B's facts, its meaning
  for (const [name, before] of B.byName) {
    if (exempt.has(name)) continue;
    const entry = S.byName.get(name);
    const owner = ownerOf(base, name);
    const isTarget = targetStatements.has(name);
    const common = { step: 'G3' as const, code: 'existing-changed' as const, names: [name], ...node(owner) };
    if (!entry) {
      push({
        ...common,
        message: `${loc(before)}${name} existed before the run and was removed: never change or remove a declaration that existed before the run (except the target's .holds); restore it.`,
        token: isTarget ? 'target' : 'removed',
        file: before.file.path,
        range: before.decl.range,
      });
      continue;
    }
    if (entry.text !== before.text) {
      push({
        ...common,
        message: `${loc(entry)}${name} existed before the run and was changed (its text, docstring included, must stay exactly as it was; only the target's .holds may change): restore it.`,
        token: isTarget ? 'target' : 'changed',
        ...at(entry),
      });
      continue;
    }
    if (base.facts === undefined) continue;
    const bf = factsOf(base, name, before);
    const cf = factsOf(current, name, entry);
    if (!bf || !cf) continue;
    const typeChanged = norm(bf.type) !== norm(cf.type);
    if (typeChanged || norm(bf.value) !== norm(cf.value)) {
      const [was, now] = typeChanged ? [norm(bf.type), norm(cf.type)] : [norm(bf.value), norm(cf.value)];
      push({
        ...common,
        message: `${loc(entry)}${name}'s text is unchanged but its meaning changed (its ${typeChanged ? 'type' : 'value'} was \`${was ?? '(none)'}\`, now \`${now ?? '(none)'}\`), e.g. through an \`open … in\` or a new declaration it now refers to: restore what it meant.`,
        token: isTarget ? 'target' : 'meaning',
        ...at(entry),
      });
    }
  }
  // telelean's adopted ghosts: their statement and `.holds` stay as written at adoption (A)
  if (input.adopted) {
    const A = declTables(input.adopted);
    for (const id of input.teleleanBlocks) {
      const ghost = input.adopted.nodes.get(id)?.node;
      const statement = ghost?.lean.statement;
      if (statement === undefined) continue;
      for (const name of [statement, holdsName(statement)]) {
        const was = A.byName.get(name);
        if (!was) continue;
        const entry = S.byName.get(name);
        if (entry?.text === was.text) continue;
        push({
          step: 'G3',
          code: 'existing-changed',
          message: `${loc(entry ?? was)}${name}, which telelean wrote for the adopted suggestion ${id}, was ${entry ? 'changed' : 'removed'}: leave it exactly as telelean wrote it.`,
          names: [name],
          nodeId: id,
          token: 'ghost',
          ...(entry ? at(entry) : { file: was.file.path, range: was.decl.range }),
        });
      }
    }
  }

  // ---- not-proved (gate-proved): T.holds exists, is a theorem stating exactly T, no sorry, not conditional
  if (purpose === 'gate-proved') {
    const t = curTarget;
    const proof = t?.status.proof;
    if (!t || proof?.kind !== 'proved') {
      const holds = targetHolds ?? `${selection.target}.holds`;
      const entry = S.byName.get(holds);
      const hf = factsOf(current, holds, entry);
      const s = targetStatement !== undefined ? short(targetStatement) : selection.target;
      let token: string;
      let why: string;
      if (!t || t.lean.statement === undefined) {
        token = 'missing';
        why = `the target ${selection.target} has no statement, so there is nothing proved`;
      } else if (t.lean.justification === undefined) {
        token = 'missing';
        why = `${holds} does not exist: prove \`theorem ${s}.holds : ${s} := …\`, or remove every proof of the target and finish with status not_proved`;
      } else if (t.lean.justificationKind === 'axiom') {
        token = 'axiom';
        why = `${holds} is an axiom, not a proof: replace it by \`theorem ${s}.holds : ${s} := …\``;
      } else if (t.status.flags.includes('uses-sorry')) {
        token = 'sorry';
        why = `${holds} uses sorry: give a complete proof`;
      } else if (t.status.flags.includes('holds-mismatch')) {
        token = 'mismatch';
        why = `${holds} proves \`${norm(hf?.type) ?? '(unknown)'}\`, not \`${targetStatement}\`: prove exactly the frozen statement`;
      } else if (proof?.kind === 'conditional') {
        token = 'conditional';
        why = `${holds} takes hypotheses (${proof.on.join(', ')}): prove the target itself, using the selected premises' .holds`;
      } else {
        token = 'unchecked';
        why = `Lean could not check ${holds} (no facts for it): make sure the files build`;
      }
      push({ step: 'G3', code: 'not-proved', message: `${loc(entry)}${why}.`, names: [holds], nodeId: selection.target, token, ...at(entry) });
    }
  }

  // ---- status-mismatch (gate-other): no theorem T.holds added or changed in the run
  if (purpose === 'gate-other' && targetHolds !== undefined) {
    const entry = S.byName.get(targetHolds);
    const cf = factsOf(current, targetHolds, entry);
    if (entry && !isAxiom(entry, cf)) {
      const before = B.byName.get(targetHolds);
      const baseTheorem = before !== undefined && !isAxiom(before, factsOf(base, targetHolds, before));
      if (!before || !baseTheorem || before.text !== entry.text) {
        push({
          step: 'G3',
          code: 'status-mismatch',
          message: `${loc(entry)}you finished without status proved, but ${targetHolds} is a proof added or changed in this run: either finish with status proved (after freeze_statements), or remove the proof of the target before finishing.`,
          names: [targetHolds],
          nodeId: selection.target,
          ...at(entry),
        });
      }
    }
  }

  // ---- statement-changed: after the freeze, every frozen declaration but T.holds keeps its kind, type and value
  if (freeze && (checkProve || gate)) {
    for (const [name, frozen] of Object.entries(freeze.declarations)) {
      if (exempt.has(name)) continue;
      const entry = S.byName.get(name);
      const cf = factsOf(current, name, entry);
      if (!cf) {
        if (!entry && !current.declFacts.has(name)) {
          push({ step: 'G3', code: 'statement-changed', message: `${name} was frozen by freeze_statements and has been removed: restore it exactly as frozen.`, names: [name], token: 'removed', ...node(ownerOf(current, name)) });
        }
        continue;
      }
      const kindChanged = frozen.kind !== undefined && cf.kind !== undefined && frozen.kind !== cf.kind;
      const typeChanged = norm(frozen.type) !== norm(cf.type);
      const valueChanged = norm(frozen.value) !== norm(cf.value);
      if (!kindChanged && !typeChanged && !valueChanged) continue;
      const detail = kindChanged
        ? `it was ${frozen.kind === 'def' ? 'a definition' : `a ${frozen.kind}`}, now ${cf.kind === 'def' ? 'a definition' : `a ${cf.kind}`}`
        : typeChanged
          ? `its type was \`${frozen.type ?? '(none)'}\`, now \`${norm(cf.type) ?? '(none)'}\``
          : `its value was \`${frozen.value ?? '(none)'}\`, now \`${norm(cf.value) ?? '(none)'}\``;
      push({
        step: 'G3',
        code: 'statement-changed',
        message: `${loc(entry)}${name} changed after freeze_statements (${detail}): the frozen statements, vocabulary and definitions must stay exactly as frozen.`,
        names: [name],
        ...(targetStatements.has(name) ? { token: 'target' } : {}),
        ...node(ownerOf(current, name)),
        ...at(entry),
      });
    }
  }

  // ---- footprint: T.holds (gate-proved, check in stage prove) and every declaration added or changed in the run
  // Without a freeze (gate-other) the set is computed from the files as they are, with derivation footprints only from
  // the user's own unchanged proofs in B: a proof Claude wrote for a selected premise never permits its own axioms.
  // Fixer round 2 (P12 by another route): not only proofs. A declaration whose type is not a Prop can carry a proof
  // too (`def h : PLift p := ⟨p.holds⟩`, an `Inhabited (PLift p)` instance, a structure field defaulting to `p.holds`),
  // so every declaration added or changed in the run is judged whatever its kind or type (axioms are `new-axiom`'s),
  // and so is every name only Lean reports inside one (a `where` declaration, a structure's field). A proof is held
  // to the permitted set; anything else to the permitted set plus the vocabulary's existence presuppositions
  // (`noncomputable opaque c : T` rests on `T.exists` by design, D-3); a structure or class also answers for what its
  // source mentions (`footprintOf`).
  const permitted: PermittedAxioms | undefined = checkProve || gate ? (freeze?.permitted ?? permittedAxioms(current, selection, false, base)) : undefined;
  const footprints: Record<string, string[]> = {};
  const judged: Judged[] = [];
  const judgedNames = new Set<string>();
  const judge = (item: Judged) => {
    if (judgedNames.has(item.name)) return;
    judgedNames.add(item.name);
    judged.push(item);
  };
  if (targetHolds !== undefined && S.byName.has(targetHolds) && (purpose === 'gate-proved' || checkProve || addedOrChanged.has(targetHolds))) {
    const entry = S.byName.get(targetHolds);
    const f = factsOf(current, targetHolds, entry);
    if (isProof(current, entry, f)) judge({ name: targetHolds, ...(entry ? { entry } : {}), ...(f ? { facts: f } : {}), proof: true });
  }
  for (const name of [...added, ...changed]) {
    const entry = S.byName.get(name);
    if (entry === undefined || entry.decl.keyword === 'axiom') continue;
    const f = factsOf(current, name, entry);
    if (f?.kind === 'axiom') continue;
    judge({ name, entry, ...(f ? { facts: f } : {}), proof: isProof(current, entry, f) });
  }
  for (const { name, facts: f } of factsOnlySince(base, B)) {
    if (changedFiles.has(f.file)) judge({ name, facts: f, proof: false });
  }
  // Fail closed (fixer round 1; every kind since fixer round 2): a declaration added or changed in the run that Lean
  // has no facts for (Lean's index skips `private` declarations; a name telelean resolves differently) cannot be
  // checked, in every purpose. Files Lean did not build are G1's to report.
  if (facts) {
    const g1 = (findings.get('build') ?? []).length > 0;
    for (const j of judged) {
      if (j.facts !== undefined || j.entry === undefined) continue;
      if (g1 && !current.freshFiles.has(j.entry.file.path)) continue;
      const isPrivate = j.entry.decl.modifiers.includes('private');
      push({
        step: 'G3',
        code: 'footprint',
        message: `${loc(j.entry)}Lean reported nothing about ${j.name}${isPrivate ? ' (Lean does not report `private` declarations)' : ''}, so telelean cannot check what it rests on: ${isPrivate ? 'remove `private`' : 'make sure it is a plain top-level declaration of a module the library builds'}, or delete the declaration.`,
        names: [j.name],
        token: 'no-facts',
        ...node(ownerOf(current, j.name)),
        ...at(j.entry),
      });
    }
  }
  const allowedForProofs = new Set(permitted?.all ?? []);
  const allowedForOthers = new Set([...allowedForProofs, ...presuppositions]);
  for (const j of judged) {
    const { name, facts: f } = j;
    if (j.proof && f?.axioms !== undefined) footprints[name] = [...f.axioms];
    if (!permitted || !f) continue;
    const axioms = footprintOf(f);
    if (axioms === undefined) {
      push({ step: 'G3', code: 'footprint', message: `${locOf(j)}Lean could not list the axioms of ${name}, so it cannot be checked: make sure the files build.`, names: [name], token: 'no-facts', ...node(ownerOf(current, name)), ...atOf(j) });
      continue;
    }
    const allowed = j.proof ? allowedForProofs : allowedForOthers;
    const extra = axioms.filter((a) => a !== SORRY_AXIOM && !allowed.has(a));
    if (extra.length === 0) continue;
    const described = extra.map((a) => {
      const owner = ownerOf(current, a);
      return owner !== undefined ? `${a} (${quote(sentence(owner))}, not selected)` : a;
    });
    const selected = [...permitted.selected, ...permitted.derivationFootprints.filter((a) => statementOfHolds(a) !== undefined)];
    const premises = `the selected premises${selected.length > 0 ? ` (${[...new Set(selected)].join(', ')})` : ''}`;
    push({
      step: 'G3',
      code: 'footprint',
      message: j.proof
        ? `${locOf(j)}${name} rests on ${described.join(', ')}, outside the permitted set: every proof may use only ${premises}, the vocabulary, the existence presuppositions of the statements and Lean's standard axioms.`
        : `${locOf(j)}${name} is not a theorem but carries a proof resting on ${described.join(', ')}, outside the permitted set: everything you add (a definition, instance or structure too, and what it holds inside, e.g. a field's default value) may use only ${premises}, the vocabulary, existence presuppositions and Lean's standard axioms; remove it or rest it on the selected premises.`,
      names: extra,
      ...node(ownerOf(current, name)),
      ...atOf(j),
    });
  }
  if (targetHolds !== undefined && footprints[targetHolds] === undefined) {
    const f = factsOf(current, targetHolds, S.byName.get(targetHolds));
    if (f?.axioms !== undefined && f.kind !== 'axiom') footprints[targetHolds] = [...f.axioms];
  }

  // ---- sorry-axiom: no sorryAx in a declaration of a changed file (the user's own unchanged sorry stays theirs)
  for (const [name, f] of current.declFacts) {
    if (!changedFiles.has(f.file) || !(f.usesSorry === true || (f.axioms ?? []).includes(SORRY_AXIOM))) continue;
    const entry = S.byName.get(name);
    const before = B.byName.get(name);
    if (before && entry && before.text === entry.text) {
      const bf = base.facts === undefined ? undefined : factsOf(base, name, before);
      if (base.facts === undefined || bf?.usesSorry === true || (bf?.axioms ?? []).includes(SORRY_AXIOM)) continue;
    }
    push({ step: 'G3', code: 'sorry-axiom', message: `${loc(entry)}${name} depends on sorry (sorryAx): give a complete proof, or remove it.`, names: [name], token: 'sorry', ...node(ownerOf(current, name)), ...at(entry) });
  }

  // ---- vocabulary-shape: new vocabulary passes the simple D-3 shape rule
  for (const item of current.vocabulary) {
    if (inBase(item.name) || item.kind === 'unmarked-axiom') continue;
    if (!item.flags.includes('shape-violation') && item.kind !== 'other') continue;
    const entry = S.byName.get(item.name);
    const reason = current.diagnostics.find((d) => d.code === 'TL111' && d.vocab === item.name)?.message;
    push({
      step: 'G3',
      code: 'vocabulary-shape',
      message: `${loc(entry)}${reason ?? `${item.name} is not a vocabulary shape telelean accepts`} Vocabulary may only be sorts \`axiom T : Type\`, predicates \`axiom P : T₁ → … → Prop\` over sorts, and constants or functions as \`noncomputable opaque\`.`,
      names: [item.name],
      ...(item.loc ? { file: item.loc.file, range: item.loc.range } : at(entry)),
    });
  }

  // ---- G5 markup
  for (const finding of markupFindings(input, chosen, sentence)) push(finding);

  // ---- readiness (freeze, gate-proved): the target and the selected assumptions and ghosts are formalised
  const readiness = purpose === 'freeze' || purpose === 'gate-proved';
  const ready = readiness ? [...new Set([selection.target, ...selection.premises.filter((id) => current.nodes.get(id)?.node.type === 'ASSUMPTION' || ghosts.includes(id)), ...ghosts])] : [];
  if (readiness) {
    for (const id of ready) {
      const entry = current.nodes.get(id);
      if (!entry) continue;
      const n = entry.node;
      const assumption = id !== selection.target;
      if (!formalised(current, n)) {
        const now = bound(n);
        const detached = now === undefined ? detachedStatementOf(id) : undefined;
        if (detached !== undefined) {
          push({
            step: 'G3',
            code: 'not-formalised',
            message: `${where(entry.file, entry.block.range)}: the card ${id} (${quote(n.naturalName)}) has no Lean statement: ${detached} follows its block after a blank line, so it is not attached; remove the blank line (the statement goes directly below the block).`,
            nodeId: id,
            names: [detached],
            token: 'detached',
            file: entry.file,
            range: entry.block.range,
          });
          continue;
        }
        const what = now !== undefined ? `is bound to ${now}, which is not a Prop statement (${malformedReason(current, n)})` : 'has no Lean statement';
        push({
          step: 'G3',
          code: 'not-formalised',
          message: `${where(entry.file, entry.block.range)}: the card ${id} (${quote(n.naturalName)}) ${what}: write \`/-- <its sentence> -/\` and \`abbrev <name> : Prop := <statement>\`${assumption ? ' and `axiom <name>.holds : <name>`' : ''} directly below its block.`,
          nodeId: id,
          ...(now !== undefined ? { names: [now], token: 'malformed' } : {}),
          file: entry.file,
          range: entry.block.range,
        });
        continue;
      }
      if (!assumption) continue;
      const statement = n.lean.statement as string;
      const s = short(statement);
      if (n.lean.justification === undefined) {
        push({
          step: 'G3',
          code: 'missing-holds',
          message: `${where(entry.file, entry.block.range)}: the selected assumption ${id} (${quote(n.naturalName)}) has no \`axiom ${s}.holds : ${s}\`: add it right after \`abbrev ${s}\`.`,
          names: [holdsName(statement)],
          nodeId: id,
          token: 'missing',
          file: entry.file,
          range: entry.block.range,
        });
      } else if (n.status.flags.includes('holds-mismatch')) {
        push({
          step: 'G3',
          code: 'missing-holds',
          message: `${where(entry.file, entry.block.range)}: ${holdsName(statement)} does not state ${statement}: write exactly \`axiom ${s}.holds : ${s}\`.`,
          names: [holdsName(statement)],
          nodeId: id,
          token: 'mismatch',
          file: entry.file,
          range: entry.block.range,
        });
      }
    }
  }

  // ---- not-formalised in every purpose (fixer round 1): a selected card (any type) bound in this run to something
  // that is not a Prop statement (TL101: not found; TL113: not a Prop abbrev/def, e.g. an axiom or a non-Prop def
  // directly below its block). The readiness rules above cover the target and the selected assumptions at the freeze
  // and finish(proved) only; without this, a GOAL or DERIVATION premise, or any finish, could carry a malformed
  // statement into the proposal. A card left code-less is still fine ("could not formalise" is honest).
  const readyChecked = new Set(ready);
  for (const id of chosen) {
    if (readyChecked.has(id)) continue;
    const entry = current.nodes.get(id);
    if (!entry) continue;
    const n = entry.node;
    const now = bound(n);
    if (now === undefined || bound(base.nodes.get(id)?.node) !== undefined || formalised(current, n)) continue;
    push({
      step: 'G3',
      code: 'not-formalised',
      message: `${where(entry.file, entry.block.range)}: the card ${id} (${quote(n.naturalName)}) is now bound to ${now}, which is not a Prop statement (${malformedReason(current, n)}): a card's statement is \`abbrev <name> : Prop := …\` directly below its block (only a selected ASSUMPTION also gets \`axiom <name>.holds\`); fix it, or leave a blank line between the block and that declaration.`,
      names: [now],
      nodeId: id,
      token: 'malformed',
      file: entry.file,
      range: entry.block.range,
    });
  }

  // ---- proof-before-freeze (check in stage formalise, freeze): no proof added or changed since the round started
  // Fixer round 2: also no proof carried inside a declaration that is not one (a def, instance or structure, or a name
  // only Lean reports inside one): it carries a proof when what it rests on goes beyond the vocabulary layer (Lean's
  // standard axioms, the signature and the existence presuppositions), i.e. it uses a claim such as a `.holds`.
  if ((checkFormalise || purpose === 'freeze') && !freeze) {
    const vocabularyLayer = new Set([...STANDARD_AXIOM_NAMES, ...signatureAxioms(current), ...presuppositions, SORRY_AXIOM]);
    const carried = (f: DeclFacts | undefined) => (footprintOf(f) ?? []).filter((a) => !vocabularyLayer.has(a));
    const carrier = (name: string, claims: string[], j: Judged) =>
      push({
        step: 'G3',
        code: 'proof-before-freeze',
        message: `${locOf(j)}${name} carries a proof written before freeze_statements (it rests on ${claims.join(', ')}): no proofs before the freeze (D-19), also not inside a definition, instance or structure; remove it, call freeze_statements, then prove.`,
        names: [name],
        token: 'carrier',
        ...node(ownerOf(current, name)),
        ...atOf(j),
      });
    for (const [name, entry] of S.byName) {
      const before = R.byName.get(name);
      if (before && before.text === entry.text) continue;
      const f = factsOf(current, name, entry);
      if (!isProof(current, entry, f)) {
        if (isAxiom(entry, f)) continue;
        const claims = carried(f);
        if (claims.length > 0) carrier(name, claims, { name, entry, ...(f ? { facts: f } : {}), proof: false });
        continue;
      }
      push({
        step: 'G3',
        code: 'proof-before-freeze',
        message: `${loc(entry)}${name} is a proof written before freeze_statements: no proofs before the freeze (D-19); remove it, call freeze_statements, then prove.`,
        names: [name],
        ...node(ownerOf(current, name)),
        ...at(entry),
      });
    }
    for (const { name, facts: f } of factsOnlySince(roundStart, R)) {
      const claims = carried(f);
      if (claims.length > 0) carrier(name, claims, { name, facts: f, proof: false });
    }
  }

  // ---- examples (fixer round 3): every `example` added since B (by text, as a multiset: the user's own stay theirs)
  // is a finding in every purpose, so none reaches the user's files, whatever the finish status. An example is a proof
  // without a name: Lean reports nothing about it, so no rule can check what it rests on, nothing can use it, and the
  // files never need one. Before the round's freeze it is a proof written before freeze_statements (D-19); after it,
  // a proof telelean cannot check (code `footprint`, token `example`).
  {
    const baseExamples = new Map<string, number>();
    for (const example of B.examples) baseExamples.set(example.text, (baseExamples.get(example.text) ?? 0) + 1);
    for (const example of S.examples) {
      const left = baseExamples.get(example.text) ?? 0;
      if (left > 0) {
        baseExamples.set(example.text, left - 1);
        continue;
      }
      const place = { file: example.file.path, range: example.decl.range };
      const here = where(example.file.path, example.decl.range);
      if (freeze === undefined) {
        push({ step: 'G3', code: 'proof-before-freeze', message: `${here}: an \`example\` is a proof, written before freeze_statements: remove it.`, token: 'example', ...place });
      } else {
        push({
          step: 'G3',
          code: 'footprint',
          message: `${here}: an \`example\` may not stay in the files: it has no name, so Lean reports nothing about it and telelean cannot check what it rests on; remove it (to try something out, use #check or a named lemma).`,
          token: 'example',
          ...place,
        });
      }
    }
  }

  // ---- not-frozen (gate-proved)
  if (purpose === 'gate-proved' && !freeze) {
    push({
      step: 'G3',
      code: 'not-frozen',
      message: 'finish with status proved needs a successful freeze_statements in this round: call check_lean and freeze_statements first, then prove and call finish again.',
      nodeId: selection.target,
    });
  }

  // ---- flagged definitions (questions, never failures)
  const flaggedDefinitions = flagged(input, chosen, inBase);

  // ---- the run's new statements (normalisation pins them)
  const formalisedThisRun: string[] = [];
  for (const id of chosen) {
    const now = current.nodes.get(id)?.node;
    if (now === undefined || !formalised(current, now)) continue;
    if (bound(base.nodes.get(id)?.node) === undefined) formalisedThisRun.push(id);
  }

  const ordered = [...(findings.get('build') ?? []), ...G3_ORDER.flatMap((c) => findings.get(c) ?? []), ...(findings.get('markup') ?? []), ...LATE_ORDER.flatMap((c) => findings.get(c) ?? [])];
  return { findings: ordered, flaggedDefinitions, footprints, formalisedThisRun, declarations: { added, changed, removed } };
}

/** New definitions on a statement path and new presuppositions (A2, D-4, D-3). */
function flagged(input: RuleInput, chosen: ReadonlySet<string>, inBase: (name: string) => boolean): FlaggedDefinition[] {
  const { current } = input;
  const out: FlaggedDefinition[] = [];
  const closureOfChosen = new Set<string>();
  for (const id of chosen) for (const name of current.nodes.get(id)?.node.lean.uses ?? []) closureOfChosen.add(name);
  /**
   * Definitions the signature refers to, e.g. `noncomputable opaque c : Pair`: refs of every vocabulary item but
   * definitions (their own closure is followed through the cards' `uses`) and lemmas (proofs: a definition only a
   * lemma mentions is not on a statement path).
   */
  const usedByVocabulary = new Set<string>();
  for (const item of current.vocabulary) {
    if (item.kind === 'definition' || item.kind === 'lemma') continue;
    for (const ref of current.declFacts.get(item.name)?.refs ?? []) usedByVocabulary.add(ref.name);
  }
  for (const item of current.vocabulary) {
    if (inBase(item.name)) continue;
    if (item.kind === 'definition') {
      const onPath = item.usedBy.length > 0 || item.flags.includes('definitional-choice') || closureOfChosen.has(item.name) || usedByVocabulary.has(item.name);
      if (!onPath) continue;
      out.push({ name: item.name, kind: 'definition', ...(item.code !== undefined ? { code: item.code } : {}), ...(item.gloss !== undefined ? { gloss: item.gloss } : {}), usedByStatementsOf: [...item.usedBy] });
    } else if (item.kind === 'presupposition') {
      out.push({ name: item.name, kind: 'presupposition', ...(item.code !== undefined ? { code: item.code } : {}), ...(item.gloss !== undefined ? { gloss: item.gloss } : {}), usedByStatementsOf: [...item.usedBy] });
    }
  }
  return out;
}

/** G5: the user's words, ids, `lean:` lines and bindings; no new blocks but telelean's own (docs/m2-plan.md 3.3). */
function markupFindings(input: RuleInput, chosen: ReadonlySet<string>, sentence: (id: string) => string): GateFinding[] {
  const { base, current } = input;
  const out: GateFinding[] = [];
  const baseIds = nodeIdsOfBlocks(base);
  const curIds = nodeIdsOfBlocks(current);
  const keyOf = (ids: Map<MarkupBlock, string>, block: MarkupBlock) => ids.get(block) ?? block.id;
  const telelean = new Set(input.teleleanBlocks);
  const B = declTables(base);
  // Blocks of a file by key (node id), computed once per file and model.
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
  /**
   * telelean's own premises declaration at ghost adoption (fixer round 1; docs/m2-plan.md section 4.9): the target's
   * `premises:` may gain the adopted ghosts' ids, appended to B's list, exactly as telelean wrote it at the newest
   * `adopt` commit (A). The agent itself never changes a `premises:` line.
   */
  const adoptedPremises = (bBlock: MarkupBlock, sBlock: MarkupBlock, key: string): boolean => {
    if (key !== input.selection.target || telelean.size === 0) return false;
    const aBlock = input.adopted?.nodes.get(key)?.block;
    if (aBlock === undefined || !sameList(raws(aBlock, 'premises'), raws(sBlock, 'premises'))) return false;
    const was = bBlock.fields.premises ?? [];
    const now = aBlock.fields.premises ?? [];
    if (now.length <= was.length || !was.every((id, i) => now[i] === id)) return false;
    const extra = now.slice(was.length);
    return new Set(extra).size === extra.length && extra.every((id) => telelean.has(id) && !was.includes(id));
  };
  const matched = new Set<MarkupBlock>();
  const moved = new Set<string>();
  const files = [...base.files.values()].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  for (const bFile of files) {
    const cFile = current.files.get(bFile.path);
    const seen = new Map<string, number>();
    for (const bBlock of bFile.blocks) {
      const key = keyOf(baseIds, bBlock);
      const k = seen.get(key) ?? 0;
      seen.set(key, k + 1);
      const sBlock = blocksOf(cFile, curIds, key)[k];
      const label = `the block ${key} (${quote(bBlock.fields.naturalName ?? sentence(key))})`;
      if (!sBlock) {
        const elsewhere = [...current.files.values()].find((f) => f.path !== bFile.path && blocksOf(f, curIds, key).length > 0);
        if (elsewhere) moved.add(key);
        out.push(
          elsewhere
            ? finding(bBlock, bFile.path, key, 'moved', `${label} moved from ${bFile.path} to ${elsewhere.path}: blocks stay in their file; move it back.`)
            : finding(bBlock, bFile.path, key, 'removed', `${label} was removed: never add or delete blocks; restore it exactly.`),
        );
        continue;
      }
      matched.add(sBlock);
      const path = bFile.path;
      // the user's words and every other field, raw
      for (const field of COMPARED_FIELDS) {
        const was = raws(bBlock, field);
        const now = raws(sBlock, field);
        if (sameList(was, now)) continue;
        if (field === 'premises' && adoptedPremises(bBlock, sBlock, key)) continue;
        const show = (list: string[]) => (list.length === 0 ? '(absent)' : list.map(quote).join(', '));
        const words = field === 'natural_name' || field === 'rationale';
        out.push(
          finding(
            sBlock,
            path,
            key,
            field,
            `${label} changed its \`${field}:\` (${show(was)} → ${show(now)}): ${words ? "the person's words are the specification and stay byte-identical" : 'never change any field of a block'}; restore it.`,
          ),
        );
      }
      if (bBlock.version !== sBlock.version) out.push(finding(sBlock, path, key, 'version', `${label} changed its markup version: restore \`@@ telelean v${bBlock.version}\`.`));
      if (JSON.stringify(bBlock.extensions) !== JSON.stringify(sBlock.extensions)) out.push(finding(sBlock, path, key, 'extension', `${label} changed its extension fields: restore them.`));
      if ((bBlock.body ?? '') !== (sBlock.body ?? '')) out.push(finding(sBlock, path, key, 'body', `${label} changed its notes (after \`---\`): restore them.`));
      // ids: unchanged, or the derived id written back (TL112)
      const idWas = raws(bBlock, 'id');
      const idNow = raws(sBlock, 'id');
      const idOk = bBlock.idWritten ? sameList(idWas, idNow) : idNow.length === 0 || (idNow.length === 1 && (idNow[0] === key || idNow[0] === bBlock.id));
      if (!idOk) out.push(finding(sBlock, path, key, 'id', `${label} changed its \`id:\` line: ids are stable; restore it.`));
      // `lean:` lines: never changed or removed; added only by telelean's normalisation
      const leanWas = raws(bBlock, 'lean');
      const leanNow = raws(sBlock, 'lean');
      const bNode = base.nodes.get(key)?.node;
      const sNode = current.nodes.get(key)?.node;
      let leanFinding = false;
      if (leanWas.length > 0 && !sameList(leanWas, leanNow)) {
        leanFinding = true;
        out.push(
          finding(
            sBlock,
            path,
            key,
            'lean',
            `${label}'s \`lean:\` line changed (${leanWas.join(', ')} → ${leanNow.length > 0 ? leanNow.join(', ') : '(removed)'}): a \`lean:\` line is never changed or removed; restore it.`,
            [bNode?.lean.statement ?? leanWas[0], sNode?.lean.statement ?? leanNow[0]].filter((n): n is string => n !== undefined && n !== ''),
          ),
        );
      } else if (leanWas.length === 0 && leanNow.length > 0) {
        const pinned = sNode?.lean.statement;
        const adjacent = sBlock.binding.adjacentDecl !== undefined ? current.files.get(path)?.decls[sBlock.binding.adjacentDecl]?.fullName : undefined;
        const legal = chosen.has(key) && bBlock.binding.mode === 'none' && pinned !== undefined && pinned === adjacent && !B.known.has(pinned);
        if (!legal) {
          leanFinding = true;
          out.push(
            finding(
              sBlock,
              path,
              key,
              'lean',
              `a \`lean:\` line was added to ${label}: telelean pins a statement itself, and only for the target and the selected premises formalised in this run, naming the declaration directly below the block; remove it.`,
              [pinned ?? leanNow[0]].filter((n): n is string => n !== undefined && n !== ''),
            ),
          );
        }
      }
      // bindings: a card formalised in B keeps its statement; unselected cards do not become formalised
      if (!leanFinding && bNode && sNode) {
        const was = bound(bNode);
        const now = bound(sNode);
        if (was !== undefined && was !== now) {
          out.push(
            finding(
              sBlock,
              path,
              key,
              'binding',
              `the card ${key} was bound to ${was} before the run and is now bound to ${now ?? 'nothing'}: a card formalised before the run keeps its statement; put any new declaration elsewhere (not directly below its block).`,
              now !== undefined ? [was, now] : [was],
            ),
          );
        } else if (was === undefined && now !== undefined && !chosen.has(key)) {
          out.push(
            finding(
              sBlock,
              path,
              key,
              'formalised',
              `the card ${key} (${quote(sNode.naturalName)}) is not selected but is now bound to ${now}: formalise only the target and the selected premises; leave a blank line between its block and that declaration, or move the declaration.`,
              [now],
            ),
          );
        }
      }
    }
  }
  // new blocks: only telelean's adopted ghosts, exactly as written at adoption (A)
  for (const cFile of [...current.files.values()].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    for (const sBlock of cFile.blocks) {
      if (matched.has(sBlock)) continue;
      const key = keyOf(curIds, sBlock);
      if (moved.has(key)) continue;
      if (telelean.has(key)) {
        const adoptedFile = input.adopted?.files.get(cFile.path);
        const adoptedIds = input.adopted ? nodeIdsOfBlocks(input.adopted) : new Map<MarkupBlock, string>();
        const original = adoptedFile ? blocksOf(adoptedFile, adoptedIds, key)[0] : undefined;
        if (original && adoptedFile && adoptedFile.text.slice(original.span.start, original.span.end) === cFile.text.slice(sBlock.span.start, sBlock.span.end)) continue;
        out.push(finding(sBlock, cFile.path, key, 'telelean', `the block ${key} that telelean wrote for an adopted suggestion was changed: leave it exactly as telelean wrote it.`));
        continue;
      }
      out.push(finding(sBlock, cFile.path, key, 'block', `a new telelean block (${key}) was added: never add or delete blocks; propose a missing premise with propose_assumption instead.`));
    }
  }
  // telelean's own blocks must not disappear either
  if (input.adopted) {
    const adoptedIds = nodeIdsOfBlocks(input.adopted);
    for (const aFile of input.adopted.files.values()) {
      for (const aBlock of aFile.blocks) {
        const key = keyOf(adoptedIds, aBlock);
        if (!telelean.has(key)) continue;
        if (blocksOf(current.files.get(aFile.path), curIds, key).length > 0) continue;
        out.push(finding(aBlock, aFile.path, key, 'telelean', `the block ${key} that telelean wrote for an adopted suggestion was removed: restore it exactly.`));
      }
    }
  }
  return out;
}
