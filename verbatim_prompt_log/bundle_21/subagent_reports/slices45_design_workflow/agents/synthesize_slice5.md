# synthesize:slice5

Agent `a331d24e7b8e41774` of workflow `wf_824d854d-064`. Verbatim output (JSON alongside).

I've written the slice-5 plan. It is 401 lines, against the ~500 allowed, and is the only file I created or changed. Nothing in the repo was touched; I ran no builds, tests or Lean.

Plan: /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/plans/slice5-plan.md

It has sections 0–9 like the slice 2 and 3 plans. I chose to build slice 5 after slice 4 (the logged ★D8/AP-2 order), so every place slice 5 changes in slice 4's code is marked (S4), and §2.6 lists the hooks slice 4 must leave.

**Sub-slices** (core ones run strictly one at a time):
- **5a (core):** the token grammar (`#[card:ID(:FIELD)]`, `#[lean:NAME(:FIELD)]`), the `ids.json` registry format, one id allocator, and F1: every board write also writes the missing `id:` lines of its subject. Also all texts, the stubs, and a temporary runner stopgap (`IDS_FROM_MODEL`) so add-node keeps working until 5b.
- **5b (runner, host):** the registry on disk. Ids are recorded before every write on telelean's common write path, at each session start, and at each in-session allocation (premises, add_card, slice 4's new cards). Opening a board writes nothing; an unreadable registry gives a TL203 warning.
- **5c1 (core):** resolving references to names, `TlNode.name`, rendering, docstring mirrors (`mirrorText`, `isMirrorOf`), checks on the person's references, `referencedBy`/`detachRefs`, two new diagnostics (TL124, TL125), and referenced vocabulary from other subjects shown in the band.
- **5c2 (core):** the gate rule that Claude never adds a reference, its tool checks, raw spans for text Claude must restore exactly, slice 4's TR-13 reference dependents, and names instead of raw tokens in person-facing core texts.
- **5d (core plus two runner files):** a frozen card's references hold their targets, through slice 3's `heldFields` hook. Held maps gain field keys, other subjects' references are held, and slice 4's revalue and cascade are extended.
- **5e (runner):** two choke points render every turn and tool result for Claude, plus the system-prompt line and the premise-Why check.
- **5f1 (webview):** the `#` dropdown (extending slice 4's sentence search), chips with reveal, the board's editors, Copy reference. May run beside 5e.
- **5f2 (webview, docs):** `#` in answers, Shaky notes, the premise Why and the transform window; names everywhere; held marks; the Delete dialog's list; the user guide.

**Decisions:**
- **D5-1:** slice 5 after slice 4 (AP-2's order), against the references design's recommendation.
- **D5-2:** the token grammar; Lean names containing whitespace, `:`, `[`, `]`, `«` or `»` can't be referenced.
- **D5-3:** slug ids are kept; never-reuse comes from a monotonic per-subject registry recorded at telelean's writes, session starts and allocations.
- **D5-4:** F1, every model-file plan writes its subject's missing `id:` lines.
- **D5-5:** editors show the stored form with a "Shows as:" preview; elsewhere a reference shows as a chip or label, one level deep.
- **D5-6:** card references stay within their subject and never point to the card itself; vocabulary from any subject can be referenced.
- **D5-7:** Claude's turns and tool results are rendered at two choke points, but the files Claude reads keep the stored form, and docstrings are never re-mirrored when another card's sentence changes. This narrows RF-2 (d).
- **D5-8:** Claude never adds, forges or moves a reference.
- **D5-9:** what a reference holds. A statement is held by meaning, without its docstring; Dependencies and proof references hold nothing. Holding is transitive. This narrows FZ-4.
- **D5-10:** references from other subjects hold this subject's vocabulary against Claude only.
- **D5-11:** `#` works in sentences, Whys, answers, notes and Instructions, but not in glosses, notes after `---` or Lean fields, and never names a transform's new cards.
- **D5-12:** a transform detaches references to a card it deletes (no per-card choice). Changed targets only get a warning; the board's Delete leaves "deleted card".
- **D5-13:** no board-wide find.
- **D5-14:** `#` opens the dropdown only at a word start, never on paste.
- **D5-15:** Copy reference copies the stored form, on both views, during sessions too.
- **D5-16:** RV-6 safety rule: chips show only names, and everything comes from what the person sees.
- **D5-17:** an unreadable `ids.json` blocks allocation and session starts, and is never overwritten.
- **D5-18:** accepted residuals (hand-written ids, a rolled-back registry, ids deleted before slice 5, stale docstrings).

**Unresolved:**
1. The slice-4 plan is being written in parallel. Someone must check that it keeps §2.6's hooks: single calls for id allocation, the mirror write and draft problems, a `reference` via in TR-13, exact ledger values for typed text, and string-keyed `revalued.held`. The alternative is to flip D5-1, in which case the (S4) lines move into slice 4's plan.
2. Names marked (S4) and the slice 2/3 file names follow the designs, not built code; builders map them and record it in §8.
3. Diagnostic numbers TL124, TL125 and TL203 need confirming at build time.
4. Whether VS Code's webview keeps `execCommand('insertText')` in its undo history; 5f1 checks this, with a fallback in the plan.
5. Slice 3's `heldFields` stub signature gets adapted in 5d.
