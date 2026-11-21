/**
 * Spec v4 BD-3 (slice 1c, carry-over from 1b): the proposed graph keeps the current board's canvas positions, so the
 * Proposed canvas shows the existing cards where the Current one does; a card the proposal adds has no position (the
 * board places it). No Lean: the proposal is built from a check without facts (the syntactic board).
 */
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import type { LeanFacts, TlGraph } from '@telelean/core';

import type { CheckReport } from '../../src/gate/types.js';
import { createProposalService, type ProposalBuildInput } from '../../src/proposal/index.js';
import { currentLayoutOf } from '../../src/proposal/service.js';
import { MENTAL_MODEL, SCRATCH } from '../workspace/helpers.js';
import { boardOf, fakeDiff, fakeShadow, MAIN, SELECTION_ALL, shadowFilesOnDisk, USAGE } from './helpers.js';

const TARGET = 'cynder-not-good';
const AXIOM = 'pg-no-dark-past';
const NEW_CARD = 'claude-new-proposition';

function check(facts: LeanFacts | undefined): CheckReport {
  return { outcome: 'ok', g0: [], findings: [], diagnostics: [], ...(facts ? { facts } : {}), durationMs: 1 };
}

/** The base files with one new proposition (as a proposal would add it) at the end of the Spyro namespace. */
function withNewProposition(base: ReadonlyMap<string, string>): Map<string, string> {
  const out = new Map(base);
  const block = `/-\n@@ telelean v1\nid: ${NEW_CARD}\ntype: PROPOSITION\nnatural_name: A proposition the proposal adds\nasserted: 2026-11-19\n-/\n\n`;
  const main = base.get(MAIN) ?? '';
  expect(main).toContain('\nend Spyro');
  out.set(MAIN, main.replace(/\nend Spyro\s*$/, `\n${block}end Spyro\n`));
  return out;
}

describe('the proposed graph keeps the canvas positions (BD-3, slice 1c)', () => {
  it('currentLayoutOf: the column order and the stored positions of the current board', () => {
    const graph = {
      nodes: [
        { id: 'a1', type: 'AXIOM' },
        { id: 'p1', type: 'PROPOSITION' },
        { id: 'p2', type: 'PROPOSITION' },
      ],
      positions: { p1: { x: 10, y: -20.5 } },
    } as unknown as TlGraph;
    expect(currentLayoutOf(graph)).toEqual({ format: 'telelean-layout', version: 1, columns: { AXIOM: ['a1'], PROPOSITION: ['p1', 'p2'] }, positions: { p1: { x: 10, y: -20.5 } } });
    // No stored position: no `positions` key (as layout.json leaves it out).
    expect(currentLayoutOf({ ...graph, positions: undefined } as unknown as TlGraph)).not.toHaveProperty('positions');
  });

  it("build: existing propositions keep the current board's positions; a new card and an axiom have none", async () => {
    const base = shadowFilesOnDisk(MENTAL_MODEL);
    const shown = withNewProposition(base);
    const currentGraph: TlGraph = { ...boardOf(base), positions: { [TARGET]: { x: 40, y: 60 }, [AXIOM]: { x: 1, y: 2 } } };
    const input: ProposalBuildInput = {
      runId: 'r1',
      round: 1,
      proposalId: 'p1',
      selection: { ...SELECTION_ALL, premises: [...SELECTION_ALL.premises], adoptedGhosts: [] },
      shadow: fakeShadow({ runDir: path.join(SCRATCH, 'positions-run'), root: MENTAL_MODEL, base, current: shown }),
      check: check(undefined),
      rendered: [],
      currentGraph,
      verdict: 'not-proved',
      ghosts: [],
      gateAttempts: [],
      flaggedDefinitions: [],
      usage: USAGE,
      durationMs: 1,
      agentMs: 1,
      drift: [],
      graphVersion: 7,
    };
    const proposal = await createProposalService({ core: { diffGraphs: () => fakeDiff() } }).build(input);
    expect(proposal.graph.nodes.map((n) => n.id)).toEqual(expect.arrayContaining([TARGET, AXIOM, NEW_CARD]));
    // Positions are kept for the propositions the current board stores (an axiom's entry never reaches a graph).
    expect(proposal.graph.positions).toEqual({ [TARGET]: { x: 40, y: 60 } });
    // Without stored positions, the proposed graph has none either.
    const plain = await createProposalService({ core: { diffGraphs: () => fakeDiff() } }).build({ ...input, currentGraph: boardOf(base) });
    expect(plain.graph.positions).toBeUndefined();
  });
});
