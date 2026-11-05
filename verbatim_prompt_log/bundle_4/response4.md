A shadow is **Claude's private working copy of your model files**. It first appears in the **M2** row of 03 §11 ("Shadow + Claude + fake backend"), not M1. M1 has no AI, so it edits your files directly with Undo. The details are in 03 §8.4.

**Why it exists.** When you press **These suffice**, Claude needs to edit and build Lean files, possibly many times over. If it did that in your real folder, a half-finished or failed attempt would leave your files broken. So telelean copies the model into the shadow, Claude works only there, and your real files stay untouched until you press **Accept**.

**What it is concretely:**
- **Location:** a fresh folder per run in the extension's private storage (`~/.config/Code/User/globalStorage/<ext>/runs/<id>/ws`). The last 10 runs are kept.
- **Contents:** only the `*.lean` files, the lakefile, the toolchain file and the Lake manifest. Symlinks are refused when the copy is made. Your compiled `.lake/build` is copied too, so builds stay fast, but only the sandboxed Lean process can see it.
- **A private git repository** inside the shadow, with a base commit. That makes it easy to produce the diff you review, and to merge if you edit your real files during the run.
- **Confinement:** the file guard only lets Claude's file tools touch paths inside the shadow.

**How a run uses it:**
1. Copy your model into a fresh shadow.
2. Claude formalises and proves there, building inside the sandbox.
3. The non-LLM gate checks run on the shadow.
4. If they fail, Claude retries in the shadow. After 3 failures, the shadow is reset to its last passing state; that is the "revert" from your gate-loop note.
5. If they pass, telelean shows the diff between the shadow and your files, overlaid on the board. **Accept** applies it to your real files; **Discard** throws the shadow away.

**Status:** M0 built a prototype of the copy step (`packages/runner/src/lean/shadow.ts`). M0 also showed that Grep and Glob search hidden folders, so the M2 shadow will hold only model files for Claude. `.lake/` and `.telelean/` will be visible only inside the Lean sandbox.

The file you have open is an older copy of 03 that a reviewer saved during last turn's review. The current version is `bundle_1/user_requested_documents/03_architecture.md`, though its shadow description says the same.
