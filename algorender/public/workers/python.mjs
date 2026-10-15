// Runs learner Python in Pyodide, off the main thread. A static module script,
// not bundled: Pyodide refuses classic workers, and bundled workers run classic.
// The protocol is in src/workspace/runner.ts; the Python that does the work
// (run_request) is src/workspace/python/harness.ts, sent over with 'init'.

const BASE = 'https://cdn.jsdelivr.net/pyodide/v314.0.7/full/';

/** run_request from the harness, once Python is ready. */
let ready = null;

async function start(harness) {
  self.postMessage({ type: 'status', status: 'loading', detail: 'Loading Python (about 6 MB, first time only)…' });
  const { loadPyodide } = await import(BASE + 'pyodide.mjs');
  const pyodide = await loadPyodide({ indexURL: BASE });
  pyodide.runPython(harness);
  return pyodide.globals.get('run_request');
}

function internal(message) {
  return { events: [], arrays: {}, returned: null, error: { kind: 'internal', message, line: null }, ms: 0 };
}

self.onmessage = async (e) => {
  const msg = e.data;
  if (msg.type === 'init') {
    ready = start(msg.harness);
    try {
      await ready;
      self.postMessage({ type: 'status', status: 'ready' });
    } catch (err) {
      self.postMessage({ type: 'failed', message: String(err?.message ?? err) });
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
    self.postMessage({ type: 'result', id: msg.id, result });
  }
};
