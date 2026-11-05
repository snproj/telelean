/**
 * Parsing `lake build` output (Lake 5.0 / Lean 4.35; docs/m1-plan.md section 4 step 4, verified on real logs and
 * against `Lake/Build/Run.lean` and `Lake/Util/Log.lean` in the toolchain sources).
 *
 * Line shapes:
 * - progress: `<icon> [i/n] <verb> <caption>[ (<time>)]`, icon `✔` (ok), `⚠` (warnings), `ℹ` (infos), `✖`
 *   (failed), `⊘` (canceled); verbs `Built`/`Building`, `Replayed`/`Replaying`, `Ran`/`Running`, `Fetched`/…
 *   (the `-ing` form means the job failed). Lake replays the stored messages of up-to-date modules (`Replayed`),
 *   so warnings such as "declaration uses `sorry`" appear on every build;
 * - `trace: …`: the command line of a failed job (ignored, with any continuation);
 * - messages: `error|warning|info: <text>`, where a Lean message's text is `<file>:<line>:<col>: <first line>`
 *   (1-based line, 0-based code-point column; no end position); every following line up to the next recognised
 *   line is a continuation of the message (Lean's message text spans lines);
 * - `Some required targets logged failures:` followed by `- <caption>` lines (module names, or captions such as
 *   `job computation`); `error: build failed`; `Build completed successfully (n jobs).`
 */

export type LakeSeverity = 'error' | 'warning' | 'information';

export interface LakeProgress {
  readonly icon: string;
  readonly jobNo: number;
  readonly totalJobs: number;
  readonly verb: string;
  /** Usually a module name, e.g. `Model.Spyro.Main`; also captions such as `job computation`. */
  readonly caption: string;
  /** The job failed (icon `✖`). */
  readonly failed: boolean;
}

export interface LakeMessage {
  readonly severity: LakeSeverity;
  /** The file as Lake printed it (usually relative to the package root), when the message names one. */
  readonly file?: string;
  /** 1-based line, when the message has a position. */
  readonly line?: number;
  /** 0-based column in code points, when the message has a position. */
  readonly column?: number;
  /** The message without the `<severity>: <file>:<line>:<col>: ` prefix, continuation lines included. */
  readonly text: string;
}

export interface LakeLog {
  readonly progress: LakeProgress[];
  readonly messages: LakeMessage[];
  /** Captions listed under "Some required targets logged failures:". */
  readonly failedTargets: string[];
  /** `error: build failed` was printed. */
  readonly buildFailed: boolean;
  /** `Build completed successfully …`, `All targets up-to-date …` or `Nothing to build.` was printed. */
  readonly completed: boolean;
  /** Lines that matched nothing and continued no message (kept for error details). */
  readonly otherLines: string[];
}

const PROGRESS = /^([✔⚠✖ℹ⊘]) \[(\d+)\/(\d+)\](?: \(Optional\))? (\S+) (.+?)(?: \((?:\d+(?:\.\d+)?m?s)\))?$/u;
const MESSAGE = /^(error|warning|info): (.*)$/u;
const POSITIONED = /^(.+?):(\d+):(\d+): ([^]*)$/u;
const FILE_ONLY = /^(\S+\.lean): ([^]*)$/u;
const FAILURES_HEADER = 'Some required targets logged failures:';
const COMPLETED = /^(?:Build completed successfully \(\d+ jobs?\)\.|All targets up-to-date \(\d+ jobs?\)\.|Nothing to build\.)$/u;
// eslint-disable-next-line no-control-regex
const ANSI = /\x1B\[[0-9;?]*[A-Za-z]/gu;

const SEVERITY: Readonly<Record<string, LakeSeverity>> = { error: 'error', warning: 'warning', info: 'information' };

interface OpenMessage {
  severity: LakeSeverity;
  lines: string[];
}

function finishMessage(open: OpenMessage): LakeMessage {
  const lines = [...open.lines];
  while (lines.length > 1 && (lines.at(-1) ?? '').trim() === '') lines.pop();
  const body = lines.join('\n');
  const positioned = POSITIONED.exec(body);
  if (positioned !== null && !/\s/u.test(positioned[1] ?? '')) {
    return {
      severity: open.severity,
      file: positioned[1] ?? '',
      line: Number(positioned[2]),
      column: Number(positioned[3]),
      text: positioned[4] ?? '',
    };
  }
  const fileOnly = FILE_ONLY.exec(body);
  if (fileOnly !== null) return { severity: open.severity, file: fileOnly[1] ?? '', text: fileOnly[2] ?? '' };
  return { severity: open.severity, text: body };
}

/** Parses one output stream of `lake build` (parse stdout and stderr separately, then concatenate). */
export function parseLakeLog(output: string): LakeLog {
  const log = {
    progress: [] as LakeProgress[],
    messages: [] as LakeMessage[],
    failedTargets: [] as string[],
    buildFailed: false,
    completed: false,
    otherLines: [] as string[],
  };
  /** What unrecognised lines continue: a message, a trace entry (dropped), or nothing. */
  let open: OpenMessage | 'trace' | undefined;
  let inFailures = false;
  const close = (): void => {
    if (open !== undefined && open !== 'trace') log.messages.push(finishMessage(open));
    open = undefined;
  };

  for (const raw of output.replace(ANSI, '').split('\n')) {
    // A trailing `\r` belongs to CRLF; an inner one is a terminal line reset: only the text after it is visible.
    const trimmed = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    const line = trimmed.slice(trimmed.lastIndexOf('\r') + 1);
    if (inFailures) {
      if (line.startsWith('- ')) {
        log.failedTargets.push(line.slice(2).trim());
        continue;
      }
      inFailures = false;
    }
    const progress = PROGRESS.exec(line);
    if (progress !== null) {
      close();
      log.progress.push({
        icon: progress[1] ?? '',
        jobNo: Number(progress[2]),
        totalJobs: Number(progress[3]),
        verb: progress[4] ?? '',
        caption: progress[5] ?? '',
        failed: progress[1] === '✖',
      });
      continue;
    }
    if (line.startsWith('trace: ')) {
      close();
      open = 'trace';
      continue;
    }
    if (line === FAILURES_HEADER) {
      close();
      inFailures = true;
      continue;
    }
    if (line === 'error: build failed') {
      close();
      log.buildFailed = true;
      continue;
    }
    if (COMPLETED.test(line)) {
      close();
      log.completed = true;
      continue;
    }
    const message = MESSAGE.exec(line);
    if (message !== null) {
      close();
      open = { severity: SEVERITY[message[1] ?? ''] ?? 'error', lines: [message[2] ?? ''] };
      continue;
    }
    if (open === 'trace') continue;
    if (open !== undefined) {
      open.lines.push(line);
      continue;
    }
    if (line.trim() !== '') log.otherLines.push(line);
  }
  close();
  return log;
}

/** Concatenates the logs of stdout and stderr (each parsed on its own, so streams never mix inside a message). */
export function mergeLakeLogs(...logs: LakeLog[]): LakeLog {
  return {
    progress: logs.flatMap((l) => l.progress),
    messages: logs.flatMap((l) => l.messages),
    failedTargets: logs.flatMap((l) => l.failedTargets),
    buildFailed: logs.some((l) => l.buildFailed),
    completed: logs.some((l) => l.completed),
    otherLines: logs.flatMap((l) => l.otherLines),
  };
}

/** Captions of jobs that finished without failing (`Built`, `Replayed`, …). */
export function succeededCaptions(log: LakeLog): Set<string> {
  return new Set(log.progress.filter((p) => !p.failed && p.icon !== '⊘').map((p) => p.caption));
}
