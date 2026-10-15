// Runs learner code off the main thread. One worker per runtime, started on
// first use and kept warm; a run that overruns its time budget gets the worker
// terminated (the only reliable way to stop a tight loop) and a fresh one next
// time.
//
// Worker protocol (both runtimes):
//   main → worker  { type: 'init', harness? }      once, right after spawning
//   worker → main  { type: 'status', status: 'loading' | 'ready', detail? }
//   main → worker  { type: 'run', id, request }
//   worker → main  { type: 'result', id, result } | { type: 'failed', message }

import type { Language, RunRequest, RunResult, Runtime } from './protocol';

export type RuntimeStatus = 'idle' | 'loading' | 'ready' | 'running' | 'failed';

type FromWorker =
  | { type: 'status'; status: 'loading' | 'ready'; detail?: string }
  | { type: 'result'; id: number; result: RunResult }
  | { type: 'failed'; message: string };

type Pending = { resolve: (r: RunResult) => void; timer: ReturnType<typeof setTimeout>; started: number };

export class WorkerRuntime implements Runtime {
  private worker: Worker | null = null;
  private ready: Promise<void> | null = null;
  private pending = new Map<number, Pending>();
  private nextId = 1;
  private listeners = new Set<(status: RuntimeStatus, detail?: string) => void>();
  status: RuntimeStatus = 'idle';
  /** What the runtime is doing, for the learner ("Loading Python…"). */
  detail: string | undefined;

  constructor(
    private readonly spawn: () => Worker,
    private readonly init: () => Promise<Record<string, unknown>> = async () => ({}),
  ) {}

  /** Subscribe to status changes (loading Python, ready, running…). Returns an unsubscribe function. */
  onStatus(listener: (status: RuntimeStatus, detail?: string) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Starts the worker ahead of the first run (e.g. when the workspace opens). */
  warm(): Promise<void> {
    if (this.ready) return this.ready;
    this.setStatus('loading');
    const worker = this.spawn();
    this.worker = worker;
    this.ready = new Promise<void>((resolve, reject) => {
      worker.onmessage = (e: MessageEvent<FromWorker>) => {
        const msg = e.data;
        if (msg.type === 'status') {
          this.setStatus(msg.status, msg.detail);
          if (msg.status === 'ready') resolve();
        } else if (msg.type === 'result') {
          const p = this.pending.get(msg.id);
          if (!p) return;
          clearTimeout(p.timer);
          this.pending.delete(msg.id);
          this.setStatus('ready');
          p.resolve(msg.result);
        } else if (msg.type === 'failed') {
          this.fail(msg.message);
          reject(new Error(msg.message));
        }
      };
      worker.onerror = (e) => {
        const message = e.message || 'The code runner stopped unexpectedly.';
        this.fail(message);
        reject(new Error(message));
      };
    });
    // A failed start must not leave an unhandled rejection; run() reports it.
    this.ready.catch(() => {});
    void this.init().then((extra) => worker.postMessage({ type: 'init', ...extra }));
    return this.ready;
  }

  async run(request: RunRequest): Promise<RunResult> {
    try {
      await this.warm();
    } catch (e) {
      return failure('internal', `Couldn’t start the ${request.language} runner: ${(e as Error).message}`);
    }
    const worker = this.worker!;
    const id = this.nextId++;
    this.setStatus('running');
    return new Promise<RunResult>((resolve) => {
      const started = performance.now();
      const timer = setTimeout(() => {
        this.pending.delete(id);
        this.reset();
        const seconds = Math.round(request.limits.timeoutMs / 100) / 10;
        resolve({
          ...failure('timeout', `Stopped after ${seconds} s: the code was still running. Is there a loop that never ends?`),
          ms: performance.now() - started,
        });
      }, request.limits.timeoutMs);
      this.pending.set(id, { resolve, timer, started });
      worker.postMessage({ type: 'run', id, request });
    });
  }

  /** Stops the worker; the next run starts a new one. */
  reset() {
    this.worker?.terminate();
    this.worker = null;
    this.ready = null;
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.resolve(failure('internal', 'The runner was restarted.'));
    }
    this.pending.clear();
    this.setStatus('idle');
  }

  private fail(message: string) {
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.resolve(failure('internal', message));
    }
    this.pending.clear();
    this.worker?.terminate();
    this.worker = null;
    this.ready = null;
    this.setStatus('failed', message);
  }

  private setStatus(status: RuntimeStatus, detail?: string) {
    this.status = status;
    this.detail = detail;
    for (const l of this.listeners) l(status, detail);
  }
}

function failure(kind: 'timeout' | 'internal', message: string): RunResult {
  return { events: [], arrays: {}, returned: null, error: { kind, message, line: null }, ms: 0 };
}

const runtimes: Partial<Record<'python' | 'js', WorkerRuntime>> = {};

/** The shared runtime for a language (JS and TS share one worker). */
export function runtimeFor(language: Language): WorkerRuntime {
  if (language === 'python') {
    return (runtimes.python ??= new WorkerRuntime(
      // Pyodide refuses classic workers, and bundled workers run classic, so
      // the Python worker is a static module script (public/workers/python.mjs).
      () => new Worker('/workers/python.mjs', { type: 'module', name: 'python' }),
      async () => ({ harness: (await import('./python/harness')).HARNESS }),
    ));
  }
  return (runtimes.js ??= new WorkerRuntime(
    () => new Worker(new URL('./js/js.worker.ts', import.meta.url), { type: 'module', name: 'javascript' }),
  ));
}
