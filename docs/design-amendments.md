# Design amendments (turn 2, 2026-11-01)

These amend `verbatim_prompt_log/bundle_1/user_requested_documents/02_design_decisions.md` and `03_architecture.md`, and take precedence where they conflict. The ★ recommendations were approved with the notes below.

## A1 · D-23(a): Claude is driven through your installed Claude Code CLI (the learnharness pattern), behind an LLM-agnostic interface

**What telelean does.** It starts `claude -p --input-format stream-json --output-format stream-json …` in a copy of your model files ("the shadow"). The flags allow:
- the file tools (Read/Glob/Grep/Edit/Write) and telelean's own tools, and nothing else: no shell, no web;
- none of your Claude Code settings, hooks or CLAUDE.md;
- no API-key or cloud-provider environment variables, so you are never billed per token by accident.

**Where telelean's tools live.** Tools such as `ask_user`, `check_lean` and `finish` are served over a local **MCP** server. MCP (Model Context Protocol) is the standard way to give an agent tools, and most agent CLIs support it.

**What makes it LLM-agnostic.** Telelean's own logic sees only an `LlmBackend` interface: start, send, events, interrupt, resume. Supporting another LLM means writing one adapter. For an agent CLI that speaks MCP, the adapter is its flags plus parsing its event stream; an API-key provider is a further option. Telelean never handles anyone's login or keys.

**Which binary.** By default, the Claude Code that ships with your VS Code Claude extension, found automatically. A setting can override it.

**Dropped:** the Claude Agent SDK dependency (proprietary licence, plus its own ~330 MB binary).

**Traded away:**
- *Then:* in-process hooks and typed events. *Now:* a command hook, plus parsing the CLI's JSON event stream.
- *Then:* resilience to CLI updates. *Now:* the event stream is more fragile across updates, so a minimum-version check and a recorded stream in the tests catch breakage.

**Your reading of the policy is correct, with two nuances.** This is not legal advice.
1. **The CLI pattern doesn't "offer claude.ai login".** Each user signs in to their own, unmodified Claude Code, which is the case Anthropic's legal page explicitly allows.
2. **The Consumer Terms' clause on "automated or non-human means" still governs subscription use.** You start every run and it waits on your answers, which keeps it ordinary individual use. If you share telelean, the clean route is to point users at an API key or another provider.

## A2 · The gate loop (your proposal, adopted)

1. Claude says it is finished.
2. Telelean runs **non-LLM checks** on Claude's working copy. Each must hold:
   - the files build in the sandbox;
   - `#print axioms` lists only your selected assumptions, plus the "X exists" presuppositions of the things they mention;
   - there is no `sorry`;
   - the goal statement is identical to the one frozen before proving (via `lake comparator`);
   - there are no forbidden commands (`#eval` etc.);
   - your natural-language text is untouched.
3. **On failure** the board shows a small notice. For example: *"Attempt 1 didn't pass: it used `foo`, which you didn't select. Asking Claude to retry."* Claude is re-prompted automatically with the exact failure.
4. **After 3 failed attempts**, a setting you can change, the board tells you what kept failing. It then **reverts the working copy to the last state that passed**. The attempt is kept in the history.

Your real files are never touched until you press Accept, so "revert" only ever applies to Claude's copy.

**What is a question for you, not a retry.** These need your judgement, which a program can't supply:
- a new definition or vocabulary item (yes/no);
- a proposed missing premise (a ghost node: "I hold this" / "no");
- whether the Lean says what your sentence says (the meaning review).

**The honest limit.** The checks guarantee that the goal follows from the selected assumptions *as formalised*. Whether the formalisation matches your meaning is what the review step (and M3's faithfulness tools) is for.

## A3 · D-33: history dropdown with revert and a storage counter

**Storage.** Every change telelean writes is first snapshotted as a private git ref in the model folder (`refs/telelean/…`); your branches are never touched. Git stores files compressed and deduplicated, so a snapshot costs only what changed, typically a few KB.

**The dropdown** (board header):
- Each entry shows time · action · one-line summary, e.g. *"These suffice → proved cynder-not-good"*.
- Selecting an entry previews that state read-only, with its diff.
- **Revert to this** first snapshots the current state, so a revert can itself be undone.

**The counter** shows disk use per subject and in total. It measures **disk, not RAM**: snapshots sit on disk and add nothing to memory pressure. A "keep the last N" pruning option is included.

**When:** M1, together with the board's first writes.

## A4 · D-10: several subjects per project

D-10 is attempted in M1: one module subtree and namespace per subject, plus a subject picker. If it proves complex, M1 ships one subject first. Comparing models, your two-person "convince someone" setting, is deferred and may need its own analyses.

## A5 · D-31, D-32

- **D-31:** headless extension tests use `xvfb-run`.
- **D-32:** dropped. `mental_model/` is the sample model workspace.

## A6 · M0 contents (replaces the M0 row of 03 §11 / D-29)

M0 is three spikes, each independently verified:
1. Sandboxed Lean runs (memory cap + bwrap), with `lake comparator` running under them.
2. The Claude CLI harness, built offline: provider interface, flags, environment sanitising, MCP tool server, file-confinement hook, a fake backend for tests.
3. The board prototype in a real VS Code webview.

After those, one small real-Claude smoke test, announced to you before it runs. It covers your login, a long blocking question, file confinement, and resuming after a reload.

"Spike" is agile jargon for a short, time-boxed experiment that answers one technical question ("does X actually work here?") before anything is built on it. The "1–2 days" was a human-developer estimate and shouldn't have been there. For me it means hours.

## A7 · Your `~/telelean_scripts` commands map onto board actions (no decision needed)

| Your sketch | telelean |
|---|---|
| `\|- "goal"` | add a GOAL node |
| `self_evident ?-` | **These suffice** with an empty selection (the tray allows 0 premises; G6 flags "self-evident") |
| `add "…"` | add an ASSUMPTION node |
| `from [h1, h2] ?-` | select h1, h2 and the target, then **These suffice** |
| the other person's `no` | Lean + Claude answer *proved* / *not proved*, with the missing premise (M2) or a countermodel (M3). With two people's models (A4, later), the other person's model would answer |

Optional idea for M1: telelean could also append each board action to a plain-text log in exactly this style. That gives a replayable transcript and feeds the meta-analyses you mentioned.

## A8 · Facts learned in M0

The section "Design changes learned in M0" of `docs/m0-report.md` amends 03 §7 (colour ids, message delivery), §8.2 (CLI flags, MCP `alwaysLoad`/timeouts, the `initialize` account check, the hook-listing check, the minimum CLI version 2.1.295, environment stripping), §8.4 (keeper + `setpriv`, `OOMPolicy=stop`, `exit-code` as the start signal, toolchain-first PATH) and §8.5 G4 (comparator message wording). M1 applies them.
