// The JavaScript/TypeScript runner's worker; runner.ts describes the protocol.
// scripts/build-workers.mjs bundles it into public/workers/js.js, which runs
// inside the sandbox (public/sandbox.html): an opaque origin, so the learner's
// code here can't read the app's cookies or storage or call its API.

import type { RunRequest, RunResult } from '../protocol';
import { runJs } from './runtime';

type ToWorker = { type: 'init' } | { type: 'run'; id: number; request: RunRequest };

// The sandbox hands over one end of a MessageChannel whose other end is the
// app's page; until then (or as a plain worker) messages use this global.
let page: { postMessage(message: unknown): void } = self;
const answer = (message: unknown) => page.postMessage(message);

function internal(message: string): RunResult {
  return { events: [], arrays: {}, returned: null, error: { kind: 'internal', message, line: null }, ms: 0 };
}

// A learner's timer or promise that outlives its run is stopped at its next
// line by a throw; don't let that surface as a worker error (which would make
// the main thread treat the whole runner as crashed).
self.addEventListener('error', (e) => e.preventDefault());
self.addEventListener('unhandledrejection', (e) => e.preventDefault());

self.addEventListener('message', (e: MessageEvent<ToWorker | { type: 'connect' }>) => {
  if (e.data.type === 'connect' && e.ports[0]) {
    const port = e.ports[0];
    page = port;
    port.onmessage = (m: MessageEvent<ToWorker>) => handle(m.data);
    return;
  }
  if (e.data.type !== 'connect') handle(e.data);
});

function handle(msg: ToWorker) {
  if (msg.type === 'init') {
    answer({ type: 'status', status: 'ready' });
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
    answer({ type: 'result', id: msg.id, result });
  } catch (err) {
    // Something in the result couldn't be cloned: still answer, so the run doesn't hang until its timeout.
    answer({ type: 'result', id: msg.id, result: internal(`The JavaScript runner couldn't send its result: ${err instanceof Error ? err.message : String(err)}`) });
  }
}
