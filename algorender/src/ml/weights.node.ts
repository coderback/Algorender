// Reading pretrained weights from disk, for tests and scripts (never imported
// by the app: the browser fetches them from /models/, see weights.ts).

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { loadModels, setModelSource, type ModelFile, type ModelSource } from './weights';

/** The folder `npm run models` writes to, which Next serves at /models/. */
export const MODELS_DIR = path.join(process.cwd(), 'public', 'models');

/** Every model on disk, by name. */
export const modelNames = () =>
  readdirSync(MODELS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.slice(0, -'.json'.length));

export const readModelFile = (name: string): ModelFile => JSON.parse(readFileSync(path.join(MODELS_DIR, `${name}.json`), 'utf8')) as ModelFile;

export const diskSource: ModelSource = async (name) => readModelFile(name);

/** Reads models from disk from now on, and loads every one, so modules that read them can run. */
export async function loadModelsFromDisk() {
  setModelSource(diskSource);
  await loadModels(modelNames());
}
