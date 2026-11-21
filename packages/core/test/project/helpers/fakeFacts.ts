/**
 * A stand-in for WP-semantic's `refreshLeanFacts` on small synthetic fixtures: from parsed files it derives the
 * LeanFacts a real build would report for the simple Lean the tests use (ranges from the declarations, refs from
 * the identifiers that resolve to project declarations, `#check`-style fully-qualified types with binders turned into
 * arrows, `typeSort` for axioms/opaques, and `#print axioms`-style transitive axiom lists in Lean's name order).
 * Anything a test needs beyond that (e.g. the `And.right` ref Lean records for `.2`) goes in `overrides`.
 * The Spyro acceptance tests use the hand-written fixtures/project/*.json instead.
 */
import { probeFailure, type DeclFacts, type DeclRef, type LeanDeclKind, type LeanFacts, type LeanMessageFact, type ModuleFacts, type ProbeRunFacts } from '../../../src/facts.js';
import type { DeclInfo, ParsedFile } from '../../../src/markup/types.js';
import { moduleOfPath } from '../../../src/paths.js';
import { keywordKind } from '../../../src/project/factsIndex.js';
import { blankComments, compareLeanNames, identifierTokens, LineMap, normalizeWhitespace, splitTopLevelArrows } from '../../../src/project/text.js';
import { anonymousInstanceName, qualifyText, resolveName, shapeOf } from '../../../src/project/vocabulary.js';

export interface DeclOverride {
  kind?: LeanDeclKind;
  type?: string;
  typeSort?: string;
  axioms?: string[];
  usesSorry?: boolean;
  /** Extra ref names appended (zero-width ranges at the declaration's end), e.g. `And.right`. */
  extraRefs?: string[];
  /** Replace the refs entirely. */
  refs?: DeclRef[];
  value?: string;
  error?: string;
  parent?: string;
  /** Slice 1d: the elaborated value's constants (`DeclFacts.valueConsts`), e.g. a lemma `simp` used unnamed. */
  valueConsts?: string[];
  /** Slice 1d: leave `valueConsts` out for this declaration (a failed probe, old facts). */
  noValueConsts?: boolean;
  /** Slice 2a1: the elaborated type's constants (`DeclFacts.typeConsts`), e.g. a class reached through a field. */
  typeConsts?: string[];
  /** Slice 2a1: leave `typeConsts` out for this declaration (old facts, a failed probe). */
  noTypeConsts?: boolean;
  /** Leave the declaration out of the facts. */
  drop?: boolean;
}

export interface FakeFactsOptions {
  library?: string;
  overrides?: Record<string, DeclOverride>;
  /** Module state per file path (default `fresh`; non-fresh modules get no declarations, like a real build). */
  moduleStates?: Record<string, ModuleFacts['state']>;
  messages?: LeanMessageFact[];
  status?: LeanFacts['status'];
  /**
   * Slice 1d: give every declaration `valueConsts`, as the value probe does: the project declarations its refs name
   * (in order, once), unless overridden. Off by default: such facts are the ones from before slice 1d.
   */
  valueConsts?: boolean;
  /**
   * Slice 2a1 (docs/slice2-plan.md 2.1): give every declaration `typeConsts`, as slice 2's probe does: the project
   * declarations named in its type (the signature before `:=`/`where`/`|`; the whole declaration for an axiom, an
   * opaque without a value, and an inductive, structure or class, whose constructors' types count), in order, once,
   * unless overridden. Off by default: such facts are the ones from before slice 2.
   */
  typeConsts?: boolean;
  /**
   * Slice 2b2 (docs/slice2-plan.md 2.1, D2-75): the isolated probe's marker (`LeanFacts.probe`); a status alone gets
   * `durationMs: 300` and no detail. When it is `cut` or `failed`, no declaration gets valueConsts or typeConsts, whatever
   * the other options and overrides say (a refresh never gives constants then), and the facts' status is `check-errors`
   * with the cause in `detail` (refresh reports it as a check problem) unless `status` is given.
   */
  probe?: ProbeRunFacts | ProbeRunFacts['status'];
}

export const hashOf = (path: string) => `sha-${path}`;

/** The input hashes that make every file fresh against `fakeFacts` (change one to make that file stale). */
export function freshHashes(files: readonly ParsedFile[]): Record<string, string> {
  return Object.fromEntries(files.map((f) => [f.path, hashOf(f.path)]));
}

interface Entry {
  file: ParsedFile;
  decl: DeclInfo;
  name: string;
}

export function fakeFacts(files: readonly ParsedFile[], options: FakeFactsOptions = {}): LeanFacts {
  const library = options.library ?? 'Model';
  const overrides = options.overrides ?? {};
  const entries: Entry[] = [];
  for (const file of files) {
    for (const decl of file.decls) {
      if (decl.keyword === 'example' || decl.keyword === 'mutual') continue;
      const name = decl.fullName ?? (decl.keyword === 'instance' ? anonymousInstanceName(file, decl) : undefined);
      if (name) entries.push({ file, decl, name });
    }
  }
  const names = new Set(entries.map((e) => e.name));
  const known = (n: string) => names.has(n);
  const byName = new Map(entries.map((e) => [e.name, e]));

  const refsOf = new Map<string, DeclRef[]>();
  /** Slice 2a1: the refs inside each declaration's type (see `FakeFactsOptions.typeConsts`). */
  const typeRefsOf = new Map<string, string[]>();
  for (const { file, decl, name } of entries) {
    const lines = new LineMap(file.text);
    const from = decl.nameSpan?.end ?? decl.keywordSpan.end;
    const body = blankComments(file.text.slice(from, decl.span.end));
    const refs: DeclRef[] = [];
    const structural = ['inductive', 'coinductive', 'structure', 'class', 'class inductive'].includes(decl.keyword);
    const typeEnd = structural || decl.valueStart === undefined ? decl.span.end : decl.valueStart;
    const typeRefs: string[] = [];
    for (const token of identifierTokens(body)) {
      let text = token.text;
      let resolved = resolveName(text, decl.namespace, known);
      while (!resolved && text.includes('.')) {
        text = text.slice(0, text.lastIndexOf('.'));
        resolved = resolveName(text, decl.namespace, known);
      }
      if (!resolved || resolved === name) continue;
      const start = from + token.start;
      const target = byName.get(resolved);
      refs.push({ name: resolved, module: moduleOfPath(target?.file.path ?? '') ?? '', range: lines.rangeOf(start, start + text.length) });
      if (start < typeEnd && !typeRefs.includes(resolved)) typeRefs.push(resolved);
    }
    typeRefsOf.set(name, typeRefs);
    const o = overrides[name];
    if (o?.extraRefs) {
      const end = lines.positionAt(decl.span.end);
      for (const extra of o.extraRefs) refs.push({ name: extra, module: 'Init.Prelude', range: { start: end, end } });
    }
    refsOf.set(name, o?.refs ?? refs);
  }

  const shapeCache = new Map<string, ReturnType<typeof shapeOf>>();
  const shape = (e: Entry) => {
    let s = shapeCache.get(e.name);
    if (!s) {
      s = shapeOf(e.file, e.decl, undefined, e.name, known);
      shapeCache.set(e.name, s);
    }
    return s;
  };
  const sorts = new Set(entries.filter((e) => e.decl.keyword === 'axiom' && shape(e).type === 'Type').map((e) => e.name));
  const presupOf = new Map<string, string>();
  for (const e of entries) {
    const m = e.decl.keyword === 'axiom' ? /^Nonempty\s+(\S+)$/.exec(shape(e).type ?? '') : null;
    if (m && sorts.has(m[1] ?? '') && !presupOf.has(m[1] ?? '')) presupOf.set(m[1] ?? '', e.name);
  }

  const axiomMemo = new Map<string, string[]>();
  const axiomsOf = (name: string, stack = new Set<string>()): string[] => {
    const memo = axiomMemo.get(name);
    if (memo) return memo;
    const o = overrides[name];
    if (o?.axioms) return o.axioms;
    if (stack.has(name)) return [];
    stack.add(name);
    const e = byName.get(name);
    const out = new Set<string>();
    if (e) {
      if (e.decl.keyword === 'axiom') out.add(name);
      for (const ref of refsOf.get(name) ?? []) for (const a of axiomsOf(ref.name, stack)) out.add(a);
      if (e.decl.keyword === 'opaque') {
        const type = shape(e).type ?? '';
        const presup = presupOf.get(type);
        if (presup) {
          out.add('Classical.choice');
          for (const a of axiomsOf(presup, stack)) out.add(a);
        }
      }
      const text = blankComments(e.file.text.slice(e.decl.span.start, e.decl.span.end));
      if (/(^|[^\w])sorry([^\w]|$)/.test(text)) out.add('sorryAx');
    }
    stack.delete(name);
    const list = [...out].sort(compareLeanNames);
    axiomMemo.set(name, list);
    return list;
  };

  const states = options.moduleStates ?? {};
  const modules: ModuleFacts[] = files.map((file) => ({
    name: moduleOfPath(file.path) ?? file.path,
    file: file.path,
    sourceSha256: hashOf(file.path),
    state: states[file.path] ?? 'fresh',
    imports: file.imports.filter((m) => m === library || m.startsWith(`${library}.`)),
  }));
  const factsOk = (path: string) => (states[path] ?? 'fresh') === 'fresh' || states[path] === 'stale';

  const probe: ProbeRunFacts | undefined = options.probe === undefined ? undefined : typeof options.probe === 'string' ? { status: options.probe, durationMs: 300 } : options.probe;
  const probeFailed = probe !== undefined && (probe.status === 'cut' || probe.status === 'failed');
  const decls: DeclFacts[] = [];
  for (const e of entries) {
    if (!factsOk(e.file.path)) continue;
    const o = overrides[e.name] ?? {};
    if (o.drop) continue;
    const lines = new LineMap(e.file.text);
    const s = shape(e);
    const kind: LeanDeclKind = o.kind ?? (e.decl.keyword === 'instance' ? 'instance' : keywordKind(e.decl.keyword));
    const type = o.type ?? (s.type !== undefined ? normalizeWhitespace(s.type) : undefined);
    let typeSort = o.typeSort;
    if (typeSort === undefined && (kind === 'axiom' || kind === 'opaque') && type !== undefined) {
      const parts = splitTopLevelArrows(type);
      if (type === 'Type') typeSort = 'Type 1';
      else if (/^Type\b/.test(type)) typeSort = 'Type 2';
      else if (/^Sort\b/.test(type)) typeSort = 'Type';
      else if (parts[parts.length - 1] === 'Prop' || parts.every((p) => sorts.has(p))) typeSort = 'Type';
      else typeSort = 'Prop';
    }
    let value = o.value;
    if (value === undefined && kind === 'def' && e.decl.valueStart !== undefined) {
      value = qualifyText(blankComments(e.file.text.slice(e.decl.valueStart + 2, e.decl.span.end)), e.decl.namespace, known);
    }
    const axioms = axiomsOf(e.name);
    decls.push({
      name: e.name,
      module: moduleOfPath(e.file.path) ?? '',
      file: e.file.path,
      range: e.decl.range,
      selectionRange: lines.rangeOf(e.decl.nameSpan?.start ?? e.decl.keywordSpan.start, e.decl.nameSpan?.end ?? e.decl.keywordSpan.end),
      kind,
      ...(e.decl.attributes ? { attributes: e.decl.attributes } : {}),
      ...(type !== undefined ? { type } : {}),
      ...(typeSort !== undefined ? { typeSort } : {}),
      ...(value !== undefined ? { value } : {}),
      axioms,
      usesSorry: o.usesSorry ?? axioms.includes('sorryAx'),
      ...(o.error !== undefined ? { error: o.error } : {}),
      ...(e.decl.docstring !== undefined ? { docstring: e.decl.docstring } : {}),
      refs: refsOf.get(e.name) ?? [],
      ...(o.parent !== undefined ? { parent: o.parent } : {}),
      ...((options.valueConsts === true || o.valueConsts !== undefined) && !o.noValueConsts && !probeFailed
        ? { valueConsts: o.valueConsts ?? [...new Set((refsOf.get(e.name) ?? []).map((r) => r.name).filter((n) => names.has(n) && n !== e.name))] }
        : {}),
      ...((options.typeConsts === true || o.typeConsts !== undefined) && !o.noTypeConsts && !probeFailed
        ? { typeConsts: o.typeConsts ?? (typeRefsOf.get(e.name) ?? []).filter((n) => names.has(n) && n !== e.name) }
        : {}),
    });
  }

  const facts: LeanFacts = {
    format: 'telelean-lean-facts',
    version: 1,
    toolchain: 'leanprover/lean4:v4.35.0',
    library,
    startedAt: '2026-11-01T02:00:00.000Z',
    finishedAt: '2026-11-01T02:00:01.200Z',
    status: options.status ?? (probeFailed ? 'check-errors' : 'ok'),
    build: { status: 'ok', durationMs: 1000, messages: options.messages ?? [], failedModules: Object.entries(states).filter(([, s]) => s === 'failed').map(([p]) => moduleOfPath(p) ?? p) },
    check: { status: 'ok', durationMs: 200, probed: decls.length },
    modules,
    decls,
    ...(probe !== undefined ? { probe } : {}),
  };
  const cause = probeFailure(facts);
  if (cause !== undefined && options.status === undefined) facts.detail = cause;
  return facts;
}
