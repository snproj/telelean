// FakeBackend scripts as data (M2, WP3; docs/m2-plan.md sections 10.2 and 10.3).
//
// A script file lists the turns a scripted "Claude" plays, in order. Each send() takes the next
// unplayed turn; a turn with `match` is only played for a user turn whose text contains it (the
// round-1 context bundle starts with `Run: "These suffice"`, an adoption turn with `The person
// adopted`, a nudge with `You ended your turn without calling finish`), so a script stays in step
// even when the host sends a turn the script did not plan for (that turn gets no steps and ends at
// once). The played-turn cursor lives in the returned FakeScript, so a session resumed with
// `--resume` (a new FakeSession of the same FakeBackend) continues where the old one stopped.

import type { FakeScript, FakeStep } from './fake.js';

export interface FakeScriptTurn {
  /** Played only for a user turn containing this text (default: the next turn, whatever it says). */
  match?: string;
  /** Free text for people reading the fixture. */
  note?: string;
  steps: FakeStep[];
}

export interface FakeScriptFile {
  name: string;
  description?: string;
  turns: FakeScriptTurn[];
}

/** One played turn, for assertions (`FakeScriptPlayer.played`). */
export interface PlayedTurn {
  index: number;
  turn: string;
  /** Index into `turns`, or -1 when no scripted turn matched. */
  scripted: number;
}

export interface FakeScriptPlayer {
  script: FakeScript;
  played: PlayedTurn[];
  /** Scripted turns not played yet. */
  remaining(): number;
}

const STEP_KINDS = new Set(['text', 'writeFile', 'edit', 'read', 'callTool', 'usage', 'rateLimit', 'sleep', 'result']);

/** Checks the shape of a parsed script file (kinds and required fields), throwing a TypeError naming the problem. */
export function validateFakeScriptFile(data: unknown): FakeScriptFile {
  const fail = (what: string): never => {
    throw new TypeError(`invalid fake script: ${what}`);
  };
  if (typeof data !== 'object' || data === null) return fail('not an object');
  const file = data as Partial<FakeScriptFile>;
  if (typeof file.name !== 'string' || file.name === '') fail('missing name');
  if (!Array.isArray(file.turns)) return fail('turns must be a list');
  file.turns.forEach((turn, t) => {
    if (typeof turn !== 'object' || turn === null || !Array.isArray(turn.steps)) fail(`turn ${t} has no steps`);
    if (turn.match !== undefined && typeof turn.match !== 'string') fail(`turn ${t}: match must be a string`);
    turn.steps.forEach((step, i) => {
      const kind = (step as { kind?: unknown }).kind;
      if (typeof kind !== 'string' || !STEP_KINDS.has(kind)) fail(`turn ${t} step ${i}: unknown kind ${JSON.stringify(kind)}`);
      if ((kind === 'edit' || kind === 'writeFile' || kind === 'read') && typeof (step as { path?: unknown }).path !== 'string') {
        fail(`turn ${t} step ${i}: ${kind} needs a path`);
      }
      if (kind === 'edit') {
        const e = step as { oldString?: unknown; newString?: unknown };
        if (typeof e.oldString !== 'string' || typeof e.newString !== 'string') fail(`turn ${t} step ${i}: edit needs oldString and newString`);
      }
      if (kind === 'callTool' && typeof (step as { tool?: unknown }).tool !== 'string') fail(`turn ${t} step ${i}: callTool needs a tool`);
    });
  });
  return file as FakeScriptFile;
}

/** A FakeScript playing `file`'s turns in order (see the module comment), with a record of what it played. */
export function playFakeScript(file: FakeScriptFile | FakeScriptTurn[]): FakeScriptPlayer {
  const turns = Array.isArray(file) ? file : file.turns;
  const used = new Array<boolean>(turns.length).fill(false);
  const played: PlayedTurn[] = [];
  let sends = 0;
  const script: FakeScript = (turnText: string) => {
    const index = sends++;
    let chosen = -1;
    for (let i = 0; i < turns.length; i++) {
      if (used[i]) continue;
      const match = turns[i]?.match;
      if (match === undefined || turnText.includes(match)) {
        chosen = i;
        break;
      }
      // An unmatched turn with a `match` waits for its own user turn; later turns may still match this one.
    }
    played.push({ index, turn: turnText, scripted: chosen });
    if (chosen < 0) return [];
    used[chosen] = true;
    // Steps are data: hand out copies so a test that mutates them cannot change the fixture.
    return structuredClone(turns[chosen]?.steps ?? []);
  };
  return { script, played, remaining: () => used.filter((u) => !u).length };
}
