// The JavaScript/TypeScript runner's worker; runner.ts describes the protocol.
//
// Security: the learner's code runs here with this worker's same-origin
// privileges (fetch, IndexedDB, postMessage…). That's acceptable while code is
// only ever the learner's own and there are no accounts; revisit (a sandboxed
// cross-origin iframe, or a stricter realm) before code sharing or auth.

import type { RunRequest, RunResult } from '../protocol';
import { runJs } from './runtime';

type ToWorker = { type: 'init' } | { type: 'run'; id: number; request: RunRequest };

function internal(message: string): RunResult {
  return { events: [], arrays: {}, returned: null, error: { kind: 'internal', message, line: null }, ms: 0 };
}

// A learner's timer or promise that outlives its run is stopped at its next
// line by a throw; don't let that surface as a worker error (which would make
// the main thread treat the whole runner as crashed).
self.addEventListener('error', (e) => e.preventDefault());
self.addEventListener('unhandledrejection', (e) => e.preventDefault());

self.addEventListener('message', (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  if (msg.type === 'init') {
    self.postMessage({ type: 'status', status: 'ready' });
    return;
  }
  if (msg.type !== 'run') return;
  let result: RunResult;
  try {
    result = runJs(msg.request);
  } catch (err) {
    result = internal(`The JavaScript runner failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  try {
    self.postMessage({ type: 'result', id: msg.id, result });
  } catch (err) {
    // Something in the result couldn't be cloned: still answer, so the run doesn't hang until its timeout.
    self.postMessage({ type: 'result', id: msg.id, result: internal(`The JavaScript runner couldn't send its result: ${err instanceof Error ? err.message : String(err)}`) });
  }
});
