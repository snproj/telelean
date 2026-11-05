Very little, and nothing system-wide. Everything that needed sudo or a big download is already in place: Node, the VS Code test build, xvfb, and your Lean, bubblewrap, git and Chrome.

What I expect, all already on the approved list in 03 §12:
- **M1, small repo-local npm packages:**
  - `ajv`, to check `graph.json` against its schema;
  - possibly the lint trio, `eslint`, `@eslint/js` and `typescript-eslint`.

  They go into `telelean/node_modules`, a few MB, through the same pinned `npm install` as before.
- **M2, a build, not a download:** `telelean-extract`, the small Lean program that reads proof facts and closure hashes out of your compiled Lean. It's compiled from our own source with your existing Lean 4.35 into the extension's storage, about 231 MB of build output. It needs no Lean packages from the internet and no Mathlib.
- **Not needed for M1/M2:**
  - Shiki, the Lean syntax highlighter, is M4 polish; until then the expanded Lean is plain text;
  - `@vscode/vsce`, for VSIX packaging, is optional and M4;
  - the Claude Agent SDK was dropped;
  - D-33's history uses your existing git.

There is one possible automatic download. If VS Code updates itself past 1.140, the test runner may fetch a matching test build, about 350 MB, into `packages/extension/.vscode-test`. Otherwise I can keep it pinned to the one already downloaded.

Either way, I'll tell you before installing or downloading anything and add it to the running list. If something outside the approved list turns out to be necessary, I'll stop and ask first.
