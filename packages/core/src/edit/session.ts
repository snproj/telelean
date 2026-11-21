/**
 * An editing session over the model's files (pure): it applies WP-markup's text primitives one step at a time,
 * re-parsing a file before the next step, and yields whole-file FileChanges at the end. Blocks of the original parse
 * are found again after earlier edits by mapping their start offset through the applied edits, so a plan may edit
 * several blocks (or a block and the declarations next to it) without the edits overlapping.
 *
 * Lean operations whose spans come from the facts (D-11 rewrite) must run before any other edit of their file: the
 * planners always apply Lean operations first.
 */
import { ActionError, type FileChange } from '../actions.js';
import { holdsName } from '../facts.js';
import type { ArchivedDecl, InsertWhere, KnownFieldKey, LeanOp, MarkupBlock, ParsedFile, TextEdit } from '../markup/types.js';
import { applyLeanOps, applyTextEdits, findDecl, insertBlockEdits, parseLeanFile, removeBlockEdits, setBlockField } from '../markup/api.js';
import { LIST_FIELD_KEYS } from '../markup/values.js';
import { LineMap } from '../project/text.js';
import type { ProjectModel } from '../project/types.js';

interface FileState {
  before: string | null;
  text: string | null;
  parsed?: ParsedFile;
  /** Edit batches applied since the model's parse (offset mapping); undefined once the file was (re)created. */
  batches: TextEdit[][] | undefined;
}

/** `import <module>` added after the last import line of `text` (or first, when there is none); undefined if present. */
export function importEdit(text: string, module: string, eol: '\n' | '\r\n'): TextEdit | undefined {
  const linePattern = /^import\s+(\S+)\s*$/;
  let offset = 0;
  let lastImportEnd = -1;
  for (const raw of text.split('\n')) {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    const match = linePattern.exec(line);
    if (match) {
      if (match[1] === module) return undefined;
      lastImportEnd = offset + line.length;
    } else if (line.trim() !== '' && !line.trimStart().startsWith('--')) {
      break;
    }
    offset += raw.length + 1;
  }
  if (lastImportEnd >= 0) return { span: { start: lastImportEnd, end: lastImportEnd }, newText: `${eol}import ${module}` };
  return { span: { start: 0, end: 0 }, newText: `import ${module}${eol}` };
}

export class EditSession {
  private readonly states = new Map<string, FileState>();
  /** Blocks of the model's parse that this session removes (their binding may go). */
  private readonly removed = new Set<MarkupBlock>();
  /**
   * Slice 2 (2b2, planItemRevert): blocks of the model's parse whose binding a plan changes on purpose, with the
   * statement each must end bound to (undefined: none, code-less).
   */
  private readonly expected = new Map<MarkupBlock, string | undefined>();

  constructor(private readonly model: ProjectModel) {}

  private state(path: string): FileState {
    let state = this.states.get(path);
    if (!state) {
      const file = this.model.files.get(path);
      state = file ? { before: file.text, text: file.text, parsed: file, batches: [] } : { before: null, text: null, batches: undefined };
      this.states.set(path, state);
    }
    return state;
  }

  exists(path: string): boolean {
    return this.state(path).text !== null;
  }

  text(path: string): string | null {
    return this.state(path).text;
  }

  parsed(path: string): ParsedFile {
    const state = this.state(path);
    if (state.text === null) throw new ActionError('internal', `${path} does not exist.`);
    if (!state.parsed) state.parsed = parseLeanFile(path, state.text);
    return state.parsed;
  }

  /** Creates a file that does not exist yet. */
  create(path: string, text: string): void {
    const state = this.state(path);
    if (state.text !== null) throw new ActionError('invalid', `${path} exists already.`);
    state.text = text;
    delete state.parsed;
    state.batches = undefined;
  }

  apply(path: string, edits: readonly TextEdit[]): void {
    if (edits.length === 0) return;
    const state = this.state(path);
    if (state.text === null) throw new ActionError('internal', `${path} does not exist.`);
    state.text = applyTextEdits(state.text, edits);
    delete state.parsed;
    state.batches?.push([...edits]);
  }

  /** Where an offset of the model's parse of `path` is now; undefined when an edit replaced it. */
  mapOffset(path: string, offset: number): number | undefined {
    const state = this.state(path);
    if (!state.batches) return undefined;
    let current = offset;
    for (const batch of state.batches) {
      let delta = 0;
      for (const edit of batch) {
        if (edit.span.end <= current) delta += edit.newText.length - (edit.span.end - edit.span.start);
        else if (edit.span.start <= current) return undefined;
      }
      current += delta;
    }
    return current;
  }

  /** The current parse of a block of the model. */
  block(path: string, original: MarkupBlock): MarkupBlock {
    const offset = this.mapOffset(path, original.span.start);
    const found = offset === undefined ? undefined : this.parsed(path).blocks.find((b) => b.span.start === offset);
    if (!found) throw new ActionError('unsafe', `The card's block in ${path} could not be found again after the other edits of this action.`);
    return found;
  }

  /**
   * setBlockField on a block of the model; `nodeId` is the workspace id (written back when the block's id is derived).
   * Removing a field that the block repeats (TL005: only the first line counts) is refused: removing every line would
   * delete text the board never showed, removing the first would silently promote the hidden one.
   */
  setField(path: string, original: MarkupBlock, nodeId: string, key: KnownFieldKey, value: string | readonly string[] | null): void {
    const current = this.block(path, original);
    const lines = current.lines.filter((line) => line.key === key);
    if (value === null && lines.length > 1 && !LIST_FIELD_KEYS.has(key)) {
      const parsed = this.parsed(path);
      const at = (offset: number) => parsed.text.slice(0, offset).split('\n').length;
      throw new ActionError(
        'unsafe',
        `The card's block has ${lines.length} \`${key}:\` lines (${path}, lines ${lines.map((l) => at(l.span.start)).join(' and ')}; only the first counts): remove the extra one by hand first.`,
      );
    }
    this.apply(path, setBlockField(this.parsed(path), { ...current, id: nodeId }, key, value));
  }

  /**
   * Slice 2 (2b2, planItemRevert: a card's statement taken out goes back to B's): `original`, a block of the model,
   * must end bound to `statement`, or to nothing (`undefined`: a blank line then keeps it code-less when a declaration
   * ends up directly below it), instead of keeping the binding it has in the model. Any other binding is refused.
   */
  expectBinding(original: MarkupBlock, statement: string | undefined): void {
    this.expected.set(original, statement);
  }

  removeBlock(path: string, original: MarkupBlock): void {
    const current = this.block(path, original);
    this.removed.add(original);
    this.apply(path, removeBlockEdits(this.parsed(path), current));
  }

  insertBlock(path: string, blockText: string, where: InsertWhere): void {
    this.apply(path, insertBlockEdits(this.parsed(path), blockText, where));
  }

  /**
   * Applies Lean operations to one file (all or nothing); refuses with `unsafe` when WP-markup reports problems, or
   * when the file is freshly checked and Lean's range of a declaration to remove or replace reaches beyond the
   * span telelean would cut (the text reading and Lean disagree about where it ends).
   */
  leanOps(path: string, ops: readonly LeanOp[]): ArchivedDecl[] {
    if (ops.length === 0) return [];
    this.checkSpansAgainstLean(path, ops);
    const result = applyLeanOps(this.parsed(path), ops);
    if (result.problems.length > 0) throw new ActionError('unsafe', result.problems.join(' '));
    this.apply(path, result.edits);
    return result.archived;
  }

  /** Lean's full range (fresh facts) of each declaration an op removes or replaces must lie inside its syntactic span. */
  private checkSpansAgainstLean(path: string, ops: readonly LeanOp[]): void {
    const state = this.state(path);
    if (state.batches === undefined || state.batches.length > 0 || !this.model.freshFiles.has(path)) return;
    const parsed = this.parsed(path);
    let map: LineMap | undefined;
    for (const op of ops) {
      const name =
        op.op === 'remove-decl' || op.op === 'replace-decl' ? op.name : op.op === 'remove-holds' || op.op === 'holds-theorem-to-axiom' ? holdsName(op.statement) : undefined;
      if (name === undefined) continue;
      const decl = findDecl(parsed, name);
      const facts = this.model.declFacts.get(name);
      if (!decl || !facts || facts.file !== path) continue;
      map ??= new LineMap(parsed.text);
      const leanEnd = map.offsetAt(facts.range.end);
      if (leanEnd > decl.span.end) {
        const ours = map.positionAt(decl.span.end).line + 1;
        throw new ActionError(
          'unsafe',
          `${name} ends on line ${facts.range.end.line + 1} of ${path} for Lean, but telelean reads it as ending on line ${ours}: edit it by hand.`,
        );
      }
    }
  }

  /** Adds `import <module>` to `path` (creating the file with just that line when it does not exist). */
  addImport(path: string, module: string): void {
    if (!this.exists(path)) {
      this.create(path, `import ${module}\n`);
      return;
    }
    const text = this.text(path) ?? '';
    const edit = importEdit(text, module, text.includes('\r\n') ? '\r\n' : '\n');
    if (edit) this.apply(path, [edit]);
  }

  /**
   * Keeps every other card's binding: a code-less block that the edits left directly above a declaration (e.g. the
   * block below it was deleted, or the declarations after it were) gets a blank line after it, so it does not
   * silently bind to that declaration; any other change of another block's statement is refused.
   */
  private keepOtherBindings(): void {
    for (const [path, state] of this.states) {
      const original = this.model.files.get(path);
      if (!original || state.text === null || state.text === state.before || state.batches === undefined) continue;
      for (let pass = 0; pass <= original.blocks.length; pass++) {
        const now = this.parsed(path);
        const byStart = new Map(now.blocks.map((b) => [b.span.start, b]));
        let separated = false;
        for (const block of original.blocks) {
          if (this.removed.has(block)) continue;
          const offset = this.mapOffset(path, block.span.start);
          const current = offset === undefined ? undefined : byStart.get(offset);
          if (!current) continue;
          // A binding a plan changes on purpose (2b2) is held to the one it must end with.
          const expected = this.expected.has(block);
          const before = (expected ? this.expected.get(block) : block.binding.statement) ?? '';
          const codeLess = expected ? this.expected.get(block) === undefined : block.binding.mode === 'none';
          const after = current.binding.statement ?? '';
          if (before === after) continue;
          if (codeLess && current.binding.mode === 'adjacent') {
            // A blank line after the block's last line keeps it code-less.
            const newline = now.text.indexOf('\n', current.span.end);
            if (newline < 0) continue;
            const at = newline > 0 && now.text.charCodeAt(newline - 1) === 0x0d ? newline - 1 : newline;
            this.apply(path, [{ span: { start: at, end: at }, newText: now.eol }]);
            separated = true;
            break;
          }
          throw new ActionError(
            'unsafe',
            `This edit would change what the card "${current.id}" is bound to (${before || 'nothing'} → ${after || 'nothing'}): edit ${path} by hand.`,
          );
        }
        if (!separated) break;
      }
    }
  }

  /** The whole-file changes so far (files whose text changed), by path. */
  changes(): FileChange[] {
    this.keepOtherBindings();
    const out: FileChange[] = [];
    for (const [path, state] of this.states) if (state.text !== state.before) out.push({ path, before: state.before, after: state.text });
    return out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  }
}
