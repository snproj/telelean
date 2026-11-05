// Injected into every CommonJS bundle of the extension (esbuild `inject`, scripts/esbuild-options.mjs), which defines
// `import.meta.url` as this value: the bundle's own file URL. The runner's llm/ modules and its path-guard module read
// `import.meta.url` (the guard's default path, the guard module's "am I the entry point?" check); in CommonJS esbuild
// would otherwise leave it undefined, and `new URL(relative, undefined)` throws (docs/m2-plan.md section 8.4, risk R2).
// The extension never relies on that default: it always passes the guard script's path (dist/bin/) explicitly.
import { pathToFileURL } from 'node:url';

export const teleleanImportMetaUrl = pathToFileURL(__filename).href;
