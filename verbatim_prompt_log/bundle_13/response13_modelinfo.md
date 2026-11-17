# Model / session metadata for response13 (turn 13)

- **Model:** Opus 5.5 (`claude-opus-5-5`); session `03a29d54-…` resumed on 2026-11-10 (PST); Ultracode on.
- **The user's instruction this turn:** skip logging, write-ups and the audit until the demo was done. This bundle was therefore written in turn 15 from the session transcript.
- **Workflow:** `wf_8e6791a7-556` (demo readiness): 4 agents (fresh-model, snap-vscode, demo-driver, integrate), 620 tool uses, ≈ 1.79 M subagent tokens, ≈ 1.9 h. Reports are in `subagent_reports/demo_readiness_workflow/`.
- **Real Claude used by telelean** (all on Opus 5.5 at effort high, through the user's Claude Code 2.1.322; announced to the user before each run):

  | Run | Requests | CLI cost estimate | Wall time |
  |---|---|---|---|
  | Walkthrough, normative | 8 | $0.18 | 46 s |
  | Walkthrough, literal | 11 | $0.16 | 61 s |
  | Live demo, Socrates | 6 | $0.14 | ~52 s |
  | Live demo, penguin (in turn 14) | 10 | $0.14 | ~76 s |
- **Evidence:** Claude Code's own transcripts of these sessions are copied to `evidence/live_claude_sessions/`, with the user's email address redacted. The driver's summary files and screenshots were in `/tmp` and were lost in a reboot on 2026-11-12. Their key numbers are in the interim replies.
