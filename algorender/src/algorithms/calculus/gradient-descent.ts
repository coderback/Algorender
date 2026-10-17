import { defineAlgorithm } from '@/engine/module';
import type { Frame } from '@/engine/types';
import { askInOrder, numbersIn, plain, plotFrame } from '@/viz/plot/frame';
import { fmt, fmtVec, round } from '@/viz/plot/geometry';
import type { PlanePart, PlotPart, PlotState, Shape, Vec } from '@/viz/plot/types';
import { contourShape, parseSurface, SURFACES, type Surface, type SurfaceId } from './surfaces';

export const MAX_STEPS = 40;
/** A gradient this small counts as flat ground: the run has arrived. */
const FLAT = 1e-3;
const MAX_LR = 2;

export type DescentInput = { surface: SurfaceId; lr: number; start: Vec };

const pseudocode = [
  'x ← start;  choose a step size η',
  'repeat:',
  '  g ← ∇f(x)         the uphill direction',
  '  x ← x − η·g       a step downhill',
  'until g ≈ 0, or we give up',
];

type Run = { xs: Vec[]; fs: number[]; gs: Vec[]; outcome: 'flat' | 'diverged' | 'steps' };

/** The whole descent, run ahead of time so every frame can draw the loss chart on one scale. */
export function descend({ surface, lr, start }: DescentInput): Run {
  const s = SURFACES[surface];
  const xs: Vec[] = [start];
  const fs = [s.f(...start)];
  const gs: Vec[] = [];
  const span = Math.max(s.x.max - s.x.min, s.y.max - s.y.min);
  for (let k = 0; k < MAX_STEPS; k++) {
    const x = xs[k];
    const g = s.grad(...x);
    gs.push(g);
    if (Math.hypot(...g) < FLAT) return { xs, fs, gs, outcome: 'flat' };
    const next: Vec = [x[0] - lr * g[0], x[1] - lr * g[1]];
    xs.push(next);
    fs.push(s.f(...next));
    const far = Math.abs(next[0]) > 3 * span || Math.abs(next[1]) > 3 * span || !Number.isFinite(fs[k + 1]);
    if (far) return { xs, fs, gs, outcome: 'diverged' };
  }
  gs.push(s.grad(...xs[xs.length - 1]));
  return { xs, fs, gs, outcome: Math.hypot(...gs[gs.length - 1]) < FLAT ? 'flat' : 'steps' };
}

function contourPlane(s: Surface, xs: readonly Vec[], extra: Shape[], start: Vec): PlanePart {
  const here = xs[xs.length - 1];
  return {
    kind: 'plane',
    id: 'plane',
    label: `Contours of f = ${s.formula}`,
    x: s.x,
    y: s.y,
    equal: true,
    shapes: [
      contourShape(s),
      ...s.minima.map((m, k): Shape => ({ kind: 'point', id: `min${k}`, at: m, mark: 'found', size: 'sm' })),
      { kind: 'path', id: 'trail', points: xs, dots: true },
      ...extra,
      { kind: 'point', id: 'x', at: here, mark: 'key', size: 'lg', label: 'x' },
    ],
    handles: [{ id: 'start', at: start, label: 'Start', step: 0.1, min: [s.x.min, s.y.min], max: [s.x.max, s.y.max] }],
  };
}

function lossPlane(fs: readonly number[], top: number, bottom: number): PlanePart {
  return {
    kind: 'plane',
    id: 'loss',
    label: 'f after each step',
    x: { min: 0, max: MAX_STEPS, label: 'step' },
    y: { min: bottom, max: top, label: 'f' },
    equal: false,
    shapes: [{ kind: 'path', id: 'loss', points: fs.map((f, k): Vec => [k, Math.min(f, top * 4)]), mark: 'key' }],
    handles: [],
  };
}

function* run(input: DescentInput): Generator<Frame<PlotState>> {
  const s = SURFACES[input.surface];
  const { lr, start } = input;
  const r = descend(input);
  const finite = r.fs.filter(Number.isFinite);
  // The chart's scale: from the lowest value on the surface (or reached) to a bit above the start.
  const bottom = Math.min(0, ...finite, ...s.minima.map((m) => s.f(...m)));
  const top = Math.max(r.fs[0] * 1.15, bottom + 0.5);
  const parts = (k: number, extra: Shape[] = []): PlotPart[] => [
    contourPlane(s, r.xs.slice(0, k + 1), extra, start),
    lossPlane(r.fs.slice(0, k + 1), top, bottom),
    {
      kind: 'readouts',
      id: 'readouts',
      label: 'Values',
      items: [
        { id: 'x', label: 'x', value: fmtVec(r.xs[k]), mark: 'key' },
        { id: 'f', label: 'f(x)', value: fmt(r.fs[k], 3) },
        { id: 'lr', label: 'η', value: fmt(lr, 3) },
      ],
    },
  ];
  const steps = r.xs.length - 1;
  const down = (k: number) => r.fs[k + 1] < r.fs[k];
  const willDrop = (k: number) =>
    askInOrder(`Will f be lower after step ${k + 1}?`, ['Yes', 'No'], down(k) ? 'Yes' : 'No');

  yield plotFrame(parts(0), {
    line: 0,
    note: `Find the bottom of f = ${s.formula} by only ever looking at the slope where you stand. Start at ${fmtVec(start)} (drag it), with step size η = ${fmt(lr, 3)}.`,
    vars: { η: lr, x: start[0], y: start[1] },
    stats: { steps: 0 },
  });

  for (let k = 0; k < steps; k++) {
    const x = r.xs[k];
    const g = r.gs[k];
    const next = r.xs[k + 1];
    const vars = { η: lr, x: round(x[0], 3), y: round(x[1], 3), 'g.x': round(g[0], 3), 'g.y': round(g[1], 3) };
    yield plotFrame(parts(k, [{ kind: 'vector', id: 'step', from: x, to: next, mark: 'compare', label: '−η·g' }]), {
      line: 2,
      note: `The gradient at ${fmtVec(x)} is ${fmtVec(g)}: f climbs fastest that way. So step the other way, by η times it: ${fmtVec([next[0] - x[0], next[1] - x[1]])}.`,
      vars,
      stats: { steps: k },
      checkpoint: willDrop(k),
    });
    const ratio = r.fs[k] === 0 ? 0 : r.fs[k + 1] / r.fs[k];
    yield plotFrame(parts(k + 1), {
      line: 3,
      note: down(k)
        ? `Step ${k + 1}: f fell from ${fmt(r.fs[k], 3)} to ${fmt(r.fs[k + 1], 3)}${
            s.id === 'valley' && Math.sign(next[1]) * Math.sign(x[1]) < 0
              ? ', but x jumped across the valley floor: a step that suits the gentle slope along the valley is too big for the steep sides'
              : ''
          }.`
        : `Step ${k + 1}: f went up from ${fmt(r.fs[k], 3)} to ${fmt(r.fs[k + 1], 3)}. The step was so big it jumped clean over the valley${ratio > 1 ? ' and landed higher up the far side' : ''}.`,
      vars: { ...vars, x: round(next[0], 3), y: round(next[1], 3) },
      stats: { steps: k + 1 },
    });
  }

  const end = r.xs[steps];
  const near = s.minima.findIndex((m) => Math.hypot(m[0] - end[0], m[1] - end[1]) < 0.15);
  const where =
    near === 0
      ? 'the lowest point'
      : near > 0
        ? `a valley that is not the lowest one (the global minimum is at ${fmtVec(s.minima[0])}): gradient descent only sees the ground under its feet`
        : `${fmtVec(end)}`;
  yield plotFrame(parts(steps), {
    line: 4,
    note:
      r.outcome === 'flat'
        ? `After ${steps} steps the ground is flat (the gradient is about 0), so x has stopped at ${where}.`
        : r.outcome === 'diverged'
          ? `η = ${fmt(lr, 3)} is too big: every step overshoots by more than the last, and x flies off the map. Halve the step size and try again.`
          : `${MAX_STEPS} steps used up and still not flat: x got to ${where} with f = ${fmt(r.fs[steps], 3)}. ${
              lr < s.rates.plain ? 'The steps are too timid; a bigger η would get there sooner.' : 'Try another step size or start.'
            }`,
    vars: { η: lr, x: round(end[0], 3), y: round(end[1], 3) },
    stats: { steps },
  });
}

const example = (id: string, label: string, input: DescentInput) => ({ id, label, make: () => input, sized: false });

export const gradientDescent = defineAlgorithm<DescentInput, PlotState>({
  kind: 'algorithm',
  slug: 'gradient-descent',
  view: 'plot',
  input: {
    examples: [
      example('bowl', 'Round bowl', { surface: 'bowl', lr: 0.1, start: [-2.5, 2] }),
      example('zigzag', 'Narrow valley', { surface: 'valley', lr: 0.18, start: [-3.5, 1.5] }),
      example('timid', 'Tiny steps', { surface: 'valley', lr: 0.02, start: [-3.5, 1.5] }),
      example('too-big', 'Too big a step', { surface: 'bowl', lr: 1.05, start: [-2, 1.5] }),
      example('banana', 'Banana valley', { surface: 'banana', lr: 0.02, start: [-1.5, 2] }),
      example('two-valleys', 'Two valleys', { surface: 'two-valleys', lr: 0.05, start: [1.8, 1.2] }),
    ],
    custom: {
      label: 'Surface (bowl, valley, banana, two-valleys), step size and start',
      placeholder: 'e.g. valley, lr = 0.1, start = (-3, 1.5)',
      parse: (text) => {
        const surface = parseSurface(text.split(/[,;]/)[0] ?? '');
        if (!surface) return { error: 'Start with a surface: bowl, valley, banana or two-valleys.' };
        const xs = numbersIn(text.slice(text.search(/[,;]/) + 1 || text.length));
        if (xs.length !== 3) return { error: 'Then give the step size and the start, e.g. lr = 0.1, start = (-3, 1.5).' };
        const [lr, x, y] = xs;
        if (!(lr > 0 && lr <= MAX_LR)) return { error: `The step size must be above 0 and at most ${MAX_LR}.` };
        const s = SURFACES[surface];
        if (x < s.x.min || x > s.x.max || y < s.y.min || y > s.y.max) {
          return { error: `Start inside the map: x from ${s.x.min} to ${s.x.max}, y from ${s.y.min} to ${s.y.max}.` };
        }
        return { value: { surface, lr: round(lr, 4), start: [round(x, 2), round(y, 2)] } };
      },
      format: ({ surface, lr, start }) => `${surface}, lr = ${plain(lr, 4)}, start = (${plain(start[0])}, ${plain(start[1])})`,
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
    { mark: 'key', label: 'Where x is now' },
    { mark: 'compare', label: 'The next step, −η·∇f' },
    { mark: 'found', label: 'A minimum' },
  ],
  run,
  content: {
    idea: 'To find the bottom of a surface you can only feel underfoot, step downhill: the gradient ∇f points the way f rises fastest, so move a little against it, x ← x − η·∇f, and repeat until the ground is flat. Training a neural network is this, on a surface with millions of dimensions.',
    invariant: 'For a small enough step size η, every step lowers f, because near x the surface is close to its tangent plane. Too big a step outruns that approximation: it can overshoot and climb the far side, or blow up.',
    whenToUse: 'Minimising any differentiable function too big to solve directly: fitting regression weights, training neural networks (on mini-batches, as stochastic gradient descent). The step size is the key setting: too small crawls, too big bounces or diverges.',
    traits: [
      { label: 'Needs only the gradient', good: true },
      { label: 'Finds a local minimum, not always the lowest', good: false },
      { label: 'Step size is critical', good: null },
    ],
    experiments: [
      { example: 'zigzag', prompt: 'The valley curves 100 times more sharply across than along. A step fit for the steep direction is far too timid for the shallow one, so the path zigzags.' },
      { example: 'too-big', prompt: 'With η = 1.05 on x² + y², each step lands 1.1× as far out on the other side. Predict: does f ever go down?' },
      { example: 'two-valleys', prompt: 'Starting on the right, descent settles in the right-hand valley even though the left one is lower. Drag the start to the left half and run again.' },
      { example: 'timid', prompt: 'η = 0.02 is safe but slow: 40 steps barely cross the valley floor.' },
    ],
  },
});
