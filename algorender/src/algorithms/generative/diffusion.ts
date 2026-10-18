import { createRng } from '@/engine/random';
import { defineAlgorithm } from '@/engine/module';
import type { Frame } from '@/engine/types';
import {
  alphaBars,
  betas,
  distanceToShape,
  gaussian,
  generate,
  netFromJson,
  noised,
  outline,
  predictClean,
  predictNoise,
  round2p,
  sampleShape,
  SHAPES,
  T,
  type DiffusionShape,
  type P2,
} from '@/ml/denoiser';
import pretrained from '@/ml/pretrained/diffusion.json';
import { ask, askInOrder, plotFrame } from '@/viz/plot/frame';
import { fmt, fmtVec } from '@/viz/plot/geometry';
import type { PlanePart, PlotPart, PlotState, Shape, Vec } from '@/viz/plot/types';

export type DiffusionInput = { shape: DiffusionShape; n: number; seed: number };

export const MIN_N = 30;
export const MAX_N = 150;
/** The forward process is shown at these steps (the closed form jumps straight to any t). */
export const FORWARD_STEPS = [1, 2, 3, 5, 7, 10, 13, 16, 20, 24, 28, 32, 36, 40] as const;
/** The step the denoiser's job is shown at. */
const DEMO_T = 20;
const BOX = 3.5;

const net = netFromJson(pretrained.weights);

const pseudocode = [
  'x₀ ← points of the data',
  'for t = 1 to T:          forward',
  '  x_t ← √ᾱ_t·x₀ + √(1 − ᾱ_t)·ε',
  'x_T ← fresh noise from N(0, I)',
  'for t = T down to 1:     reverse',
  '  ε̂ ← denoiser(x_t, t)',
  '  x ← (x_t − β_t/√(1 − ᾱ_t)·ε̂)/√α_t',
  '  if t > 1: x ← x + σ_t·z',
];

const NAMES: Record<DiffusionShape, string> = { spiral: 'a spiral', ring: 'a ring', moons: 'two moons' };

/** The data (x₀) and one fixed noise draw ε per point, both rounded to hundredths. */
export function dataOf({ shape, n, seed }: DiffusionInput): { x0: P2[]; eps: P2[] } {
  const rng = createRng(seed);
  const x0 = Array.from({ length: n }, () => round2p(sampleShape(shape, rng)));
  const eps = Array.from({ length: n }, () => round2p([gaussian(rng), gaussian(rng)]));
  return { x0, eps };
}

/** The reverse run for an input: positions[t] from t = T (fresh noise) down to 0, and each step's predicted noise. */
export const reverseOf = ({ shape, n, seed }: DiffusionInput) => generate(net, shape, n, seed);

/** Indices of the followed points: the first is drawn large, the other two in tones. */
const FOLLOW = [0, 1, 2] as const;
/** How many recent positions a followed point's trail keeps during the reverse walk. */
const TRAIL = 8;

const signal = (t: number) => Math.sqrt(alphaBars[t]);
const noiseLevel = (t: number) => Math.sqrt(1 - alphaBars[t]);
const clampBox = (v: number) => Math.min(BOX, Math.max(-BOX, v));
const shown = (p: P2): Vec => [clampBox(p[0]), clampBox(p[1])];
const r2 = (v: number) => Math.round(v * 100) / 100 + 0;

/** Which way a move goes, in words, or null when it is too small or diagonal-ish to call. */
function compass(d: P2): string | null {
  if (Math.abs(d[0]) < 0.02 || Math.abs(d[1]) < 0.02) return null;
  return `${d[1] > 0 ? 'Up' : 'Down'} and ${d[0] > 0 ? 'right' : 'left'}`;
}
const DIRECTIONS = ['Up and left', 'Up and right', 'Down and left', 'Down and right'];

function* run(input: DiffusionInput): Generator<Frame<PlotState>> {
  const { shape, n } = input;
  const { x0, eps } = dataOf(input);
  const { positions, predicted } = reverseOf(input);
  const curves = outline(shape);

  const schedule = (t: number): PlanePart => {
    const ts = Array.from({ length: T + 1 }, (_, k) => k);
    return {
      kind: 'plane',
      id: 'schedule',
      label: 'Signal and noise at each step t',
      x: { min: 0, max: T, label: 't' },
      y: { min: 0, max: 1.05 },
      equal: false,
      shapes: [
        { kind: 'path', id: 'signal', points: ts.map((k): Vec => [k, r2(signal(k))]), tone: 1, label: '√ᾱ signal' },
        { kind: 'path', id: 'noise', points: ts.map((k): Vec => [k, r2(noiseLevel(k))]), tone: 2, label: '√(1−ᾱ) noise' },
        { kind: 'point', id: 'now-signal', at: [t, r2(signal(t))], tone: 1, size: 'md' },
        { kind: 'point', id: 'now-noise', at: [t, r2(noiseLevel(t))], tone: 2, size: 'md' },
        { kind: 'line', id: 'now', through: [t, 0], dir: [0, 1], dashed: true },
      ],
      handles: [],
    };
  };

  const scene = (o: {
    t: number;
    points: readonly P2[];
    prefix: string;
    trails: readonly (readonly P2[])[];
    extra?: Shape[];
    phase: string;
  }): PlotPart[] => {
    const shapes: Shape[] = curves.map((c, k) => ({ kind: 'path', id: `outline-${k}`, points: c.map(shown), faint: true }));
    o.trails.forEach((trail, k) => {
      if (trail.length > 1) shapes.push({ kind: 'path', id: `trail-${k}`, points: trail.map(shown), dashed: k > 0, ...(k === 0 ? { mark: 'key' as const } : { tone: (k + 2) as 3 | 4 }) });
    });
    o.points.forEach((p, i) => {
      const follow = FOLLOW.indexOf(i as 0 | 1 | 2);
      shapes.push(
        follow === 0
          ? { kind: 'point', id: `${o.prefix}${i}`, at: shown(p), mark: 'key', size: 'lg', label: 'x' }
          : follow > 0
            ? { kind: 'point', id: `${o.prefix}${i}`, at: shown(p), tone: (follow + 2) as 3 | 4, size: 'md' }
            : { kind: 'point', id: `${o.prefix}${i}`, at: shown(p), size: 'sm' },
      );
    });
    shapes.push(...(o.extra ?? []));
    const plane: PlanePart = {
      kind: 'plane',
      id: 'plane',
      label: `${n} points at step t = ${o.t}`,
      x: { min: -BOX, max: BOX },
      y: { min: -BOX, max: BOX },
      equal: true,
      shapes,
      handles: [],
    };
    return [
      plane,
      schedule(o.t),
      {
        kind: 'readouts',
        id: 'readouts',
        label: 'Diffusion',
        items: [
          { id: 'phase', label: 'phase', value: o.phase },
          { id: 't', label: 't', value: String(o.t) },
          { id: 'abar', label: 'ᾱ_t', value: fmt(alphaBars[o.t], 3) },
          { id: 'signal', label: 'signal √ᾱ_t', value: fmt(signal(o.t), 2), tone: 1 },
          { id: 'noise', label: 'noise √(1−ᾱ_t)', value: fmt(noiseLevel(o.t), 2), tone: 2 },
        ],
      },
    ];
  };

  let noisedTo = 0;
  let denoised = 0;
  let calls = 0;
  const stats = () => ({ noised: noisedTo, denoised, calls });

  yield plotFrame(scene({ t: 0, points: x0, prefix: 'd', trails: [], phase: 'data' }), {
    line: 0,
    note: `The data: ${n} points that together make ${NAMES[shape]}. A diffusion model learns to make new points like these. It is trained by destroying data with noise a little at a time, and learning to undo each step.`,
    vars: { n, T },
    stats: stats(),
  });

  // ── Forward: noise the data, a little more at every step ──
  const forwardTrails: P2[][] = FOLLOW.map((i) => [x0[i]]);
  for (let k = 0; k < FORWARD_STEPS.length; k++) {
    const t = FORWARD_STEPS[k];
    noisedTo = t;
    const pts = x0.map((p, i) => round2p(noised(p, eps[i], t)));
    FOLLOW.forEach((i, f) => forwardTrails[f].push(pts[i]));
    const { note, checkpoint } = forwardText(t, k, pts);
    yield plotFrame(scene({ t, points: pts, prefix: 'd', trails: forwardTrails, phase: 'forward' }), {
      line: 2,
      note,
      vars: { t, 'ᾱ_t': Number(fmt(alphaBars[t], 4)), 'x.x': r2(pts[0][0]), 'x.y': r2(pts[0][1]) },
      stats: stats(),
      ...(checkpoint && { checkpoint }),
    });
  }

  // ── The denoiser's job, on the followed point at one step ──
  {
    const t = DEMO_T;
    const xt = round2p(noised(x0[0], eps[0], t));
    const guess = predictNoise(net, xt, t, shape);
    calls++;
    const s = noiseLevel(t);
    const tip = (e: P2): Vec => shown([xt[0] - s * e[0], xt[1] - s * e[1]]);
    const err = Math.hypot(guess[0] - eps[0][0], guess[1] - eps[0][1]);
    const points = x0.map((p, i) => (i === 0 ? xt : round2p(noised(p, eps[i], t))));
    yield plotFrame(
      scene({
        t,
        points,
        prefix: 'd',
        trails: [],
        phase: 'training',
        extra: [
          { kind: 'vector', id: 'true-step', from: shown(xt), to: tip(eps[0]), mark: 'path', label: 'true' },
          { kind: 'vector', id: 'guess-step', from: shown(xt), to: tip(guess), mark: 'compare', dashed: true, label: 'guess' },
        ],
      }),
      {
        line: 5,
        note: `The denoiser's job. Take a clean point, noise it to t = ${t} (x is at ${fmtVec(xt)}), and ask a small network: which noise ε was added? Its answer ε̂ = ${fmtVec(guess)}; the truth was ${fmtVec(eps[0])}. Each arrow takes x back by √(1 − ᾱ_t) times a noise; with the true noise it lands exactly on √ᾱ_t·x₀. It was trained before this page loaded, on ${pretrained.config.steps * pretrained.config.batch} such examples, to make the squared error ‖ε̂ − ε‖² small (here ${fmt(err * err, 2)}).`,
        vars: { t, 'ε.x': r2(eps[0][0]), 'ε.y': r2(eps[0][1]), 'ε̂.x': r2(guess[0]), 'ε̂.y': r2(guess[1]) },
        stats: stats(),
      },
    );
  }

  // ── Reverse: from fresh noise back to the shape ──
  const trails: P2[][] = FOLLOW.map(() => []);
  // Ask which way the followed point moves every few steps, when its move agrees with the arrow (fresh noise can outweigh it).
  let lastAsk = T + 2;
  for (let t = T; t >= 0; t--) {
    const pts = positions[t];
    FOLLOW.forEach((i, f) => trails[f].push(pts[i]));
    const extra: Shape[] = [];
    let clean: P2 | null = null;
    if (t >= 1) {
      clean = predictClean(pts[0], predicted[t][0], t);
      extra.push({ kind: 'vector', id: 'heading', from: shown(pts[0]), to: shown(clean), mark: 'compare', dashed: true, label: 'x̂₀' });
    }
    let note: string;
    let line: number;
    let checkpoint;
    if (t === T) {
      line = 3;
      note = `Now generate. Start from ${n} fresh points drawn from N(0, I): new noise, not the noised data from before. At every step the denoiser predicts each point's noise; the dashed arrow shows where that puts the clean point x̂₀ = (x_t − √(1 − ᾱ_t)·ε̂)/√ᾱ_t.`;
    } else {
      const step = t + 1;
      line = step > 1 ? 7 : 6;
      note =
        step > 1
          ? `Step t = ${step}: each point loses the predicted noise's share β_t/√(1 − ᾱ_t)·ε̂ = ${fmt(betas[step] / noiseLevel(step), 3)}·ε̂, is rescaled by 1/√α_t = ${fmt(1 / Math.sqrt(1 - betas[step]), 3)}, and gets a little fresh noise, σ_t = ${fmt(Math.sqrt(betas[step]), 3)}. Only a small move: the guess x̂₀ is unreliable while the noise is large.`
          : `Step t = 1, the last: the predicted noise is removed and no fresh noise is added, so the points land.`;
    }
    if (clean && t >= 1) {
      const d: P2 = [positions[t - 1][0][0] - pts[0][0], positions[t - 1][0][1] - pts[0][1]];
      const towards: P2 = [clean[0] - pts[0][0], clean[1] - pts[0][1]];
      const way = compass(d);
      if (t < lastAsk - 5 && t > 1 && way && way === compass(towards)) {
        lastAsk = t;
        checkpoint = askInOrder(`Use the arrow: which way will the followed point x move in the next step?`, DIRECTIONS, way);
      }
      if (t === 1) checkpoint = askInOrder('The next step is the last one, t = 1. Is fresh noise σ_t·z added after removing the predicted noise?', ['Yes', 'No'], 'No');
    }
    if (t < T) {
      denoised = T - t;
      calls += n;
    }
    if (t === 0) {
      const near = pts.filter((p) => distanceToShape(shape, p) < 0.25).length;
      note = `Done: ${near} of ${n} new points (${Math.round((100 * near) / n)}%) lie within 0.25 of ${NAMES[shape]}, though every one started as random noise. They are new samples, not copies of the training data: run it with another seed and you get different points on the same shape. ${T} small steps were needed because each guess x̂₀ is only good enough to take a small step towards it.`;
    }
    // Fresh noise makes every trail a zigzag: keep only the recent moves, and none on the finished picture.
    const recent = t === 0 ? [] : trails.map((trail) => trail.slice(-TRAIL));
    yield plotFrame(scene({ t, points: pts, prefix: 'g', trails: recent, extra, phase: t === 0 ? 'done' : 'reverse' }), {
      line: t === 0 ? 6 : line,
      note,
      vars: { t, 'x.x': r2(pts[0][0]), 'x.y': r2(pts[0][1]), ...(clean && { 'x̂₀.x': r2(clean[0]), 'x̂₀.y': r2(clean[1]) }) },
      stats: stats(),
      ...(checkpoint && { checkpoint }),
    });
  }

  function forwardText(t: number, k: number, pts: readonly P2[]) {
    const next = FORWARD_STEPS[k + 1];
    if (k === 0)
      return {
        note: `Step t = 1 adds a tiny amount of noise: β₁ = ${fmt(betas[1], 3)}, so ᾱ₁ = ${fmt(alphaBars[1], 3)}. Each point keeps √ᾱ = ${fmt(signal(1), 3)} of its position and gets √(1 − ᾱ) = ${fmt(noiseLevel(1), 3)} of its own noise ε. The schedule raises β every step.`,
        checkpoint: askInOrder(`At the next step shown, t = ${next}, will the noise level √(1 − ᾱ_t) be higher, lower or the same?`, ['Higher', 'Lower', 'The same'], 'Higher'),
      };
    if (t === 13)
      return {
        note: `t = ${t}: the signal √ᾱ_t has dropped to ${fmt(signal(t), 2)} and the noise has risen to ${fmt(noiseLevel(t), 2)}. Thanks to the closed form, any t can be reached in one jump instead of t small steps, which is what makes training fast.`,
        checkpoint: ask(`How much signal will be left at t = ${next}: √ᾱ_${next} = ?`, fmt(signal(next), 2), [
          fmt(signal(t), 2),
          fmt(signal(next) + 0.15, 2),
          fmt(signal(next) * 0.5, 2),
          fmt(alphaBars[next], 2),
        ]),
      };
    if (t === 36)
      return {
        note: `t = ${t}: only ${fmt(signal(t), 2)} of each original position is left, and the noise has a spread of ${fmt(noiseLevel(t), 2)}. The shape is barely there.`,
        checkpoint: askInOrder(
          `What will the cloud look like at t = ${T}?`,
          ['The shape, slightly blurred', 'A round blob around the origin', 'Points spread evenly over the whole square', 'Nothing: the points have gone'],
          'A round blob around the origin',
        ),
      };
    if (t === T)
      return {
        note: `t = ${T}: ᾱ_T = ${fmt(alphaBars[T], 3)}, so almost nothing of the data is left: the cloud is nearly a sample of N(0, I), a round blob with spread 1 around the origin. Any shape ends up here, which is why the reverse process can start from plain noise.`,
      };
    return {
      note: `t = ${t}: x_t = ${fmt(signal(t), 2)}·x₀ + ${fmt(noiseLevel(t), 2)}·ε. Every point shrinks towards the origin and drifts along its own noise direction; the followed point x is now at ${fmtVec(pts[FOLLOW[0]])}.`,
    };
  }
}

export const diffusion = defineAlgorithm<DiffusionInput, PlotState>({
  kind: 'algorithm',
  slug: 'diffusion',
  view: 'plot',
  input: {
    examples: [
      { id: 'spiral', label: 'Spiral', make: ({ seed, size }) => ({ shape: 'spiral', n: size, seed }) },
      { id: 'ring', label: 'Ring', make: ({ seed, size }) => ({ shape: 'ring', n: size, seed }) },
      { id: 'moons', label: 'Two moons', make: ({ seed, size }) => ({ shape: 'moons', n: size, seed }) },
    ],
    size: { label: 'Points', min: MIN_N, max: MAX_N, default: 80 },
    custom: {
      label: `Shape (spiral, ring, moons), n (${MIN_N}–${MAX_N}) and seed`,
      placeholder: 'e.g. spiral, n = 80, seed = 7',
      parse: (text) => {
        const word = (text.toLowerCase().match(/[a-z]+/) ?? [''])[0] as DiffusionShape;
        if (!SHAPES.includes(word)) return { error: 'Start with the shape: spiral, ring or moons.' };
        const n = Number(text.match(/\bn\s*=\s*(\d+)/i)?.[1]);
        const seed = Number(text.match(/\bseed\s*=\s*(\d+)/i)?.[1]);
        if (!Number.isInteger(n) || !Number.isInteger(seed)) return { error: 'Give n and seed, e.g. n = 80, seed = 7.' };
        if (n < MIN_N || n > MAX_N) return { error: `n must be between ${MIN_N} and ${MAX_N}.` };
        return { value: { shape: word, n, seed } };
      },
      format: ({ shape, n, seed }) => `${shape}, n = ${n}, seed = ${seed}`,
    },
  },
  pseudocode,
  stats: [
    { key: 'noised', label: 'Noising steps' },
    { key: 'denoised', label: 'Denoising steps' },
    { key: 'calls', label: 'Denoiser calls' },
  ],
  legend: [
    { neutral: 'Points of the cloud; the faint curve is the shape' },
    { mark: 'key', label: 'The followed point x and its trail' },
    { tone: 3, label: 'Two more followed points' },
    { mark: 'compare', label: 'The denoiser’s guess (of the noise, or the clean point x̂₀)' },
    { mark: 'path', label: 'The true noise step' },
    { tone: 1, label: 'Signal left, √ᾱ_t' },
    { tone: 2, label: 'Noise, √(1 − ᾱ_t)' },
  ],
  run,
  content: {
    idea: 'A diffusion model generates by removing noise. Training destroys data with a little noise at a time until only a blob of pure noise is left, and teaches a network to predict the noise in a noisy point. Generating runs that backwards: start from fresh noise and take many small denoising steps until points land on the shape.',
    invariant:
      'At every step of the forward process, x_t = √ᾱ_t·x₀ + √(1 − ᾱ_t)·ε with ε ~ N(0, I): signal and noise trade places as ᾱ_t falls from 1 towards 0. Each reverse step removes the predicted noise’s share and adds back a little fresh noise, so the cloud at step t looks like data noised to step t.',
    whenToUse:
      'Diffusion models generate images, audio, video and molecules (Stable Diffusion, DALL·E 3 and Sora use the idea). Here the data is 2D points so every step can be seen; an image model does the same to every pixel at once, with a much bigger network that also reads a text prompt.',
    traits: [
      { label: 'Trained by predicting noise', good: null },
      { label: 'Many small steps to generate', good: false },
      { label: 'New samples, not copies', good: true },
    ],
    experiments: [
      { example: 'spiral', prompt: 'Watch the forward process erase the spiral, then follow the three marked points as fresh noise flows back onto it.' },
      { example: 'ring', prompt: 'Early in the reverse process the guess x̂₀ jumps around; near the end it settles. Watch the dashed arrow shrink.' },
      { example: 'moons', prompt: 'Change the seed: the generated points differ every time, but they always land on the two moons.' },
    ],
  },
});
