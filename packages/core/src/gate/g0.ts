/**
 * G0 (docs/m2-plan.md sections 3.1 and 3.8): the token denylist over Claude's lines, the file rules over a change set,
 * and the single-term rule for Claude's ghost text. Text only: nothing here runs Lean, and only `lexLean` tokens count,
 * so words in comments, strings, docstrings and telelean blocks never do. Since 2b2 (docs/slice2-plan.md 2.1, AP30-1)
 * the denylist also refuses the `init` and `builtin_init` attributes in any attribute list (`metaprogramming`), read as
 * Lean reads them (after `eraseMacroScopes`), the list judged as a whole, and any hand-written hygienic name (a `«_@»`
 * component or a last `_hyg` one, AP30-1 r3).
 */
import { scanDecls } from '../markup/decls.js';
import { canonicalName, lexLean, nameComponents } from '../markup/lexer.js';
import { relativeName } from '../markup/names.js';
import { Lines } from '../markup/text.js';
import type { DeclInfo, LeanToken } from '../markup/types.js';
import type { Range } from '../model.js';
import type { G0Context, GateFinding, GateFindingCode } from './types.js';

/** `#` commands that may stay (they only print). */
const HASH_ALLOWED: ReadonlySet<string> = new Set(['check', 'print']);

/** Code tokens that are refused wherever they occur, by code (plan 3.1). `run_tac` added (a sibling of `run_elab`). */
const WORD_CODES: ReadonlyMap<string, GateFindingCode> = new Map<string, GateFindingCode>([
  ...[
    'initialize',
    'builtin_initialize',
    'run_cmd',
    'run_elab',
    'run_meta',
    'run_tac',
    'macro',
    'macro_rules',
    'syntax',
    'notation',
    'infix',
    'infixl',
    'infixr',
    'prefix',
    'postfix',
    'elab',
    'elab_rules',
    'declare_syntax_cat',
    'declare_simp_like_tactic',
  ].map((w) => [w, 'metaprogramming'] as const),
  ...['native_decide', 'bv_decide', 'implemented_by', 'extern', 'csimp', 'native'].map((w) => [w, 'native-code'] as const),
  ...['unsafe', 'partial'].map((w) => [w, 'unsafe'] as const),
  ['set_option', 'set-option'],
  ...['sorry', 'admit'].map((w) => [w, 'sorry'] as const),
]);

/** Constants of Lean's `Lean` namespace behind native evaluation: refused however they are written (`Lean.ofReduceBool`). */
const NATIVE_CONSTANTS: ReadonlySet<string> = new Set(['ofReduceBool', 'ofReduceNat', 'reduceBool', 'reduceNat']);

/**
 * Attributes that run code when a module that has them is imported (docs/slice2-plan.md 2.1, "No Claude code runs at
 * import", AP30-1; 2b2): what `initialize` expands to. Refused as `metaprogramming` wherever an attribute list names
 * them, by canonical name (`«init»` too).
 */
const INIT_ATTRIBUTES: ReadonlySet<string> = new Set(['init', 'builtin_init']);
/** The attribute kinds that may stand before an attribute's name in its list (`attribute [local init] x`). */
const ATTRIBUTE_KINDS: ReadonlySet<string> = new Set(['scoped', 'local']);
const LIST_OPENERS = '([{⟨';
const LIST_CLOSERS = ')]}⟩';

/** A name's components with their «» escapes taken off (`init.«_@».x._hyg` -> init, _@, x, _hyg). */
const componentValues = (name: string) => nameComponents(name).map((part) => (part.length >= 2 && part.startsWith('«') && part.endsWith('»') ? part.slice(1, -1) : part));

/**
 * Lean's `Name.eraseMacroScopes` (4.35) on a written name (AP30-1 r3): a name whose last component is `_hyg` has macro
 * scopes, and loses its last `_@` component and everything after it (`init.«_@».x._hyg` is `init`); no `_@` leaves
 * nothing. Any other name is unchanged. Lean names an attribute this way (Elab/Attributes.lean), so G0 does too.
 */
export function eraseMacroScopes(name: string): string {
  const values = componentValues(name);
  if (values[values.length - 1] !== '_hyg') return name;
  const at = values.lastIndexOf('_@');
  return at <= 0 ? '' : nameComponents(name).slice(0, at).join('.');
}

/**
 * A hand-written hygienic name (AP30-1 r3): a component `_@`, or a last component `_hyg`. No model needs one, and the
 * spelling gets any word G0 guards past its comparison (`macro.«_@».x._hyg` is Lean's `macro`).
 */
export function isHygienicName(name: string): boolean {
  const values = componentValues(name);
  return values.includes('_@') || values[values.length - 1] === '_hyg';
}

/**
 * The `init` attributes of a text's attribute lists (2b2, AP30-1 and AP30-1 r2): in `@[…]` and in `attribute […] x`
 * alike, an attribute whose name is `init` or `builtin_init`, first in its list or after a comma, `scoped` or `local`
 * (so `@[simp, init]`, `@[local init]`, `@[init f]` and `attribute [simp, init] x`). The identifier `init` anywhere
 * else is no attribute: `foldl (init := 0)`, a binder named `init`, `simp [init]`, `attribute [simp] init`. AP30-1 r3:
 * the name is compared as Lean reads it, after `eraseMacroScopes` (`@[init.«_@».x._hyg]` is `init`), and each finding
 * carries its list's span, so the list is judged as a whole against B's lines.
 */
function initAttributes(tokens: readonly LeanToken[]): RawToken[] {
  const out: RawToken[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i] as LeanToken;
    const next = tokens[i + 1];
    const at = tok.kind === 'symbol' && tok.text === '@' && next?.kind === 'symbol' && next.text === '[';
    const command = tok.kind === 'ident' && canonicalName(tok.text) === 'attribute' && next?.kind === 'symbol' && next.text === '[';
    if (!at && !command) continue;
    const prefix = at ? '@[' : 'attribute [';
    const found: RawToken[] = [];
    let depth = 0;
    let entryStart = true;
    let j = i + 1;
    for (; j < tokens.length; j++) {
      const t = tokens[j] as LeanToken;
      if (t.kind === 'symbol' && LIST_OPENERS.includes(t.text)) {
        depth++;
        entryStart = depth === 1;
        continue;
      }
      if (t.kind === 'symbol' && LIST_CLOSERS.includes(t.text)) {
        depth--;
        if (depth <= 0) break;
        entryStart = false;
        continue;
      }
      if (depth === 1 && t.kind === 'symbol' && t.text === ',') {
        entryStart = true;
        continue;
      }
      if (depth === 1 && entryStart && t.kind === 'ident' && ATTRIBUTE_KINDS.has(canonicalName(t.text))) continue;
      // As Lean reads the name: after `eraseMacroScopes` (AP30-1 r3).
      if (depth === 1 && entryStart && t.kind === 'ident' && INIT_ATTRIBUTES.has(eraseMacroScopes(canonicalName(t.text)))) {
        found.push({ code: 'metaprogramming', start: t.span.start, end: t.span.end, token: `${prefix}${t.text}]` });
      }
      entryStart = false;
    }
    // The list is judged as a whole (AP30-1 r3): its span, from `@` or `attribute` to its closing bracket (or the end).
    const end = tokens[j]?.span.end ?? tokens[tokens.length - 1]?.span.end ?? tok.span.end;
    for (const item of found) out.push({ ...item, list: { start: tok.span.start, end } });
    // The list's closing bracket (or the text's end, for a list that never closes): scanning goes on after it.
    i = j;
  }
  return out;
}

/** What each token code means, for Claude's message. */
const TOKEN_ADVICE: Readonly<Partial<Record<GateFindingCode, string>>> = {
  'hash-command': 'is not allowed in the model files (only #check and #print may be used): remove it',
  metaprogramming: 'is metaprogramming, which is not allowed in the model files: remove it',
  'native-code': 'trusts compiled code instead of the kernel, which is not allowed: prove it in the kernel (decide, simp, omega, …)',
  unsafe: 'is not allowed in the model files: remove it',
  'set-option': 'is not allowed in what you write (no option or limit changes): remove it',
  sorry: 'leaves a gap: give a complete proof, or remove the proof and finish with status not_proved',
};

/** The lines of a text without their line breaks (`\n` or `\r\n`). */
export function textLines(text: string): string[] {
  return text.split('\n').map((line) => (line.endsWith('\r') ? line.slice(0, -1) : line));
}

/** How many times each exact line occurs. */
function lineCounts(text: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const line of textLines(text)) counts.set(line, (counts.get(line) ?? 0) + 1);
  return counts;
}

const lastComponent = (name: string) => {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? name : name.slice(dot + 1);
};

/** `file:line:col` as Lean prints it (1-based line, 0-based column). */
export function where(file: string, range: Range | undefined): string {
  return range ? `${file}:${range.start.line + 1}:${range.start.character}` : file;
}

interface RawToken {
  code: GateFindingCode;
  start: number;
  end: number;
  token: string;
  /** What it is, for Claude's message, when not the code's usual advice (a hygienic name, AP30-1 r3). */
  advice?: string;
  /**
   * An `init` attribute's list (AP30-1 r3): judged as a whole against B's lines, so it is refused when any line of the
   * list is Claude's, also on a line whose text B has.
   */
  list?: { start: number; end: number };
}

/** The offending tokens of a text (no line filtering), in text order. */
function forbiddenTokens(tokens: readonly LeanToken[], projectModules: ReadonlySet<string> | undefined): RawToken[] {
  const out: RawToken[] = [];
  const glued = (a: LeanToken | undefined, b: LeanToken | undefined) => a !== undefined && b !== undefined && a.span.end === b.span.start;
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i] as LeanToken;
    const next = tokens[i + 1];
    if (tok.kind === 'symbol' && tok.text === '#' && next?.kind === 'ident' && glued(tok, next)) {
      const command = next.text.split('.')[0] ?? next.text;
      if (!HASH_ALLOWED.has(command)) out.push({ code: 'hash-command', start: tok.span.start, end: next.span.end, token: `#${next.text}` });
      i++;
      continue;
    }
    if (tok.kind !== 'ident') continue;
    const canonical = canonicalName(tok.text);
    if (tok.text === 'import' || canonical === 'import') {
      let j = i + 1;
      if (tokens[j]?.kind === 'ident' && tokens[j]?.text === 'all') j++;
      const module = tokens[j];
      if (module?.kind === 'ident') {
        if (projectModules === undefined || !projectModules.has(canonicalName(module.text))) {
          out.push({ code: 'import', start: tok.span.start, end: module.span.end, token: `import ${module.text}` });
        }
        i = j;
      } else {
        out.push({ code: 'import', start: tok.span.start, end: tok.span.end, token: 'import' });
      }
      continue;
    }
    // AP30-1 r3: a hand-written hygienic name, whatever word it spells.
    if (isHygienicName(canonical)) {
      out.push({ code: 'metaprogramming', start: tok.span.start, end: tok.span.end, token: tok.text, advice: 'is a hygienic name, which is not allowed in the model files: rename it' });
      continue;
    }
    const code = WORD_CODES.get(tok.text) ?? WORD_CODES.get(canonical) ?? (NATIVE_CONSTANTS.has(lastComponent(canonical)) ? 'native-code' : undefined);
    if (code === undefined) continue;
    const previous = tokens[i - 1];
    if (canonical === 'native' && previous?.kind === 'symbol' && previous.text === '+' && glued(previous, tok)) {
      out.push({ code, start: previous.span.start, end: tok.span.end, token: `+${tok.text}` });
    } else {
      out.push({ code, start: tok.span.start, end: tok.span.end, token: tok.text });
    }
  }
  // 2b2 (AP30-1): the `init` attributes, in text order with the rest; a hygienic `init` is one finding, the attribute's.
  const attributes = initAttributes(tokens);
  if (attributes.length === 0) return out;
  const atAttribute = new Set(attributes.map((a) => a.start));
  return [...out.filter((item) => !(item.advice !== undefined && atAttribute.has(item.start))), ...attributes].sort((a, b) => a.start - b.start);
}

/** The innermost declaration whose span contains `offset`. */
function declAt(decls: readonly DeclInfo[], offset: number): DeclInfo | undefined {
  let found: DeclInfo | undefined;
  for (const decl of decls) if (decl.span.start <= offset && offset < decl.span.end) found = decl;
  return found;
}

/** See `scanForbidden` in ./index.ts. */
export function scanForbiddenText(file: string, text: string, ctx: G0Context, baseText?: string | null): GateFinding[] {
  const lex = lexLean(text);
  const raw = forbiddenTokens(lex.tokens, ctx.projectModules);
  if (raw.length === 0) return [];
  const lines = new Lines(text);
  const decls = scanDecls(text, lex, lines).decls;
  // Only Claude's lines are judged: a line whose exact text B's version also has (as often) is the user's own.
  const base = baseText === undefined || baseText === null ? undefined : lineCounts(baseText);
  const current = textLines(text);
  const rank = new Map<number, number>();
  if (base !== undefined) {
    const seen = new Map<string, number>();
    current.forEach((line, index) => {
      const n = (seen.get(line) ?? 0) + 1;
      seen.set(line, n);
      rank.set(index, n);
    });
  }
  const out: GateFinding[] = [];
  /** The line is the user's: B's version has that exact text at least as often, up to this occurrence. */
  const inBase = (line: number) => base !== undefined && (rank.get(line) ?? 1) <= (base.get(current[line] ?? '') ?? 0);
  for (const item of raw) {
    const line = lines.lineOf(item.start);
    if (item.list !== undefined) {
      // AP30-1 r3: an `init` attribute's list is the user's only when every line of it is.
      const first = lines.lineOf(item.list.start);
      const last = lines.lineOf(Math.max(item.list.start, item.list.end - 1));
      let all = true;
      for (let k = first; k <= last && all; k++) all = inBase(k);
      if (all) continue;
    } else if (inBase(line)) continue;
    const range = lines.range({ start: item.start, end: item.end });
    const decl = declAt(decls, item.start);
    const inDecl = decl?.fullName !== undefined ? ` (in ${relativeName(decl.fullName, decl.namespace)})` : '';
    const advice =
      item.code === 'import'
        ? `\`${item.token}\` imports a module from outside the project${inDecl}: only the project's own modules may be imported`
        : `\`${item.token}\` ${item.advice ?? TOKEN_ADVICE[item.code] ?? 'is not allowed'}${inDecl}`;
    out.push({
      step: 'G0',
      code: item.code,
      message: `${where(file, range)}: ${advice}.`,
      file,
      range,
      token: item.token,
      ...(decl?.fullName !== undefined ? { names: [decl.fullName] } : {}),
    });
  }
  return out;
}

/** The project files Claude may never change (plan 3.1 `project-file`), at the model root. */
export const PROJECT_FILES: ReadonlySet<string> = new Set(['lakefile.toml', 'lakefile.lean', 'lean-toolchain', 'lake-manifest.json']);

/** A module path component a new file may use: an ASCII Lean identifier part. */
const MODULE_COMPONENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Inside the run's subject: `<library>/<S>.lean` or `<library>/<S>/**`. */
export function inSubjectScope(path: string, library: string, subject: string): boolean {
  return path === `${library}/${subject}.lean` || path.startsWith(`${library}/${subject}/`);
}

/** A path a new file of the subject may have: `<library>/<S>/<A>/…/<Module>.lean` with identifier components (or the subject root). */
export function isSubjectModulePath(path: string, library: string, subject: string): boolean {
  if (path === `${library}/${subject}.lean`) return true;
  const prefix = `${library}/${subject}/`;
  if (!path.startsWith(prefix) || !path.endsWith('.lean')) return false;
  const parts = path.slice(prefix.length, -'.lean'.length).split('/');
  return parts.length > 0 && parts.every((part) => MODULE_COMPONENT.test(part));
}

/** See `checkFileChanges` in ./index.ts. */
export function checkChangeSet(base: ReadonlyMap<string, string>, current: ReadonlyMap<string, string>, ctx: G0Context): GateFinding[] {
  const out: GateFinding[] = [];
  const scope = `${ctx.library}/${ctx.subject}/… and ${ctx.library}/${ctx.subject}.lean`;
  const paths = [...new Set([...base.keys(), ...current.keys()])].sort();
  for (const path of paths) {
    const before = base.get(path);
    const after = current.get(path);
    if (before === after) continue;
    const verb = before === undefined ? 'was added' : after === undefined ? 'was deleted' : 'was changed';
    const finding = (code: GateFindingCode, advice: string): GateFinding => ({ step: 'G0', code, message: `${path} ${verb}: ${advice}.`, file: path, token: path });
    if (PROJECT_FILES.has(path)) {
      out.push(finding('project-file', 'the project files (lakefile, lean-toolchain, lake-manifest.json) must stay exactly as they were; undo it'));
      continue;
    }
    if (after === undefined) out.push(finding('deleted-file', 'model files may not be deleted; restore it'));
    else if (!inSubjectScope(path, ctx.library, ctx.subject)) {
      out.push(finding('outside-subject', `only the files of the subject ${ctx.subject} (${scope}) may change; ${before === undefined ? 'remove it' : 'undo the change'}`));
    } else if (before === undefined && !isSubjectModulePath(path, ctx.library, ctx.subject)) {
      out.push(
        finding('bad-path', `it is not a Lean module of the subject (expected ${ctx.library}/${ctx.subject}/<Module>.lean with letters, digits and "_" only); remove it`),
      );
    }
    if (after !== undefined && path.endsWith('.lean')) out.push(...scanForbiddenText(path, after, ctx, before ?? null));
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// The single-term rule for ghost text (plan 3.8)

/** Command keywords: a ghost text holding one could close the generated declaration and start another. */
const GHOST_COMMAND_WORDS: ReadonlySet<string> = new Set([
  'axiom',
  'theorem',
  'lemma',
  'def',
  'abbrev',
  'example',
  'instance',
  'structure',
  'class',
  'inductive',
  'coinductive',
  'opaque',
  'namespace',
  'section',
  'end',
  'universe',
  'variable',
  'import',
  'attribute',
  'mutual',
  'deriving',
  'noncomputable',
  'private',
  'protected',
  // Also commands that would act on the declarations after an adopted ghost (name resolution), never needed in one term.
  'open',
  'export',
  'omit',
  'include',
]);

const OPENERS = '([{⟨⦃⟦‹';
const CLOSERS = ')]}⟩⦄⟧›';

const G0_LABEL: Readonly<Partial<Record<GateFindingCode, string>>> = {
  metaprogramming: 'metaprogramming',
  'native-code': 'native code',
  unsafe: 'unsafe code',
  'set-option': 'an option change',
  sorry: 'a gap',
};

/** The single-term problems of one text (`what` = "statement" or "proof"). */
function termProblems(text: string, what: 'statement' | 'proof'): string[] {
  const problems: string[] = [];
  const The = what === 'statement' ? 'The statement' : 'The proof';
  for (const delimiter of ['/-', '-/', '--']) {
    if (text.includes(delimiter)) problems.push(`${The} contains a comment delimiter (\`${delimiter}\`): it must be plain Lean without comments.`);
  }
  const { tokens } = lexLean(text);
  const glued = (a: LeanToken | undefined, b: LeanToken | undefined) => a !== undefined && b !== undefined && a.span.end === b.span.start;
  const keywords = new Set<string>();
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i] as LeanToken;
    const next = tokens[i + 1];
    if (tok.kind === 'symbol' && tok.text === '#' && next?.kind === 'ident' && glued(tok, next)) {
      problems.push(`${The} contains a command (\`#${next.text}\`): it must be one Lean term.`);
      continue;
    }
    if (tok.kind === 'symbol' && tok.text === '@' && next?.kind === 'symbol' && next.text === '[' && glued(tok, next)) keywords.add('@[');
    if (tok.kind === 'ident' && GHOST_COMMAND_WORDS.has(canonicalName(tok.text))) keywords.add(canonicalName(tok.text));
  }
  for (const keyword of keywords) problems.push(`${The} contains the command keyword \`${keyword}\`: it must be one Lean term, not declarations.`);
  for (const finding of forbiddenTokens(tokens, new Set())) {
    // `#` commands and imports are reported above.
    if (finding.code === 'hash-command' || finding.code === 'import') continue;
    problems.push(`${The} uses \`${finding.token}\` (${G0_LABEL[finding.code] ?? 'not allowed'}), which is not allowed.`);
  }
  if (what === 'statement') {
    const stack: string[] = [];
    let assign = false;
    let bar = false;
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i] as LeanToken;
      if (tok.kind !== 'symbol') continue;
      const open = OPENERS.indexOf(tok.text);
      const close = CLOSERS.indexOf(tok.text);
      if (open >= 0) stack.push(tok.text);
      else if (close >= 0) {
        if (stack.length > 0 && stack[stack.length - 1] === OPENERS[close]) stack.pop();
        else problems.push(`${The} has an unbalanced \`${tok.text}\` (character ${tok.span.start + 1}) that closes no bracket opened before it.`);
      } else if (stack.length === 0 && tok.text === ':' && tokens[i + 1]?.text === '=' && glued(tok, tokens[i + 1])) assign = true;
      else if (stack.length === 0 && tok.text === '|') bar = true;
    }
    if (assign) problems.push(`${The} contains \`:=\` outside brackets: a suggested premise is one proposition (put any \`:=\` inside parentheses).`);
    if (bar) problems.push(`${The} contains \`|\` outside brackets: put any pattern match inside parentheses.`);
    for (const open of stack) problems.push(`${The} leaves \`${open}\` open: every bracket must close within the statement.`);
  }
  if (text.trim() === '') problems.push(`${The} is empty.`);
  return problems;
}

/** See `ghostTextProblems` in ./index.ts. */
export function ghostProblems(statement: string, proof?: string): string[] {
  return [...termProblems(statement, 'statement'), ...(proof !== undefined ? termProblems(proof, 'proof') : [])];
}

/** Every whitespace run collapsed to one space, trimmed: the form the ghost check elaborates and adoption writes. */
export function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
