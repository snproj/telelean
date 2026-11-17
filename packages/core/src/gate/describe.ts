/**
 * Findings as plain board sentences (amendment A2's notices, docs/m2-plan.md section 3.5), in telelean's words. Names
 * are shown relative to the subject's namespace (`new_spyro_pg.holds`, not `Spyro.new_spyro_pg.holds`): the namespace
 * comes from the finding's file (`<library>/<S>/…`), else known Lean namespaces are kept and a leading subject-like
 * component is dropped.
 */
import { subjectOfPath } from '../paths.js';
import type { DescribeContext, GateFinding } from './types.js';

/** Namespaces of Lean itself: never treated as a subject's namespace when shortening a name. */
const LEAN_NAMESPACES: ReadonlySet<string> = new Set([
  'Classical',
  'Quot',
  'Lean',
  'Nat',
  'Int',
  'List',
  'Array',
  'String',
  'Char',
  'Bool',
  'Prop',
  'Eq',
  'And',
  'Or',
  'Not',
  'Iff',
  'Exists',
  'Decidable',
  'Nonempty',
  'Inhabited',
  'Option',
  'Std',
  'Init',
  'Function',
  'Sigma',
  'Subtype',
  'PLift',
  'ULift',
  'Fin',
  'Float',
  'IO',
  'Except',
  'Unit',
  'PUnit',
  'True',
  'False',
  'HEq',
  'Prod',
  'Sum',
  'Empty',
  'Id',
]);

const code = (text: string) => `\`${text}\``;

/** The subject namespace a finding's file belongs to (`Model/Spyro/Main.lean` -> `Spyro`). */
function namespaceOf(finding: GateFinding): string | undefined {
  const file = finding.file;
  if (file === undefined) return undefined;
  const library = file.split('/')[0];
  return library === undefined ? undefined : subjectOfPath(file, library);
}

/** A Lean name as the board shows it. */
function display(name: string, finding: GateFinding): string {
  const namespace = namespaceOf(finding);
  if (namespace !== undefined) return name.startsWith(`${namespace}.`) && name.length > namespace.length + 1 ? name.slice(namespace.length + 1) : name;
  const dot = name.indexOf('.');
  if (dot < 0) return name;
  const first = name.slice(0, dot);
  return /^[A-Z]/.test(first) && !LEAN_NAMESPACES.has(first) ? name.slice(dot + 1) : name;
}

/** `a`, `a and b`, `a, b and c`. */
function listing(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** “sentence” of a card, or its id in backticks when the board does not know it. */
function cardLabel(id: string | undefined, ctx: DescribeContext): string {
  if (id === undefined) return 'a card';
  const sentence = ctx.sentenceOf(id);
  return sentence !== undefined ? `“${sentence}”` : `the card ${code(id)}`;
}

/** ` in Model/Spyro/Main.lean line 12`, from a G0 finding's position. */
function inFile(finding: GateFinding): string {
  if (finding.file === undefined) return '';
  return finding.range ? ` in ${finding.file} line ${finding.range.start.line + 1}` : ` in ${finding.file}`;
}

/** The axioms a proof used outside the permitted set. */
function usedAxioms(finding: GateFinding, ctx: DescribeContext, brief: boolean): string {
  const names = finding.names ?? [];
  if (names.length === 0) return 'it used an axiom that is not allowed here';
  const own = names.filter((n) => finding.nodeId !== undefined && ctx.nodeOfDecl(n) === finding.nodeId);
  if (own.length > 0 && own.length === names.length) return `it used the claim it had to prove (${listing(own.map((n) => code(display(n, finding))))})`;
  const parts: string[] = [];
  let allUnselectedCards = true;
  for (const name of names) {
    const card = ctx.nodeOfDecl(name);
    const shown = code(display(name, finding));
    if (card !== undefined && !ctx.selected.includes(card)) parts.push(brief ? shown : `${cardLabel(card, ctx)} (${shown})`);
    else {
      allUnselectedCards = false;
      parts.push(shown);
    }
  }
  return `it used ${listing(parts)}, which ${allUnselectedCards ? "you didn't select" : 'the selected premises do not allow'}`;
}

/** See `describeFinding` in ./index.ts; `brief` drops card sentences (the give-up notice). */
export function describe(finding: GateFinding, ctx: DescribeContext, brief = false): string {
  const name = finding.names?.[0];
  const shown = name !== undefined ? code(display(name, finding)) : undefined;
  const token = finding.token;
  switch (finding.code) {
    case 'hash-command':
      return `it used a forbidden command (${code(token ?? '#')})${inFile(finding)}`;
    case 'metaprogramming':
      return `it used metaprogramming (${code(token ?? 'macro')})${inFile(finding)}`;
    case 'native-code':
      return `it used native code (${code(token ?? 'native_decide')})${inFile(finding)}`;
    case 'unsafe':
      return `it used a forbidden keyword (${code(token ?? 'unsafe')})${inFile(finding)}`;
    case 'set-option':
      return `it changed a Lean option (${code('set_option')})${inFile(finding)}`;
    case 'sorry':
      return `it left a gap (${code(token ?? 'sorry')}) ${shown !== undefined ? `in ${shown}` : inFile(finding).trim()}`.trimEnd();
    case 'import':
      return `it imported a module from outside the project (${code(token ?? 'import')})`;
    case 'project-file':
      return `it changed a project file (${code(finding.file ?? token ?? 'lakefile')})`;
    case 'outside-subject':
      return `it changed a file outside this subject (${code(finding.file ?? token ?? '')})`;
    case 'deleted-file':
      return `it deleted a file (${code(finding.file ?? token ?? '')})`;
    case 'bad-path':
      return `it wrote a file that is not a Lean module of this subject (${code(finding.file ?? token ?? '')})`;
    case 'build':
      if (token === 'not-built' && finding.file !== undefined) return `it added a module the library does not import (${code(finding.file)})`;
      return finding.file !== undefined ? `the files did not build (an error${inFile(finding)})` : 'the files did not build';
    case 'budget':
      return 'the build ran out of time or memory';
    case 'not-proved':
      switch (token) {
        case 'mismatch':
          return `it proved something other than the goal${shown !== undefined ? ` (${shown} does not state the goal)` : ''}`;
        case 'sorry':
          return `it left a gap (${code('sorry')}) in ${shown ?? 'the proof of the goal'}`;
        case 'conditional':
          return `its proof of the goal takes extra hypotheses${shown !== undefined ? ` (${shown})` : ''}`;
        case 'axiom':
          return `it stated the goal as an axiom instead of proving it${shown !== undefined ? ` (${shown})` : ''}`;
        case 'unchecked':
          return `Lean could not check the proof of the goal${shown !== undefined ? ` (${shown})` : ''}`;
        default:
          return `it did not prove the goal${shown !== undefined ? ` (${shown} is missing)` : ''}`;
      }
    case 'footprint':
      if (token === 'no-facts') return `telelean could not check what ${shown ?? 'a proof'} rests on (Lean reported nothing about it, e.g. a private declaration)`;
      if (token === 'example') return 'it left an example in the files (a proof without a name, so telelean cannot check what it rests on)';
      return usedAxioms(finding, ctx, brief);
    case 'comparator-illegal-axiom':
      return usedAxioms(finding, ctx, brief);
    case 'sorry-axiom':
      return `it left a gap (${code('sorry')}) in ${shown ?? 'a proof'}`;
    case 'new-axiom':
      if (token === 'after-freeze') return `it added ${shown !== undefined ? `vocabulary (${shown})` : 'vocabulary'} after freezing the statements`;
      if (token === 'statement') return `it wrote an axiom${shown !== undefined ? ` (${shown})` : ''} as the statement of ${cardLabel(finding.nodeId, ctx)}`;
      if (token === 'unclassified') return `it added an axiom telelean cannot classify as vocabulary${shown !== undefined ? ` (${shown})` : ''}`;
      if (token === 'detached') return `it left a blank line between ${cardLabel(finding.nodeId, ctx)} and its Lean statement`;
      return `it added an axiom${shown !== undefined ? ` (${shown})` : ''}, and only you can add beliefs`;
    case 'vocabulary-shape':
      return `it added vocabulary of a kind telelean does not allow${shown !== undefined ? ` (${shown})` : ''}`;
    case 'existing-changed':
      if (token === 'target') return `it changed the statement it had to prove (a definition the frozen statement depends on changed${shown !== undefined ? `: ${shown}` : ''})`;
      if (token === 'removed') return `it removed an existing declaration${shown !== undefined ? ` (${shown})` : ''}`;
      if (token === 'ghost') return `it changed the suggestion you adopted${shown !== undefined ? ` (${shown})` : ''}`;
      return `it changed an existing declaration${shown !== undefined ? ` (${shown})` : ''}`;
    case 'statement-changed':
    case 'comparator-definition-mismatch':
      return `it changed the statement it had to prove (a definition the frozen statement depends on changed${shown !== undefined ? `: ${shown}` : ''})`;
    case 'comparator-statement-mismatch':
      return `it changed the statement it had to prove${shown !== undefined ? ` (${shown})` : ''}`;
    case 'comparator-kind-mismatch':
      return `it changed the kind of a frozen declaration${shown !== undefined ? ` (${shown})` : ''}`;
    case 'comparator-missing':
      return `the proof of the goal is missing${shown !== undefined ? ` (${shown})` : ''}`;
    case 'comparator-kernel':
      return "Lean's kernel rejected the proof";
    case 'comparator-build':
      return 'the frozen statements did not build for the final check';
    case 'comparator-export':
      return 'telelean could not export the proof for the final check';
    case 'status-mismatch':
      return 'it said the goal was not proved but left a proof of it in the files';
    case 'not-formalised':
      if (token === 'malformed') return `it bound ${cardLabel(finding.nodeId, ctx)} to something that is not a Lean statement${shown !== undefined ? ` (${shown})` : ''}`;
      if (token === 'detached') return `it left a blank line between ${cardLabel(finding.nodeId, ctx)} and its Lean statement`;
      return `it did not formalise ${cardLabel(finding.nodeId, ctx)}`;
    case 'missing-holds':
      return token === 'mismatch'
        ? `it did not state ${cardLabel(finding.nodeId, ctx)} correctly as an assumption${shown !== undefined ? ` (${shown})` : ''}`
        : `it did not state ${cardLabel(finding.nodeId, ctx)} as an assumption${shown !== undefined ? ` (${shown} is missing)` : ''}`;
    case 'proof-before-freeze':
      if (token === 'example') return 'it wrote an example before freezing the statements';
      if (token === 'carrier') return `it put a proof inside ${shown !== undefined ? shown : 'a definition'} before freezing the statements`;
      return `it wrote a proof before freezing the statements${shown !== undefined ? ` (${shown})` : ''}`;
    case 'not-frozen':
      return 'it claimed the goal was proved without freezing the statements first';
    case 'markup': {
      const card = cardLabel(finding.nodeId, ctx);
      switch (token) {
        case 'natural_name':
        case 'rationale':
          return `it changed your words on ${card}`;
        case 'lean':
        case 'binding':
          return `it re-pointed ${card} to a different Lean statement`;
        case 'formalised':
          return `it formalised ${card}, which you didn't select`;
        case 'type':
          return `it changed the kind of ${card}`;
        case 'removed':
          return `it removed the card ${card}`;
        case 'moved':
          return `it moved the card ${card} to another file`;
        case 'block':
          return 'it added a card of its own';
        case 'telelean':
          return `it changed the suggestion you adopted, ${card}`;
        case 'id':
          return `it changed the id of ${card}`;
        default:
          return `it changed the card ${card}`;
      }
    }
    default: {
      const unknown: never = finding.code;
      return `a check failed (${String(unknown)})`;
    }
  }
}

/**
 * The findings worth a notice: consequences of a root cause in the same list are dropped (a `footprint` on axioms the
 * attempt itself added, a `statement-changed` of a declaration already reported as `existing-changed`), and so are
 * findings described exactly like an earlier one.
 */
function distinct(findings: readonly GateFinding[], ctx: DescribeContext): GateFinding[] {
  const added = new Set(findings.filter((f) => f.code === 'new-axiom').flatMap((f) => f.names ?? []));
  const changed = new Set(findings.filter((f) => f.code === 'existing-changed').flatMap((f) => f.names ?? []));
  const covered = (f: GateFinding, by: ReadonlySet<string>) => (f.names ?? []).length > 0 && (f.names ?? []).every((n) => by.has(n));
  const seen = new Set<string>();
  const out: GateFinding[] = [];
  for (const finding of findings) {
    if (finding.code === 'footprint' && covered(finding, added)) continue;
    if (finding.code === 'statement-changed' && covered(finding, changed)) continue;
    const text = describe(finding, ctx);
    if (seen.has(text)) continue;
    seen.add(text);
    out.push(finding);
  }
  return out;
}

/** See `attemptNotice` in ./index.ts. */
export function notice(all: readonly GateFinding[], attempt: number, maxAttempts: number, ctx: DescribeContext, revertedTo?: string): string {
  const findings = distinct(all, ctx);
  const first = findings[0];
  const more = findings.length > 1 ? ` (and ${findings.length - 1} more)` : '';
  if (attempt >= maxAttempts) {
    const what = first ? `each time ${describe(first, ctx, true)}${more}` : 'the checks kept failing';
    const label = revertedTo?.trim().replace(/^[“"]|[”"]$/g, '');
    const target = label ? `“${label}”` : 'the last state that passed';
    const attempts = maxAttempts === 1 ? "Claude's attempt didn't pass the checks" : `Claude's attempts didn't pass the checks ${maxAttempts} times`;
    return `${attempts}: ${what}. telelean reverted its working copy to ${target}.`;
  }
  const what = first ? `${describe(first, ctx)}${more}` : 'the checks failed';
  return `Attempt ${attempt} didn't pass: ${what}. Asking Claude to retry.`;
}
