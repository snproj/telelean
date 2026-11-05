/** Name helpers of the markup API (moved verbatim from `api.ts`; behaviour unchanged). */
import type { ParsedFile } from './types.js';

/** The declaration with this fully-qualified name, if the file declares it. */
export function findDecl(file: ParsedFile, fullName: string): ParsedFile['decls'][number] | undefined {
  return file.decls.find((d) => d.fullName === fullName);
}

/** How to write `fullName` inside `namespace` (outermost first): the shortest suffix that resolves to it there. */
export function relativeName(fullName: string, namespace: readonly string[]): string {
  for (let i = namespace.length; i > 0; i--) {
    const prefix = `${namespace.slice(0, i).join('.')}.`;
    if (fullName.startsWith(prefix) && fullName.length > prefix.length) return fullName.slice(prefix.length);
  }
  return fullName;
}
