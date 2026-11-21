/**
 * AT1.1, AT1.2, AT1.2b (docs/m2-plan.md sections 3.1 and 3.8): G0's token denylist over Claude's lines only, the file
 * rules over a change set, and the single-term rule for ghost text.
 */
import { describe, expect, it } from 'vitest';
import { eraseMacroScopes, isHygienicName } from '../../src/gate/g0.js';
import { checkFileChanges, ghostTextProblems, scanForbidden, type G0Context } from '../../src/gate/index.js';
import { BASE, MAIN, normative, proved } from './helpers/spyroRun.js';

const CTX: G0Context = { library: 'Model', subject: 'Spyro', projectModules: new Set(['Model', 'Model.Spyro.Main', 'Model.Spyro.Vocabulary', 'Model.Spyro.Lemmas']) };
const FILE = 'Model/Spyro/Main.lean';
const scan = (text: string, base?: string | null) => scanForbidden(FILE, text, CTX, base);
const codesOf = (text: string) => scan(text).map((f) => f.code);

describe('AT1.1 G0 token denylist', () => {
  it('reports every denylisted token in code, with its code, token and range', () => {
    const cases: Array<[string, string, string]> = [
      ['#eval 1', 'hash-command', '#eval'],
      ['#exit', 'hash-command', '#exit'],
      ['#reduce (1 + 1)', 'hash-command', '#reduce'],
      ['#synth Inhabited Nat', 'hash-command', '#synth'],
      ['initialize foo : IO.Ref Nat ← IO.mkRef 0', 'metaprogramming', 'initialize'],
      ['builtin_initialize pure ()', 'metaprogramming', 'builtin_initialize'],
      ['run_cmd pure ()', 'metaprogramming', 'run_cmd'],
      ['run_elab pure ()', 'metaprogramming', 'run_elab'],
      ['run_meta pure ()', 'metaprogramming', 'run_meta'],
      ['macro "x" : term => `(1)', 'metaprogramming', 'macro'],
      ['macro_rules | `(x) => `(1)', 'metaprogramming', 'macro_rules'],
      ['syntax "y" : term', 'metaprogramming', 'syntax'],
      ['notation "⊥⊥" => False', 'metaprogramming', 'notation'],
      ['infix:50 " ~ " => Eq', 'metaprogramming', 'infix'],
      ['infixl:50 " ~ " => Eq', 'metaprogramming', 'infixl'],
      ['infixr:50 " ~ " => Eq', 'metaprogramming', 'infixr'],
      ['prefix:max "√" => Not', 'metaprogramming', 'prefix'],
      ['postfix:max "!" => Not', 'metaprogramming', 'postfix'],
      ['elab "z" : term => pure (Lean.mkConst ``Nat)', 'metaprogramming', 'elab'],
      ['elab_rules : term | `(z) => pure default', 'metaprogramming', 'elab_rules'],
      ['declare_syntax_cat foo', 'metaprogramming', 'declare_syntax_cat'],
      ['declare_simp_like_tactic foo', 'metaprogramming', 'declare_simp_like_tactic'],
      ['theorem t : 2 + 2 = 4 := by native_decide', 'native-code', 'native_decide'],
      ['theorem t : 2 + 2 = 4 := by bv_decide', 'native-code', 'bv_decide'],
      ['@[implemented_by foo] def bar : Nat := 0', 'native-code', 'implemented_by'],
      ['@[extern "c_bar"] opaque bar : Nat', 'native-code', 'extern'],
      ['@[csimp] theorem c : @foo = @bar := rfl', 'native-code', 'csimp'],
      ['theorem t : True := Lean.ofReduceBool _ _ rfl', 'native-code', 'Lean.ofReduceBool'],
      ['theorem t : True := ofReduceNat _ _ rfl', 'native-code', 'ofReduceNat'],
      ['def r := Lean.reduceBool true', 'native-code', 'Lean.reduceBool'],
      ['def r := Lean.reduceNat 1', 'native-code', 'Lean.reduceNat'],
      ['unsafe def u : Nat := 0', 'unsafe', 'unsafe'],
      ['partial def p : Nat → Nat := p', 'unsafe', 'partial'],
      ['set_option maxRecDepth 10000 in', 'set-option', 'set_option'],
      ['theorem s : False := sorry', 'sorry', 'sorry'],
      ['theorem s : False := by admit', 'sorry', 'admit'],
      ['import Lean', 'import', 'import Lean'],
    ];
    for (const [text, code, token] of cases) {
      const findings = scan(`namespace Spyro\n\n${text}\n\nend Spyro\n`);
      expect(findings.map((f) => [f.code, f.token]), text).toContainEqual([code, token]);
      const finding = findings.find((f) => f.code === code);
      expect(finding).toMatchObject({ step: 'G0', file: FILE });
      expect(finding?.range?.start.line, text).toBe(2);
      expect(finding?.message).toMatch(new RegExp(`^${FILE}:3:\\d+: `));
    }
  });

  it('gives the exact range of a token and the declaration it is in', () => {
    const text = 'namespace Spyro\n\ntheorem cynder_not_good.holds : cynder_not_good := sorry\n\nend Spyro\n';
    const [finding] = scan(text);
    expect(finding).toMatchObject({ code: 'sorry', token: 'sorry', names: ['Spyro.cynder_not_good.holds'] });
    expect(finding?.range).toEqual({ start: { line: 2, character: 51 }, end: { line: 2, character: 56 } });
    expect(finding?.message).toBe(`${FILE}:3:51: \`sorry\` leaves a gap: give a complete proof, or remove the proof and finish with status not_proved (in cynder_not_good.holds).`);
  });

  it('ignores the same words in comments, strings, docstrings and telelean blocks', () => {
    const text = [
      'namespace Spyro',
      '-- #eval sorry set_option macro native_decide unsafe import Lean',
      '/- #eval 1\nsorry admit partial set_option notation -/',
      '/-- uses sorry, #eval, native_decide and `set_option maxHeartbeats 0 in` -/',
      'def s : String := "sorry #eval set_option macro import Lean unsafe"',
      '/-',
      '@@ telelean v1',
      'id: x',
      'type: GOAL',
      'natural_name: we never sorry, #eval or set_option anything; macro notation unsafe',
      'rationale: import Lean',
      '-/',
      'end Spyro',
    ].join('\n');
    expect(scan(text)).toEqual([]);
  });

  it('allows #check and #print (also #print axioms)', () => {
    expect(scan('#check Nat\n#print Nat\n#print axioms Nat.add\n')).toEqual([]);
    expect(codesOf('#check_failure foo\n')).toEqual(['hash-command']);
  });

  it('flags `decide +native` and `set_option maxHeartbeats 0 in`', () => {
    expect(scan('theorem t : 1 = 1 := by decide +native\n').map((f) => [f.code, f.token])).toEqual([['native-code', '+native']]);
    expect(scan('set_option maxHeartbeats 0 in\ntheorem t : True := trivial\n').map((f) => [f.code, f.token])).toEqual([['set-option', 'set_option']]);
  });

  it('flags imports from outside the project; the project\'s own modules are allowed', () => {
    expect(scan('import Lean\nimport Model.Spyro.Lemmas\n').map((f) => f.token)).toEqual(['import Lean']);
    expect(scan('import Model.Spyro.Lemmas\nimport Model.Spyro.Vocabulary\n')).toEqual([]);
    expect(scanForbidden(FILE, 'import Model.Spyro.Lemmas\n', { ...CTX, projectModules: new Set(['Model.Spyro.Main']) }).map((f) => f.code)).toEqual(['import']);
  });

  it('with baseText: the user\'s own lines in a file Claude edited are not reported; extra copies Claude adds are', () => {
    const base = 'namespace Spyro\n\nset_option maxHeartbeats 400000 in\ntheorem mine : True := trivial\n\n#eval 1 + 1\n\nend Spyro\n';
    const claude = base.replace('end Spyro', 'theorem claude : True := trivial\n\nend Spyro');
    expect(scan(claude, base)).toEqual([]);
    // Without baseText (a new file) both lines are judged.
    expect(scan(claude).map((f) => f.code)).toEqual(['set-option', 'hash-command']);
    // A second copy of the user's line, added by Claude, is reported (the later occurrence).
    const copied = claude.replace('theorem claude', 'set_option maxHeartbeats 400000 in\ntheorem claude');
    const findings = scan(copied, base);
    expect(findings.map((f) => [f.code, f.range?.start.line])).toEqual([['set-option', copied.split('\n').lastIndexOf('set_option maxHeartbeats 400000 in')]]);
    expect(copied.split('\n').indexOf('set_option maxHeartbeats 400000 in')).toBe(2);
    // An edited version of the user's line is Claude's line.
    expect(scan(base.replace('400000', '0'), base).map((f) => f.code)).toEqual(['set-option']);
  });
});

describe('2b2 (AP30-1, AP30-1 r2): G0 refuses the `init` attribute in any attribute list', () => {
  const wrapped = (text: string) => `namespace Spyro\n\n${text}\n\nend Spyro\n`;
  it('refuses `init` and `builtin_init` as `metaprogramming`, first in a list or after a comma, `scoped` or `local`, in `@[…]` and `attribute […] x` alike', () => {
    const cases: Array<[string, string]> = [
      ['@[init] def x : IO Unit := pure ()', '@[init]'],
      ['@[init f] opaque y : Nat', '@[init]'],
      ['@[simp, init] def z : IO Unit := pure ()', '@[init]'],
      ['@[local init] def z : IO Unit := pure ()', '@[init]'],
      ['@[scoped init] def z : IO Unit := pure ()', '@[init]'],
      ['@[«init»] def z : IO Unit := pure ()', '@[«init»]'],
      ['@[builtin_init] def z : IO Unit := pure ()', '@[builtin_init]'],
      ['@[simp,\n  init] def z : IO Unit := pure ()', '@[init]'],
      ['attribute [init] x', 'attribute [init]'],
      ['attribute [simp, init] x', 'attribute [init]'],
      ['attribute [local init] x', 'attribute [init]'],
      ['attribute [builtin_init] x', 'attribute [builtin_init]'],
      ['attribute [instance 100, init] x', 'attribute [init]'],
      ['@[aesop safe [constructors], init] def z : IO Unit := pure ()', '@[init]'],
    ];
    for (const [text, token] of cases) {
      const findings = scan(wrapped(text));
      expect(findings.map((f) => [f.code, f.token]), text).toEqual([['metaprogramming', token]]);
      const finding = findings[0];
      expect(finding?.message, text).toMatch(new RegExp(`^${FILE}:\\d+:\\d+: \`${token.replace(/[[\]]/g, '\\$&')}\` is metaprogramming, which is not allowed in the model files: remove it`));
      expect(finding?.step).toBe('G0');
    }
    // The range is the attribute's name, on its own line.
    const [split] = scan(wrapped('@[simp,\n  init] def z : IO Unit := pure ()'));
    expect(split?.range).toEqual({ start: { line: 3, character: 2 }, end: { line: 3, character: 6 } });
  });

  it('the identifier `init` anywhere else passes: a named argument, a binder, a simp lemma, a declaration named `init`, `attribute [simp] init`, an argument of another attribute', () => {
    for (const text of [
      'def s (l : List Nat) : Nat := l.foldl (init := 0) (· + ·)',
      'def k : Nat → Nat := fun init => init',
      'theorem t : True := by simp [init]',
      'def init : Nat := 0',
      'attribute [simp] init',
      '@[simp] theorem init_ok : True := trivial',
      '@[deprecated init] def old : Nat := 0',
      '-- @[init] in a comment',
      'def str : String := "@[init]"',
      'attribute [-simp] init',
    ]) {
      expect(scan(wrapped(text)), text).toEqual([]);
    }
  });

  it('a line B already has is not judged; a copy Claude adds is', () => {
    const base = wrapped('@[init] def mine : IO Unit := pure ()');
    expect(scan(base, base)).toEqual([]);
    const claude = base.replace('end Spyro', 'theorem t : True := trivial\n\nend Spyro');
    expect(scan(claude, base)).toEqual([]);
    const copied = base.replace('end Spyro', '@[init] def mine2 : IO Unit := pure ()\n\nend Spyro');
    expect(scan(copied, base).map((f) => f.token)).toEqual(['@[init]']);
  });

  it('several lists in one text: each is scanned, none twice; an unclosed list is scanned once to the end', () => {
    expect(scan(wrapped('@[init] def a : IO Unit := pure ()\n@[simp] theorem b : True := trivial\nattribute [local init] a')).map((f) => f.token)).toEqual(['@[init]', 'attribute [init]']);
    expect(scan(wrapped('@[simp, init')).map((f) => f.token)).toEqual(['@[init]']);
    expect(scan(wrapped(''))).toEqual([]);
  });

  it('AP30-1 r3: an attribute name is read as Lean reads it, after `eraseMacroScopes`; any hand-written hygienic name is refused', () => {
    expect(eraseMacroScopes('init.«_@».x._hyg')).toBe('init');
    expect(eraseMacroScopes('«init».«_@».M._hyg')).toBe('«init»');
    expect(eraseMacroScopes('a.«_@».b.«_@».c._hyg')).toBe('a.«_@».b');
    expect(eraseMacroScopes('x._hyg')).toBe('');
    expect(eraseMacroScopes('init')).toBe('init');
    expect(eraseMacroScopes('a.«_@».b')).toBe('a.«_@».b');
    for (const name of ['init.«_@».x._hyg', 'x._hyg', 'a.«_@».b', '«_@»']) expect(isHygienicName(name), name).toBe(true);
    for (const name of ['x_hyg', 'hyg', 'a.b', 'init', '_hyg_x', 'a._hyg.b']) expect(isHygienicName(name), name).toBe(false);
    // The attribute rule: one finding, the attribute's (its hygienic name is no second one).
    const cases: Array<[string, string]> = [
      ['@[init.«_@».x._hyg] def x : IO Unit := pure ()', '@[init.«_@».x._hyg]'],
      ['@[simp, «init».«_@».M._hyg] def x : IO Unit := pure ()', '@[«init».«_@».M._hyg]'],
      ['attribute [local builtin_init.«_@».a._hyg] x', 'attribute [builtin_init.«_@».a._hyg]'],
    ];
    for (const [text, token] of cases) expect(scan(wrapped(text)).map((f) => [f.code, f.token]), text).toEqual([['metaprogramming', token]]);
    // Any other hygienic name: refused as one, whatever word it spells (here `macro`, which WORD_CODES compares whole).
    const macro = scan(wrapped('@[macro.«_@».x._hyg Lean.Parser.Command.check] def m : Lean.Macro := fun s => pure s'));
    expect(macro.map((f) => [f.code, f.token])).toEqual([['metaprogramming', 'macro.«_@».x._hyg']]);
    expect(macro[0]?.message).toMatch(/: `macro\.«_@»\.x\._hyg` is a hygienic name, which is not allowed in the model files: rename it \(in m\)\.$/);
    for (const text of ['theorem t : True := csimp.«_@».y._hyg', 'def v : Nat := foo._hyg', 'def w : Nat := a.«_@».b']) {
      expect(scan(wrapped(text)).map((f) => f.code), text).toEqual(['metaprogramming']);
    }
    // Passing: `x_hyg`, a binder named `hyg`, `a.b`.
    for (const text of ['def x_hyg : Nat := 0', 'def k : Nat → Nat := fun hyg => hyg', 'def a.b : Nat := 0']) expect(scan(wrapped(text)), text).toEqual([]);
  });

  it('AP30-1 r3: an attribute list is judged as a whole: an `init` on a line B has is refused when another line of its list is Claude’s', () => {
    const base = wrapped('  init] def mine : IO Unit := pure ()');
    expect(scan(base, base)).toEqual([]);
    // Claude opens the list on a line of its own: the person's line now holds an attribute of Claude's list.
    const opened = base.replace('  init] def mine', '@[simp,\n  init] def mine');
    expect(scan(opened, base).map((f) => [f.code, f.token, f.range?.start.line])).toEqual([['metaprogramming', '@[init]', 3]]);
    // Claude's line closes the list: the `init` on the person's first line is refused too.
    const personal = wrapped('@[init,\n  simp] def mine : IO Unit := pure ()');
    const closed = personal.replace('  simp] def mine', '  inline] def mine');
    expect(scan(closed, personal).map((f) => [f.token, f.range?.start.line])).toEqual([['@[init]', 2]]);
    // A list all of whose lines B has stays the person's.
    const whole = wrapped('@[simp,\n  init] def mine : IO Unit := pure ()');
    expect(scan(whole, whole)).toEqual([]);
    // Another rule's token on a line B has stays the person's, inside a list or not.
    const other = wrapped('@[simp,\n  implemented_by foo] def mine : Nat := 0');
    expect(scan(other.replace('@[simp,', '@[simp, inline,'), other)).toEqual([]);
  });

  it('ghost text with an `init` attribute is refused by the single-term rule too', () => {
    expect(ghostTextProblems('True', '@[init] fun _ => trivial').some((p) => p.includes('@[init]'))).toBe(true);
  });
});

describe('AT1.2 G0 file rules', () => {
  const base = new Map(Object.entries({ ...BASE, 'lakefile.toml': 'name = "model"\n', 'lean-toolchain': 'leanprover/lean4:v4.35.0\n', 'lake-manifest.json': '{}\n', 'Model/Other/Main.lean': 'namespace Other\nend Other\n' }));
  const changed = (changes: Record<string, string | null>) => {
    const current = new Map(base);
    for (const [path, text] of Object.entries(changes)) {
      if (text === null) current.delete(path);
      else current.set(path, text);
    }
    return checkFileChanges(base, current, CTX);
  };
  const codesFor = (changes: Record<string, string | null>) => changed(changes).map((f) => [f.code, f.file]);

  it('project files: lakefile, toolchain and manifest changes', () => {
    expect(codesFor({ 'lakefile.toml': 'name = "model"\n[leanOptions]\nautoImplicit = true\n' })).toEqual([['project-file', 'lakefile.toml']]);
    expect(codesFor({ 'lean-toolchain': 'leanprover/lean4:v4.36.0\n' })).toEqual([['project-file', 'lean-toolchain']]);
    expect(codesFor({ 'lake-manifest.json': '{"packages": []}\n' })).toEqual([['project-file', 'lake-manifest.json']]);
    expect(codesFor({ 'lakefile.lean': 'import Lake\n' })).toEqual([['project-file', 'lakefile.lean']]);
    expect(codesFor({ 'lean-toolchain': null })).toEqual([['project-file', 'lean-toolchain']]);
  });

  it('another subject\'s file or the library root: outside-subject', () => {
    expect(codesFor({ 'Model/Other/Main.lean': 'namespace Other\ntheorem x : True := trivial\nend Other\n' })).toEqual([['outside-subject', 'Model/Other/Main.lean']]);
    expect(codesFor({ 'Model.lean': 'import Model.Spyro.Main\nimport Model.Spyro.Lemmas\n' })).toEqual([['outside-subject', 'Model.lean']]);
    expect(codesFor({ 'Model/Other/New.lean': 'namespace Other\nend Other\n' })).toEqual([['outside-subject', 'Model/Other/New.lean']]);
    expect(changed({ 'Model.lean': 'import Model.Spyro.Main\n-- more\n' })[0]?.message).toBe(
      'Model.lean was changed: only the files of the subject Spyro (Model/Spyro/… and Model/Spyro.lean) may change; undo the change.',
    );
  });

  it('a deleted model file: deleted-file', () => {
    expect(codesFor({ [MAIN]: null })).toEqual([['deleted-file', MAIN]]);
    expect(codesFor({ 'Model/Other/Main.lean': null })).toEqual([['deleted-file', 'Model/Other/Main.lean']]);
  });

  it('a new path that is not a module of the subject: bad-path; a new module of the subject is fine', () => {
    expect(codesFor({ 'Model/Spyro/my file.lean': 'namespace Spyro\nend Spyro\n' })).toEqual([['bad-path', 'Model/Spyro/my file.lean']]);
    expect(codesFor({ 'Model/Spyro/notes.md': 'my notes\n' })).toEqual([['bad-path', 'Model/Spyro/notes.md']]);
    expect(codesFor({ 'Model/Spyro/Lemmas.lean': 'import Model.Spyro.Vocabulary\nnamespace Spyro\nend Spyro\n' })).toEqual([]);
    expect(codesFor({ 'Model/Spyro/Sub/Lemmas.lean': 'namespace Spyro\nend Spyro\n' })).toEqual([]);
    expect(codesFor({ 'Model/Spyro/2nd.lean': 'namespace Spyro\nend Spyro\n' })).toEqual([['bad-path', 'Model/Spyro/2nd.lean']]);
    expect(codesFor({ 'Model/Spyro.lean': 'import Model.Spyro.Main\n' })).toEqual([]);
  });

  it('unchanged files are never scanned; changed files are, against their base text', () => {
    const withEval = new Map(base);
    withEval.set('Model/Other/Main.lean', 'namespace Other\n#eval 1\nend Other\n');
    // The same text in base and current: nothing to judge, even though it holds #eval.
    expect(checkFileChanges(withEval, new Map(withEval), CTX)).toEqual([]);
    // The walkthrough's honest edits pass G0.
    const current = new Map(base);
    current.set(MAIN, proved()[MAIN] as string);
    expect(checkFileChanges(base, current, CTX)).toEqual([]);
    const cheat = new Map(base);
    const cheatText = (normative()[MAIN] as string).replace('end Spyro', '#eval 1\n\nend Spyro');
    cheat.set(MAIN, cheatText);
    expect(checkFileChanges(base, cheat, CTX).map((f) => [f.code, f.token, f.range?.start.line])).toEqual([['hash-command', '#eval', cheatText.split('\n').indexOf('#eval 1')]]);
  });
});

describe('AT1.2b the single-term rule for ghost text', () => {
  const STATEMENT = '∀ (c : Character) (g : Game), ¬ InGame c g → ¬ GoodAddition c g';
  const PROOF = 'fun h => h cynder newSpyro (pg_no_dark_past.holds newSpyro cynder new_spyro_pg.holds cynder_dark_past.holds)';

  it('the literal ghost of the walkthrough (statement and proof) has no problem', () => {
    expect(ghostTextProblems(STATEMENT, PROOF)).toEqual([]);
    expect(ghostTextProblems(STATEMENT)).toEqual([]);
    expect(ghostTextProblems('¬ GoodAddition cynder newSpyro', 'fun h => h')).toEqual([]);
    expect(ghostTextProblems('∀ c : Character, (match c with | _ => True)')).toEqual([]);
  });

  it('the injected statement of fact 8 is refused for each of its tricks', () => {
    const problems = ghostTextProblems('True) → True := fun _ => trivial\naxiom evil : False\nexample : (True');
    const text = problems.join('\n');
    expect(text).toContain('`:=` outside brackets');
    expect(text).toContain('unbalanced `)`');
    expect(text).toContain('leaves `(` open');
    expect(text).toContain('command keyword `axiom`');
    expect(text).toContain('command keyword `example`');
  });

  it('comment delimiters, # commands, G0 tokens and empty statements are refused', () => {
    expect(ghostTextProblems('True -/ ∧ True')).toEqual(['The statement contains a comment delimiter (`-/`): it must be plain Lean without comments.']);
    expect(ghostTextProblems('True /- x').join(' ')).toContain('comment delimiter (`/-`)');
    expect(ghostTextProblems('True -- x').join(' ')).toContain('comment delimiter (`--`)');
    expect(ghostTextProblems('#eval 1')).toEqual(['The statement contains a command (`#eval`): it must be one Lean term.']);
    expect(ghostTextProblems('sorry')).toEqual(['The statement uses `sorry` (a gap), which is not allowed.']);
    expect(ghostTextProblems('   ')).toEqual(['The statement is empty.']);
    expect(ghostTextProblems('')).toEqual(['The statement is empty.']);
    expect(ghostTextProblems('a | b').join(' ')).toContain('`|` outside brackets');
    expect(ghostTextProblems('(a ∧ b]').join(' ')).toContain('unbalanced `]`');
    expect(ghostTextProblems('True @[simp] theorem')).toHaveLength(2);
    expect(ghostTextProblems('True open Classical')).toEqual(['The statement contains the command keyword `open`: it must be one Lean term, not declarations.']);
  });

  it('the proof gets the token and keyword checks (but may hold `:=` and `|`)', () => {
    expect(ghostTextProblems(STATEMENT, 'fun h => h\ntheorem x : True := trivial')).toEqual(['The proof contains the command keyword `theorem`: it must be one Lean term, not declarations.']);
    expect(ghostTextProblems(STATEMENT, 'by have k := trivial; exact fun h => h')).toEqual([]);
    expect(ghostTextProblems(STATEMENT, 'by native_decide')).toEqual(['The proof uses `native_decide` (native code), which is not allowed.']);
    expect(ghostTextProblems(STATEMENT, '')).toEqual(['The proof is empty.']);
  });
});
