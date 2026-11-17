// Vitest setup (vitest.config.ts): every test file starts with the pretrained
// models read from disk and loaded, so modules that read them can run.
import { loadModelsFromDisk } from './weights.node';

await loadModelsFromDisk();
