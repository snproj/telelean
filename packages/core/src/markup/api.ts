/**
 * WP-markup public functions (docs/m1-plan.md section 9, WP1). The signatures and documented behaviour are FROZEN;
 * the implementations live in the modules below and `markup/index.ts` exports every name through this file.
 *
 *  - `lexer.ts`: `lexLean` (Lean 4.35 comments, literals, identifiers);
 *  - `text.ts`: `lineIndex` (offsets <-> LSP positions);
 *  - `parser.ts`: `parseLeanFile` (blocks, diagnostics, declarations via `decls.ts`, imports, binding);
 *  - `values.ts`: `parseFieldValue`, `escapeJsonValue`, `formatFieldValue`, `escapeBodyText`;
 *  - `serializer.ts`: `renderBlock`;
 *  - `ids.ts`: `ID_PATTERN`, `deriveId`;
 *  - `edits.ts`: `applyTextEdits`, `setBlockField`, `setBlockFields` (additive, several fields at once),
 *    `removeBlockEdits`, `insertBlockEdits`;
 *  - `leanOps.ts`: `applyLeanOps`;
 *  - `names.ts`: `findDecl`, `relativeName`.
 */
export { lexLean } from './lexer.js';
export { lineIndex } from './text.js';
export { parseLeanFile } from './parser.js';
export { escapeBodyText, escapeJsonValue, formatFieldValue, parseFieldValue } from './values.js';
export { renderBlock } from './serializer.js';
export { deriveId, ID_PATTERN } from './ids.js';
export { applyTextEdits, insertBlockEdits, removeBlockEdits, setBlockField, setBlockFields, type BlockFieldChange } from './edits.js';
export { applyLeanOps } from './leanOps.js';
export { findDecl, relativeName } from './names.js';
