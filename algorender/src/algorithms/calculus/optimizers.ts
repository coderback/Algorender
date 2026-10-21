import { defineAlgorithm } from '@/engine/module';
import type { Frame } from '@/engine/types';
import type { Tone } from '@/viz/marks';
import { askInOrder, numbersIn, plain, plotFrame } from '@/viz/plot/frame';
import { fmt, fmtVec, round } from '@/viz/plot/geometry';
import type { PlanePart, PlotPart, PlotState, Shape, Vec } from '@/viz/plot/types';
import { contourShape, parseSurface, SURFACES, washShape, type Surface, type SurfaceId } from './surfaces';

export const RACE_STEPS = 60;
/** Within this of the lowest value counts as "at the bottom". */
const AT_BOTTOM = 0.01;
const BETA = 0.9;
const RHO = 0.9;
const BETA2 = 0.999;
const EPS = 1e-8;

export type RaceInput = { surface: SurfaceId; start: Vec };

export type OptimizerId = 'gd' | 'momentum' | 'rmsprop' | 'adam';
export const OPTIMIZERS: readonly { id: OptimizerId; name: string; short: string; tone: Tone }[] = [
  { id: 'gd', name: 'Gradient descent', short: 'GD', tone: 1 },
  { id: 'momentum', name: 'Momentum', short: 'Mom', tone: 2 },
  { id: 'rmsprop', name: 'RMSProp', short: 'RMS', tone: 3 },
  { id: 'adam', name: 'Adam', short: 'Adam', tone: 4 },
];

const pseudocode = [
  'every step, each one: g ← ∇f(x)',
  'GD:   x ← x − η·g',
  'Mom:  v ← β·v + g;   x ← x − η·v',
  'RMS:  s ← ρ·s + (1 − ρ)·g²',
  '      x ← x − η·g / √s',
  'Adam: m ← β·m + (1 − β)·g;  s as RMS',
  '      x ← x − η·m / √s  (bias-corrected)',
];

type Path = { xs: Vec[]; fs: number[]; diverged: boolean };

/** Runs one optimizer for RACE_STEPS steps (fewer if it flies off the map). */
export function race(s: Surface, start: Vec, id: OptimizerId): Path {
  const lr = id === 'gd' ? s.rates.plain : id === 'momentum' ? s.rates.momentum : s.rates.adaptive;
  const xs: Vec[] = [start];
  const fs = [s.f(...start)];
  let v: Vec = [0, 0];
  let m: Vec = [0, 0];
  let sq: Vec = [0, 0];
  const span = Math.max(s.x.max - s.x.min, s.y.max - s.y.min);
  for (let t = 1; t <= RACE_STEPS; t++) {
    const x = xs[t - 1];
    const g = s.grad(...x);
    let step: Vec;
    switch (id) {
      case 'gd':
        step = [lr * g[0], lr * g[1]];
        break;
      case 'momentum':
        v = [BETA * v[0] + g[0], BETA * v[1] + g[1]];
        step = [lr * v[0], lr * v[1]];
        break;
      case 'rmsprop':
        sq = [RHO * sq[0] + (1 - RHO) * g[0] ** 2, RHO * sq[1] + (1 - RHO) * g[1] ** 2];
        step = [(lr * g[0]) / (Math.sqrt(sq[0]) + EPS), (lr * g[1]) / (Math.sqrt(sq[1]) + EPS)];
        break;
      case 'adam': {
        m = [BETA * m[0] + (1 - BETA) * g[0], BETA * m[1] + (1 - BETA) * g[1]];
        sq = [BETA2 * sq[0] + (1 - BETA2) * g[0] ** 2, BETA2 * sq[1] + (1 - BETA2) * g[1] ** 2];
        const mh = [m[0] / (1 - BETA ** t), m[1] / (1 - BETA ** t)];
        const sh = [sq[0] / (1 - BETA2 ** t), sq[1] / (1 - BETA2 ** t)];
        step = [(lr * mh[0]) / (Math.sqrt(sh[0]) + EPS), (lr * mh[1]) / (Math.sqrt(sh[1]) + EPS)];
        break;
      }
    }
    const next: Vec = [x[0] - step[0], x[1] - step[1]];
    const f = s.f(...next);
    if (!Number.isFinite(f) || Math.abs(next[0]) > 3 * span || Math.abs(next[1]) > 3 * span) return { xs, fs, diverged: true };
    xs.push(next);
    fs.push(f);
  }
  return { xs, fs, diverged: false };
}

/** Position and value at step k (an optimizer that flew off stays at its last point). */
const at = (p: Path, k: number) => Math.min(k, p.xs.length - 1);

function* run({ surface, start }: RaceInput): Generator<Frame<PlotState>> {
  const s = SURFACES[surface];
  const fmin = s.f(...s.minima[0]);
  const paths = OPTIMIZERS.map((o) => race(s, start, o.id));
  const top = Math.max(0.5, (paths[0].fs[0] - fmin) * 1.15);
  const gap = (p: Path, k: number) => p.fs[at(p, k)] - fmin;
  const leader = (k: number) => OPTIMIZERS[paths.map((p) => gap(p, k)).reduce((best, g, i, all) => (g < all[best] - 1e-12 ? i : best), 0)];

  const parts = (k: number): PlotPart[] => {
    const shapes: Shape[] = [washShape(s), contourShape(s), ...s.minima.map((m, i): Shape => ({ kind: 'point', id: `min${i}`, at: m, mark: 'found', size: 'sm' }))];
    OPTIMIZERS.forEach((o, i) => shapes.push({ kind: 'path', id: `trail-${o.id}`, points: paths[i].xs.slice(0, at(paths[i], k) + 1), tone: o.tone }));
    OPTIMIZERS.forEach((o, i) => shapes.push({ kind: 'point', id: `x-${o.id}`, at: paths[i].xs[at(paths[i], k)], tone: o.tone, label: o.short }));
    const plane: PlanePart = {
      kind: 'plane',
      id: 'plane',
      label: `Contours of f = ${s.formula}`,
      x: s.x,
      y: s.y,
      equal: true,
      shapes,
      handles: [{ id: 'start', at: start, label: 'Start', step: 0.1, min: [s.x.min, s.y.min], max: [s.x.max, s.y.max] }],
    };
    const loss: PlanePart = {
      kind: 'plane',
      id: 'loss',
      label: 'How far above the minimum, per step',
      x: { min: 0, max: RACE_STEPS, label: 'step' },
      y: { min: 0, max: top, label: 'f − min' },
      equal: false,
      shapes: OPTIMIZERS.map((o, i) => ({
        kind: 'path',
        id: `loss-${o.id}`,
        points: paths[i].fs.slice(0, at(paths[i], k) + 1).map((f, j): Vec => [j, Math.min(f - fmin, top * 4)]),
        tone: o.tone,
      })),
      handles: [],
    };
    return [
      plane,
      loss,
      {
        kind: 'readouts',
        id: 'readouts',
        label: 'f − min',
        items: OPTIMIZERS.map((o, i) => ({ id: o.id, label: o.name, value: paths[i].diverged && k >= paths[i].xs.length ? 'flew off' : fmt(gap(paths[i], k), 3), tone: o.tone })),
      },
    ];
  };

  const vars = (k: number) => Object.fromEntries(OPTIMIZERS.map((o, i) => [o.short, round(gap(paths[i], k), 3)]));
  const reached = new Set<OptimizerId>();
  const climbed = new Set<OptimizerId>();
  const ask = (k: number) =>
    k % 10 === 9 && k + 1 <= RACE_STEPS
      ? askInOrder(`Which optimizer will be lowest after step ${k + 1}?`, OPTIMIZERS.map((o) => o.name), leader(k + 1).name)
      : undefined;

  yield plotFrame(parts(0), {
    line: 0,
    note: `Four optimizers start together at ${fmtVec(start)} on f = ${s.formula}. Each sees the same gradient but turns it into a step differently. Drag the start to race from elsewhere.`,
    vars: vars(0),
    stats: { steps: 0 },
    checkpoint: askInOrder('Which optimizer will be lowest after step 1?', OPTIMIZERS.map((o) => o.name), leader(1).name),
  });

  // Events found on a frame that asks a question wait for the next frame, so a note never names the answer.
  let pending: string[] = [];
  for (let k = 1; k <= RACE_STEPS; k++) {
    const events: string[] = pending;
    pending = [];
    OPTIMIZERS.forEach((o, i) => {
      const p = paths[i];
      if (k < p.xs.length && !reached.has(o.id) && gap(p, k) < AT_BOTTOM) {
        reached.add(o.id);
        events.push(reached.size === 1 ? `${o.name} reaches the bottom first` : `${o.name} reaches the bottom too`);
      }
      if (k < p.xs.length && p.fs[k] > p.fs[k - 1] + 1e-9 && !climbed.has(o.id)) {
        climbed.add(o.id);
        events.push(
          o.id === 'momentum'
            ? 'Momentum’s f went up: its built-up speed carried it past the low point, and it will swing back'
            : o.id === 'gd'
              ? 'plain gradient descent’s f went up: the step overshot'
              : `${o.name}’s f went up: its steps stay about η long even near the bottom, so it jitters there`,
        );
      }
      if (p.diverged && k === p.xs.length) events.push(`${o.name} flew off the map`);
    });
    const lead = leader(k);
    const checkpoint = ask(k);
    if (checkpoint) pending = events;
    yield plotFrame(parts(k), {
      line: 0,
      note: checkpoint
        ? `Step ${k}. Compare the four trails and the chart, then predict.`
        : `Step ${k}: ${events.length ? `${events.join('; ')}.` : `${lead.name} is lowest so far, ${fmt(gap(paths[OPTIMIZERS.indexOf(lead)], k), 3)} above the minimum.`}`,
      vars: vars(k),
      stats: { steps: k },
      checkpoint,
    });
  }

  const ranking = OPTIMIZERS.map((o, i) => ({ o, g: gap(paths[i], RACE_STEPS), end: paths[i].xs[at(paths[i], RACE_STEPS)] })).sort((a, b) => a.g - b.g);
  const valley = (end: Vec) => s.minima.findIndex((m) => Math.hypot(m[0] - end[0], m[1] - end[1]) < 0.25);
  const stuck = ranking.filter((r) => valley(r.end) > 0).map((r) => r.o.name);
  const lessons: Record<SurfaceId, string> = {
    bowl: 'On a round bowl every direction is alike, so plain steps already point straight at the bottom.',
    valley: 'In a narrow valley plain descent zigzags across the steep sides; momentum averages the zigzag away, and RMSProp and Adam shrink the steep direction’s steps.',
    banana: 'In a curved valley the gradient mostly points at the walls, not along the floor; momentum and Adam keep moving along it.',
    'two-valleys': stuck.length
      ? `${stuck.join(' and ')} settled in the higher valley; whichever started rolling fast enough crossed the ridge to the lower one.`
      : 'Every optimizer found the lower valley from this start.',
  };
  yield plotFrame(parts(RACE_STEPS), {
    line: null,
    note: `After ${RACE_STEPS} steps: ${ranking.map((r) => `${r.o.name} ${fmt(r.g, 3)}`).join(', ')} above the minimum. ${lessons[surface]}`,
    vars: vars(RACE_STEPS),
    stats: { steps: RACE_STEPS },
  });
}

const example = (id: string, label: string, input: RaceInput) => ({ id, label, make: () => input, sized: false });

export const optimizers = defineAlgorithm<RaceInput, PlotState>({
  kind: 'algorithm',
  slug: 'optimizers',
  view: 'plot',
  input: {
    examples: [
      example('valley', 'Narrow valley', { surface: 'valley', start: [-3.5, 1.5] }),
      example('banana', 'Banana valley', { surface: 'banana', start: [-1.5, 2] }),
      example('two-valleys', 'Two valleys', { surface: 'two-valleys', start: [1.8, 1.2] }),
      example('bowl', 'Round bowl', { surface: 'bowl', start: [-2.5, 2] }),
    ],
    custom: {
      label: 'Surface (bowl, valley, banana, two-valleys) and start',
      placeholder: 'e.g. banana, start = (-1.5, 2)',
      parse: (text) => {
        const surface = parseSurface(text.split(/[,;]/)[0] ?? '');
        if (!surface) return { error: 'Start with a surface: bowl, valley, banana or two-valleys.' };
        const xs = numbersIn(text.slice(text.search(/[,;]/) + 1 || text.length));
        if (xs.length !== 2) return { error: 'Then give the start, e.g. start = (-1.5, 2).' };
        const s = SURFACES[surface];
        const [x, y] = xs;
        if (x < s.x.min || x > s.x.max || y < s.y.min || y > s.y.max) {
          return { error: `Start inside the map: x from ${s.x.min} to ${s.x.max}, y from ${s.y.min} to ${s.y.max}.` };
        }
        return { value: { surface, start: [round(x, 2), round(y, 2)] } };
      },
      format: ({ surface, start }) => `${surface}, start = (${plain(start[0])}, ${plain(start[1])})`,
    },
    drag: (input, _handle, to) => {
      const s = SURFACES[input.surface];
      const clamp = (v: number, a: { min: number; max: number }) => Math.min(a.max, Math.max(a.min, v));
      return { ...input, start: [clamp(to[0], s.x), clamp(to[1], s.y)] };
    },
  },
  pseudocode,
  stats: [{ key: 'steps', label: 'Steps' }],
  legend: [
    { neutral: 'Contour lines: equal f' },
    ...OPTIMIZERS.map((o) => ({ tone: o.tone, label: o.name })),
    { mark: 'found', label: 'A minimum' },
  ],
  run,
  content: {
    idea: 'Plain gradient descent takes a step against the gradient, no matter what happened before. Momentum keeps a running velocity so steps that agree build up speed and steps that zigzag cancel; RMSProp divides each direction by its recent gradient size, so steep and shallow directions get similar steps; Adam does both.',
    invariant: 'Every optimizer uses only the gradient at the current point plus a little memory of past gradients (a velocity, or running averages). None of them ever sees the surface itself, which is why they can stall, zigzag or overshoot.',
    whenToUse: 'Adam is the usual default for training neural networks because it copes with directions of very different steepness without tuning; momentum (SGD with momentum) often generalises a little better on large vision models. Plain gradient descent is the baseline that explains the rest.',
    traits: [
      { label: 'Momentum: speed through ravines', good: true },
      { label: 'Adaptive: per-direction step sizes', good: true },
      { label: 'All of them only see local slope', good: null },
    ],
    experiments: [
      { example: 'valley', prompt: 'Watch plain gradient descent zigzag across the valley while momentum smooths the zigzag and Adam heads along the floor.' },
      { example: 'banana', prompt: 'The curved valley floor is nearly flat along its length: compare who is still crawling after 60 steps.' },
      { example: 'two-valleys', prompt: 'Momentum’s speed can carry it over the ridge into the lower valley. Drag the start and see who crosses.' },
    ],
  },
});
