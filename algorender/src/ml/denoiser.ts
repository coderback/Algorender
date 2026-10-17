import { createRng } from '@/engine/random';

// The pieces of a tiny 2D diffusion model (DDPM): a noise schedule, three
// point-cloud shapes to learn, and a small ReLU network that looks at a noisy
// point, the step t and which shape it is, and predicts the noise that was
// added. Backprop is written out by hand for speed (denoiser.test.ts checks it
// against the autograd engine); training runs at build time
// (src/ml/train/diffusion.ts, `npm run models`) and the weights ship as JSON.
//
// Everything a trace uses at run time is exact IEEE arithmetic (+, ×, ÷, √,
// max): ReLU instead of tanh and piecewise-linear time features instead of
// sines, so Node and the browser compute the same points to the last bit.

export type DiffusionShape = 'spiral' | 'ring' | 'moons';
export const SHAPES: readonly DiffusionShape[] = ['spiral', 'ring', 'moons'];

/** Number of noising steps. */
export const T = 40;
const BETA_1 = 0.001;
const BETA_T = 0.25;

/** β_t for t = 1..T (index 0 unused): how much noise step t adds. */
export const betas: readonly number[] = [0, ...Array.from({ length: T }, (_, i) => BETA_1 + ((BETA_T - BETA_1) * i) / (T - 1))];
/** α_t = 1 − β_t. */
export const alphas: readonly number[] = betas.map((b) => 1 - b);
/** ᾱ_t = α_1·…·α_t: how much of the original signal survives to step t (ᾱ_0 = 1). */
export const alphaBars: readonly number[] = alphas.reduce<number[]>((acc, a, t) => [...acc, t === 0 ? 1 : acc[t - 1] * a], []);

/** Standard normal from two uniforms (Box–Muller). */
export function gaussian(rng: () => number): number {
  const u = Math.max(1e-12, rng());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

export type P2 = readonly [number, number];

/** One point of a shape, with a little spread so the cloud has thickness. */
export function sampleShape(shape: DiffusionShape, rng: () => number): P2 {
  const jitter = () => gaussian(rng) * 0.06;
  switch (shape) {
    case 'spiral': {
      const s = Math.sqrt(rng());
      const angle = 0.6 + 3.2 * Math.PI * s;
      const r = 0.35 + 1.75 * s;
      return [r * Math.cos(angle) + jitter(), r * Math.sin(angle) + jitter()];
    }
    case 'ring': {
      const angle = 2 * Math.PI * rng();
      return [1.8 * Math.cos(angle) + jitter(), 1.8 * Math.sin(angle) + jitter()];
    }
    case 'moons': {
      const upper = rng() < 0.5;
      const a = Math.PI * rng();
      const x = upper ? Math.cos(a) - 0.5 : 0.5 - Math.cos(a);
      const y = upper ? Math.sin(a) - 0.25 : 0.25 - Math.sin(a);
      return [1.6 * x + jitter(), 1.6 * y + jitter()];
    }
  }
}

/** A clean outline of each shape (no spread), for drawing the target faintly and measuring how close samples land. */
export function outline(shape: DiffusionShape, count = 120): P2[][] {
  const at = (k: number, n: number) => k / (n - 1);
  switch (shape) {
    case 'spiral':
      return [
        Array.from({ length: count }, (_, k): P2 => {
          const s = at(k, count);
          const angle = 0.6 + 3.2 * Math.PI * s;
          const r = 0.35 + 1.75 * s;
          return [r * Math.cos(angle), r * Math.sin(angle)];
        }),
      ];
    case 'ring':
      return [Array.from({ length: count }, (_, k): P2 => [1.8 * Math.cos(2 * Math.PI * at(k, count)), 1.8 * Math.sin(2 * Math.PI * at(k, count))])];
    case 'moons': {
      const half = Math.floor(count / 2);
      return [
        Array.from({ length: half }, (_, k): P2 => [1.6 * (Math.cos(Math.PI * at(k, half)) - 0.5), 1.6 * (Math.sin(Math.PI * at(k, half)) - 0.25)]),
        Array.from({ length: half }, (_, k): P2 => [1.6 * (0.5 - Math.cos(Math.PI * at(k, half))), 1.6 * (0.25 - Math.sin(Math.PI * at(k, half)))]),
      ];
    }
  }
}

/** Distance from p to the nearest point of the shape's outline. */
export function distanceToShape(shape: DiffusionShape, p: P2, curves = outline(shape, 600)): number {
  let best = Infinity;
  for (const curve of curves) for (const q of curve) best = Math.min(best, Math.hypot(p[0] - q[0], p[1] - q[1]));
  return best;
}

// ───────────────────────────── the network ─────────────────────────────

/** Time features: tents centred on TIME_CENTRES evenly spread over 0..1, each 1 at its centre and 0 one spacing away. */
const TIME_FEATURES = 8;
export const INPUTS = 2 + TIME_FEATURES + SHAPES.length;

/** The network's input for a point at step t of a shape: (x, y), then the time tents, then the shape one-hot. */
export function features(p: P2, t: number, shape: DiffusionShape): number[] {
  const s = (t - 1) / (T - 1);
  const time = Array.from({ length: TIME_FEATURES }, (_, k) => Math.max(0, 1 - Math.abs(s * (TIME_FEATURES - 1) - k)));
  return [p[0], p[1], ...time, ...SHAPES.map((sh) => (sh === shape ? 1 : 0))];
}

export type Net = {
  /** Units per layer, inputs first: [INPUTS, ...hidden, 2]. */
  sizes: readonly number[];
  /** W[l][j][i]: weight from unit i of layer l to unit j of layer l + 1. */
  W: number[][][];
  /** b[l][j]: bias of unit j of layer l + 1. */
  b: number[][];
};

/** Seeded He-uniform weights (for ReLU) and zero biases. */
export function initNet(hidden: readonly number[], seed: number): Net {
  const sizes = [INPUTS, ...hidden, 2];
  const rng = createRng(seed * 7919 + 17);
  const W: number[][][] = [];
  const b: number[][] = [];
  for (let l = 1; l < sizes.length; l++) {
    const limit = Math.sqrt(6 / sizes[l - 1]) * (l === sizes.length - 1 ? 0.3 : 1);
    W.push(Array.from({ length: sizes[l] }, () => Array.from({ length: sizes[l - 1] }, () => (rng() * 2 - 1) * limit)));
    b.push(Array<number>(sizes[l]).fill(0));
  }
  return { sizes, W, b };
}

/** Every layer's values: acts[0] is the input, then each hidden layer's ReLU outputs, then the predicted noise (2 numbers). */
export function forward(net: Net, input: readonly number[]): number[][] {
  const acts = [[...input]];
  for (let l = 0; l < net.W.length; l++) {
    const prev = acts[l];
    const last = l === net.W.length - 1;
    const out: number[] = [];
    for (let j = 0; j < net.W[l].length; j++) {
      const row = net.W[l][j];
      let z = net.b[l][j];
      for (let i = 0; i < row.length; i++) z += row[i] * prev[i];
      out.push(last ? z : Math.max(0, z));
    }
    acts.push(out);
  }
  return acts;
}

/** The noise the network thinks was added to p at step t. */
export function predictNoise(net: Net, p: P2, t: number, shape: DiffusionShape): P2 {
  const out = forward(net, features(p, t, shape))[net.W.length];
  return [out[0], out[1]];
}

export type Example = { input: readonly number[]; noise: P2 };

/**
 * Loss ½·mean‖ε̂ − ε‖² per coordinate (1 means no better than guessing zero
 * noise) over a batch, and its gradient for every weight and bias.
 */
export function lossAndGradients(net: Net, batch: readonly Example[]): { loss: number; gW: number[][][]; gb: number[][] } {
  const gW = net.W.map((layer) => layer.map((row) => row.map(() => 0)));
  const gb = net.b.map((row) => row.map(() => 0));
  const n = batch.length;
  let loss = 0;
  for (const ex of batch) {
    const acts = forward(net, ex.input);
    const out = acts[net.W.length];
    loss += ((out[0] - ex.noise[0]) ** 2 + (out[1] - ex.noise[1]) ** 2) / 2;
    let delta = [(out[0] - ex.noise[0]) / n, (out[1] - ex.noise[1]) / n];
    for (let l = net.W.length - 1; l >= 0; l--) {
      const prev = acts[l];
      for (let j = 0; j < delta.length; j++) {
        const d = delta[j];
        if (d === 0) continue;
        gb[l][j] += d;
        const g = gW[l][j];
        for (let i = 0; i < prev.length; i++) g[i] += d * prev[i];
      }
      if (l > 0) {
        // Back through the weights, then through ReLU: its slope is 1 where the unit was on, 0 where off.
        const next: number[] = [];
        for (let i = 0; i < prev.length; i++) {
          if (prev[i] <= 0) {
            next.push(0);
            continue;
          }
          let sum = 0;
          for (let j = 0; j < delta.length; j++) sum += net.W[l][j][i] * delta[j];
          next.push(sum);
        }
        delta = next;
      }
    }
  }
  return { loss: loss / n, gW, gb };
}

/** A training example: a clean point of a random shape, noised to a random step. */
export function makeExample(rng: () => number): Example {
  const shape = SHAPES[Math.floor(rng() * SHAPES.length)];
  const x0 = sampleShape(shape, rng);
  const t = 1 + Math.floor(rng() * T);
  const noise: P2 = [gaussian(rng), gaussian(rng)];
  return { input: features(noised(x0, noise, t), t, shape), noise };
}

/** The closed form of the forward process: x_t = √ᾱ_t·x₀ + √(1 − ᾱ_t)·ε. */
export function noised(x0: P2, noise: P2, t: number): P2 {
  const a = Math.sqrt(alphaBars[t]);
  const s = Math.sqrt(1 - alphaBars[t]);
  return [a * x0[0] + s * noise[0], a * x0[1] + s * noise[1]];
}

export type TrainConfig = { hidden: readonly number[]; steps: number; batch: number; lr: number; finalLr: number; seed: number };

/**
 * Adam on fresh minibatches (every batch is new points, so the network learns
 * the shapes rather than memorising a set), with the step size decaying from
 * `lr` to `finalLr` along a cosine. Deterministic from the seed.
 */
export function trainNet(config: TrainConfig, log?: (step: number, loss: number) => void): { net: Net; loss: number } {
  const net = initNet(config.hidden, config.seed);
  const rng = createRng(config.seed);
  const zeros = () => ({ W: net.W.map((layer) => layer.map((row) => row.map(() => 0))), b: net.b.map((row) => row.map(() => 0)) });
  const m = zeros();
  const v = zeros();
  const [b1, b2, eps] = [0.9, 0.999, 1e-8];
  let recent = 0;
  for (let step = 1; step <= config.steps; step++) {
    const batch = Array.from({ length: config.batch }, () => makeExample(rng));
    const { loss, gW, gb } = lossAndGradients(net, batch);
    recent = step === 1 ? loss : 0.99 * recent + 0.01 * loss;
    const lr = config.finalLr + ((config.lr - config.finalLr) * (1 + Math.cos((Math.PI * (step - 1)) / config.steps))) / 2;
    const c1 = 1 - b1 ** step;
    const c2 = 1 - b2 ** step;
    const update = (p: number[], g: number[], mm: number[], vv: number[]) => {
      for (let i = 0; i < p.length; i++) {
        mm[i] = b1 * mm[i] + (1 - b1) * g[i];
        vv[i] = b2 * vv[i] + (1 - b2) * g[i] * g[i];
        p[i] -= (lr * (mm[i] / c1)) / (Math.sqrt(vv[i] / c2) + eps);
      }
    };
    for (let l = 0; l < net.W.length; l++) {
      for (let j = 0; j < net.W[l].length; j++) update(net.W[l][j], gW[l][j], m.W[l][j], v.W[l][j]);
      update(net.b[l], gb[l], m.b[l], v.b[l]);
    }
    if (log && step % 1000 === 0) log(step, recent);
  }
  return { net, loss: recent };
}

/**
 * One reverse (DDPM) step from x_t to x_{t−1}: remove the predicted noise's
 * share, rescale, and (for t > 1) add fresh noise σ_t·z with σ_t² = β_t.
 */
export function reverseStep(p: P2, predicted: P2, t: number, z: P2): P2 {
  const k = betas[t] / Math.sqrt(1 - alphaBars[t]);
  const inv = 1 / Math.sqrt(alphas[t]);
  const sigma = t > 1 ? Math.sqrt(betas[t]) : 0;
  return [inv * (p[0] - k * predicted[0]) + sigma * z[0], inv * (p[1] - k * predicted[1]) + sigma * z[1]];
}

/** The denoiser's guess of the clean point: x̂₀ = (x_t − √(1 − ᾱ_t)·ε̂)/√ᾱ_t. */
export function predictClean(p: P2, predicted: P2, t: number): P2 {
  const a = Math.sqrt(alphaBars[t]);
  const s = Math.sqrt(1 - alphaBars[t]);
  return [(p[0] - s * predicted[0]) / a, (p[1] - s * predicted[1]) / a];
}

const round2 = (v: number) => Math.round(v * 100) / 100 + 0;
export const round2p = (p: P2): P2 => [round2(p[0]), round2(p[1])];

/**
 * A full reverse run for `n` points from seeded noise: positions[t] for t = T
 * down to 0. Noise draws are rounded to hundredths so the run uses only exact
 * arithmetic after them (see the note at the top).
 */
export function generate(net: Net, shape: DiffusionShape, n: number, seed: number): { positions: P2[][]; predicted: P2[][] } {
  const rng = createRng(seed * 31 + 7);
  const draw = (): P2 => round2p([gaussian(rng), gaussian(rng)]);
  const positions: P2[][] = Array.from({ length: T + 1 }, () => []);
  const predicted: P2[][] = Array.from({ length: T + 1 }, () => []);
  positions[T] = Array.from({ length: n }, draw);
  for (let t = T; t >= 1; t--) {
    const fresh = Array.from({ length: n }, draw);
    positions[t].forEach((p, i) => {
      const e = predictNoise(net, p, t, shape);
      predicted[t].push(e);
      positions[t - 1].push(reverseStep(p, e, t, fresh[i]));
    });
  }
  return { positions, predicted };
}

/** Weights as stored in src/ml/pretrained/*.json. */
export type NetJson = { sizes: number[]; W: number[][][]; b: number[][] };

export const netFromJson = (j: NetJson): Net => ({ sizes: j.sizes, W: j.W, b: j.b });
