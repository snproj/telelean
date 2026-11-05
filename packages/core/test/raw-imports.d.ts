// Vite/vitest `?raw` imports, so core tests can read fixture files as strings, e.g.
//   import mainLean from '../../../../test-fixtures/spyro/Model/Spyro/Main.lean?raw';
//   import factsJson from '../fixtures/project/spyro-facts.json?raw';   // then JSON.parse(factsJson)
// Core is typechecked with `types: []` on purpose (no Node or DOM APIs may leak into src), so tests cannot use
// `node:fs`; vitest resolves `?raw` itself (verified on vitest 5.0.5, 2026-11-01). Shared by every core work package.
declare module '*?raw' {
  const text: string;
  export default text;
}
