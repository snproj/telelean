/**
 * Path conventions of a model folder (03 section 4 scaffold, D-10 subjects, D-12 sidecars), as pure string helpers.
 * Every path is POSIX and relative to the model root (the folder that holds `.telelean/` and the lakefile).
 *
 * FROZEN CONTRACT (M1, docs/m1-plan.md section 7). Implemented here by the architect; owned by WP-model afterwards.
 *
 *   lakefile.toml · lean-toolchain · lake-manifest.json · .gitignore
 *   Model.lean                         library root: imports every subject root (maintained by telelean)
 *   Model/<S>.lean                     subject root: imports the subject's modules
 *   Model/<S>/{Vocabulary,Inbox,Main}.lean        `namespace <S>`
 *   .telelean/config.json              opt-in marker + project settings
 *   .telelean/graph.json               export for scripts (gitignored)
 *   .telelean/subjects/<S>/layout.json column order (committed)
 *   .telelean/subjects/<S>/attic/<id>.lean        archived proofs (committed)
 *   .telelean/subjects/<S>/endorsements.json      endorsed definitions (slice 2, D2-18)
 */
import { sha256Hex } from './review/hash.js';

export const TELELEAN_DIR = '.telelean';
export const CONFIG_PATH = '.telelean/config.json';
export const GRAPH_JSON_PATH = '.telelean/graph.json';
export const DEFAULT_LIBRARY = 'Model';
export const PINNED_TOOLCHAIN_NAME = 'leanprover/lean4:v4.35.0';

/** The modules of a scaffolded subject, in import order. */
export const SUBJECT_MODULES = ['Vocabulary', 'Inbox', 'Main'] as const;
export type SubjectModule = (typeof SUBJECT_MODULES)[number];

/** A subject name is a Lean identifier usable as a module component and a namespace (capitalised by convention). */
export const SUBJECT_NAME_PATTERN = /^[A-Z][A-Za-z0-9_]{0,63}$/;

export function isSubjectName(name: string): boolean {
  return SUBJECT_NAME_PATTERN.test(name);
}

/** `.telelean/config.json`. */
export interface ProjectConfig {
  format: 'telelean-config';
  version: 1;
  /** The Lake library that holds the subjects (default `Model`). */
  library: string;
}

export function defaultProjectConfig(): ProjectConfig {
  return { format: 'telelean-config', version: 1, library: DEFAULT_LIBRARY };
}

/** Parses `.telelean/config.json` leniently: unknown keys are ignored, a bad library name falls back to the default. */
export function parseProjectConfig(json: string): ProjectConfig {
  try {
    const raw = JSON.parse(json) as Record<string, unknown>;
    const library = typeof raw['library'] === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(raw['library']) ? raw['library'] : DEFAULT_LIBRARY;
    return { format: 'telelean-config', version: 1, library };
  } catch {
    return defaultProjectConfig();
  }
}

export function serializeProjectConfig(config: ProjectConfig): string {
  return `${JSON.stringify({ format: config.format, version: config.version, library: config.library }, null, 2)}\n`;
}

export function libraryRootFile(library: string = DEFAULT_LIBRARY): string {
  return `${library}.lean`;
}

export function subjectDir(subject: string, library: string = DEFAULT_LIBRARY): string {
  return `${library}/${subject}`;
}

export function subjectRootFile(subject: string, library: string = DEFAULT_LIBRARY): string {
  return `${library}/${subject}.lean`;
}

export function subjectModulePath(subject: string, module: SubjectModule, library: string = DEFAULT_LIBRARY): string {
  return `${library}/${subject}/${module}.lean`;
}

/** New code-less nodes go to the subject's Inbox (D-11). */
export function inboxPath(subject: string, library: string = DEFAULT_LIBRARY): string {
  return subjectModulePath(subject, 'Inbox', library);
}

export function subjectSidecarDir(subject: string): string {
  return `${TELELEAN_DIR}/subjects/${subject}`;
}

export function layoutPath(subject: string): string {
  return `${subjectSidecarDir(subject)}/layout.json`;
}

export function atticPath(subject: string, nodeId: string): string {
  return `${subjectSidecarDir(subject)}/attic/${nodeId}.lean`;
}

/**
 * M2 (D-18): every "These suffice" round of the subject, one JSON object per line (`AttemptLine`, core run.ts).
 * Append-only, written directly by the runner (not through the EditApplier, never undone, not in history snapshots:
 * `isSubjectSidecarFile` keeps covering only layout.json and attic/), committed with the user's own commits (D-12).
 */
export function attemptsPath(subject: string): string {
  return `${subjectSidecarDir(subject)}/attempts.jsonl`;
}

/**
 * M2 (D-20): the subject's recorded answers to Claude's questions (`DecisionsFile`, core run.ts). Written directly by
 * the runner when the user answers (atomic replace inside `.telelean/`), not undone, not in history snapshots.
 */
export function decisionsPath(subject: string): string {
  return `${subjectSidecarDir(subject)}/decisions.json`;
}

/**
 * Slice 2 (docs/slice2-plan.md 2.6, D2-18, EN-3; 2c1): the definitions and presuppositions the person endorsed at an
 * Apply (`EndorsementsFile`). Apply writes it inside its history entry, so Undo of the Apply removes the endorsements
 * (2f); the runner's ModelWorkspace reads it and passes its `endorsed` to `buildProjectModel`, which drops
 * `definitional-choice` from a definition whose name and text hash it holds.
 */
export function endorsementsPath(subject: string): string {
  return `${subjectSidecarDir(subject)}/endorsements.json`;
}

/** One endorsed declaration (D2-18): its fully-qualified name and `endorsementHash` of its text, from the run that endorsed it. */
export interface Endorsement {
  name: string;
  textHash: string;
  /** The session's run id. */
  run: string;
  /** ISO date of the Apply. */
  date: string;
}

/** `.telelean/subjects/<S>/endorsements.json` (docs/slice2-plan.md 2.6). */
export interface EndorsementsFile {
  format: 'telelean-endorsements';
  version: 1;
  endorsed: Endorsement[];
}

/**
 * The one hash an endorsement records (2f writes it) and the build compares (2c1): SHA-256 (hex) of the declaration's
 * source text as core's scanner spans it (its docstring and attributes included, no comment line around it: `VocabItem.code`,
 * the gate's `DeclEntry.text`), with every whitespace run collapsed to one space and the ends trimmed, as content keys
 * compare texts (§4.3). So a re-indented or re-wrapped definition stays endorsed, and any other edit flags it again.
 */
export function endorsementHash(text: string): string {
  return sha256Hex(text.replace(/\s+/g, ' ').trim());
}

/**
 * Reads `endorsements.json` leniently (a hand-edited sidecar must not break the board): another format or version, or
 * text that is no JSON, gives no endorsement, and an entry without a string `name` and `textHash` is dropped (its `run`
 * and `date` default to ''). Fails closed: what it cannot read endorses nothing, so the flag stays.
 */
export function parseEndorsements(json: string): EndorsementsFile {
  const empty: EndorsementsFile = { format: 'telelean-endorsements', version: 1, endorsed: [] };
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return empty;
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return empty;
  const file = raw as Record<string, unknown>;
  if (file['format'] !== 'telelean-endorsements' || file['version'] !== 1 || !Array.isArray(file['endorsed'])) return empty;
  const endorsed: Endorsement[] = [];
  for (const entry of file['endorsed'] as unknown[]) {
    if (typeof entry !== 'object' || entry === null) continue;
    const e = entry as Record<string, unknown>;
    if (typeof e['name'] !== 'string' || e['name'] === '' || typeof e['textHash'] !== 'string' || e['textHash'] === '') continue;
    endorsed.push({ name: e['name'], textHash: e['textHash'], run: typeof e['run'] === 'string' ? e['run'] : '', date: typeof e['date'] === 'string' ? e['date'] : '' });
  }
  return { ...empty, endorsed };
}

/** `endorsements.json` as Apply writes it: two-space JSON, the entries sorted by name then hash, a final newline. */
export function serializeEndorsements(file: EndorsementsFile): string {
  const endorsed = [...file.endorsed]
    .map((e) => ({ name: e.name, textHash: e.textHash, run: e.run, date: e.date }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.textHash < b.textHash ? -1 : a.textHash > b.textHash ? 1 : 0));
  return `${JSON.stringify({ format: 'telelean-endorsements', version: 1, endorsed }, null, 2)}\n`;
}

/** `Model/Spyro/Main.lean` -> `Model.Spyro.Main`; undefined for non-Lean paths. */
export function moduleOfPath(path: string): string | undefined {
  if (!path.endsWith('.lean') || path.startsWith('/') || path.split('/').some((s) => s === '' || s === '.' || s === '..')) return undefined;
  return path.slice(0, -'.lean'.length).split('/').join('.');
}

/** `Model.Spyro.Main` -> `Model/Spyro/Main.lean`. */
export function pathOfModule(module: string): string {
  return `${module.split('.').join('/')}.lean`;
}

/**
 * The subject a model file belongs to: `Model/<S>.lean` and `Model/<S>/**.lean` belong to `<S>`; anything else
 * (the library root, files outside the library) belongs to no subject.
 */
export function subjectOfPath(path: string, library: string = DEFAULT_LIBRARY): string | undefined {
  const parts = path.split('/');
  if (parts[0] !== library || parts.length < 2) return undefined;
  if (parts.length === 2) {
    const file = parts[1] ?? '';
    return file.endsWith('.lean') ? file.slice(0, -'.lean'.length) || undefined : undefined;
  }
  return parts[1] || undefined;
}

/**
 * The files a subject's history snapshots cover (D-33, docs/m1-plan.md section 8): its subject root, its module
 * directory, and its sidecar directory. Returned as prefixes; a path is in scope if it equals a file entry or starts
 * with a directory entry (those end with `/`).
 */
export function subjectSnapshotScope(subject: string, library: string = DEFAULT_LIBRARY): string[] {
  return [subjectRootFile(subject, library), `${subjectDir(subject, library)}/`, `${subjectSidecarDir(subject)}/`];
}

/** Project-level files covered by the project history chain (`refs/telelean/<rootKey>/project`, docs/m1-plan.md section 8). */
export function projectSnapshotScope(library: string = DEFAULT_LIBRARY): string[] {
  return [libraryRootFile(library), 'lakefile.toml', 'lean-toolchain', 'lake-manifest.json', '.gitignore', CONFIG_PATH];
}

export function inScope(path: string, scope: readonly string[]): boolean {
  return scope.some((entry) => (entry.endsWith('/') ? path.startsWith(entry) : path === entry));
}
