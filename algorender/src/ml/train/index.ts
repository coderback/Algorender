import * as diffusion from './diffusion';

/**
 * Every model trained ahead of time. `npm run models` (scripts/train-models.mjs)
 * runs each trainer and writes src/ml/pretrained/<name>.json; models small
 * enough to train in the browser train there instead.
 */
export const trainers: Record<string, { config: unknown; train: (log?: (step: number, loss: number) => void) => { loss: number; weights: unknown } }> = {
  diffusion,
};

export { configHash } from './hash';
