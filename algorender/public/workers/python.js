// Runs learner Python in Pyodide, off the main thread, inside the sandbox
// (public/sandbox.html). A classic worker script, not bundled: the sandbox
// starts it from its text, and a module worker can't start that way in an
// opaque origin. The protocol is in src/workspace/runner.ts; the Python that
// does the work (run_request) is src/workspace/python/harness.ts, sent over
// with 'init'.

const BASE = 'https://cdn.jsdelivr.net/pyodide/v314.0.7/full/';

/** run_request from the harness, once Python is ready. */
let ready = null;

// The sandbox hands over one end of a MessageChannel whose other end is the
// app's page; until then (or as a plain worker) messages use this global.
let page = self;
const answer = (message) => page.postMessage(message);

async function start(harness) {
  answer({ type: 'status', status: 'loading', detail: 'Loading Python (about 6 MB, first time only)…' });
  importScripts(BASE + 'pyodide.js'); // defines loadPyodide
  const pyodide = await self.loadPyodide({ indexURL: BASE });
  pyodide.runPython(harness);
  return pyodide.globals.get('run_request');
}

function internal(message) {
  return { events: [], arrays: {}, returned: null, error: { kind: 'internal', message, line: null }, ms: 0 };
}

self.onmessage = (e) => {
  if (e.data?.type === 'connect' && e.ports[0]) {
    page = e.ports[0];
    page.onmessage = (m) => handle(m.data);
    return;
  }
  handle(e.data);
};

async function handle(msg) {
  if (msg.type === 'init') {
    ready = start(msg.harness);
    try {
      await ready;
      answer({ type: 'status', status: 'ready' });
    } catch (err) {
      answer({ type: 'failed', message: String(err?.message ?? err) });
    }
  } else if (msg.type === 'run') {
    let result;
    try {
      const runRequest = await ready;
      result = JSON.parse(runRequest(JSON.stringify(msg.request)));
    } catch (err) {
      // run_request reports the learner's errors itself; reaching here is a runtime bug.
      result = internal(`The Python runner failed: ${String(err?.message ?? err).trim().split('\n').at(-1)}`);
    }
    answer({ type: 'result', id: msg.id, result });
  }
}
