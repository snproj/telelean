# fix:r2

Agent `af3b8dd18c5b15082` of workflow `wf_16a1ea15-88d`. Verbatim output (JSON alongside).

All three findings are correct, and all three are fixed. I checked each claim against the code first. I ran no build, test or Lean job, made no git change and used no network.

Files edited:
- /home/zhengyew/telelean/docs/slice2-plan.md: exact-string Edits only, re-reading each region first. The file went from 3192 to 3207 lines, all of them mine, so no builder appended during my edits. In §8 I touched nothing but my one appended entry.
- /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/plans/slice3-plan.md

In the text I call the re-raised finding "AP30-1 r2" to tell it apart from the first AP30-1.

**AP30-1 (major): fixed in both plans, with one adaptation.**
- Checked: in runner `gate/engine.ts`, `runCheck` returns on G0 findings before it syncs the mirror (lines 412–416). In `run/manager.ts`, `buildProposal` renders only when `g0` is empty. Slice 2's 2b3b text did not fix this order for the session path.
- Slice 2 changes:
  - §1.1 2b3b's G0 bullet is rewritten. G0 runs first, before any Lean job, at every purpose. When it finds anything, nothing is synced, built, checked, probed, rendered or challenged.
    - At step purposes and in the ghost check: G0's findings as `problems`, counted, with no judgement.
    - `judge` and `finalCheck`: a judgement of the files without facts, so it has the `facts` problem, with G0's findings in `global` and `ok` false.
    - `writePremise` and `complete`: `{ ok: false }` with G0's first message.
  - §1.1 2b2 line updated.
  - §2.1: the probe-file paragraph and "No Claude code runs at import" now state this order. The list rule now reads "in `@[…]` and in `attribute […] x` alike: first in the list, or after a comma, `scoped` or `local`".
  - §2.9: the `SessionCheckContext` doc and a comment over the engine's methods.
  - §6.1 2b2: adds `attribute [simp, init] x`, `attribute [local init] x` and `attribute [builtin_init] x`.
  - §6.1 2b3b: a new G0-first test. ws/ holds `@[init] def x : IO Unit := pure ()` at check, freeze, gate-proved, gate-not-proved, the ghost check, judge, finalCheck, writePremise and complete. Spies on `refreshFacts`, `renderStatements` and `syncMirror` must never be called.
  - D2-75 updated, and a new §8 entry.
- Adaptation: the finding had `writePremise` and `complete` "judge the files without facts". Their failure reports carry no judgement, and step 4 must never read a partial one (AP30-4). So they judge nothing. They fail as a premise write whose probe failed does, and as a completion that does not pass (§3.8), with G0's message.
- Concurrency rule: I did not edit builder 2b1b's G0 entry or the S-F6 hand-off in §8, because those lines are not mine. My §8 entry and the 2b3b bullet say they are superseded on the order.
- Slice 3 changes:
  - §2.1 "The meaning walk rides…" and D3-52 cite 2b3b's order.
  - Cheat 24's `@[init]` variant now also runs in 3d through the runner (§6.2 and §6.1 3d). A FakeBackend step that writes it gets G0's finding, the real engine runs on a fake `refreshFacts` spy, and no Lean job runs and nothing is synced.
  - A §8 line.

**AP30-7 (minor): fixed by the finding's smallest fix (state the condition, log the residual).**
- Checked:
  - Core `gate/g0.ts` judges imports only in Claude's lines, and its denylist has no `command_elab` or `register_*`.
  - Runner `semantic/project.ts` keeps the person's header imports.
  - No Lean file in the repo imports Lean or Std, and telelean itself only ever writes imports of the project's own modules.
- Slice 2 changes:
  - §2.1: a condition in the probe-file paragraph, and a new bullet after "No Claude code runs at import".
  - D2-75: the condition, the logged residual, and the way to close it: `checkBase` refusing a B that imports a module outside the project, with the finding's notice.
  - The plain-words line of §7.4's AP entry, and §8.
- Slice 3 changes: §2.1 "The meaning walk rides…" and D3-52 state the condition, plus a §8 line.
- Not closed: refusing such a B would refuse every Formalize on a model that imports Lean. That narrows what the product accepts, so it is named in D2-75 and left to the integrator.

**AP30-8 (minor): fixed, in slice 3 only.**
- Checked: `checkBaseNow` refuses whenever ws/ differs from the base commit (lines 501–510), and `syncMirror()` in `shadow/workspace.ts` always copies ws/.
- Slice 3 changes:
  - §1.1 3p has a new bullet for a base-commit mode, `checkBase(ctx, { mode: 'base-commit' })`, in `gate/engine.ts` and `gate/types.ts`, with `syncMirror(files?)` in `shadow/types.ts` and `shadow/workspace.ts`. In this mode `checkBase`:
    - syncs the mirror from `filesAt(baseCommit)`, with no working-copy refusal;
    - builds, probes and writes base-facts.json for that commit;
    - drops the clean-mirror cache, so the next judge syncs ws/ and builds the head.
    A start keeps slice 2's mode.
  - Used by and cited in: 3p's `gate/engine.ts` bullet, §2.1 Base facts, §5.2 The upgrade and §1.1 3d's upgrade bullet. These say ws/ is "in general not B", since it can equal B.
  - Tests in 3p: a fake `refreshFacts` that reads the mirror, with a real shadow. A stage whose head differs from B gets base-facts.json with B's keys and the `meaning` marker, and the next judge builds the head. A start whose working copy differs from B is still refused.
  - Tests in 3d: the upgrade mid-step and in confirming stores B's facts.
  - A §8 line.
- Slice 2: no change, because slice 2 runs `checkBase` only at a start, where ws/ is B. Its §8 entry says so.
