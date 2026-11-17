The audit is stopped and saved, and only the two docs agents are running.

**What I did:**
- **Stopped the whole audit workflow.** Its agents can't be stopped individually. If only the audit agents had stopped, the queued reconcile step would still have started and spent quota.
- **Relaunched only docs: finish → docs: check.** The docs agent's earlier edits are on disk, so the new one continues from them.
- **Continuation instructions** are in `verbatim_prompt_log/CONTINUE_AUDIT.md`: what's done, what remains, the exact script holding the agents' prompts, the expected cost (4 agents, about 1–1.5 h), the facts already established, and your rules. A note in my memory points to it, and a future session will run it only when you ask.
- **The audit agents' partial notes** are copied to `bundle_18/evidence/` (19 MB), since `/tmp` is wiped at reboot.

**How important are the two docs agents? Not important for functionality.** The code, tests, extension and `docs/DEMO.md` are already finished and accurate; these agents only edit files in `docs/`.
- **What they add:** the write-up of the live results (`docs/m2-live-report.md`, mostly written already). They also bring the reference docs up to date with the Nov 10 changes. `project-report.md` still says the real-Claude walkthrough hasn't run, and it doesn't describe that day's gate and system-prompt fixes, e.g. Lean's unlisted declarations and Accept's handling of cards you add during a run.
- **When it matters:** if you plan to review the Lean system from Part 3 of the report, since the gate changed slightly. If not, they can wait.
- **Rough cost:** two agents, probably 0.5–1M subagent tokens, finishing in 30–60 minutes.

If you'd rather save that quota too, say so and I'll stop them. The docs would then be left part-edited and would need a review before you rely on them.
