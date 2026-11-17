// Pretrained weights, loaded only by the pages that need them.
//
// Every visualiser module ships on every visualiser page (the registry is one
// import), so weights imported into a module would ship everywhere too. They
// live instead as static files, public/models/<name>.json, written by
// `npm run models` (scripts/train-models.mjs). A module lists the models it
// reads in its `models`; the explorer loads them before it records a trace
// (useModels), and the module reads them synchronously with `model(name)`
// while it runs.
//
// In the browser a model is fetched from /models/; tests and scripts read the
// files from disk instead (weights.node.ts sets that source).

/** A pretrained model's file: its trainer's config and the hash that pins the weights to it. */
export type ModelFile<W = unknown, C = Record<string, unknown>> = {
  name: string;
  hash: string;
  config: C;
  loss: number;
  weights: W;
};

/** Where the files are served from. */
export const MODEL_PATH = '/models';

/** Fetches a model's file: from the server in the browser, from disk in tests. */
export type ModelSource = (name: string) => Promise<ModelFile>;

const fetchSource: ModelSource = async (name) => {
  const response = await fetch(`${MODEL_PATH}/${name}.json`);
  if (!response.ok) throw new Error(`Couldn't load the ${name} model (${response.status})`);
  return (await response.json()) as ModelFile;
};

let source: ModelSource = fetchSource;
const loaded = new Map<string, ModelFile>();
const pending = new Map<string, Promise<ModelFile>>();
const listeners = new Set<() => void>();

/** Replaces where files come from (tests and scripts read them from disk), and forgets what was loaded. */
export function setModelSource(next: ModelSource) {
  source = next;
  loaded.clear();
  pending.clear();
}

/** Loads one model, once: later calls share the first request. A failed load can be tried again. */
export function loadModel(name: string): Promise<ModelFile> {
  const done = loaded.get(name);
  if (done) return Promise.resolve(done);
  let request = pending.get(name);
  if (!request) {
    request = source(name).then(
      (file) => {
        if (file.name !== name) throw new Error(`/models/${name}.json holds the ${file.name} model`);
        loaded.set(name, file);
        pending.delete(name);
        for (const fn of listeners) fn();
        return file;
      },
      (error: unknown) => {
        pending.delete(name);
        throw error;
      },
    );
    pending.set(name, request);
  }
  return request;
}

export const loadModels = (names: readonly string[]) => Promise.all(names.map(loadModel)).then(() => undefined);

/** Whether every one of these models is loaded, so a module that reads them can run. */
export const hasModels = (names: readonly string[]) => names.every((n) => loaded.has(n));

/**
 * A loaded model, for a module to read while it runs. Throws when it isn't
 * loaded: list it in the module's `models` so the explorer loads it first.
 */
export function model<W = unknown, C = Record<string, unknown>>(name: string): ModelFile<W, C> {
  const file = loaded.get(name);
  if (!file) throw new Error(`The ${name} model isn't loaded: list it in the module's models, and load it (loadModels) before running`);
  return file as ModelFile<W, C>;
}

/** Calls `fn` whenever a model finishes loading (for useSyncExternalStore). */
export function onModelsLoaded(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Something computed from a model once (a network built from its weights),
 * kept until the model is loaded again from another source.
 */
export function fromModel<T, W = unknown, C = Record<string, unknown>>(name: string, build: (file: ModelFile<W, C>) => T): () => T {
  let cached: { file: ModelFile<W, C>; value: T } | null = null;
  return () => {
    const file = model<W, C>(name);
    if (cached?.file !== file) cached = { file, value: build(file) };
    return cached.value;
  };
}
