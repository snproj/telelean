The next step is finishing M2: the items you paused. I project **about 2.5–4 hours if nothing breaks, and 4–7 hours if the real-Claude walkthrough exposes a bug**. These projections are based on how long similar steps actually took in this project.

| # | Sub-step | Projection |
|---|---|---|
| 1 | Run the two paused script tests (they can only reach a fake `claude`) | ~5 min |
| 2 | Preflight against your updated Claude Code: it is now 2.1.319/2.1.322, while M0 verified flags and event formats on 2.1.314. Dry run, binary check, re-run the CLI-backend tests | ~10 min, **+30–60 min** if an update changed a flag or event format |
| 3 | Announce the quota use, then the live walkthrough's normative reading (expected: proved, then G→D) | ~10–20 min |
| 4 | The literal reading (expected: not proved, ghost, adopt, re-freeze, proved) | ~10–20 min |
| 5 | Only if a reading fails: read the transcript, at most one retry per reading. If it's a real bug, a fix and re-verify round | +20–40 min; a bug **+1–3 h** |
| 6 | Write up the walkthrough results and update the user guide and report | ~20–30 min |
| 7 | The modifications audit for turn 9. It is much bigger than turn 2's (about 54 agents and 8,100 tool calls, against 26 agents then), which took about 1 h | ~1.5–2.5 h |
| 8 | Logs | ~15 min |

Two notes:
- **Ultracode is now off,** so by default I'd do the audit with two or three subagents rather than a workflow. It takes about the same time. Say "use a workflow" if you want the previous setup.
- **If by "next step" you mean closing the four theory gaps** from the report's §3.7, that needs a few decisions from you first. For example: forbid new instances before the freeze, or compare fully elaborated terms? And should your proofs be protected always, or only after the freeze? After that, roughly 3–6 hours to build and verify.
