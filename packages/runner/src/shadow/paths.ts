/**
 * Which paths belong in a run's shadow (docs/m2-plan.md section 4.2, D-24): the model files `<library>.lean` and
 * `<library>/**.lean`, and the project files at the root. Paths are root-relative POSIX; none may be absolute, contain
 * `..` or `.` segments, empty segments, backslashes or control characters, or have a segment starting with a dot.
 */
import { isValidModuleName } from '../lean/leanNames.js';
import { PROJECT_CONFIG_FILES } from '../lean/shadow.js';

export { PROJECT_CONFIG_FILES };

const CONTROL = /[\u0000-\u001f\u007f]/u;

/** A root-relative POSIX path with no dot-segment, no empty segment, no backslash and no control character. */
export function isSafeRelativePath(p: string): boolean {
  if (typeof p !== 'string' || p === '' || p.length > 4096 || p.startsWith('/') || p.includes('\\') || CONTROL.test(p)) return false;
  return p.split('/').every((segment) => segment !== '' && !segment.startsWith('.'));
}

/** A Lean model file of the library: `<library>.lean` or `<library>/…/<name>.lean`. */
export function isLeanModelPath(p: string, library: string): boolean {
  if (!isSafeRelativePath(p) || !p.endsWith('.lean')) return false;
  if (p === `${library}.lean`) return true;
  return p.startsWith(`${library}/`) && p.length > library.length + 1 + '.lean'.length;
}

/** A path that may enter the shadow and the build mirror: a Lean model file or a project file at the root. */
export function isModelPath(p: string, library: string): boolean {
  return isLeanModelPath(p, library) || PROJECT_CONFIG_FILES.includes(p);
}

/** The module name of a Lean model file (`Model/Spyro/Main.lean` -> `Model.Spyro.Main`), or undefined. */
export function moduleNameOf(p: string, library: string): string | undefined {
  if (!isLeanModelPath(p, library)) return undefined;
  const name = p.slice(0, -'.lean'.length).split('/').join('.');
  return isValidModuleName(name) ? name : undefined;
}
