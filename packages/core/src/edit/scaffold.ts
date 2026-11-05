/**
 * The files of a new subject (docs/m1-plan.md section 7.1). Moved here unchanged from edit/index.ts (which re-exports
 * it) so the planner can use it without a circular import; contracts.test.ts guards the exact texts.
 */
import { ActionError } from '../actions.js';
import { isSubjectName, subjectModulePath, subjectRootFile } from '../paths.js';

/**
 * The files of a new subject, with the exact texts of docs/m1-plan.md section 7.1: `<library>/<S>.lean` (imports
 * Vocabulary, Inbox, Main), `<library>/<S>/Vocabulary.lean`, `Inbox.lean` (imports Vocabulary) and `Main.lean`
 * (imports Vocabulary and Inbox), each module a `namespace <S> … end <S>` with a one-line comment saying what
 * belongs there. Shared by `create-subject` (WP-model) and Initialize (WP-workspace) so both write identical text.
 * Does not touch `<library>.lean` or sidecars. Implemented with the contract (verified to build on Lean 4.35).
 * Throws ActionError `invalid` for a name that is not a subject name.
 */
export function subjectScaffold(subject: string, library: string): Array<{ path: string; text: string }> {
  if (!isSubjectName(subject)) throw new ActionError('invalid', `"${subject}" is not a subject name: use a capitalised Lean identifier (letters, digits, "_").`);
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(library)) throw new ActionError('invalid', `"${library}" is not a library name.`);
  const module = (name: string) => `${library}.${subject}.${name}`;
  return [
    {
      path: subjectRootFile(subject, library),
      text: `import ${module('Vocabulary')}\nimport ${module('Inbox')}\nimport ${module('Main')}\n`,
    },
    {
      path: subjectModulePath(subject, 'Vocabulary', library),
      text: `-- Vocabulary of ${subject}: types, predicates and constants (the board lists them in its Vocabulary group).\nnamespace ${subject}\n\nend ${subject}\n`,
    },
    {
      path: subjectModulePath(subject, 'Inbox', library),
      text: `import ${module('Vocabulary')}\n\n-- New cards typed on the telelean board are added here.\nnamespace ${subject}\n\nend ${subject}\n`,
    },
    {
      path: subjectModulePath(subject, 'Main', library),
      text: `import ${module('Vocabulary')}\nimport ${module('Inbox')}\n\n-- Formalised cards: a statement \`abbrev n : Prop := …\` and its \`n.holds\`.\nnamespace ${subject}\n\nend ${subject}\n`,
    },
  ];
}
