/**
 * D-6 ghost adoption ("I hold this", docs/m2-plan.md section 4.9): the new AXIOM card Claude suggested, written
 * by telelean right before the target's block, with exactly the statement text the ghost check elaborated, and its id
 * appended to the target's `premises:` (fixer round 1: the user adopted it for this target, so it joins the declared
 * selection, as "These suffice" declares the selected premises; otherwise the accepted proof shows TL107), replacing
 * the target's "follows from nothing" mark if it has one (spec v4 AR-5). The plan
 * re-parses what it would write and refuses unless the result is exactly the expected card, bound to the new
 * statement, the target declares it, and every other card's binding is unchanged.
 *
 * Slice 2 (docs/slice2-plan.md 3.8; 2b2): an accepted Add premise is written the same way, held as the person chose
 * (`holdAs`): as an axiom, an AXIOM card (the default, M2's adoption); as a proposition pending proof, a PROPOSITION
 * card with the same `axiom P.holds`, never green (A26). Any other choice is refused.
 */
import { ActionError, type FileChange } from '../actions.js';
import { holdsName } from '../facts.js';
import { DECL_KEYWORDS, MODIFIERS, isCommandWord } from '../markup/decls.js';
import { insertionEdit, setBlockFields } from '../markup/edits.js';
import { deriveId } from '../markup/ids.js';
import { lexLean } from '../markup/lexer.js';
import { parseLeanFile } from '../markup/parser.js';
import { renderBlock } from '../markup/serializer.js';
import { applyTextEdits } from '../markup/edits.js';
import { Lines } from '../markup/text.js';
import { escapeBodyText } from '../markup/values.js';
import type { ProjectModel } from '../project/types.js';
import { collapseWhitespace, ghostProblems, scanForbiddenText } from './g0.js';
import type { GhostAdoptionPlan, GhostAdoptionRequest } from './types.js';

/** Words that cannot name a declaration (Lean 4 keywords and command words). */
const KEYWORDS: ReadonlySet<string> = new Set([
  ...DECL_KEYWORDS,
  ...MODIFIERS,
  'fun',
  'let',
  'have',
  'show',
  'from',
  'suffices',
  'by',
  'do',
  'then',
  'else',
  'if',
  'match',
  'with',
  'at',
  'in',
  'where',
  'forall',
  'calc',
  'nomatch',
  'nofun',
  'return',
  'for',
  'unless',
  'mut',
  'try',
  'catch',
  'finally',
  'break',
  'continue',
  'this',
  'Type',
  'Sort',
  'Prop',
  'sorry',
  'admit',
  'deriving',
  'termination_by',
  'decreasing_by',
  'using',
  'obtain',
  'rfl',
]);

/** A plain, undotted ASCII identifier that is no keyword. */
function validName(name: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_']*$/.test(name) && !KEYWORDS.has(name) && !isCommandWord(name);
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SESSION = /^[A-Za-z0-9][A-Za-z0-9_.:+-]*$/;

export function adoptionPlan(model: ProjectModel, request: GhostAdoptionRequest): GhostAdoptionPlan {
  const holdAs: unknown = request.holdAs ?? 'axiom';
  if (holdAs !== 'axiom' && holdAs !== 'pending') {
    throw new ActionError('invalid', `A premise is held as an axiom or as a proposition pending proof, not ${JSON.stringify(holdAs)}.`);
  }
  const type = holdAs === 'pending' ? 'PROPOSITION' : 'AXIOM';
  const target = model.nodes.get(request.target);
  if (!target || target.node.subject !== request.subject) throw new ActionError('not-found', `No card "${request.target}" in the subject ${request.subject}.`);
  const statement = collapseWhitespace(request.leanStatement);
  const problems = ghostProblems(statement);
  if (problems.length > 0) throw new ActionError('invalid', `The suggested statement cannot be written safely: ${problems.join(' ')}`);
  const sentence = request.naturalName.trim();
  if (sentence === '' || /[\r\n]/.test(sentence)) throw new ActionError('invalid', 'The suggested sentence must be one non-empty line.');
  const rationale = request.rationale?.trim();
  if (rationale !== undefined && /[\r\n]/.test(rationale)) throw new ActionError('invalid', 'The reason must be one line.');
  if (!DATE.test(request.today)) throw new ActionError('invalid', `"${request.today}" is not a date (YYYY-MM-DD).`);
  if (!SESSION.test(request.session)) throw new ActionError('invalid', `"${request.session}" cannot be written as a session id.`);

  const path = target.file;
  const file = model.files.get(path);
  if (!file) throw new ActionError('not-found', `The target's file ${path} is not in the model.`);
  const namespace = target.block.namespace ?? [];
  const prefix = namespace.length > 0 ? `${namespace.join('.')}.` : '';

  // Names the project's code uses (a new declaration named like one would shadow it inside the namespace).
  const used = new Set<string>();
  for (const f of model.files.values()) {
    for (const token of lexLean(f.text).tokens) if (token.kind === 'ident') used.add(token.text.split('.')[0] ?? token.text);
  }
  const declared = (fq: string) => model.declFacts.has(fq) || [...model.files.values()].some((f) => f.decls.some((d) => d.fullName === fq));
  const taken = (name: string) => used.has(name) || declared(`${prefix}${name}`) || declared(`${prefix}${name}.holds`) || declared(name);
  let name: string;
  if (request.leanName !== undefined && validName(request.leanName) && !taken(request.leanName)) name = request.leanName;
  else {
    let base = deriveId(sentence, () => false).replace(/[-.]/g, '_');
    if (!/^[A-Za-z]/.test(base) || !validName(base)) base = `ghost_${base}`;
    name = base;
    for (let n = 2; taken(name); n++) name = `${base}_${n}`;
  }
  if (!validName(name)) throw new ActionError('invalid', `"${name}" is not a valid Lean name.`);

  const ids = new Set<string>(model.nodes.keys());
  for (const f of model.files.values()) for (const block of f.blocks) ids.add(block.id);
  const nodeId = deriveId(sentence, (id) => ids.has(id));
  const qualified = `${prefix}${name}`;

  const eol = file.eol;
  const blockText = renderBlock(
    {
      id: nodeId,
      type,
      naturalName: sentence,
      ...(rationale ? { rationale } : {}),
      asserted: request.today,
      lean: [qualified],
      extra: [
        ['origin', 'agent'],
        ['session', request.session],
        ['worded_by', 'agent'],
      ],
    },
    eol,
  );
  const code = [`/-- ${escapeBodyText(sentence)} -/`, `abbrev ${name} : Prop := ${statement}`, `axiom ${name}.holds : ${name}`].join(eol);
  const forbidden = scanForbiddenText(path, code, { library: model.library, subject: request.subject, projectModules: new Set() });
  if (forbidden.length > 0) throw new ActionError('invalid', `The suggested statement cannot be written: ${forbidden.map((f) => f.message).join(' ')}`);

  const lines = new Lines(file.text);
  const offset = lines.start(lines.lineOf(target.block.span.start));
  const premises = [...new Set([...(target.block.fields.premises ?? []), nodeId])];
  // Spec v4 AR-5 / B.3: a premise accepted into a card marked "follows from nothing" replaces the mark (telelean's
  // follow-on edit; G5 accepts exactly this removal on the target, docs/slice1-plan.md section 8).
  const dropsMark = target.block.lines.some((line) => line.key === 'follows_from');
  const declare = setBlockFields(file, { ...target.block, id: request.target }, [
    { key: 'premises', value: premises },
    ...(dropsMark ? [{ key: 'follows_from' as const, value: null }] : []),
  ]);
  const after = applyTextEdits(file.text, [insertionEdit(file.text, eol, offset, `${blockText}${eol}${code}`, lines), ...declare]);

  // The result must parse to exactly the new card, pinned to the new statement, with every other binding unchanged.
  const parsed = parseLeanFile(path, after);
  const added = parsed.blocks.filter((b) => b.id === nodeId);
  const block = added[0];
  const ok =
    added.length === 1 &&
    block !== undefined &&
    block.idWritten &&
    block.fields.type === type &&
    block.fields.naturalName === sentence &&
    block.fields.wordedBy === 'agent' &&
    block.fields.origin === 'agent' &&
    block.fields.session === request.session &&
    block.binding.mode === 'pinned' &&
    block.binding.statement === qualified &&
    parsed.decls.some((d) => d.fullName === qualified && d.keyword === 'abbrev') &&
    parsed.decls.some((d) => d.fullName === holdsName(qualified) && d.keyword === 'axiom') &&
    parsed.blocks.length === file.blocks.length + 1 &&
    JSON.stringify(parsed.blocks.find((b) => b !== block && b.id === request.target)?.fields.premises) === JSON.stringify(premises) &&
    !parsed.blocks.some((b) => b !== block && b.id === request.target && b.lines.some((line) => line.key === 'follows_from')) &&
    file.blocks.every((b) => {
      const now = parsed.blocks.find((x) => x.id === b.id && x !== block);
      return now !== undefined && now.binding.mode === b.binding.mode && now.binding.statement === b.binding.statement;
    });
  if (!ok) throw new ActionError('unsafe', `telelean could not insert the suggested axiom into ${path} without changing other cards; nothing was written.`);
  const change: FileChange = { path, before: file.text, after };
  return { changes: [change], nodeId, leanName: qualified };
}
