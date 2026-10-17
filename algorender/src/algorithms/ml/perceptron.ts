import { defineAlgorithm } from '@/engine/module';
import type { Frame } from '@/engine/types';
import { CLASS_TONES, DATA_BOX, dataset, regionHeatmap, type Point2 } from '@/ml/datasets';
import { askInOrder, plotFrame } from '@/viz/plot/frame';
import { fmt, fmtVec, round } from '@/viz/plot/geometry';
import type { Bar, PlanePart, PlotPart, PlotState, Shape, Vec } from '@/viz/plot/types';

export type PerceptronData = 'linear' | 'overlap' | 'xor';
const DATA: readonly PerceptronData[] = ['linear', 'overlap', 'xor'];
export type PerceptronInput = { data: PerceptronData; n: number; seed: number };

export const MIN_N = 10;
export const MAX_N = 40;
export const MAX_EPOCHS = 8;
/** Per epoch shown step by step: this many mistakes and correct visits; the rest is summed up. */
const SHOW_MISTAKES = 6;
const SHOW_CORRECT = 2;
/** After this many frames, epochs are shown one frame each. */
const DETAIL_FRAMES = 50;

const pseudocode = [
  'w ← (0, 0);   b ← 0',
  'for each point x with class y (±1):',
  '  if y·(w·x + b) ≤ 0:     a mistake',
  '    w ← w + y·x;   b ← b + y',
  'repeat until an epoch has no mistakes',
];

export type Visit = { epoch: number; index: number; mistake: boolean; w: Vec; b: number; wAfter: Vec; bAfter: number; score: number };

export const classOf = (p: Point2) => (p.label === 1 ? 1 : -1);
export const score = (w: Vec, b: number, p: { x: number; y: number }) => w[0] * p.x + w[1] * p.y + b;

/** The classic perceptron: visit the points in order, epoch after epoch, and add y·x to w on every mistake. */
export function train(pts: readonly Point2[], maxEpochs = MAX_EPOCHS): { visits: Visit[]; mistakesPerEpoch: number[]; converged: boolean; w: Vec; b: number } {
  let w: Vec = [0, 0];
  let b = 0;
  const visits: Visit[] = [];
  const mistakesPerEpoch: number[] = [];
  for (let epoch = 1; epoch <= maxEpochs; epoch++) {
    let mistakes = 0;
    pts.forEach((p, index) => {
      const y = classOf(p);
      const s = score(w, b, p);
      const mistake = y * s <= 0;
      const wAfter: Vec = mistake ? [w[0] + y * p.x, w[1] + y * p.y] : w;
      const bAfter = mistake ? b + y : b;
      visits.push({ epoch, index, mistake, w, b, wAfter, bAfter, score: s });
      if (mistake) mistakes++;
      w = wAfter;
      b = bAfter;
    });
    mistakesPerEpoch.push(mistakes);
    if (mistakes === 0) return { visits, mistakesPerEpoch, converged: true, w, b };
  }
  return { visits, mistakesPerEpoch, converged: false, w, b };
}

export const pointsOf = ({ data, n, seed }: PerceptronInput) => dataset(data, n, seed);

const sign = (y: number) => (y > 0 ? '+1' : '−1');

function* run(input: PerceptronInput): Generator<Frame<PlotState>> {
  const pts = pointsOf(input);
  const { visits, mistakesPerEpoch, converged } = train(pts);
  const epochs = mistakesPerEpoch.length;
  const tones = [CLASS_TONES[0], CLASS_TONES[1]];
  const barTop = Math.max(2, ...mistakesPerEpoch) + 1;

  const scene = (w: Vec, b: number, o: { focus?: number; epoch: number; doneEpochs: number }): PlotPart[] => {
    const shapes: Shape[] = [];
    const norm = Math.hypot(w[0], w[1]);
    if (norm > 0) shapes.push(regionHeatmap((x, y) => (score(w, b, { x, y }) > 0 ? 1 : 0), { kind: 'classes', tones }, { cols: 30, rows: 30 }));
    pts.forEach((p, i) => {
      const wrong = classOf(p) * score(w, b, p) <= 0;
      shapes.push(
        i === o.focus
          ? { kind: 'point', id: `p${i}`, at: [p.x, p.y], mark: 'key', size: 'lg', label: 'x' }
          : wrong
            ? { kind: 'point', id: `p${i}`, at: [p.x, p.y], mark: 'reject', size: 'md' }
            : { kind: 'point', id: `p${i}`, at: [p.x, p.y], tone: tones[p.label], size: 'sm' },
      );
    });
    if (norm > 0) {
      shapes.push({ kind: 'line', id: 'boundary', through: [(-b * w[0]) / norm ** 2, (-b * w[1]) / norm ** 2], dir: [-w[1], w[0]], mark: 'compare', label: 'w·x + b = 0' });
      shapes.push({ kind: 'vector', id: 'w', from: [0, 0], to: [(1.6 * w[0]) / norm, (1.6 * w[1]) / norm], label: 'w' });
    }
    const plane: PlanePart = { kind: 'plane', id: 'plane', label: `${pts.length} points, two classes`, x: DATA_BOX.x, y: DATA_BOX.y, equal: true, shapes, handles: [] };
    const bars: Bar[] = mistakesPerEpoch.slice(0, o.doneEpochs).map((m, e) => ({ id: `e${e + 1}`, x0: e + 0.65, x1: e + 1.35, y: m, label: String(m), mark: e + 1 === o.epoch ? 'key' : null }));
    const chart: PlanePart = {
      kind: 'plane',
      id: 'epochs',
      label: 'Mistakes in each epoch',
      x: { min: 0.3, max: MAX_EPOCHS + 0.7, ticks: Array.from({ length: MAX_EPOCHS }, (_, e) => ({ at: e + 1, label: String(e + 1) })) },
      y: { min: 0, max: barTop, label: 'mistakes' },
      equal: false,
      shapes: [{ kind: 'bars', id: 'mistakes', bars }],
      handles: [],
    };
    const wrongNow = pts.filter((p) => classOf(p) * score(w, b, p) <= 0).length;
    return [
      plane,
      chart,
      {
        kind: 'readouts',
        id: 'readouts',
        label: 'Perceptron',
        items: [
          { id: 'w', label: 'w', value: fmtVec(w) },
          { id: 'b', label: 'b', value: fmt(b) },
          { id: 'epoch', label: 'epoch', value: String(o.epoch) },
          { id: 'wrong', label: 'on the wrong side', value: String(wrongNow), mark: 'reject' },
        ],
      },
    ];
  };

  let updates = 0;
  let seen = 0;
  let frames = 0;
  let asked = 1;
  const emit = (f: Frame<PlotState>) => {
    frames++;
    return f;
  };
  const stats = () => ({ updates, visits: seen });

  yield emit(
    plotFrame(scene([0, 0], 0, { epoch: 1, doneEpochs: 0 }), {
      line: 0,
      note: `Two classes of points, class A (−1) and class B (+1). The perceptron looks for a line w·x + b = 0 with each class on its own side. It starts from w = (0, 0) and b = 0, so every point sits on the "line" and counts as a mistake.`,
      vars: { 'w.x': 0, 'w.y': 0, b: 0 },
      stats: stats(),
    }),
  );

  for (let epoch = 1; epoch <= epochs; epoch++) {
    const these = visits.filter((v) => v.epoch === epoch);
    const end = these[these.length - 1];
    if (frames >= DETAIL_FRAMES) {
      for (const v of these) {
        seen++;
        if (v.mistake) updates++;
      }
      const m = mistakesPerEpoch[epoch - 1];
      yield emit(
        plotFrame(scene(end.wAfter, end.bAfter, { epoch, doneEpochs: epoch }), {
          line: 4,
          note: m === 0 ? `Epoch ${epoch}: no mistakes at all.` : `Epoch ${epoch}: ${m} ${m === 1 ? 'mistake' : 'mistakes'}, so the line moved ${m} ${m === 1 ? 'time' : 'times'}.`,
          vars: { epoch, mistakes: m, 'w.x': round(end.wAfter[0], 2), 'w.y': round(end.wAfter[1], 2), b: end.bAfter },
          stats: stats(),
        }),
      );
      continue;
    }

    let shownMistakes = 0;
    let shownCorrect = 0;
    let quiet: Visit[] = [];
    let rest = 0;
    const flushQuiet = function* () {
      if (!quiet.length) return;
      const first = quiet[0];
      const last = quiet[quiet.length - 1];
      seen += quiet.length;
      yield emit(
        plotFrame(scene(last.wAfter, last.bAfter, { epoch, doneEpochs: epoch - 1 }), {
          line: 1,
          note:
            quiet.length === 1
              ? `Point ${first.index + 1} is on its own side: no update.`
              : `Points ${first.index + 1} to ${last.index + 1} (${quiet.length} points) are all on their own side: no updates.`,
          vars: { epoch, 'w.x': round(last.w[0], 2), 'w.y': round(last.w[1], 2), b: last.b },
          stats: stats(),
        }),
      );
      quiet = [];
    };

    for (const v of these) {
      if (shownMistakes >= SHOW_MISTAKES) {
        rest++;
        continue;
      }
      if (!v.mistake && shownCorrect >= SHOW_CORRECT) {
        quiet.push(v);
        continue;
      }
      yield* flushQuiet();
      const p = pts[v.index];
      const y = classOf(p);
      const question =
        asked++ % 2 === 0
          ? askInOrder('Is the highlighted point on the wrong side of the line (or on it)?', ['Yes', 'No'], v.mistake ? 'Yes' : 'No')
          : askInOrder('Will the line move after this point?', ['Yes', 'No'], v.mistake ? 'Yes' : 'No');
      yield emit(
        plotFrame(scene(v.w, v.b, { focus: v.index, epoch, doneEpochs: epoch - 1 }), {
          line: 1,
          note: `Epoch ${epoch}, point ${v.index + 1}: x = ${fmtVec([p.x, p.y])}, class ${sign(y)}. Check which side of the line it is on.`,
          vars: { epoch, x: p.x, y: p.y, class: y, 'w.x': round(v.w[0], 2), 'w.y': round(v.w[1], 2), b: v.b },
          stats: stats(),
          checkpoint: question,
        }),
      );
      seen++;
      if (v.mistake) {
        updates++;
        shownMistakes++;
      } else shownCorrect++;
      yield emit(
        plotFrame(scene(v.wAfter, v.bAfter, { focus: v.index, epoch, doneEpochs: epoch - 1 }), {
          line: v.mistake ? 3 : 2,
          note: v.mistake
            ? `Its score w·x + b = ${fmt(v.score, 2)}${v.score === 0 ? ' is 0, on the line itself' : `, but its class is ${sign(y)}: the wrong side`}. So nudge the line towards it: w ← w ${y > 0 ? '+' : '−'} x = ${fmtVec(v.wAfter)} and b ← b ${y > 0 ? '+' : '−'} 1 = ${fmt(v.bAfter)}.`
            : `Its score w·x + b = ${fmt(v.score, 2)} has the same sign as its class ${sign(y)}: correct, so nothing changes.`,
          vars: { epoch, score: round(v.score, 3), class: y, 'w.x': round(v.wAfter[0], 2), 'w.y': round(v.wAfter[1], 2), b: v.bAfter },
          stats: stats(),
        }),
      );
    }
    yield* flushQuiet();
    // Visits past the shown mistakes are summed up in the epoch's closing frame.
    for (const v of these.slice(these.length - rest)) {
      seen++;
      if (v.mistake) updates++;
    }
    const m = mistakesPerEpoch[epoch - 1];
    const later = these.slice(these.length - rest).filter((v) => v.mistake).length;
    yield emit(
      plotFrame(scene(end.wAfter, end.bAfter, { epoch, doneEpochs: epoch }), {
        line: 4,
        note: `${later > 0 ? `The rest of the epoch brought ${later} more ${later === 1 ? 'mistake' : 'mistakes'}. ` : ''}Epoch ${epoch} done: ${m === 0 ? 'no mistakes at all.' : `${m} ${m === 1 ? 'mistake' : 'mistakes'} in all.`}`,
        vars: { epoch, mistakes: m, 'w.x': round(end.wAfter[0], 2), 'w.y': round(end.wAfter[1], 2), b: end.bAfter },
        stats: stats(),
      }),
    );
  }

  const last = visits[visits.length - 1];
  const finalMistakes = mistakesPerEpoch[epochs - 1];
  const why = converged
    ? `An epoch with no mistakes: every point is on its own side, so the perceptron stops. The data is linearly separable, and for separable data the perceptron convergence theorem promises this always happens after a finite number of mistakes.`
    : input.data === 'xor'
      ? `Still ${finalMistakes} mistakes in epoch ${epochs}, and it will never reach zero: no straight line puts XOR’s classes on opposite sides, so the perceptron keeps chasing its own tail. The convergence theorem only covers separable data. One line isn’t enough here; a hidden layer (an MLP) is.`
      : input.data === 'overlap'
        ? `Still ${finalMistakes} mistakes in epoch ${epochs}. The classes overlap, so no line separates them all and the line keeps flipping between compromises. Variants such as the pocket or averaged perceptron keep the best line seen.`
        : `Still ${finalMistakes} mistakes after ${epochs} epochs. If the data is separable the theorem promises an end, but the number of mistakes grows as the gap between the classes shrinks.`;
  yield emit(
    plotFrame(scene(last.wAfter, last.bAfter, { epoch: epochs, doneEpochs: epochs }), {
      line: 4,
      note: why,
      vars: { epochs, 'w.x': round(last.wAfter[0], 2), 'w.y': round(last.wAfter[1], 2), b: last.bAfter },
      stats: stats(),
    }),
  );
}

export const perceptron = defineAlgorithm<PerceptronInput, PlotState>({
  kind: 'algorithm',
  slug: 'perceptron',
  view: 'plot',
  input: {
    examples: [
      { id: 'linear', label: 'Separable', make: ({ seed, size }) => ({ data: 'linear', n: size, seed }) },
      { id: 'overlap', label: 'Overlapping classes', make: ({ seed, size }) => ({ data: 'overlap', n: size, seed }) },
      { id: 'xor', label: 'XOR', make: ({ seed, size }) => ({ data: 'xor', n: size, seed }) },
    ],
    size: { label: 'Points', min: MIN_N, max: MAX_N, default: 20 },
    custom: {
      label: `Data (linear, overlap, xor), n (${MIN_N}–${MAX_N}) and seed`,
      placeholder: 'e.g. linear, n = 20, seed = 7',
      parse: (text) => {
        const word = (text.toLowerCase().match(/[a-z]+/) ?? [''])[0] as PerceptronData;
        if (!DATA.includes(word)) return { error: 'Start with the data: linear, overlap or xor.' };
        const n = Number(text.match(/\bn\s*=\s*(\d+)/i)?.[1]);
        const seed = Number(text.match(/\bseed\s*=\s*(\d+)/i)?.[1]);
        if (!Number.isInteger(n) || !Number.isInteger(seed)) return { error: 'Give n and seed, e.g. n = 20, seed = 7.' };
        if (n < MIN_N || n > MAX_N) return { error: `n must be between ${MIN_N} and ${MAX_N}.` };
        return { value: { data: word, n, seed } };
      },
      format: ({ data, n, seed }) => `${data}, n = ${n}, seed = ${seed}`,
    },
  },
  pseudocode,
  stats: [
    { key: 'updates', label: 'Updates' },
    { key: 'visits', label: 'Points checked' },
  ],
  legend: [
    { neutral: 'The two shaded sides of the line' },
    { tone: 1, label: 'Class A (−1)' },
    { tone: 2, label: 'Class B (+1)' },
    { mark: 'key', label: 'The point being checked' },
    { mark: 'reject', label: 'On the wrong side' },
    { mark: 'compare', label: 'The line w·x + b = 0' },
  ],
  run,
  content: {
    idea: 'The perceptron, from 1958, is a single neuron that draws a line. Visit the points one at a time; whenever one is on the wrong side, add it to the weights (w ← w + y·x, b ← b + y), which tilts and shifts the line towards classifying it correctly. Repeat until a whole pass makes no mistakes.',
    invariant: 'The line is w·x + b = 0, with w perpendicular to it pointing at the +1 side. Each update raises y·(w·x + b) for the point that triggered it by |x|² + 1. If some line separates the classes with a margin, the number of updates is bounded, so it stops; otherwise it never does.',
    whenToUse: 'As the simplest linear classifier and the ancestor of neural networks. It only works when the classes are linearly separable; logistic regression gives probabilities and a stable answer on overlapping data, and a hidden layer handles shapes like XOR.',
    traits: [
      { label: 'Stops on separable data', good: true },
      { label: 'Never stops on XOR', good: false },
      { label: 'Learns only from mistakes', good: null },
    ],
    experiments: [
      { example: 'linear', prompt: 'Two well-separated clouds: count how many mistakes it takes before an epoch comes back clean.' },
      { example: 'xor', prompt: 'Opposite corners share a class. Watch the mistakes per epoch refuse to drop to zero: no line can do it.' },
      { example: 'overlap', prompt: 'Overlapping classes make the line flip back and forth between compromises.' },
    ],
  },
});
