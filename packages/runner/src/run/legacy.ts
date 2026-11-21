/**
 * Old runs (docs/slice2-plan.md 3.11, D2-16, AF12): a run of version 1 (M2's, slice 1's) left in review is converted
 * into an edit session with one passed step when it is recovered:
 *   - its selection becomes the inference (the question: the selected arrows' sources, or the "follows from nothing"
 *     mark when there are none);
 *   - the ledger is written from the v1 run: `created` for every declaration new since B (`statements` when the v1
 *     freeze commit has it, `proof` otherwise), and `premise` (with `mark-removed` when the adoption removed the
 *     target's mark) for its adopted ghosts;
 *   - its pending ghosts become Add premise drafts (the first judge checks them again, which gives them their facts);
 *   - an adopted ghost ("I hold this") becomes an Add premise item that is already written: its draft rebuilt from the
 *     v1 ghost, its `card` set by every judge-apply from its ledger `premise` entry (fixer 2d r1, A-F2: never from
 *     memory, so a reload during the first judge keeps it), its key the written item's. It stays in review, accepted
 *     only as an axiom, and writes nothing again;
 *   - a fresh judge runs (the caller), so the facts gain `typeConsts`, and everything else is in review at stage 1. Its
 *     proposal is not used again.
 */
import { premiseKey, type LedgerEntry, type PremiseDraft } from '@telelean/core';

import type { ShadowWorkspace } from '../shadow/types.js';
import { declarationNames, filesModel } from './session.js';
import { PERSISTED_SESSION_FORMAT, type PersistedRun, type PersistedSession, type PersistedStep } from './types.js';

export async function legacySession(p: PersistedRun, shadow: ShadowWorkspace): Promise<{ session: PersistedSession }> {
  const library = p.library;
  let commits = await shadow.commits();
  const base = commits.find((c) => c.kind === 'base');
  let head = commits.at(-1);
  if (base === undefined || head === undefined) throw new Error('the run has no base commit');
  // The v1 proposal is the head's files; anything in ws/ beyond them (a crash mid-round) goes.
  if ((await shadow.changes(head.id)).length > 0) {
    await shadow.revertTo(head.id, 'Converted to an edit session: back to the proposal', p.view.round);
    commits = await shadow.commits();
    head = commits.at(-1) ?? head;
  }
  const baseModel = filesModel(await shadow.filesAt(base.id), library);
  const headModel = filesModel(await shadow.filesAt(head.id), library);
  const sel = p.selection;
  const target = sel.target;
  const sources = [...new Set(sel.premises)];
  const freeze = p.freezes.at(-1);
  const freezeNames = freeze !== undefined ? declarationNames(filesModel(await shadow.filesAt(freeze.commit.id), library)) : undefined;
  const baseNames = declarationNames(baseModel);
  const adopted = p.ghosts.filter((g) => g.state === 'adopted' && g.nodeId !== undefined);
  const adoptedCards = new Set(adopted.map((g) => g.nodeId as string));

  const ledger: LedgerEntry[] = [];
  for (const name of [...declarationNames(headModel)].sort()) {
    if (baseNames.has(name)) continue;
    // A written premise's card owns its own declarations (§4.2): no `created` entry for them.
    const owner = headModel.ownerOfDecl.get(name);
    if (owner !== undefined && adoptedCards.has(owner)) continue;
    ledger.push({ kind: 'created', name, step: 's1', phase: freezeNames?.has(name) === true ? 'statements' : 'proof' });
  }
  const premises: PremiseDraft[] = [];
  const adoptCommits = commits.filter((c) => c.kind === 'adopt');
  const markedInB = baseModel.nodes.get(target)?.node.fromNothing === true;
  const markedNow = headModel.nodes.get(target)?.node.fromNothing === true;
  for (const g of p.ghosts) {
    if (g.state === 'rejected') continue;
    premises.push({
      target,
      step: 's1',
      naturalName: g.naturalName,
      leanName: g.leanName,
      leanStatement: g.leanStatement,
      explicit: '',
      whyNeeded: g.whyNeeded,
      proof: g.proof,
      footprint: [...g.footprint],
      aloneEntails: g.aloneEntails,
      facts: {},
    });
    if (g.state !== 'adopted' || g.nodeId === undefined) continue;
    const item = premiseKey(target, g.leanName);
    const commit = adoptCommits.find((c) => c.label.includes(g.naturalName.slice(0, 40)))?.id ?? adoptCommits.at(-1)?.id ?? head.id;
    ledger.push({ kind: 'premise', card: g.nodeId, target, holdAs: 'axiom', item, commit });
    if (markedInB && !markedNow && !ledger.some((e) => e.kind === 'mark-removed' && e.card === target)) ledger.push({ kind: 'mark-removed', card: target, item, commit });
  }

  const question = { sources, fromNothing: sources.length === 0 };
  const step: PersistedStep = {
    id: 's1',
    kind: 'formalize',
    target,
    stage: 1,
    scope: { step: 's1', target, question, fuzzyStatements: [], openProof: true, openArrows: !question.fromNothing, openItems: [] },
    state: 'passed',
    queue: 1,
    round: p.view.round,
    startCommit: base.id,
    ...(freeze !== undefined ? { freezeCommit: freeze.commit.id } : {}),
    endCommit: head.id,
    freezes: [...p.freezes],
    gateAttempts: [...p.gateAttempts],
    ...(p.lastFinish !== undefined ? { lastFinish: p.lastFinish } : {}),
    counters: { ...p.view.counters },
    agentMs: p.clocks.totalAgentMs,
  };
  const session: PersistedSession = {
    format: PERSISTED_SESSION_FORMAT,
    version: 1,
    stage: 0,
    phase: 'step',
    inferences: [{ target, question, order: 0, steps: ['s1'] }],
    steps: [step],
    queue: [],
    retry: [],
    items: [],
    nextAction: 1,
    premises,
    ledger,
    rejectedArrows: [],
    stack: { done: [], undone: [] },
    head: head.id,
    events: [],
    viewVersion: 1,
  };
  return { session };
}
