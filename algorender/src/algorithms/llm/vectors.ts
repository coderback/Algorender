// Small vector helpers for the attention and KV-cache visualisers: scaled
// dot-product attention for one query, written out step by step so the
// modules can narrate each stage and the tests can check them.

export type Vector = readonly number[];

export const dot = (a: Vector, b: Vector) => a.reduce((s, x, i) => s + x * b[i], 0);

/** Softmax over the allowed entries; masked entries get weight exactly 0. */
export function softmax(xs: readonly number[], allowed: readonly boolean[] = xs.map(() => true)): number[] {
  const live = xs.filter((_, i) => allowed[i]);
  if (live.length === 0) return xs.map(() => 0);
  const top = Math.max(...live);
  const e = xs.map((x, i) => (allowed[i] ? Math.exp(x - top) : 0));
  const sum = e.reduce((s, x) => s + x, 0);
  return e.map((x) => x / sum);
}

/** Σ wⱼ·vⱼ. */
export function weightedSum(weights: readonly number[], values: readonly Vector[]): number[] {
  const out = values[0].map(() => 0);
  weights.forEach((w, j) => values[j].forEach((x, k) => (out[k] += w * x)));
  return out;
}

export type Attended = {
  /** q·kⱼ for every key (masked ones too, for display). */
  scores: number[];
  /** q·kⱼ / √d. */
  scaled: number[];
  /** softmax of the allowed scaled scores; masked keys get 0. */
  weights: number[];
  /** Σ wⱼ·vⱼ. */
  output: number[];
};

/** Scaled dot-product attention for one query over the given keys and values. */
export function attend(q: Vector, keys: readonly Vector[], values: readonly Vector[], allowed: readonly boolean[] = keys.map(() => true)): Attended {
  const scores = keys.map((k) => dot(q, k));
  const scaled = scores.map((s) => s / Math.sqrt(q.length));
  const weights = softmax(scaled, allowed);
  return { scores, scaled, weights, output: weightedSum(weights, values) };
}

/** x·W for a row vector x and a matrix W given by rows. */
export const project = (x: Vector, w: readonly Vector[]): number[] => w[0].map((_, c) => x.reduce((s, xi, r) => s + xi * w[r][c], 0));

/** Index of the largest entry (the first on a tie). */
export const argmax = (xs: readonly number[]) => xs.reduce((best, x, i) => (x > xs[best] ? i : best), 0);
