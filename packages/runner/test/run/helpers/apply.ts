/**
 * Slice 2f: driving an edit session to its end as a person would on the board, for the end-to-end tests with real Lean
 * (walkthrough, fresh models, the integrator's flows): every item accepted in the list's order (each its own Accept,
 * an Add premise with how it is held and its Why), the results shown on the way (accepting the statements shows them),
 * Submit review, the end confirmation's final check, Apply with its check id.
 */
import { expect } from 'vitest';

import type { ActionOutcome, SessionView } from '@telelean/core';

import type { RunManager } from '../../../src/run/index.js';

/** Until the session's view is a stage with nothing judging (or the time runs out). */
export async function settledView(manager: RunManager, timeoutMs = 600_000): Promise<SessionView> {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const v = manager.session();
    if (v !== null && !v.judging && v.phase === 'stage') return v;
    if (Date.now() > until) throw new Error(`the session did not settle: ${JSON.stringify({ phase: v?.phase, judging: v?.judging })}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

/**
 * Accepts every item in review whose own Accept is open, one at a time in the list's order (dependencies come first),
 * until none is left; Add premise items as `premise` says. Fails, naming them, when items stay in review.
 */
export async function acceptEverything(manager: RunManager, runId: string, premise: { holdAs: 'axiom' | 'pending'; rationale?: string } = { holdAs: 'axiom' }): Promise<SessionView> {
  for (let k = 0; k < 200; k++) {
    const v = await settledView(manager);
    const next = v.items.find((i) => i.status === 'in-review' && i.accept.ok);
    if (next === undefined) {
      const left = v.items.filter((i) => i.status === 'in-review' || i.status === null);
      expect(left.map((i) => [i.label, i.accept]), 'items left in review').toEqual([]);
      return v;
    }
    const extra = next.kind === 'add-premise' ? { holdAs: premise.holdAs, ...(premise.rationale !== undefined ? { rationale: premise.rationale } : {}) } : {};
    const outcome = await manager.decide(runId, v.stage, true, [{ item: next.id, rev: next.rev, to: 'accepted', ...extra }], true);
    expect(outcome, `accepting ${next.label}: ${JSON.stringify(outcome)}`).toMatchObject({ ok: true });
  }
  throw new Error('too many items to accept');
}

/** Submit review on a stage with every item decided: the end confirmation, until its final check ends. */
export async function confirm(manager: RunManager, runId: string, timeoutMs = 600_000): Promise<NonNullable<SessionView['confirmation']>> {
  const v = await settledView(manager);
  const submitted = await manager.submit(runId, v.stage);
  expect(submitted, JSON.stringify(submitted)).toMatchObject({ ok: true });
  const until = Date.now() + timeoutMs;
  for (;;) {
    const c = manager.session()?.confirmation;
    if (c !== undefined && c.check.state !== 'running' && manager.session()?.judging === false) return c;
    if (Date.now() > until) throw new Error(`the final check did not end: ${JSON.stringify(c?.check)}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

/** Every item accepted, Submit review, the final check passed, Apply: the session's outcome (the run ends `accepted`). */
export async function applyEverything(manager: RunManager, runId: string, premise?: { holdAs: 'axiom' | 'pending'; rationale?: string }): Promise<ActionOutcome> {
  await acceptEverything(manager, runId, premise);
  const c = await confirm(manager, runId);
  expect(c.check, JSON.stringify(c.check.failures)).toMatchObject({ state: 'passed', failures: [] });
  const stage = manager.session()?.stage ?? 0;
  return manager.end(runId, 'apply', stage, c.check.id);
}
