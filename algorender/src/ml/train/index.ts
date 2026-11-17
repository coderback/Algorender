import * as diffusion from './diffusion';

/** A model trained ahead of time: its config, a quicker one for iterating, and the training run. */
export type Trainer = {
  config: unknown;
  fast: unknown;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- each trainer takes its own config type
  train: (log?: (step: number, loss: number) => void, using?: any) => { loss: number; weights: unknown };
};

/**
 * Every model trained ahead of time. `npm run models` (scripts/train-models.mjs)
 * runs each trainer and writes public/models/<name>.json, which the pages that
 * need it fetch (src/ml/weights.ts); models small enough to train in the
 * browser train there instead.
 */
export const trainers: Record<string, Trainer> = {
  diffusion,
};

export { configHash } from './hash';
