// Watching a test: a replay run (judge.ts's watchRequest) as the trace the
// workspace's views play.

import { traceFor, type RunTrace } from '@/workspace/trace';
import type { RunResult } from '@/workspace/protocol';
import type { ReplayView } from './judge';

/** Index names drawn as pointers under an array when the learner's code uses them. Not `k`: it is as often a count (the top k) as an index. */
export const POINTERS = ['i', 'j', 'left', 'right', 'lo', 'hi', 'mid', 'l', 'r', 'start', 'end', 'slow', 'fast', 'low', 'high'];

/** The trace for a replay on a problem's view, or null when nothing ran. `memory` plays it on the memory view. */
export function replayTrace(result: RunResult, code: string, view: ReplayView, memory: boolean): RunTrace | null {
  const shown = memory ? 'memory' : view === 'array' ? 'array' : view === 'memory' ? 'memory' : undefined;
  return traceFor(result, { pointers: POINTERS, code, ...(shown && { view: shown }) });
}
