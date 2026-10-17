import { defineAlgorithm } from '@/engine/module';
import type { Frame } from '@/engine/types';
import { askInOrder, plotFrame } from '@/viz/plot/frame';
import { fmt } from '@/viz/plot/geometry';
import type { Bar, ImagePart, PlanePart, PlotPart, PlotState } from '@/viz/plot/types';
import { picture, SIZE, type ImageId, type Picture } from './images';

/** Most terms the run adds before summing up (pictures of higher rank stop here). */
export const MAX_TERMS = 10;
/** Singular values below this share of the largest count as zero. */
const ZERO = 1e-9;

export type SvdInput = { image: ImageId; seed: number };

export type Svd = {
  /** Singular values, largest first. */
  sigma: number[];
  /** u_i (length m) and v_i (length n), paired with sigma[i]. Zero vectors where sigma[i] is 0. */
  u: number[][];
  v: number[][];
};

/**
 * Singular value decomposition by one-sided Jacobi rotations (Hestenes): rotate
 * pairs of columns of A until they are all orthogonal. The rotations multiply
 * into V, the column lengths are the singular values and the normalised
 * columns are U, so A = U·Σ·Vᵀ. Deterministic: sweeps visit pairs in order.
 */
export function decompose(a: Picture): Svd {
  const m = a.length;
  const n = a[0].length;
  // Work on columns: w[j] is column j of A as it is rotated.
  const w = Array.from({ length: n }, (_, j) => Array.from({ length: m }, (_, i) => a[i][j]));
  const vt = Array.from({ length: n }, (_, j) => Array.from({ length: n }, (_, k) => (j === k ? 1 : 0)));
  for (let sweep = 0; sweep < 60; sweep++) {
    let rotated = false;
    for (let p = 0; p < n - 1; p++) {
      for (let q = p + 1; q < n; q++) {
        let alpha = 0;
        let beta = 0;
        let gamma = 0;
        for (let i = 0; i < m; i++) {
          alpha += w[p][i] * w[p][i];
          beta += w[q][i] * w[q][i];
          gamma += w[p][i] * w[q][i];
        }
        if (gamma === 0 || Math.abs(gamma) <= 1e-15 * Math.sqrt(alpha * beta)) continue;
        rotated = true;
        const zeta = (beta - alpha) / (2 * gamma);
        const t = Math.sign(zeta || 1) / (Math.abs(zeta) + Math.sqrt(1 + zeta * zeta));
        const c = 1 / Math.sqrt(1 + t * t);
        const s = c * t;
        for (const col of [w, vt]) {
          const x = col[p];
          const y = col[q];
          for (let i = 0; i < x.length; i++) {
            const xi = x[i];
            x[i] = c * xi - s * y[i];
            y[i] = s * xi + c * y[i];
          }
        }
      }
    }
    if (!rotated) break;
  }
  const lengths = w.map((col) => Math.hypot(...col));
  const order = lengths.map((_, j) => j).sort((x, y) => lengths[y] - lengths[x] || x - y);
  const top = lengths[order[0]] || 1;
  return {
    sigma: order.map((j) => (lengths[j] <= ZERO * top ? 0 : lengths[j])),
    u: order.map((j) => (lengths[j] <= ZERO * top ? w[j].map(() => 0) : w[j].map((x) => x / lengths[j]))),
    v: order.map((j) => vt[j]),
  };
}

/** The sum of the first k terms σᵢ·uᵢ·vᵢᵀ. */
export function rankK(d: Svd, k: number): Picture {
  const m = d.u[0].length;
  const n = d.v[0].length;
  const out = Array.from({ length: m }, () => Array<number>(n).fill(0));
  for (let t = 0; t < k; t++) for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) out[i][j] += d.sigma[t] * d.u[t][i] * d.v[t][j];
  return out;
}

/** Frobenius norm of a − b. */
export function distance(a: Picture, b: Picture): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) for (let j = 0; j < a[0].length; j++) s += (a[i][j] - b[i][j]) ** 2;
  return Math.sqrt(s);
}

/** Number of non-zero singular values. */
export const rankOf = (d: Svd) => d.sigma.filter((s) => s > 0).length;

const pseudocode = [
  'A = U·Σ·Vᵀ    σ₁ ≥ σ₂ ≥ … ≥ 0',
  'A₀ ← all zeros',
  'for k = 1, 2, …:',
  '  piece ← σₖ · uₖ · vₖᵀ',
  '  Aₖ ← Aₖ₋₁ + piece',
  'until Aₖ is close enough to A',
];

const LABELS: Record<ImageId, string> = {
  plus: 'Plus sign',
  gradient: 'Gradient',
  checker: 'Checkerboard',
  letter: 'Letter A',
  smiley: 'Smiley',
  noise: 'Random noise',
};

const flat = (p: Picture) => p.flat();
const image = (id: string, label: string, pixels: number[], scale: ImagePart['scale']): ImagePart => ({ kind: 'image', id, label, width: SIZE, height: SIZE, pixels, scale });

function* run({ image: id, seed }: SvdInput): Generator<Frame<PlotState>> {
  const a = picture(id, seed);
  const d = decompose(a);
  const m = a.length;
  const n = a[0].length;
  const rank = rankOf(d);
  const terms = Math.min(rank, MAX_TERMS);
  const total = d.sigma.reduce((s, x) => s + x * x, 0);
  const energy = (k: number) => d.sigma.slice(0, k).reduce((s, x) => s + x * x, 0) / total;
  const pct = (x: number) => `${fmt(100 * x, 1)}%`;
  const storage = (k: number) => `${k * (m + n + 1)} vs ${m * n}`;

  const chart = (shown: number, used: number): PlanePart => {
    const bars: Bar[] = d.sigma.slice(0, shown).map((s, i) => ({ id: `s${i + 1}`, x0: i + 0.15, x1: i + 0.85, y: s, mark: i < used ? 'found' : null }));
    return {
      kind: 'plane',
      id: 'sigma',
      label: 'Singular values σₖ, largest first',
      x: { min: 0, max: n, label: 'k', ticks: [1, 5, 10, 15, 20, n].map((k) => ({ at: k - 0.5, label: String(k) })) },
      y: { min: 0, max: d.sigma[0] * 1.1, label: 'σ' },
      equal: false,
      shapes: [{ kind: 'bars', id: 'sigma', bars }],
      handles: [],
    };
  };
  const readouts = (k: number, err: number): PlotPart => ({
    kind: 'readouts',
    id: 'readouts',
    label: 'Values',
    items: [
      { id: 'k', label: 'terms', value: String(k) },
      { id: 'energy', label: 'energy kept', value: pct(k === 0 ? 0 : energy(k)), mark: k > 0 ? 'found' : null },
      { id: 'storage', label: 'numbers stored', value: storage(k) },
      { id: 'error', label: '‖A − Aₖ‖', value: fmt(err, 3) },
    ],
  });
  const original = image('original', 'The picture A', flat(a), 'gray');
  const zero = Array<number>(m * n).fill(0);

  // A sorted, honest set of choices for "how many terms?".
  const counts = [...new Set([rank, ...[1, 2, 6, 24].filter((x) => x !== rank)])].slice(0, 4).sort((x, y) => x - y).map(String);

  yield plotFrame([original, image('approx', 'Approximation A₀', zero, 'gray'), image('piece', 'Next piece', zero, 'signed'), chart(0, 0), readouts(0, distance(a, rankK(d, 0)))], {
    line: 0,
    note: `Every picture is a sum of simple pieces σ·u·vᵀ, each one a column pattern times a row pattern. The SVD lists them from most to least important. Start from a blank picture and add them one at a time.`,
    vars: { k: 0 },
    stats: { rank: 0 },
    checkpoint: askInOrder('How many pieces will this picture need to be reproduced exactly?', counts, String(rank)),
  });

  for (let k = 1; k <= terms; k++) {
    const piece = Array.from({ length: m * n }, (_, p) => d.sigma[k - 1] * d.u[k - 1][Math.floor(p / n)] * d.v[k - 1][p % n]);
    const peak = Math.max(...piece.map(Math.abs)) || 1;
    const ak = rankK(d, k);
    const err = distance(a, ak);
    const exact = k === rank;
    const next = k + 1;
    const checkpoint =
      k === terms
        ? undefined
        : k % 2 === 1
          ? askInOrder(`Will piece ${next} add more than piece ${k}, or less (or the same)?`, ['More', 'Less or the same'], 'Less or the same')
          : askInOrder(`Will the picture be exact after piece ${next}?`, ['Yes', 'No'], next === rank ? 'Yes' : 'No');
    yield plotFrame(
      [
        original,
        image('approx', `Approximation A${subscript(k)}`, flat(ak).map((x) => Math.min(1, Math.max(0, x))), 'gray'),
        image('piece', `Piece ${k}: σ${subscript(k)}·u${subscript(k)}·v${subscript(k)}ᵀ`, piece.map((x) => x / peak), 'signed'),
        chart(k, k),
        readouts(k, err),
      ],
      {
        line: 4,
        note:
          (k === 1
            ? `Piece 1 is the best picture you can make from one column pattern times one row pattern; σ₁ = ${fmt(d.sigma[0], 2)} says how strongly it counts.`
            : `Piece ${k} (σ${subscript(k)} = ${fmt(d.sigma[k - 1], 2)}) fixes what the first ${k - 1} missed.`) +
          (exact
            ? ` Now the picture is exact: it has rank ${rank}, so ${k} pieces are all it ever needed.`
            : ` ${pct(energy(k))} of the energy is captured, and the error is down to ${fmt(err, 2)}.`),
        vars: { k, 'σₖ': Number(d.sigma[k - 1].toFixed(3)), energy: Number((100 * energy(k)).toFixed(1)) },
        stats: { rank: k },
        checkpoint,
      },
    );
  }

  const err = distance(a, rankK(d, terms));
  yield plotFrame(
    [
      original,
      image('approx', `Approximation A${subscript(terms)}`, flat(rankK(d, terms)).map((x) => Math.min(1, Math.max(0, x))), 'gray'),
      chart(n, terms),
      readouts(terms, err),
    ],
    {
      line: 5,
      note:
        terms === rank
          ? `${rank} piece${rank === 1 ? '' : 's'} rebuild the picture exactly, stored as ${terms * (m + n + 1)} numbers instead of ${m * n} pixels. Every other singular value is zero.`
          : `Stopping at ${terms} of ${rank} pieces keeps ${pct(energy(terms))} of the energy in ${terms * (m + n + 1)} numbers instead of ${m * n}. The rest are small σ’s: fine detail${id === 'noise' ? ', and noise is nothing but fine detail' : ''}.`,
      vars: { k: terms, energy: Number((100 * energy(terms)).toFixed(1)) },
      stats: { rank: terms },
    },
  );
}

function subscript(k: number): string {
  return String(k).replace(/\d/g, (c) => '₀₁₂₃₄₅₆₇₈₉'[Number(c)]);
}

const example = (id: ImageId) => ({ id, label: LABELS[id], make: ({ seed }: { seed: number }) => ({ image: id, seed: id === 'noise' ? seed : 0 }), sized: false });

export const svd = defineAlgorithm<SvdInput, PlotState>({
  kind: 'algorithm',
  slug: 'svd',
  view: 'plot',
  input: {
    examples: [example('smiley'), example('plus'), example('checker'), example('gradient'), example('letter'), example('noise')],
  },
  pseudocode,
  stats: [{ key: 'rank', label: 'Rank used' }],
  legend: [
    { neutral: 'Singular values not used yet' },
    { mark: 'found', label: 'Singular values used so far' },
    { mark: 'compare', label: 'Piece adds brightness' },
    { mark: 'swap', label: 'Piece takes brightness away' },
  ],
  run,
  content: {
    idea: 'The singular value decomposition writes any matrix, a picture included, as a sum of simple pieces σ·u·vᵀ: a column pattern times a row pattern, weighted by a singular value σ. Sorted from the largest σ down, the first few pieces carry most of the picture, so keeping only them compresses it.',
    invariant: 'A = σ₁u₁v₁ᵀ + σ₂u₂v₂ᵀ + … with σ₁ ≥ σ₂ ≥ … ≥ 0 and the u’s and v’s orthonormal. The first k pieces are the best rank-k approximation, and the squared error left over is exactly the sum of the squared σ’s you dropped.',
    whenToUse: 'Compressing images and other matrices, denoising (small σ’s are often noise), recommender systems (a ratings matrix is close to low rank), least squares and pseudo-inverses, and PCA, which is the SVD of centred data.',
    traits: [
      { label: 'Best rank-k approximation', good: true },
      { label: 'Works for any matrix', good: true },
      { label: 'O(mn·min(m, n)) to compute', good: null },
    ],
    experiments: [
      { example: 'plus', prompt: 'A plus sign is a white sheet minus a horizontal bar minus a vertical bar: two pieces rebuild it exactly.' },
      { example: 'checker', prompt: 'The checkerboard is an even gray plus one ± pattern: rank 2, however many squares it has.' },
      { example: 'smiley', prompt: 'Curves need many pieces. Watch the face appear blurry, then sharpen as smaller σ’s add detail.' },
      { example: 'noise', prompt: 'Noise has no structure to exploit: every σ is about as big as the next, so ten pieces still look like mush.' },
    ],
  },
});
