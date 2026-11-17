Four agents are running, all part of one workflow. **Nothing is using your Claude quota**: no telelean run is active. The one process my search matched was the search command itself. There are also no Lean builds or test VS Code instances; RAM shows 58 GB available.

| Agent | What it's doing | Writes to |
|---|---|---|
| **audit: turn 9, part 1** | Reads the transcripts of turn 9's main session and the three M1 workflows, and lists every command that wrote, deleted, installed or touched the network | scratch notes only |
| **audit: turn 9, part 2** | The same for the M2 workflows and the report workflow | scratch notes only |
| **audit: turns 10–15** | The same for the main session since Nov 10, the demo-readiness workflow, the 4 live Claude sessions (checking that Claude's own tool calls stayed inside its run copies) and the turn-15 subagents | scratch notes only |
| **docs: finish** | Completes the interrupted docs update: `m2-live-report.md`, `project-report.md`, `project-report-files.md`, `user-guide.md`, `decisions-log.md`, `m2-plan.md` §12 | `docs/` only |

**Still queued:**
- **docs: check** starts when the docs agent finishes: an independent fact-check of those docs against the code, fixing inaccuracies.
- **reconcile** starts when the three audit slices finish: it merges them with the completed disk-view audit into one document with undo commands.

All agents are barred from touching your git index or working tree via git, from pushing, from network use and from running Claude.
