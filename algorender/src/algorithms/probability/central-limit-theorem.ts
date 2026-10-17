import { defineAlgorithm } from '@/engine/module';
import { createRng } from '@/engine/random';
import type { Checkpoint, Frame } from '@/engine/types';
import { askInOrder, numbersIn, plotFrame } from '@/viz/plot/frame';
import { fmt, round } from '@/viz/plot/geometry';
import type { Bar, PlanePart, PlotPart, PlotState, Shape, Vec } from '@/viz/plot/types';

export type PopulationId = 'uniform' | 'skewed' | 'bimodal' | 'coin';
export type CltInput = { population: PopulationId; n: number; seed: number };

export const MAX_N = 30;
export const BINS = 24;
/** Running totals of sample means after each frame: three shown one by one, then batches. */
export const TOTALS = [1, 2, 3, 10, 30, 100, 300, 1000] as const;
const SHOWN = 3;
const CUSTOM_SEED = 7;

type Population = {
  label: string;
  /** For narration, e.g. "flat between 0 and 1". */
  describe: string;
  mean: number;
  sd: number;
  /** One draw, from a uniform u in [0, 1). */
  draw: (u: () => number) => number;
  /** The shapes that draw the population's density (or probabilities). */
  shapes: Shape[];
  /** Top of the population plane's y-axis. */
  top: number;
  yLabel: string;
};

const curve = (f: (x: number) => number, from = 0, to = 1, steps = 60): Vec[] =>
  Array.from({ length: steps + 1 }, (_, k) => {
    const x = from + ((to - from) * k) / steps;
    return [x, f(x)] as Vec;
  });

const area = (id: string, points: Vec[]): Shape => ({ kind: 'path', id, points, closed: true, fill: true, fillOpacity: 0.3 });

// Bimodal: half the time uniform on [0, 0.3], half the time uniform on [0.7, 1].
const BIMODAL_DENSITY = 0.5 / 0.3;
const BIMODAL_EX2 = 0.5 * (0.3 ** 2 / 3) + 0.5 * ((0.7 ** 2 + 0.7 + 1) / 3);

export const POPULATIONS: Record<PopulationId, Population> = {
  uniform: {
    label: 'Flat',
    describe: 'every value between 0 and 1 equally likely',
    mean: 0.5,
    sd: 1 / Math.sqrt(12),
    draw: (u) => u(),
    shapes: [area('density', [[0, 0], [0, 1], [1, 1], [1, 0]])],
    top: 1.3,
    yLabel: 'density',
  },
  skewed: {
    // Beta(1, 4): density 4(1 − x)³, drawn by inverting its CDF 1 − (1 − x)⁴.
    label: 'Skewed',
    describe: 'mostly small values with a long tail to the right',
    mean: 0.2,
    sd: Math.sqrt(4 / 150),
    draw: (u) => 1 - (1 - u()) ** 0.25,
    shapes: [area('density', [[0, 0], ...curve((x) => 4 * (1 - x) ** 3), [1, 0]])],
    top: 4.4,
    yLabel: 'density',
  },
  bimodal: {
    label: 'Two humps',
    describe: 'values near 0 or near 1, never in the middle',
    mean: 0.5,
    sd: Math.sqrt(BIMODAL_EX2 - 0.25),
    draw: (u) => (u() < 0.5 ? 0.3 * u() : 0.7 + 0.3 * u()),
    shapes: [
      area('density', [[0, 0], [0, BIMODAL_DENSITY], [0.3, BIMODAL_DENSITY], [0.3, 0]]),
      area('density2', [[0.7, 0], [0.7, BIMODAL_DENSITY], [1, BIMODAL_DENSITY], [1, 0]]),
    ],
    top: 2.1,
    yLabel: 'density',
  },
  coin: {
    label: 'Coin flips',
    describe: '0 (tails) or 1 (heads), each with probability ½',
    mean: 0.5,
    sd: 0.5,
    draw: (u) => (u() < 0.5 ? 0 : 1),
    shapes: [
      {
        kind: 'bars',
        id: 'density',
        bars: [
          { id: 'tails', x0: -0.04, x1: 0.04, y: 0.5, label: '½' },
          { id: 'heads', x0: 0.96, x1: 1.04, y: 0.5, label: '½' },
        ],
      },
    ],
    top: 0.65,
    yLabel: 'probability',
  },
};
const POPULATION_IDS = Object.keys(POPULATIONS) as PopulationId[];

export type Simulation = { means: number[]; samples: number[][] };

/** Every sample mean the run will show (and the draws of the first few), from the seed alone. */
export function simulate({ population, n, seed }: CltInput): Simulation {
  const p = POPULATIONS[population];
  const u = createRng(seed);
  const means: number[] = [];
  const samples: number[][] = [];
  for (let k = 0; k < TOTALS[TOTALS.length - 1]; k++) {
    const draws = Array.from({ length: n }, () => p.draw(u));
    if (k < SHOWN) samples.push(draws);
    means.push(draws.reduce((s, x) => s + x, 0) / n);
  }
  return { means, samples };
}

const binOf = (x: number) => Math.min(BINS - 1, Math.max(0, Math.floor(x * BINS)));

export function histogram(means: readonly number[]): number[] {
  const counts = Array<number>(BINS).fill(0);
  for (const m of means) counts[binOf(m)]++;
  return counts;
}

export const stats = (xs: readonly number[]) => {
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length);
  return { mean, sd };
};

const normal = (x: number, mu: number, sd: number) => Math.exp(-(((x - mu) / sd) ** 2) / 2) / (sd * Math.sqrt(2 * Math.PI));

/** The bin holding the most means, and whether it sits within two bins of μ. */
function peakNearMean(counts: readonly number[], mu: number) {
  const peak = counts.indexOf(Math.max(...counts));
  return Math.abs((peak + 0.5) / BINS - mu) <= 2 / BINS;
}

const pseudocode = [
  'repeat many times:',
  '  draw n values from the population',
  '  x̄ ← their average',
  '  add x̄ to the histogram',
  'compare with the normal N(μ, σ/√n)',
];

const X_AXIS = { min: -0.05, max: 1.05 };

function* run(input: CltInput): Generator<Frame<PlotState>> {
  const { population, n } = input;
  const p = POPULATIONS[population];
  const { means, samples } = simulate(input);
  const se = p.sd / Math.sqrt(n);
  const total = TOTALS[TOTALS.length - 1];
  const vars = { n, μ: round(p.mean, 3), σ: round(p.sd, 3), 'σ/√n': round(se, 3) };

  const populationPlane = (extra: Shape[]): PlanePart => ({
    kind: 'plane',
    id: 'plane',
    label: `Population: ${p.label.toLowerCase()}`,
    x: X_AXIS,
    y: { min: 0, max: p.top, label: p.yLabel },
    equal: false,
    shapes: [...p.shapes, { kind: 'line', id: 'mu', through: [p.mean, 0], dir: [0, 1], mark: 'found', dashed: true, label: 'μ' }, ...extra],
    handles: [],
  });

  const meansPlane = (count: number, opts: { newest?: boolean; curve?: boolean }): PlanePart => {
    const counts = histogram(means.slice(0, count));
    const newest = opts.newest ? binOf(means[count - 1]) : -1;
    const tallest = Math.max(...counts, 1);
    // Expected count per bin. A coin's average can only be k/n: while those values are further apart than
    // a bin, each lands in a bin of its own and collects the probability of a 1/n-wide slice.
    const width = population === 'coin' ? Math.max(1 / n, 1 / BINS) : 1 / BINS;
    const curvePeak = count * width * normal(p.mean, p.mean, se);
    const top = Math.max(4, Math.ceil(Math.max(tallest, opts.curve ? Math.min(curvePeak, tallest * 2) : 0) * 1.25));
    const bars: Bar[] = counts.map((c, k) => ({ id: `b${k}`, x0: k / BINS, x1: (k + 1) / BINS, y: c, mark: k === newest ? 'key' : null }));
    const shapes: Shape[] = [{ kind: 'bars', id: 'hist', bars }];
    if (opts.curve) {
      shapes.push({ kind: 'path', id: 'normal', points: curve((x) => count * width * normal(x, p.mean, se), 0, 1, 120), mark: 'found', label: 'N(μ, σ/√n)' });
    }
    return {
      kind: 'plane',
      id: 'means',
      label: `Means of samples of size ${n}`,
      x: X_AXIS,
      y: { min: 0, max: top, label: 'count' },
      equal: false,
      shapes,
      handles: [],
    };
  };

  const readouts = (count: number): PlotPart => {
    const s = count ? stats(means.slice(0, count)) : null;
    return {
      kind: 'readouts',
      id: 'readouts',
      label: 'Sample means',
      items: [
        { id: 'count', label: 'means', value: String(count) },
        { id: 'mean', label: 'their average', value: s ? fmt(s.mean, 3) : '–' },
        { id: 'sd', label: 'their spread (sd)', value: s && count > 1 ? fmt(s.sd, 3) : '–', mark: 'key' },
        { id: 'se', label: 'σ/√n', value: fmt(se, 3), mark: 'found' },
      ],
    };
  };

  const shapeQuestion = (): Checkpoint | undefined =>
    n === 1 || n >= 5
      ? askInOrder(`After ${total} means, will the histogram look more like a bell or like the population?`, ['A bell curve', 'The population’s shape'], n === 1 ? 'The population’s shape' : 'A bell curve')
      : undefined;
  const peakQuestion = (next: number): Checkpoint =>
    askInOrder(`After ${next} means, will the tallest bar be within two bins of μ = ${fmt(p.mean, 2)}?`, ['Yes', 'No'], peakNearMean(histogram(means.slice(0, next)), p.mean) ? 'Yes' : 'No');

  yield plotFrame([populationPlane([]), meansPlane(0, {}), readouts(0)], {
    line: 0,
    note: `The population: ${p.describe}, with mean μ = ${fmt(p.mean, 3)} and spread σ = ${fmt(p.sd, 3)}. Draw ${n} value${n === 1 ? '' : 's'}, average ${n === 1 ? 'it (a sample of one is its own average)' : 'them'}, record the average, and repeat.`,
    vars,
    stats: { means: 0 },
  });

  for (let k = 0; k < SHOWN; k++) {
    const draws = samples[k];
    const count = k + 1;
    const level = p.top * 0.08;
    const extra: Shape[] = [
      ...draws.map((x, j): Shape => ({ kind: 'point', id: `draw${j}`, at: [x, level], mark: 'compare', size: 'sm' })),
      { kind: 'point', id: 'xbar', at: [means[k], level * 2.4], mark: 'key', size: 'lg', label: 'x̄' },
    ];
    const listed = n <= 6 ? `: ${draws.map((x) => fmt(x, 2)).join(', ')}` : '';
    yield plotFrame([populationPlane(extra), meansPlane(count, { newest: true }), readouts(count)], {
      line: 3,
      note: `Sample ${count}: ${n} draw${n === 1 ? '' : 's'}${listed}. ${n === 1 ? 'Its' : 'Their'} average x̄ = ${fmt(means[k], 3)} drops into the histogram below.`,
      vars: { ...vars, 'x̄': round(means[k], 3) },
      stats: { means: count },
      checkpoint:
        k === SHOWN - 1
          ? askInOrder(
              'Will the averages spread out wider than single draws, about the same, or narrower?',
              ['Wider', 'About the same', 'Narrower'],
              n === 1 ? 'About the same' : 'Narrower',
            )
          : undefined,
    });
  }

  for (let t = SHOWN; t < TOTALS.length; t++) {
    const count = TOTALS[t];
    const s = stats(means.slice(0, count));
    const next = TOTALS[t + 1];
    const last = next === undefined;
    const spread =
      n === 1
        ? `about σ = ${fmt(p.sd, 3)} itself, since each "mean" is a single draw`
        : `close to σ/√n = ${fmt(p.sd, 3)}/√${n} = ${fmt(se, 3)}, far narrower than the population's σ = ${fmt(p.sd, 3)}`;
    let note = `${count} means so far. Their average is ${fmt(s.mean, 3)} (μ = ${fmt(p.mean, 3)}) and their spread is ${fmt(s.sd, 3)}, ${spread}.`;
    if (last) {
      note =
        n === 1
          ? `${count} means with n = 1: the histogram has simply copied the population's shape. Averaging one value smooths nothing.`
          : population === 'coin'
            ? `${count} means. An average of ${n} flips can only be a whole number of heads over ${n}, so some bins stay empty, but the outline is a bell centred on ½.`
            : `${count} means. However the population looked, the averages pile up in a single hump around μ = ${fmt(p.mean, 3)}.`;
    }
    yield plotFrame([populationPlane([]), meansPlane(count, {}), readouts(count)], {
      line: 3,
      note,
      vars: { ...vars, 'mean of x̄': round(s.mean, 3), 'sd of x̄': round(s.sd, 3) },
      stats: { means: count },
      checkpoint:
        next === total
          ? shapeQuestion()
          : t === SHOWN || t === SHOWN + 1
            ? peakQuestion(next!)
            : last
              ? askInOrder(`Will the normal curve N(μ, σ/√${n}) fit the histogram?`, ['Yes, closely', 'No'], n >= 5 ? 'Yes, closely' : 'No')
              : undefined,
    });
  }

  const s = stats(means);
  const fits = n >= 5;
  yield plotFrame([populationPlane([]), meansPlane(total, { curve: true }), readouts(total)], {
    line: 4,
    note: fits
      ? `The central limit theorem's prediction: the averages follow a normal curve centred on μ = ${fmt(p.mean, 3)} with spread σ/√n = ${fmt(se, 3)}. Their measured spread is ${fmt(s.sd, 3)}.`
      : n === 1
        ? `The normal curve with spread σ = ${fmt(p.sd, 3)} doesn't match: with n = 1 nothing is averaged, so the histogram keeps the population's shape.`
        : `With only n = ${n}, the averages are still settling towards the normal curve: the spread already matches σ/√n = ${fmt(se, 3)}, but the shape is not quite a bell yet. Raise n to see it close in.`,
    vars: { ...vars, 'mean of x̄': round(s.mean, 3), 'sd of x̄': round(s.sd, 3) },
    stats: { means: total },
  });

  yield plotFrame([populationPlane([]), meansPlane(total, { curve: true }), readouts(total)], {
    line: null,
    note: `Averages of n draws centre on μ, spread by σ/√n (so 4 times the draws halves the spread), and look more and more normal as n grows, whatever the population's shape. That is why error bars shrink like 1/√n.`,
    vars: { ...vars, 'mean of x̄': round(s.mean, 3), 'sd of x̄': round(s.sd, 3) },
    stats: { means: total },
  });
}

const clampN = (n: number) => Math.min(MAX_N, Math.max(1, Math.round(n)));
const example = (population: PopulationId) => ({
  id: population,
  label: POPULATIONS[population].label,
  make: ({ seed, size }: { seed: number; size: number }): CltInput => ({ population, n: clampN(size), seed }),
});

export const centralLimitTheorem = defineAlgorithm<CltInput, PlotState>({
  kind: 'algorithm',
  slug: 'central-limit-theorem',
  view: 'plot',
  input: {
    examples: [example('skewed'), example('uniform'), example('bimodal'), example('coin')],
    size: { label: 'Sample size n', min: 1, max: MAX_N, default: 5 },
    custom: {
      label: `Population (uniform, skewed, bimodal, coin), sample size n (1–${MAX_N}) and an optional seed`,
      placeholder: 'e.g. skewed, n = 10',
      parse: (text) => {
        const word = (text.toLowerCase().match(/[a-z]+/) ?? [''])[0];
        const population = POPULATION_IDS.find((id) => id === word);
        if (!population) return { error: 'Start with a population: uniform, skewed, bimodal or coin.' };
        const xs = numbersIn(text);
        if (xs.length < 1 || xs.length > 2) return { error: 'Then give the sample size n, and optionally a seed, e.g. skewed, n = 10.' };
        const [n, seed = CUSTOM_SEED] = xs;
        if (!Number.isInteger(n) || n < 1 || n > MAX_N) return { error: `n must be a whole number from 1 to ${MAX_N}.` };
        if (!Number.isInteger(seed) || seed < 0) return { error: 'The seed must be a whole number, 0 or more.' };
        return { value: { population, n, seed } };
      },
      format: ({ population, n, seed }) => `${population}, n = ${n}, seed = ${seed}`,
    },
  },
  pseudocode,
  stats: [{ key: 'means', label: 'Sample means' }],
  legend: [
    { neutral: 'Population, and the histogram of averages' },
    { mark: 'compare', label: 'One sample’s draws' },
    { mark: 'key', label: 'Its average x̄' },
    { mark: 'found', label: 'μ, and the normal curve N(μ, σ/√n)' },
  ],
  run,
  content: {
    idea: 'Take a sample of n values from any population, average them, and repeat many times. The averages pile up in a bell-shaped normal curve centred on the population mean μ, with spread σ/√n, even when the population itself is skewed, flat or split in two.',
    invariant: 'The average of n independent draws has mean μ and standard deviation σ/√n exactly; as n grows its distribution gets closer and closer to normal, whatever the population looked like (as long as σ is finite).',
    whenToUse: 'Whenever you average or add up many independent pieces: confidence intervals and error bars, A/B tests, polling margins, measurement noise, and why mini-batch gradients are noisy by about 1/√(batch size). It tells you how many samples you need for a given precision.',
    traits: [
      { label: 'Spread shrinks like 1/√n', good: true },
      { label: 'Works for any shape with finite σ', good: true },
      { label: 'Needs n large enough', good: null },
    ],
    experiments: [
      { example: 'skewed', prompt: 'Set n = 1 first: the histogram copies the skew. Then try n = 5 and n = 30 and watch the tail disappear.' },
      { example: 'bimodal', prompt: 'No single draw is ever near ½, yet the averages pile up exactly there. Predict where the tallest bar will be.' },
      { example: 'coin', prompt: 'Averages of n coin flips are counts of heads over n: the histogram has gaps, but its outline is still a bell.' },
      { example: 'uniform', prompt: 'With n = 2 the flat population turns into a triangle; by n = 5 it is already close to a bell.' },
    ],
  },
});
