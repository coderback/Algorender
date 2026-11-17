// The replay console: interactive input without blocking a worker.
//
// A browser can only pause a worker on input() with SharedArrayBuffer and
// Atomics.wait, which needs cross-origin isolation (awkward in the
// opaque-origin sandbox, and it breaks embeds). Instead the program runs with
// what the learner has typed so far as stdin and `moreInput`: when it asks
// for a line past the end, it stops (`waiting`), the console shows its output
// and a prompt, and the learner's next line runs it again from the start with
// that line added. Programs are fast and, with a seed fixed for the console's
// session and a fresh file system every run, deterministic, so each run
// replays the last and goes one read further. "End input" (Ctrl+D in a
// terminal) runs it once more without `moreInput`, so it reaches end of file.
//
// Pure: the state, the next run's request fields, and the transcript drawn
// from a result. ReplayConsole.tsx is the UI.

import type { RunResult } from './protocol';

export type ReplayState = {
  /** The lines typed so far, without newlines. */
  typed: string[];
  /** The learner ended input: the next run reaches end of file. */
  closed: boolean;
  /** Seeds random for the whole session, so every replay makes the same choices. */
  seed: number;
};

export function startReplay(seed = Math.floor(Math.random() * 2 ** 31)): ReplayState {
  return { typed: [], closed: false, seed };
}

export const typeLine = (state: ReplayState, line: string): ReplayState => ({ ...state, typed: [...state.typed, line] });

export const endInput = (state: ReplayState): ReplayState => ({ ...state, closed: true });

/** What the next run adds to its request. */
export function replayRequest(state: ReplayState): { stdin: string; moreInput: boolean; seed: number } {
  return { stdin: state.typed.map((line) => `${line}\n`).join(''), moreInput: !state.closed, seed: state.seed };
}

/** A piece of the console: what the program wrote, or a line the learner typed (echoed where it was read). */
export type Segment = { kind: 'out' | 'err' | 'in'; text: string };

/**
 * The console's text: stdout with each typed line written in where the
 * program read it, as a terminal echoes typing; then stderr. A line the
 * program never read (it stopped reading, or did something else this time)
 * goes at the end, so nothing typed disappears.
 */
export function transcript(result: Pick<RunResult, 'stdout' | 'stderr' | 'reads'>, typed: readonly string[]): Segment[] {
  const out = result.stdout ?? '';
  const reads = result.reads ?? [];
  const segments: Segment[] = [];
  const push = (kind: Segment['kind'], text: string) => {
    if (!text) return;
    const last = segments.at(-1);
    if (last?.kind === kind && kind !== 'in') last.text += text;
    else segments.push({ kind, text });
  };
  let at = 0;
  typed.forEach((line, k) => {
    const offset = Math.min(reads[k] ?? out.length, out.length);
    if (offset > at) push('out', out.slice(at, offset));
    at = Math.max(at, offset);
    push('in', `${line}\n`);
  });
  push('out', out.slice(at));
  push('err', result.stderr ?? '');
  return segments;
}

/** One line on where the run stands, for the console's status. */
export function replayStatus(result: Pick<RunResult, 'waiting' | 'exitCode' | 'error'>): string {
  if (result.waiting) return 'Waiting for input';
  if (result.error?.kind === 'limit' || result.error?.kind === 'timeout') return 'Stopped';
  if (result.exitCode === 0) return 'Finished';
  if (result.exitCode != null) return `Finished with exit code ${result.exitCode}`;
  return 'Finished';
}
