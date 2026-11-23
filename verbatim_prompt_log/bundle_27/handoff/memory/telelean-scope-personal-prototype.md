---
name: telelean-scope-personal-prototype
description: "telelean is a personal-use prototype — keep proof-integrity checks, but don't let security hardening drive scope; explain relevance of any safety work in plain terms"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 03a29d54-7342-40e3-b5f0-2697a62c93ef
  modified: 2026-10-31T20:14:57.737Z
---

The user is building telelean as a **prototype for personal use**. On 2026-11-01 they asked, mid-turn: "what exploits are you talking about? … I'm trying to create a prototype for personal use, so let me know to what extent this is relevant". They asked this after my design and review rounds had grown heavy on adversarial-security detail: sandbox socket isolation, symlink escapes, universe-polymorphism smuggling, nested-comparator sandboxing.

**Why:** Exhaustive adversarial hardening made the design long and hard to approve, and delayed a usable tool. The user's priority is to start using it soon.

**How to apply:**
- Keep only what makes the tool's core claim true, plus cheap safety. Core claim: "proved" means proved from exactly the selected assumptions. That needs the `#print axioms` / `collectAxioms` footprint check, no `sorry`, the goal statement unchanged, and new definitions surfaced for review. Cheap safety: the agent has no shell and works on a copy, diffs are reviewed before applying, Lean builds run under a memory cap (their RAM-crash history), and telelean is opt-in per folder.
- Treat deeper hardening as an optional later milestone: realpath/symlink guards, bwrap allowlists and socket isolation, G5 immutability, model finder, exploit fixture suites.
- When safety work comes up, explain in plain terms what it protects against and whether it matters for a single trusted user.

Related: [[telelean-project]], [[watch-ram-usage]].
