/**
 * Writing Lean names into generated Lean source safely.
 *
 * Generated files (footprint checks, comparator challenges) splice declaration names into Lean code,
 * so names are validated and written with `«»` escapes where needed: a name can never inject a
 * command, and a component that happens to be a keyword still parses as a name.
 */

const PLAIN_SEGMENT = /^[A-Za-z_][A-Za-z0-9_'!?]*$/;
// No control characters, no guillemets (they delimit escaped components), no whitespace.
const FORBIDDEN = /[\u0000-\u001f\u007f-\u009f«»\s]/u;

/** A dotted declaration name such as `Spyro.cynder_not_good.holds`. Components may not contain dots. */
export function isValidDeclName(name: string): boolean {
  if (name.length === 0 || name.length > 1024 || FORBIDDEN.test(name)) return false;
  return name.split('.').every((segment) => segment.length > 0);
}

/** A module name whose components are plain identifiers, e.g. `Model.TeleleanChallenge`. */
export function isValidModuleName(name: string): boolean {
  return name.length > 0 && name.length <= 512 && name.split('.').every((segment) => PLAIN_SEGMENT.test(segment));
}

export function assertDeclName(name: string): void {
  if (!isValidDeclName(name)) throw new TypeError(`not a usable Lean declaration name: ${JSON.stringify(name)}`);
}

export function assertModuleName(name: string): void {
  if (!isValidModuleName(name)) throw new TypeError(`not a usable Lean module name: ${JSON.stringify(name)}`);
}

/**
 * Lean source text for a declaration name. Components that are not plain identifiers are escaped as
 * `«…»`; a single-component name is always escaped, so a keyword such as `end` still reads as a name.
 */
export function formatDeclName(name: string): string {
  assertDeclName(name);
  const segments = name.split('.');
  return segments.map((s) => (segments.length > 1 && PLAIN_SEGMENT.test(s) ? s : `«${s}»`)).join('.');
}

/** The source path of a module relative to the package root: `Model.Spyro.Main` -> `Model/Spyro/Main.lean`. */
export function modulePath(moduleName: string): string {
  assertModuleName(moduleName);
  return `${moduleName.split('.').join('/')}.lean`;
}
