// An AgentToolHost for M0 spikes and tests: ask_user really blocks until answered; the Lean
// tools return stub results; finish runs a pluggable gate with the re-prompt cap of amendment 2.
// M1/M2 replace the stubs with the shadow workspace, sandboxed Lean and the real gate, keeping
// this interface.

import { randomUUID } from 'node:crypto';
import type {
  Adoption,
  AgentToolHost,
  AgentToolName,
  Answers,
  ArrowProposal,
  AskUserArgs,
  CheckLeanArgs,
  CheckResult,
  FinishArgs,
  FreezeResult,
  FreezeStatementsArgs,
  GateFailure,
  GateVerdict,
  ProposeArrowArgs,
  ProposeAssumptionArgs,
  ToolCallContext,
} from './types.js';

export const DEFAULT_GATE_ATTEMPTS = 3;

/** The verdict for one finish call: accept, retry (failures go back to the agent) or give up. */
export function makeGateVerdict(
  failures: GateFailure[],
  attempt: number,
  maxAttempts = DEFAULT_GATE_ATTEMPTS,
  flaggedDefinitions: string[] = [],
): GateVerdict {
  const passed = failures.length === 0;
  return {
    passed,
    failures,
    flaggedDefinitions,
    attempt,
    maxAttempts,
    next: passed ? 'accept' : attempt >= maxAttempts ? 'give_up' : 'retry',
  };
}

export type GateFn = (args: FinishArgs, attempt: number) => GateFailure[] | Promise<GateFailure[]>;

export interface PendingQuestion {
  id: string;
  args: AskUserArgs;
  askedAt: string;
  /** waiting: the call blocks; orphaned: the agent side went away (answer via a resumed turn). */
  state: 'waiting' | 'answered' | 'orphaned';
}

export interface RecordedCall {
  tool: AgentToolName;
  args: unknown;
  at: string;
}

export class StubToolHost implements AgentToolHost {
  readonly calls: RecordedCall[] = [];
  readonly finishes: Array<{ args: FinishArgs; verdict: GateVerdict }> = [];
  private readonly waiting = new Map<string, { q: PendingQuestion; resolve: (a: Answers) => void }>();
  private readonly questions = new Map<string, PendingQuestion>();
  private readonly questionListeners = new Set<(q: PendingQuestion) => void>();
  private finishAttempts = 0;
  private ghosts = 0;
  private readonly gate: GateFn;
  readonly maxAttempts: number;

  // No parameter properties: the sources must stay runnable with Node's type stripping.
  constructor(gate: GateFn = () => [], maxAttempts = DEFAULT_GATE_ATTEMPTS) {
    this.gate = gate;
    this.maxAttempts = maxAttempts;
  }

  /** Called for every new ask_user call; returns an unsubscribe function. */
  onQuestion(listener: (q: PendingQuestion) => void): () => void {
    this.questionListeners.add(listener);
    return () => this.questionListeners.delete(listener);
  }

  pendingQuestions(): PendingQuestion[] {
    return [...this.questions.values()].filter((q) => q.state !== 'answered');
  }

  /**
   * Answers a question. Returns true when a blocked ask_user call received it; false when the call
   * is gone (orphaned) and the answer must be delivered as the next user turn instead.
   */
  answer(id: string, answers: Answers): boolean {
    const q = this.questions.get(id);
    if (!q) throw new Error(`unknown question ${id}`);
    const w = this.waiting.get(id);
    q.state = 'answered';
    if (!w) return false;
    this.waiting.delete(id);
    w.resolve(answers);
    return true;
  }

  private record(tool: AgentToolName, args: unknown): void {
    this.calls.push({ tool, args, at: new Date().toISOString() });
  }

  ask_user(args: AskUserArgs, ctx: ToolCallContext): Promise<Answers> {
    this.record('ask_user', args);
    const q: PendingQuestion = { id: randomUUID(), args, askedAt: new Date().toISOString(), state: 'waiting' };
    this.questions.set(q.id, q);
    return new Promise<Answers>((resolve, reject) => {
      this.waiting.set(q.id, { q, resolve });
      const onAbort = (): void => {
        if (!this.waiting.delete(q.id)) return;
        q.state = 'orphaned';
        reject(new Error('the ask_user call was cancelled by the agent side'));
      };
      if (ctx.signal.aborted) onAbort();
      else ctx.signal.addEventListener('abort', onAbort, { once: true });
      for (const l of this.questionListeners) l(q);
    });
  }

  async check_lean(args: CheckLeanArgs): Promise<CheckResult> {
    this.record('check_lean', args);
    return { ok: true, diagnostics: [], footprints: {}, violations: [], note: 'M0 stub: no Lean check was run' };
  }

  async freeze_statements(args: FreezeStatementsArgs): Promise<FreezeResult> {
    this.record('freeze_statements', args);
    return { frozen: true, refusals: [], snapshotId: 'stub' };
  }

  async propose_assumption(args: ProposeAssumptionArgs): Promise<Adoption> {
    this.record('propose_assumption', args);
    this.ghosts += 1;
    return { status: 'recorded', ghostId: `ghost-${this.ghosts}`, gateChecked: false, message: 'M0 stub: recorded without a gate check' };
  }

  async propose_arrow(args: ProposeArrowArgs): Promise<ArrowProposal> {
    this.record('propose_arrow', args);
    return { status: 'recorded', message: 'M0 stub: recorded without a check' };
  }

  async finish(args: FinishArgs): Promise<GateVerdict> {
    this.record('finish', args);
    this.finishAttempts += 1;
    const verdict = makeGateVerdict(await this.gate(args, this.finishAttempts), this.finishAttempts, this.maxAttempts);
    this.finishes.push({ args, verdict });
    return verdict;
  }
}
