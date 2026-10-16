// Runs learner code off the main thread, in a sandbox. One worker per runtime,
// started on first use and kept warm; a run that overruns its time budget gets
// the worker terminated (the only reliable way to stop a tight loop) and a
// fresh one next time.
//
// The sandbox: each worker lives in its own hidden <iframe sandbox="allow-scripts">
// (public/sandbox.html). Without allow-same-origin the frame and its worker
// have an opaque origin, so learner code (perhaps someone else's, once code is
// shared) can't read the app's cookies or storage or call its API as the
// learner, and the frame's policy lets it fetch only Pyodide's CDN. The page
// fetches the worker's script (same-origin, cached) and hands it over as text
// with one end of a MessageChannel; the worker then talks to the page directly
// on that port. Terminating removes the frame, which ends its worker.
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

/** What a runtime needs of its worker. */
export type WorkerLike = {
  postMessage(message: unknown): void;
  onmessage: ((e: MessageEvent<FromWorker>) => void) | null;
  onerror: ((e: { message: string }) => void) | null;
  terminate(): void;
};

export class WorkerRuntime implements Runtime {
  private worker: WorkerLike | null = null;
  private ready: Promise<void> | null = null;
  private pending = new Map<number, Pending>();
  private nextId = 1;
  private listeners = new Set<(status: RuntimeStatus, detail?: string) => void>();
  status: RuntimeStatus = 'idle';
  /** What the runtime is doing, for the learner ("Loading Python…"). */
  detail: string | undefined;

  constructor(
    private readonly spawn: () => WorkerLike,
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

/** The page that starts workers in an opaque origin. */
const SANDBOX = '/sandbox.html';

/** Each worker script's text, fetched once per page (the browser caches it too). */
const scripts = new Map<string, Promise<string>>();

function scriptText(url: string): Promise<string> {
  let text = scripts.get(url);
  if (!text) {
    text = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`couldn’t load ${url} (${r.status})`);
      return r.text();
    });
    // A failed fetch is retried by the next worker rather than remembered.
    text.catch(() => scripts.delete(url));
    scripts.set(url, text);
  }
  return text;
}

/**
 * A classic worker running `url` inside a sandboxed iframe. Messages sent before
 * the worker is connected wait in order; terminate() removes the frame.
 */
export class SandboxedWorker implements WorkerLike {
  onmessage: WorkerLike['onmessage'] = null;
  onerror: WorkerLike['onerror'] = null;
  private readonly frame: HTMLIFrameElement;
  private port: MessagePort | null = null;
  private waiting: unknown[] = [];
  private done = false;

  constructor(url: string, name: string) {
    const frame = document.createElement('iframe');
    // Scripts only: no same origin, forms, popups, modals or top navigation.
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.title = `${name} code runner`;
    frame.hidden = true;
    frame.tabIndex = -1;
    frame.setAttribute('aria-hidden', 'true');
    this.frame = frame;
    window.addEventListener('message', this.fromFrame);
    frame.addEventListener('load', () => void this.connect(url, name), { once: true });
    frame.src = SANDBOX;
    document.body.append(frame);
  }

  private async connect(url: string, name: string) {
    let source: string;
    try {
      source = await scriptText(url);
    } catch (e) {
      return this.fail((e as Error).message);
    }
    const target = this.frame.contentWindow;
    if (this.done || !target) return;
    const { port1, port2 } = new MessageChannel();
    port1.onmessage = (e: MessageEvent<FromWorker>) => this.onmessage?.(e);
    this.port = port1;
    // The frame's origin is opaque, so there is no origin to address; it only accepts messages from its parent.
    target.postMessage({ type: 'spawn', source, name }, '*', [port2]);
    for (const message of this.waiting) port1.postMessage(message);
    this.waiting = [];
  }

  /** The frame reports a worker that failed to start; nothing else may speak for it. */
  private fromFrame = (e: MessageEvent) => {
    if (e.source !== this.frame.contentWindow || e.data?.type !== 'failed') return;
    this.fail(String(e.data.message));
  };

  private fail(message: string) {
    if (!this.done) this.onerror?.({ message });
  }

  postMessage(message: unknown) {
    if (this.port) this.port.postMessage(message);
    else this.waiting.push(message);
  }

  terminate() {
    this.done = true;
    window.removeEventListener('message', this.fromFrame);
    this.port?.close();
    this.frame.remove();
  }
}

const runtimes: Partial<Record<'python' | 'js', WorkerRuntime>> = {};

/** The shared runtime for a language (JS and TS share one worker). */
export function runtimeFor(language: Language): WorkerRuntime {
  if (language === 'python') {
    return (runtimes.python ??= new WorkerRuntime(
      () => new SandboxedWorker('/workers/python.js', 'python'),
      async () => ({ harness: (await import('./python/harness')).HARNESS }),
    ));
  }
  // Bundled from js/js.worker.ts by scripts/build-workers.mjs.
  return (runtimes.js ??= new WorkerRuntime(() => new SandboxedWorker('/workers/js.js', 'javascript')));
}
