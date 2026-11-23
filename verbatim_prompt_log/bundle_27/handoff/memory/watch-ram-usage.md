---
name: watch-ram-usage
description: "User's machine has crashed from RAM exhaustion in past Claude sessions — monitor system memory and keep heavy parallel work bounded"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 03a29d54-7342-40e3-b5f0-2697a62c93ef
  modified: 2026-10-31T17:32:16.851Z
---

Keep track of system RAM usage so the machine doesn't crash; the user reports this has happened in other sessions (a spectec session ended with VS Code crashing and a reboot). Machine: 64 GB RAM, 8 GB swap, 14 cores, with the user's browser/Discord/Telegram/Lean servers typically using ~25 GB.

**Why:** A crash loses the user's work and the session's progress; the user explicitly asked for this on 2026-11-01.

**How to apply:**
- When starting fan-out work (workflows, many agents, builds), arm a Monitor that polls `/proc/meminfo` MemAvailable and reports threshold crossings (used: warn < 12 GB, critical < 4 GB); re-arm when it expires (30 min max).
- Only ever auto-kill processes I started (e.g. those whose cwd is in my scratchpad), never the user's apps or their Lean servers.
- Keep concurrency moderate; avoid building Mathlib from source or running several `lake build`s / VS Code test instances / Playwright browsers at once; prefer `lake exe cache get` if Mathlib is ever needed; cap Lean threads (`lean -j`/`LEAN_NUM_THREADS`) for parallel builds.
- Check `free -m` before launching anything heavy.
Related: [[telelean-project]].
