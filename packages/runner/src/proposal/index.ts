/**
 * WP4: proposals, Accept and the run sidecars (docs/m2-plan.md sections 4.5 and 7; contracts in ./types.ts).
 * Signatures and documented behaviour are FROZEN; the implementations live next to this file:
 *
 *   service.ts       ProposalService (build, baseDrift, planAccept, apply, diffFiles)
 *   files.ts         file maps, line counts, the no-fuzz 3-way merge of one file, the conflict sentence
 *   sidecarStore.ts  RunSidecarStore (attempts.jsonl append-only, decisions.json atomic replace)
 */
import { DiskSidecarStore } from './sidecarStore.js';
import { ProposalServiceImpl } from './service.js';
import type { ProposalCore, ProposalService, RunSidecarStore, SidecarCore } from './types.js';

export * from './types.js';
export { MERGE_CONTEXT_LINES } from './files.js';
export { PROPOSAL_FACTS_FILE, PROVED_GOAL_REASON } from './service.js';

/** `core`: test hook replacing some of the core functions the service calls (reviewer addition). */
export function createProposalService(options: { now?: () => Date; core?: Partial<ProposalCore> } = {}): ProposalService {
  return new ProposalServiceImpl(options);
}

/**
 * The disk-backed sidecar store (attempts.jsonl append-only, decisions.json atomic replace). `core`: test hook
 * replacing some of the core codecs (reviewer addition).
 */
export function createRunSidecarStore(options: { core?: Partial<SidecarCore> } = {}): RunSidecarStore {
  return new DiskSidecarStore(options);
}
