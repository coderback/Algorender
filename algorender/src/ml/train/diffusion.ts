import { trainNet, type NetJson, type TrainConfig } from '@/ml/denoiser';
import { compact } from './hash';

/**
 * The 2D diffusion visualiser's denoiser: one network for all three shapes
 * (told which by a one-hot input). Bump `version` when the training code or
 * the schedule changes, so pretrained.test.ts flags the stale weights.
 */
export const config: TrainConfig & { version: number } = {
  version: 1,
  hidden: [48, 48],
  steps: 12000,
  batch: 128,
  lr: 0.004,
  finalLr: 0.0002,
  seed: 1,
};

/** A quick version for iterating on the training code (`npm run models -- diffusion --fast`), never committed. */
export const fast: TrainConfig & { version: number } = { ...config, steps: 1500 };

export function train(log?: (step: number, loss: number) => void, using: TrainConfig = config): { loss: number; weights: NetJson } {
  const { net, loss } = trainNet(using, log);
  return {
    loss: compact(loss, 4),
    weights: { sizes: [...net.sizes], W: net.W.map((layer) => layer.map((row) => row.map((v) => compact(v)))), b: net.b.map((row) => row.map((v) => compact(v))) },
  };
}
