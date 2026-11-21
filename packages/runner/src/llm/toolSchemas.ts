// Agent tool schemas, descriptions and result renderings (03 §8.3).
//
// One definition serves every backend: the MCP tool server registers these schemas, the fake
// backend validates scripted calls with them, and the renderers turn host results into the text
// the model reads. Descriptions are kept short on purpose: every word is sent on every request.

import { z } from 'zod';
import {
  PHENOMENA,
  type Adoption,
  type AgentToolName,
  type Answers,
  type ArrowProposal,
  type AskUserArgs,
  type CheckLeanArgs,
  type CheckResult,
  type FinishArgs,
  type FreezeResult,
  type FreezeStatementsArgs,
  type GateVerdict,
  type ProposeArrowArgs,
  type ProposeAssumptionArgs,
} from './types.js';

/** The MCP server name; the CLI exposes its tools as mcp__telelean__<tool>. */
export const TOOL_SERVER_NAME = 'telelean';
export const MCP_TOOL_PREFIX = `mcp__${TOOL_SERVER_NAME}__`;
export const mcpToolName = (tool: AgentToolName): string => `${MCP_TOOL_PREFIX}${tool}`;

const option = z.object({
  label: z.string().min(1).max(200),
  consequence: z.string().min(1).max(600).describe('What choosing this option means, in plain words'),
  formalPreview: z.string().max(2000).optional().describe('Optional Lean rendering'),
});

const question = z.object({
  phenomenon: z.enum(PHENOMENA),
  question: z.string().min(1).max(1000),
  options: z.array(option).min(2).max(4),
  claudesGuess: z
    .object({ option: z.number().int().min(0).max(3).optional(), note: z.string().max(600).optional() })
    .optional()
    .describe('Your own guess; shown to the user only after they answer'),
  affectedNodes: z.array(z.string().max(200)).max(50).optional().describe('Ids of the nodes the answer affects'),
});

export const toolInputShapes = {
  ask_user: { questions: z.array(question).min(1).max(3) },
  check_lean: { files: z.array(z.string().min(1).max(500)).max(50).optional() },
  freeze_statements: { targets: z.array(z.string().min(1).max(200)).min(1).max(50) },
  propose_assumption: {
    natural_name: z.string().min(1).max(300).describe('The sentence the user would hold, in their style'),
    lean_statement: z.string().min(1).max(4000).describe('The Lean proposition'),
    why_needed: z.string().min(1).max(2000),
    proof: z
      .string()
      .min(1)
      .max(4000)
      .describe('A Lean term of type (lean_statement) → target statement, using only selected premises'),
    lean_name: z
      .string()
      .regex(/^[a-z][a-z0-9_]{0,59}$/)
      .optional()
      .describe('Preferred snake_case statement name'),
  },
  propose_arrow: {
    source: z.string().min(1).max(200).describe('The id of the existing card the proof needs (it has a .holds)'),
    target: z.string().min(1).max(200).describe("The id of this step's target"),
    why: z.string().min(1).max(2000).describe('Why the proof needs it, in one sentence'),
  },
  finish: {
    status: z.enum(['proved', 'insufficient', 'inconsistent', 'not_proved', 'lean_errors']),
    summary: z.string().min(1).max(4000),
    gap: z.string().max(4000).optional(),
    conflict: z.array(z.string().max(200)).max(50).optional(),
    unused: z.array(z.string().max(200)).max(50).optional(),
    assumed_without_asking: z
      .array(z.string().max(1000))
      .max(50)
      .describe('Every interpretive choice you made without asking; [] if none'),
    no_alternative: z
      .boolean()
      .optional()
      .describe('Rework steps only: you found no other arrangement for the items the person declined as Shaky'),
  },
} as const;

export const toolInputSchemas = {
  ask_user: z.object(toolInputShapes.ask_user),
  check_lean: z.object(toolInputShapes.check_lean),
  freeze_statements: z.object(toolInputShapes.freeze_statements),
  propose_assumption: z.object(toolInputShapes.propose_assumption),
  propose_arrow: z.object(toolInputShapes.propose_arrow),
  finish: z.object(toolInputShapes.finish),
} as const;

// Compile-time drift check: each schema's output type and the interface in types.ts must be
// mutually assignable.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;
export type SchemaDriftChecks = [
  Assert<Same<z.infer<typeof toolInputSchemas.ask_user>, AskUserArgs>>,
  Assert<Same<z.infer<typeof toolInputSchemas.check_lean>, CheckLeanArgs>>,
  Assert<Same<z.infer<typeof toolInputSchemas.freeze_statements>, FreezeStatementsArgs>>,
  Assert<Same<z.infer<typeof toolInputSchemas.propose_assumption>, ProposeAssumptionArgs>>,
  Assert<Same<z.infer<typeof toolInputSchemas.propose_arrow>, ProposeArrowArgs>>,
  Assert<Same<z.infer<typeof toolInputSchemas.finish>, FinishArgs>>,
];

export const TOOL_TITLES: Record<AgentToolName, string> = {
  ask_user: 'Ask the user',
  check_lean: 'Check Lean',
  freeze_statements: 'Freeze statements',
  propose_assumption: 'Propose an assumption',
  propose_arrow: 'Propose an arrow',
  finish: 'Finish',
};

export const TOOL_DESCRIPTIONS: Record<AgentToolName, string> = {
  ask_user:
    'Ask the user 1-3 clarifying questions about what their sentences mean, then wait for the answers ' +
    '(this can take minutes; keep waiting). Ask instead of guessing whenever an interpretation matters. ' +
    'Each question has a phenomenon tag and 2-4 options with plain consequences; the user may also ' +
    'answer in free text or leave it open.',
  check_lean:
    'Build the Lean files in the sandbox and check the run rules. Returns Lean errors, axiom footprints ' +
    'and rule violations. Proof bodies are rejected until freeze_statements has succeeded. Limited number ' +
    'of checks per run.',
  freeze_statements:
    'Stop formalising and freeze the target statement and the selected premises. Refused, with reasons, ' +
    'until the files build and follow the rules. Afterwards prove the frozen statements unchanged; the ' +
    'reply lists the axioms you may use.',
  propose_assumption:
    'Propose a premise the user might hold that would close the gap, with a Lean proof that it does ' +
    '(a term of type statement → target). telelean checks it and shows it to the user, who may adopt it. ' +
    'Never write new assumptions into the files yourself.',
  propose_arrow:
    "Propose an arrow into this step's target from an existing card with a .holds that the proof needs. telelean checks " +
    'it at once, writes it into the target\'s premises before the checks, and the person reviews it. Never edit premises yourself.',
  finish:
    'End the run with a status, a summary and every interpretive choice made without asking. ' +
    'Programmatic checks then run (only selected premises used, no sorry, statements unchanged, ' +
    'their words untouched). If they fail you get the failures back: fix them and call finish again.',
};

/** Tool-level `_meta` the Claude Code CLI understands (code.claude.com/docs/en/mcp). */
export const TOOL_META: Record<AgentToolName, Record<string, unknown>> = {
  ask_user: { 'anthropic/alwaysLoad': true },
  check_lean: { 'anthropic/alwaysLoad': true, 'anthropic/maxResultSizeChars': 200_000 },
  freeze_statements: { 'anthropic/alwaysLoad': true },
  propose_assumption: { 'anthropic/alwaysLoad': true },
  propose_arrow: { 'anthropic/alwaysLoad': true },
  finish: { 'anthropic/alwaysLoad': true },
};

export const AGENT_TOOL_NAMES: readonly AgentToolName[] = [
  'check_lean',
  'freeze_statements',
  'ask_user',
  'propose_assumption',
  'propose_arrow',
  'finish',
];

// ---------------------------------------------------------------------------------------------
// Renderings: what the model reads back.

export function describeChoice(args: AskUserArgs, a: Answers['answers'][number]): string {
  const q = args.questions[a.question];
  switch (a.choice.kind) {
    case 'option': {
      const opt = q?.options[a.choice.option];
      return opt ? `option ${a.choice.option}: ${opt.label}` : `option ${a.choice.option}`;
    }
    case 'free-text':
      return `in their own words: ${JSON.stringify(a.choice.text)}`;
    case 'leave-open':
      return 'leave it open (keep this uninterpreted; do not decide it yourself)';
    case 'decide-for-me':
      return 'decide for me (use your best judgement and list it under assumed_without_asking)';
  }
}

export function renderAnswers(args: AskUserArgs, answers: Answers): string {
  const lines = ['The user answered:'];
  for (const a of answers.answers) {
    const q = args.questions[a.question];
    const scope = a.scope ? ` [scope: ${a.scope}]` : '';
    lines.push(`${a.question + 1}. ${q?.question ?? '(unknown question)'}`);
    lines.push(`   -> ${describeChoice(args, a)}${scope}`);
  }
  return lines.join('\n');
}

/**
 * The user turn that carries answers into a resumed session (after a window reload the pending
 * ask_user call is gone; D-25: the answer arrives as the next user turn).
 */
export function renderAnswersAsUserTurn(args: AskUserArgs, answers: Answers): string {
  return [
    'The session was interrupted while your ask_user call was waiting. Here are the answers to it:',
    renderAnswers(args, answers),
    'Continue the run from where you were.',
  ].join('\n');
}

export function renderGateVerdict(v: GateVerdict): string {
  const flagged =
    v.flaggedDefinitions.length > 0
      ? `\nNew definitions flagged for the user to review: ${v.flaggedDefinitions.join(', ')}.`
      : '';
  if (v.environment !== undefined && v.next !== 'accept') {
    // M2 (docs/m2-plan.md section 3.6): telelean could not run the checks twice; not the agent's doing.
    return (
      `telelean could not run the checks (${v.environment}). This is not your fault and was not counted as an attempt. ` +
      'Stop now and call no more tools: the person has been told, and the run ends here.'
    );
  }
  if (v.next === 'accept') return `Gate passed. The run is complete; stop here.${flagged}`;
  const failures = v.failures.map((f) => `- ${f.check}: ${indentContinuation(f.detail)}`).join('\n');
  if (v.next === 'retry') {
    return `Gate failed (attempt ${v.attempt} of ${v.maxAttempts}):\n${failures}\nFix these and call finish again.${flagged}`;
  }
  return (
    `Gate failed and the attempt limit (${v.maxAttempts}) is reached:\n${failures}\n` +
    'Stop now and call no more tools. The user has been told; the workspace copy will be reverted.'
  );
}

/** Lean messages span lines: continuation lines are indented so each item stays readable. */
function indentContinuation(text: string): string {
  return text.replace(/\r?\n/g, '\n  ');
}

/**
 * A compact text rendering (M2: fewer tokens than the M0 JSON): the verdict, stage and checks left, violations (one
 * exact line each), Lean's messages (whole text, `file:line:col`), then the axiom footprints.
 */
export function renderCheckResult(r: CheckResult): string {
  const lines: string[] = [];
  if (r.environment !== undefined) {
    lines.push(`telelean could not run Lean (${r.environment}). This is not your fault and was not counted as a check; try again, or call finish.`);
  } else {
    lines.push(r.ok ? 'Check passed: the files build and follow the run rules.' : 'Check found problems.');
  }
  const meta: string[] = [];
  if (r.stage !== undefined) meta.push(r.stage === 'formalise' ? 'stage: formalise (proofs are rejected until freeze_statements succeeds)' : 'stage: prove');
  if (r.checksLeft !== undefined) meta.push(`checks left: ${r.checksLeft}`);
  if (meta.length > 0) lines.push(`${meta.join('; ')}.`);
  if (r.note !== undefined && r.note !== '') lines.push(r.note);
  if (r.violations.length > 0) {
    lines.push('Violations:');
    for (const v of r.violations) lines.push(`- ${indentContinuation(v)}`);
  }
  if (r.diagnostics.length > 0) {
    lines.push('Lean messages:');
    for (const d of r.diagnostics) lines.push(`${d.file}:${d.line}:${d.column}: ${d.severity}: ${indentContinuation(d.message)}`);
  }
  const footprints = Object.entries(r.footprints);
  if (footprints.length > 0) {
    lines.push('Axiom footprints:');
    for (const [name, axioms] of footprints) lines.push(`- ${name}: ${axioms.length > 0 ? axioms.join(', ') : '(no axioms)'}`);
  }
  return lines.join('\n');
}

export function renderFreezeResult(r: FreezeResult): string {
  if (r.frozen) {
    const head = `Statements frozen${r.snapshotId ? ` (snapshot ${r.snapshotId})` : ''}. Now prove them unchanged.`;
    if (r.permitted === undefined) return head;
    // M2: the D-5 permitted set, so the agent knows exactly which axioms its proofs may rest on.
    return `${head}\nYour proofs may rest only on these axioms (anything else fails the gate): ${r.permitted.length > 0 ? r.permitted.join(', ') : '(none)'}.`;
  }
  return `Freeze refused:\n${r.refusals.map((x) => `- ${indentContinuation(x)}`).join('\n')}`;
}

/** Slice 2 (D2-1): propose_arrow's answer as the model reads it. */
export function renderArrowProposal(r: ArrowProposal): string {
  return `${r.status === 'recorded' ? 'Arrow recorded' : 'Arrow refused'}: ${r.message}`;
}

export function renderAdoption(r: Adoption): string {
  const head = `${r.status === 'recorded' ? 'Proposal recorded' : 'Proposal rejected'}${r.ghostId ? ` as ${r.ghostId}` : ''}: ${r.message}`;
  if (r.status === 'recorded' && r.aloneEntails === true) {
    // M2 (D-6): flagged to the person too.
    return `${head}\nNote: the gap proof uses none of the selected premises, so this suggestion alone gives the target; it may simply restate it.`;
  }
  return head;
}
