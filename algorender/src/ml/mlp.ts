import { createRng } from '@/engine/random';

// A small fully connected network on plain number arrays: 2 inputs, hidden
// layers of tanh units, one output whose sigmoid is the chance of class 1,
// trained on binary cross-entropy by full-batch gradient descent. Backprop is
// written out by hand for speed; mlp.test.ts checks every gradient against the
// autograd Value engine and against finite differences.

export type Mlp = {
  /** Units per layer, inputs first: [2, ...hidden, 1]. */
  sizes: readonly number[];
  /** W[l][j][i]: weight from unit i of layer l to unit j of layer l + 1. */
  W: number[][][];
  /** b[l][j]: bias of unit j of layer l + 1. */
  b: number[][];
};

export type Sample = { x: number; y: number; label: number };

/** Seeded Xavier-uniform weights and zero biases. */
export function initMlp(hidden: readonly number[], seed: number): Mlp {
  const sizes = [2, ...hidden, 1];
  const rng = createRng(seed * 7919 + 13);
  const W: number[][][] = [];
  const b: number[][] = [];
  for (let l = 1; l < sizes.length; l++) {
    const limit = Math.sqrt(6 / (sizes[l - 1] + sizes[l]));
    W.push(Array.from({ length: sizes[l] }, () => Array.from({ length: sizes[l - 1] }, () => (rng() * 2 - 1) * limit)));
    b.push(Array<number>(sizes[l]).fill(0));
  }
  return { sizes, W, b };
}

export const cloneMlp = (m: Mlp): Mlp => ({ sizes: m.sizes, W: m.W.map((layer) => layer.map((row) => [...row])), b: m.b.map((row) => [...row]) });

export const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

/**
 * Every layer's values for one input: acts[0] is the input, then each hidden
 * layer's tanh activations, and last the output's raw score z (a one-element
 * array); the chance of class 1 is sigmoid(z).
 */
export function forward(m: Mlp, input: readonly number[]): number[][] {
  const acts = [[...input]];
  for (let l = 0; l < m.W.length; l++) {
    const prev = acts[l];
    const last = l === m.W.length - 1;
    acts.push(
      m.W[l].map((row, j) => {
        let z = m.b[l][j];
        for (let i = 0; i < row.length; i++) z += row[i] * prev[i];
        return last ? z : Math.tanh(z);
      }),
    );
  }
  return acts;
}

/** The chance the network gives class 1 at (x, y). */
export const predict = (m: Mlp, x: number, y: number) => sigmoid(forward(m, [x, y])[m.W.length][0]);

/** Binary cross-entropy of a raw score z against label y, computed stably: log(1 + e^z) − y·z. */
export const bce = (z: number, y: number) => Math.max(z, 0) - z * y + Math.log1p(Math.exp(-Math.abs(z)));

/** Mean loss over the data and its gradient for every weight and bias. */
export function lossAndGradients(m: Mlp, data: readonly Sample[]): { loss: number; gW: number[][][]; gb: number[][] } {
  const gW = m.W.map((layer) => layer.map((row) => row.map(() => 0)));
  const gb = m.b.map((row) => row.map(() => 0));
  const n = data.length;
  let loss = 0;
  for (const s of data) {
    const acts = forward(m, [s.x, s.y]);
    const z = acts[m.W.length][0];
    loss += bce(z, s.label);
    // ∂loss/∂z for sigmoid + cross-entropy is p − y; averaged over the batch.
    let delta = [(sigmoid(z) - s.label) / n];
    for (let l = m.W.length - 1; l >= 0; l--) {
      const prev = acts[l];
      for (let j = 0; j < delta.length; j++) {
        gb[l][j] += delta[j];
        for (let i = 0; i < prev.length; i++) gW[l][j][i] += delta[j] * prev[i];
      }
      if (l > 0) {
        // Back through the weights, then through tanh: d tanh = 1 − tanh².
        delta = prev.map((a, i) => {
          let sum = 0;
          for (let j = 0; j < delta.length; j++) sum += m.W[l][j][i] * delta[j];
          return sum * (1 - a * a);
        });
      }
    }
  }
  return { loss: loss / n, gW, gb };
}

export const meanLoss = (m: Mlp, data: readonly Sample[]) => data.reduce((sum, s) => sum + bce(forward(m, [s.x, s.y])[m.W.length][0], s.label), 0) / data.length;

export const accuracy = (m: Mlp, data: readonly Sample[]) => data.filter((s) => (predict(m, s.x, s.y) >= 0.5 ? 1 : 0) === s.label).length / data.length;

export type Training = {
  /** Loss of the network after e updates, for e = 0..epochs. */
  losses: number[];
  /** Snapshots after e updates, for the epochs `keep` asked for. */
  snapshots: Map<number, Mlp>;
};

/** Full-batch gradient descent with optional momentum, keeping snapshots at the epochs `keep` accepts. */
export function train(
  m0: Mlp,
  data: readonly Sample[],
  { lr, epochs, momentum = 0, keep = () => false }: { lr: number; epochs: number; momentum?: number; keep?: (epoch: number) => boolean },
): Training {
  const m = cloneMlp(m0);
  const vW = m.W.map((layer) => layer.map((row) => row.map(() => 0)));
  const vb = m.b.map((row) => row.map(() => 0));
  const losses: number[] = [];
  const snapshots = new Map<number, Mlp>();
  for (let e = 0; ; e++) {
    const { loss, gW, gb } = lossAndGradients(m, data);
    losses.push(loss);
    if (keep(e)) snapshots.set(e, cloneMlp(m));
    if (e === epochs) break;
    for (let l = 0; l < m.W.length; l++) {
      for (let j = 0; j < m.W[l].length; j++) {
        for (let i = 0; i < m.W[l][j].length; i++) {
          vW[l][j][i] = momentum * vW[l][j][i] - lr * gW[l][j][i];
          m.W[l][j][i] += vW[l][j][i];
        }
        vb[l][j] = momentum * vb[l][j] - lr * gb[l][j];
        m.b[l][j] += vb[l][j];
      }
    }
  }
  return { losses, snapshots };
}
