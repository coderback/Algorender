import { defineAlgorithm } from '@/engine/module';
import { createRng } from '@/engine/random';
import type { Frame } from '@/engine/types';
import { ask, askInOrder, numbersIn, plain, plotFrame } from '@/viz/plot/frame';
import { fmt, round, snap } from '@/viz/plot/geometry';
import type { Axis, Bar, PlanePart, PlotPart, PlotState, Readout, Shape, Vec } from '@/viz/plot/types';

// The law of large numbers and Monte Carlo. Roll a die again and again and the
// running average settles on the expected value 3.5: not because the die
// makes up for a lucky streak, but because new rolls swamp the old ones. How
// fast? The average's typical miss shrinks like σ/√n, so quadrupling the rolls
// halves it. The same averaging estimates anything you can sample: the share
// of random darts inside a quarter circle, times 4, is π, and the share inside
// any shape, times the box around it, is its area.

// ───────────────────────────── the maths ─────────────────────────────

/** The largest run, and the counts each run is shown at (powers of 2, then of 4). */
export const MAX_N = 4096;
export const DOUBLINGS = Array.from({ length: 13 }, (_, k) => 2 ** k);
export const QUADS = [1, 4, 16, 64, 256, 1024, 4096] as const;
/** Darts drawn in the square or the box (the rest still count). */
export const DRAWN = 512;
/** Runs in the many-runs story. */
export const RUNS = 20;

/** A fair die: E[X] = 3.5 and σ² = E[X²] − 3.5² = 91/6 − 12.25 = 35/12. */
export const DIE_MEAN = 3.5;
export const SIGMA_DIE = Math.sqrt(35 / 12);
/** The chance a dart lands in the quarter circle, and the spread of one dart's 4·(1 or 0). */
export const P_QUARTER = Math.PI / 4;
export const SIGMA_DART = 4 * Math.sqrt(P_QUARTER * (1 - P_QUARTER));

/** Half the width of the band where most running averages sit: 2σ/√n. */
export const band = (sigma: number, n: number) => (2 * sigma) / Math.sqrt(n);
/** The samples needed for a band of ± `half`: n = (2σ / half)². */
export const samplesFor = (sigma: number, half: number) => ((2 * sigma) / half) ** 2;

/** `n` rolls of a fair die, each 1 to 6. */
export function rollDice(seed: number, n = MAX_N): number[] {
  const u = createRng(seed);
  return Array.from({ length: n }, () => 1 + Math.floor(u() * 6));
}

/** `n` darts thrown uniformly into the unit square, x then y. */
export function throwDarts(seed: number, n = MAX_N): Vec[] {
  const u = createRng(seed);
  return Array.from({ length: n }, () => {
    const x = u();
    return [x, u()] as Vec;
  });
}

export const inQuarter = ([x, y]: Vec) => x * x + y * y <= 1;

/** means[k] is the average of the first k + 1 values. */
export function runningMeans(values: readonly number[]): number[] {
  let total = 0;
  return values.map((v, k) => (total += v) / (k + 1));
}

/** The running estimate of π: 4 × (darts inside so far) / (darts so far). */
export const piEstimates = (darts: readonly Vec[]) => runningMeans(darts.map((d) => (inQuarter(d) ? 4 : 0)));

/** `runs` independent runs of `n` darts each, one after another from one seed: each run's running estimates. */
export function piRuns(seed: number, runs = RUNS, n = MAX_N): number[][] {
  const u = createRng(seed);
  return Array.from({ length: runs }, () => {
    let inside = 0;
    return Array.from({ length: n }, (_, k) => {
      const x = u();
      const y = u();
      if (x * x + y * y <= 1) inside++;
      return (4 * inside) / (k + 1);
    });
  });
}

/** The spread (population standard deviation) of some values. */
export function spread(values: readonly number[]): number {
  const m = values.reduce((s, v) => s + v, 0) / values.length;
  return Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / values.length);
}

// The lens: two circles of radius 1, centred at (0, 0) and (d, 0).
export const LENS_RANGE = { min: 0, max: 1.75, step: 0.25 } as const;
/** The area two unit circles d apart share: 2·acos(d/2) − (d/2)·√(4 − d²). At d = 0 it is the whole circle, π. */
export const lensArea = (d: number) => 2 * Math.acos(d / 2) - (d / 2) * Math.sqrt(4 - d * d);
/** The box the darts are thrown into: x from d − 1 to 1, y from −1 to 1. */
export const lensBox = (d: number) => ({ x0: d - 1, x1: 1, y0: -1, y1: 1, area: 2 * (2 - d) });
export const inLens = (d: number, [x, y]: Vec) => x * x + y * y <= 1 && (x - d) * (x - d) + y * y <= 1;

/** `n` darts thrown uniformly into the lens's box. */
export function lensDarts(seed: number, d: number, n = MAX_N): Vec[] {
  const { x0, x1, y0, y1 } = lensBox(d);
  const u = createRng(seed);
  return Array.from({ length: n }, () => {
    const x = x0 + (x1 - x0) * u();
    return [x, y0 + (y1 - y0) * u()] as Vec;
  });
}

/** The running estimates of the lens's area: box area × (darts inside so far) / (darts so far). */
export const areaEstimates = (d: number, darts: readonly Vec[]) => runningMeans(darts.map((p) => (inLens(d, p) ? lensBox(d).area : 0)));

/** The error bar the darts give themselves, not knowing the answer: 2·B·√(p̂(1 − p̂)) / √n. */
export const errorBar = (boxArea: number, share: number, n: number) => band(boxArea * Math.sqrt(share * (1 - share)), n);

// ───────────────────────────── input ─────────────────────────────

export type MonteCarloInput = { story: 'dice'; seed: number } | { story: 'darts'; seed: number } | { story: 'runs'; seed: number } | { story: 'area'; d: number; seed: number };
export type Story = MonteCarloInput['story'];
const STORIES: Story[] = ['dice', 'darts', 'runs', 'area'];

const pseudocode = [
  'repeat n times:',
  '  roll the die; total += roll',
  'average = total / n',
  '  throw a dart (x, y) into the box',
  '  if it lands inside: inside += 1',
  'estimate = box area × inside / n',
  'band: true value ± 2σ / √n',
  '4 × the samples: the band halves',
];

// ───────────────────────────── drawing helpers ─────────────────────────────

/** 1,024 rather than 1024. */
export const comma = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const signed = (v: number, digits = 2) => (v > 0 ? `+${fmt(v, digits)}` : fmt(v, digits));
const pm = (v: number, digits = 2) => `± ${fmt(v, digits)}`;
const readouts = (items: Readout[], label = 'Values'): PlotPart => ({ kind: 'readouts', id: 'readouts', label, items });

/** Where the running lines are drawn: every n up to 32, then 16 points per doubling. */
export const SAMPLES: number[] = [...new Set([...Array.from({ length: 32 }, (_, k) => k + 1), ...Array.from({ length: 113 }, (_, k) => Math.round(2 ** ((80 + k) / 16)))])].filter((n) => n <= MAX_N).sort((a, b) => a - b);

const LOG_X = (label: string): Axis => ({ min: -0.4, max: 12.4, label, ticks: [0, 2, 4, 6, 8, 10, 12].map((k) => ({ at: k, label: comma(2 ** k) })) });
const lx = (n: number) => round(Math.log2(n), 2);
const clampTo = (axis: Axis, v: number) => round(Math.min(axis.max, Math.max(axis.min, v)), 2);

/** The band truth ± 2σ/√n over the whole run, as a filled shape. */
function bandShape(y: Axis, truth: number, sigma: number, label = '± 2σ/√n'): Shape {
  const upper = SAMPLES.map((n) => [lx(n), clampTo(y, truth + band(sigma, n))] as Vec);
  const lower = SAMPLES.map((n) => [lx(n), clampTo(y, truth - band(sigma, n))] as Vec).reverse();
  return { kind: 'path', id: 'band', points: [...upper, ...lower], closed: true, fill: true, fillOpacity: 0.16, tone: 2, label };
}

/** A running line up to `upto` samples. */
function runningPath(id: string, values: readonly number[], upto: number, paint: { tone?: 1 | 2 | 3 | 4; label?: string; faint?: boolean }): Shape[] {
  const points = SAMPLES.filter((n) => n <= upto).map((n) => [lx(n), round(values[n - 1], 2)] as Vec);
  return points.length < 2 ? [] : [{ kind: 'path', id, points, ...paint }];
}

const targetLine = (value: number, label: string): Shape => ({ kind: 'line', id: 'target', through: [0, round(value, 2)], dir: [1, 0], dashed: true, label });

function chart(id: string, label: string, x: Axis, y: Axis, shapes: Shape[]): PlanePart {
  return { kind: 'plane', id, label, x, y, equal: false, shapes, handles: [] };
}

const dartShapes = (darts: readonly Vec[], inside: (p: Vec) => boolean, upto: number): Shape[] =>
  darts.slice(0, Math.min(upto, DRAWN)).map((p, k) => ({ kind: 'point', id: `d${k}`, at: [round(p[0], 3), round(p[1], 3)] as Vec, size: 'sm', ...(inside(p) ? { mark: 'found' as const } : {}) }));

const arc = (cx: number, from: number, to: number, steps = 48): Vec[] =>
  Array.from({ length: steps + 1 }, (_, k) => {
    const t = from + ((to - from) * k) / steps;
    return [round(cx + Math.cos(t), 2), round(Math.sin(t), 2)] as Vec;
  });

// ───────────────────────────── story 1: a die's running average ─────────────────────────────

const DICE_Y: Axis = { min: 1, max: 6, label: 'running average' };
const FACES_X: Axis = { min: 0.4, max: 6.6, label: 'face', ticks: [1, 2, 3, 4, 5, 6].map((f) => ({ at: f, label: String(f) })) };
const FACES_Y: Axis = { min: 0, max: 1, label: 'share of rolls' };

export type DiceRun = { rolls: number[]; means: number[]; totals: number[] };

export function diceRun(seed: number): DiceRun {
  const rolls = rollDice(seed);
  let t = 0;
  const totals = rolls.map((r) => (t += r));
  return { rolls, means: runningMeans(rolls), totals };
}

/** How far the total is from 3.5n after n rolls: the surplus a gambler thinks must be paid back. */
export const surplus = (run: DiceRun, n: number) => run.totals[n - 1] - DIE_MEAN * n;

/** The questions' wrong answers that come from real slips: the band shrinking like 1/n, or not at all. */
export const bandChoices = (sigma: number, n: number, factor: number) => ({
  answer: pm(band(sigma, n * factor)),
  /** Thinking the band shrinks like 1/n (by the whole factor), or not at all. */
  slips: [pm(band(sigma, n) / factor), pm(band(sigma, n))],
});

function* diceStory(seed: number): Generator<Frame<PlotState>> {
  const run = diceRun(seed);
  const { rolls, means, totals } = run;
  const counts = (n: number) => [1, 2, 3, 4, 5, 6].map((f) => rolls.slice(0, n).filter((r) => r === f).length);
  const faces = (n: number): PlanePart => ({
    kind: 'plane',
    id: 'faces',
    label: n ? `How often each face came up in ${comma(n)} roll${n === 1 ? '' : 's'}` : 'How often each face came up',
    x: FACES_X,
    y: FACES_Y,
    equal: false,
    shapes: [
      { kind: 'bars', id: 'counts', bars: counts(n).map((c, i): Bar => ({ id: `f${i + 1}`, x0: i + 0.7, x1: i + 1.3, y: n ? round(c / n, 3) : 0, label: String(c) })) },
      targetLine(1 / 6, '1/6'),
    ],
    handles: [],
  });
  const plane = (n: number): PlanePart =>
    chart('plane', n ? `The running average of ${comma(n)} roll${n === 1 ? '' : 's'}` : 'The running average', LOG_X('rolls n (log scale)'), DICE_Y, [
      bandShape(DICE_Y, DIE_MEAN, SIGMA_DIE),
      targetLine(DIE_MEAN, 'E[X] = 3.5'),
      ...runningPath('mean', means, n, { tone: 1, label: 'average' }),
      ...(n ? [{ kind: 'point', id: 'now', at: [lx(n), round(means[n - 1], 2)], mark: 'key', size: 'md' } as Shape] : []),
    ]);
  const values = (n: number): PlotPart =>
    readouts(
      n
        ? [
            { id: 'n', label: 'rolls n', value: comma(n) },
            { id: 'total', label: 'total', value: comma(totals[n - 1]) },
            { id: 'mean', label: 'average', value: fmt(means[n - 1], 3), mark: 'key' },
            { id: 'surplus', label: 'total − 3.5n', value: signed(surplus(run, n), 1) },
            { id: 'band', label: 'band 2σ/√n', value: pm(band(SIGMA_DIE, n), n >= 1024 ? 3 : 2), tone: 2 },
          ]
        : [
            { id: 'ex', label: 'E[X]', value: '3.5' },
            { id: 'sigma', label: 'σ', value: fmt(SIGMA_DIE, 2) },
          ],
    );
  const frame = (n: number, o: Parameters<typeof plotFrame>[1]) => plotFrame([plane(n), faces(n), values(n)], { ...o, stats: { n } });
  const away = (n: number) => fmt(Math.abs(means[n - 1] - DIE_MEAN), 3);
  const side = (v: number) => (v > DIE_MEAN ? 'above' : 'below');
  const vars = (n: number): Record<string, number> => (n ? { n, total: totals[n - 1], average: round(means[n - 1], 3) } : { 'E[X]': 3.5 });

  // 0: before any roll.
  yield frame(0, {
    line: 0,
    note: `A fair die's expected value is E[X] = (1 + 2 + 3 + 4 + 5 + 6) / 6 = 3.5, its balance point, and its spread is σ = ${fmt(SIGMA_DIE, 2)}. Roll it again and again and keep the running average: the total so far divided by the number of rolls n. The shaded band, 3.5 ± 2σ/√n, is where the average sits in most runs.`,
    vars: vars(0),
    checkpoint: askInOrder('After one roll, can the average be exactly 3.5?', ['Yes', 'No'], 'No'),
  });

  // 1: one roll.
  const r1 = rolls[0];
  yield frame(1, {
    line: 2,
    note: `The first roll is a ${r1}, so the average is ${r1}. One roll is a whole number from 1 to 6, so it can never be 3.5: here it is ${away(1)} away. The band at n = 1 is ± ${fmt(band(SIGMA_DIE, 1))}, wide enough for any roll.`,
    vars: vars(1),
    checkpoint: askInOrder(`The first roll was a ${r1}, ${side(r1)} 3.5. Is the next roll more likely to come up ${r1 > DIE_MEAN ? 'low' : 'high'}, to even things out?`, ['Yes', 'No'], 'No'),
  });

  // 2: four rolls.
  const q16 = bandChoices(SIGMA_DIE, 4, 4);
  yield frame(4, {
    line: 1,
    note: `The die has no memory: rolls 2 to 4 came up ${rolls.slice(1, 4).join(', ')}, each face still 1 in 6 whatever came before. The average of 4 rolls is ${fmt(means[3], 3)}. Four times the rolls made the band half as wide, ± ${fmt(band(SIGMA_DIE, 4))}, because √4 = 2.`,
    vars: vars(4),
    checkpoint: ask('Quadruple again, to 16 rolls. How wide will the band be?', q16.answer, q16.slips),
  });

  // 3: sixteen rolls.
  yield frame(16, {
    line: 6,
    note: `After 16 rolls the average is ${fmt(means[15], 3)}, ${away(16)} from 3.5, and the band is ± ${fmt(band(SIGMA_DIE, 16))}: half as wide again, for four times the rolls. Its width is 2σ/√n, so it shrinks with the square root of n.`,
    vars: vars(16),
    checkpoint: askInOrder(
      `How many rolls until the band is ± ${fmt(band(SIGMA_DIE, 1024))}, an eighth of its width now?`,
      ['128', '256', '1,024', '4,096'],
      '1,024',
    ),
  });

  // 4: 64 rolls, and the surplus.
  const s64 = surplus(run, 64);
  yield frame(64, {
    line: 2,
    note: `64 rolls: the band is down to ± ${fmt(band(SIGMA_DIE, 64))}, half its width at 16. An eighth of that width needs 8² = 64 times the 16 rolls, 1,024 in all. The average is ${fmt(means[63], 3)}. The total is ${totals[63]}, ${s64 === 0 ? 'exactly 3.5 × 64 = 224' : `${fmt(Math.abs(s64), 1)} ${s64 > 0 ? 'more' : 'less'} than 3.5 × 64 = 224`}.`,
    vars: vars(64),
    checkpoint: askInOrder(`The total's gap from 3.5n is ${signed(s64, 1)}. For the average to settle at 3.5, must that gap shrink back to 0?`, ['Yes', 'No'], 'No'),
  });

  // 5: 256 rolls.
  const s256 = surplus(run, 256);
  yield frame(256, {
    line: 2,
    note: `After 256 rolls the total's gap from 3.5n is ${signed(s256, 1)}, against ${signed(s64, 1)} after 64. Nothing pulls it back to 0; it wanders, and typically grows like √n. Yet the average is only ${fmt(Math.abs(s256) / 256, 3)} from 3.5, because the gap is shared out over 256 rolls. New rolls don't correct the old ones; they swamp them.`,
    vars: vars(256),
  });

  // 6: 1,024 rolls.
  const in1024 = Math.abs(means[1023] - DIE_MEAN) <= band(SIGMA_DIE, 1024);
  yield frame(1024, {
    line: 6,
    note: `1,024 rolls: the average is ${fmt(means[1023], 3)}, ${in1024 ? 'inside' : 'outside'} the band of ± ${fmt(band(SIGMA_DIE, 1024), 3)} (most runs are inside it, not every one). The gap in the total is ${signed(surplus(run, 1024), 1)}, but divided by 1,024 it is only ${fmt(Math.abs(surplus(run, 1024)) / 1024, 3)}.`,
    vars: vars(1024),
  });

  // 7: 4,096 rolls.
  const final = counts(MAX_N);
  const shares = final.map((c) => fmt(c / MAX_N, 3));
  yield frame(MAX_N, {
    line: 7,
    note: `4,096 rolls: the average is ${fmt(means[MAX_N - 1], 3)}, ${away(MAX_N)} from 3.5, with a band of ± ${fmt(band(SIGMA_DIE, MAX_N), 3)}. Each face came up a share close to 1/6 ≈ 0.167 (${shares.join(', ')}), yet the counts themselves run from ${Math.min(...final)} to ${Math.max(...final)}: in shares the faces even out, in counts they need not. That is the law of large numbers: the average of many independent rolls settles on the expected value, its miss shrinking like σ/√n.`,
    vars: vars(MAX_N),
  });
}

// ───────────────────────────── story 2: darts estimate π ─────────────────────────────

const SQUARE_AXIS: Axis = { min: 0, max: 1 };
const PI_Y: Axis = { min: 0, max: 4.5, label: 'estimate of π' };

const quarterShapes = (): Shape[] => [
  { kind: 'path', id: 'disc', points: [[0, 0], ...arc(0, 0, Math.PI / 2)], closed: true, fill: true, fillOpacity: 0.1, label: 'x² + y² ≤ 1' },
  { kind: 'path', id: 'square', points: [[0, 0], [1, 0], [1, 1], [0, 1]], closed: true, faint: true },
];

export type DartsRun = { darts: Vec[]; inside: number[]; estimates: number[] };

export function dartsRun(seed: number): DartsRun {
  const darts = throwDarts(seed);
  let k = 0;
  const inside = darts.map((d) => (k += inQuarter(d) ? 1 : 0));
  return { darts, inside, estimates: piEstimates(darts) };
}

/** Within 0.01 of π: the question asked before the last count. */
export const CLOSE = 0.01;
export const HUNDRED_THOUSAND = ['About 1,000', 'About 10,000', 'About 100,000', 'About 1,000,000'];

function* dartsStory(seed: number): Generator<Frame<PlotState>> {
  const { darts, inside, estimates } = dartsRun(seed);
  const square = (n: number): PlanePart => ({
    kind: 'plane',
    id: 'square',
    label: n ? `${comma(n)} dart${n === 1 ? '' : 's'} in the unit square${n > DRAWN ? ` (the first ${DRAWN} drawn)` : ''}` : 'The unit square and the quarter circle',
    x: SQUARE_AXIS,
    y: SQUARE_AXIS,
    equal: true,
    shapes: [...quarterShapes(), ...dartShapes(darts, inQuarter, n)],
    handles: [],
  });
  const plane = (n: number): PlanePart =>
    chart('plane', 'The running estimate 4 × inside / n', LOG_X('darts n (log scale)'), PI_Y, [
      bandShape(PI_Y, Math.PI, SIGMA_DART),
      targetLine(Math.PI, 'π'),
      ...runningPath('estimate', estimates, n, { tone: 1, label: 'estimate' }),
      ...(n ? [{ kind: 'point', id: 'now', at: [lx(n), round(estimates[n - 1], 2)], mark: 'key', size: 'md' } as Shape] : []),
    ]);
  const values = (n: number): PlotPart =>
    readouts(
      n
        ? [
            { id: 'n', label: 'darts n', value: comma(n) },
            { id: 'inside', label: 'inside', value: comma(inside[n - 1]), mark: 'found' },
            { id: 'estimate', label: '4 × inside / n', value: fmt(estimates[n - 1], 4), mark: 'key' },
            { id: 'error', label: 'estimate − π', value: signed(estimates[n - 1] - Math.PI, 4) },
            { id: 'band', label: 'band 2σ/√n', value: pm(band(SIGMA_DART, n), n >= 1024 ? 3 : 2), tone: 2 },
          ]
        : [{ id: 'n', label: 'darts n', value: '0' }],
    );
  const frame = (n: number, o: Parameters<typeof plotFrame>[1]) => plotFrame([square(n), plane(n), values(n)], { ...o, stats: { n } });
  const est = (n: number) => fmt(estimates[n - 1], 4);
  const err = (n: number) => fmt(Math.abs(estimates[n - 1] - Math.PI), 4);
  const inBand = (n: number) => Math.abs(estimates[n - 1] - Math.PI) <= band(SIGMA_DART, n);
  const vars = (n: number): Record<string, number> => (n ? { n, inside: inside[n - 1], estimate: round(estimates[n - 1], 4) } : { n: 0 });

  yield frame(0, {
    line: 3,
    note: 'Throw darts at random into the unit square, every point as likely as any other, and count those that land in the quarter circle x² + y² ≤ 1: radius 1, centred on the bottom-left corner. Nobody aims; each dart is two random numbers, x then y.',
    vars: vars(0),
    checkpoint: ask('What is the chance that one dart lands inside the quarter circle?', 'π/4', ['π', 'π/2', '1/4']),
  });

  const first = inQuarter(darts[0]);
  yield frame(1, {
    line: 4,
    note: `The chance is the quarter circle's area over the square's: (π × 1² / 4) / 1 = π/4 ≈ ${fmt(P_QUARTER, 3)}. So the share of darts inside estimates π/4, and 4 × inside / n estimates π. The first dart landed ${first ? 'inside' : 'outside'}, so the estimate is ${first ? 4 : 0}.`,
    vars: vars(1),
    checkpoint: askInOrder('After 2 darts, which estimates are possible?', ['0 or 4 only', '0, 2 or 4', 'Any number from 0 to 4'], '0, 2 or 4'),
  });

  yield frame(2, {
    line: 5,
    note: `With 2 darts the estimate is 4 × inside / 2, so it can only be 0, 2 or 4; here it is ${est(2)}. With n darts it moves in steps of 4/n, so it can never be π exactly, but the steps get finer as n grows.`,
    vars: vars(2),
  });

  for (const n of [4, 8]) {
    yield frame(n, {
      line: 5,
      note: `${n} darts, ${inside[n - 1]} inside: the estimate is 4 × ${inside[n - 1]} / ${n} = ${est(n)}, off by ${err(n)}. ${n === 4 ? 'Each doubling of n is one step to the right on this log scale.' : 'The estimate now moves in steps of 4/8 = 0.5.'}`,
      vars: vars(n),
    });
  }

  const q32 = bandChoices(SIGMA_DART, 16, 2);
  yield frame(16, {
    line: 6,
    note: `16 darts: the estimate is ${est(16)}, off by ${err(16)}. The band where most runs sit is π ± 2σ/√n, with σ = ${fmt(SIGMA_DART, 2)} the spread of one dart's score (4 if inside, 0 if not); at n = 16 it is ± ${fmt(band(SIGMA_DART, 16))}.`,
    vars: vars(16),
    checkpoint: ask('Double to 32 darts. How wide will the band be?', q32.answer, q32.slips),
  });

  yield frame(32, {
    line: 7,
    note: `Doubling the darts narrowed the band only by √2 ≈ 1.41, to ± ${fmt(band(SIGMA_DART, 32))}. Halving it takes four times the darts. The estimate is ${est(32)}.`,
    vars: vars(32),
  });

  for (const n of [64, 128, 256]) {
    yield frame(n, {
      line: 6,
      note: `${comma(n)} darts: the estimate is ${est(n)}, off by ${err(n)}, ${inBand(n) ? 'inside' : 'outside'} the band of ± ${fmt(band(SIGMA_DART, n))}. The early darts still count, but each new one moves the estimate by less: at most 4/n.`,
      vars: vars(n),
    });
  }

  yield frame(512, {
    line: 7,
    note: `512 darts: the estimate is ${est(512)}, and the band is ± ${fmt(band(SIGMA_DART, 512))}. The square now shows every dart thrown so far; from here on only the first 512 are drawn.`,
    vars: vars(512),
    checkpoint: askInOrder('About how many darts would make the band ± 0.01?', HUNDRED_THOUSAND, 'About 100,000'),
  });

  const need = samplesFor(SIGMA_DART, CLOSE);
  const narrower = band(SIGMA_DART, 512) / CLOSE;
  yield frame(1024, {
    line: 7,
    note: `From ± ${fmt(band(SIGMA_DART, 512))} at 512 darts to ± 0.01 is ${fmt(narrower, 1)} times narrower, so ${fmt(narrower, 1)}² ≈ ${Math.round(narrower ** 2)} times the darts: about ${comma(Math.round(need / 100) * 100)} in all. At 1,024 the estimate is ${est(1024)}, off by ${err(1024)}.`,
    vars: vars(1024),
  });

  const close = Math.abs(estimates[MAX_N - 1] - Math.PI) < CLOSE;
  yield frame(2048, {
    line: 6,
    note: `2,048 darts: the estimate is ${est(2048)}, off by ${err(2048)}, and the band is ± ${fmt(band(SIGMA_DART, 2048), 3)}.`,
    vars: vars(2048),
    // Asked of runs in general, so a learner who reasons from the band is right on every seed.
    checkpoint: askInOrder(`At 4,096 darts, is a run's estimate likely to be within ${CLOSE} of π?`, ['Yes, most runs are', 'No, most runs are not'], 'No, most runs are not'),
  });

  yield frame(MAX_N, {
    line: 5,
    note: `4,096 darts, ${comma(inside[MAX_N - 1])} inside: the estimate is ${est(MAX_N)}, off by ${err(MAX_N)}, so it is ${close ? 'within' : 'not within'} ${CLOSE} of π, and ${inBand(MAX_N) ? 'inside' : 'outside'} the band of ± ${fmt(band(SIGMA_DART, MAX_N), 3)}. Most runs of 4,096 darts land inside that band, within about 0.05 of π${inBand(MAX_N) ? '' : '; this one is among the few that stray'}, but the band is five times wider than ${CLOSE}, so most runs miss by more than ${CLOSE}${close ? ': this one got lucky' : ''}.`,
    vars: vars(MAX_N),
  });

  yield frame(MAX_N, {
    line: 7,
    note: `Monte Carlo estimates anything that is an average of random samples, and its miss shrinks like σ/√n: four times the darts for half the miss, 100 times the darts for one more correct decimal place. Slow, but it works on shapes no formula covers.`,
    vars: vars(MAX_N),
  });
}

// ───────────────────────────── story 3: many runs at once ─────────────────────────────

/** The quarter-width question: the spread at 64 darts against 16 times as many. */
export const SPREAD_CHOICES = ['The same', 'Half as wide', 'A quarter as wide', 'A sixteenth as wide'];
/** "Most" runs inside the band. */
export const MOST = 15;

function* runsStory(seed: number): Generator<Frame<PlotState>> {
  const runs = piRuns(seed);
  const at = (n: number) => runs.map((r) => r[n - 1]);
  const insideBand = (n: number) => at(n).filter((e) => Math.abs(e - Math.PI) <= band(SIGMA_DART, n)).length;
  const plane = (n: number): PlanePart =>
    chart('plane', n ? `${RUNS} runs of ${comma(n)} dart${n === 1 ? '' : 's'}` : `${RUNS} runs, before any dart`, LOG_X('darts n (log scale)'), PI_Y, [
      bandShape(PI_Y, Math.PI, SIGMA_DART),
      targetLine(Math.PI, 'π'),
      ...runs.flatMap((r, k) => runningPath(`run${k}`, r, n, { faint: true })),
      ...(n ? runs.map((r, k): Shape => ({ kind: 'point', id: `now${k}`, at: [lx(n), round(r[n - 1], 2)], mark: 'key', size: 'sm' })) : []),
    ]);
  const values = (n: number): PlotPart =>
    readouts(
      n
        ? [
            { id: 'n', label: 'darts per run', value: comma(n) },
            { id: 'spread', label: 'spread of the 20 estimates', value: fmt(spread(at(n)), 3), mark: 'key' },
            { id: 'band', label: 'band 2σ/√n', value: pm(band(SIGMA_DART, n), 3), tone: 2 },
            { id: 'inside', label: 'runs inside the band', value: `${insideBand(n)} of ${RUNS}` },
          ]
        : [{ id: 'runs', label: 'runs', value: String(RUNS) }],
    );
  const frame = (n: number, o: Parameters<typeof plotFrame>[1]) => plotFrame([plane(n), values(n)], { ...o, stats: { n } });
  const vars = (n: number): Record<string, number> => (n ? { n, spread: round(spread(at(n)), 3), 'inside band': insideBand(n) } : { runs: RUNS });
  const distinct = (n: number) => new Set(at(n)).size;
  const sd = (n: number) => fmt(spread(at(n)), 3);

  yield frame(0, {
    line: 0,
    note: `Twenty people each throw their own darts and keep their own running estimate of π. One run can be lucky or unlucky; twenty side by side show how far runs typically stray, and whether the band really holds most of them.`,
    vars: vars(0),
    checkpoint: askInOrder('After one dart each, how many different estimates will the 20 runs show between them?', ['1', '2', '20'], String(distinct(1))),
  });

  const fours = at(1).filter((e) => e === 4).length;
  yield frame(1, {
    line: 5,
    note: `One dart gives 4 or 0, nothing else: ${fours} run${fours === 1 ? '' : 's'} say${fours === 1 ? 's' : ''} 4 and ${RUNS - fours} say${RUNS - fours === 1 ? 's' : ''} 0. Their spread is ${sd(1)}; the spread of one dart's score, σ, is ${fmt(SIGMA_DART, 2)}.`,
    vars: vars(1),
  });

  for (const n of [4, 16]) {
    yield frame(n, {
      line: 6,
      note: `${n} darts each: the 20 estimates spread by ${sd(n)}, against σ/√n = ${fmt(SIGMA_DART / Math.sqrt(n), 3)} in theory, and ${insideBand(n)} of 20 sit inside the band.`,
      vars: vars(n),
    });
  }

  yield frame(64, {
    line: 6,
    note: `64 darts each: the estimates spread by ${sd(64)}. Each run is a different, equally honest estimate; how far apart they are is the uncertainty of any one of them.`,
    vars: vars(64),
    checkpoint: askInOrder('At 1,024 darts each, 16 times as many, how wide will the spread of the runs be?', SPREAD_CHOICES, 'A quarter as wide'),
  });

  yield frame(256, {
    line: 7,
    note: `256 darts each: the spread is ${sd(256)}, ${fmt(spread(at(256)) / spread(at(64)), 2)} of the ${sd(64)} at 64. In theory four times the darts halve it, as they halve the band, from ± ${fmt(band(SIGMA_DART, 64), 3)} to ± ${fmt(band(SIGMA_DART, 256), 3)}; twenty runs measure it only roughly.`,
    vars: vars(256),
    checkpoint: askInOrder(`At 1,024 darts each, will at least ${MOST} of the 20 runs sit inside the band?`, ['Yes', 'No'], insideBand(1024) >= MOST ? 'Yes' : 'No'),
  });

  const ratio = spread(at(1024)) / spread(at(64));
  yield frame(1024, {
    line: 7,
    note: `1,024 darts each: the spread is ${sd(1024)}, ${fmt(ratio, 2)} of what it was at 64. Sixteen times the darts, √16 = 4 times narrower. ${insideBand(1024)} of the 20 runs sit inside the band of ± ${fmt(band(SIGMA_DART, 1024), 3)}.`,
    vars: vars(1024),
  });

  yield frame(MAX_N, {
    line: 7,
    note: `4,096 darts each: the spread is ${sd(MAX_N)}, and ${insideBand(MAX_N)} of 20 runs sit inside the band of ± ${fmt(band(SIGMA_DART, MAX_N), 3)}. The band 2σ/√n is wide enough for about 19 runs in 20; why that share, the central limit theorem explains.`,
    vars: vars(MAX_N),
  });
}

// ───────────────────────────── story 4: the area of a lens ─────────────────────────────

const LENS_X: Axis = { min: -1.1, max: 2.85 };
const LENS_Y: Axis = { min: -1.1, max: 1.1 };
export const AREA_ASK = ['Nothing: the share is the area', 'The area of the box', 'The exact formula for the lens'];
export const BAR_ASK = ['About the same', 'About half as wide', 'About a quarter as wide'];

/** The lens as a closed outline: circle 1's right arc, then circle 2's left arc. */
function lensOutline(d: number): Vec[] {
  const t = Math.atan2(Math.sqrt(1 - (d * d) / 4), d / 2);
  return [...arc(0, -t, t), ...arc(d, Math.PI - t, Math.PI + t)];
}

/** The estimate's question after the first 16 darts: real slips are the share alone, the darts outside, and the π story's 4. */
export function estimateChoices(d: number, inside: number, n: number) {
  const B = lensBox(d).area;
  return { answer: fmt((B * inside) / n, 3), slips: [fmt(inside / n, 3), fmt((B * (n - inside)) / n, 3), fmt((4 * inside) / n, 3)] };
}

function* areaStory(d: number, seed: number): Generator<Frame<PlotState>> {
  const box = lensBox(d);
  const B = box.area;
  const A = lensArea(d);
  const darts = lensDarts(seed, d);
  const estimates = areaEstimates(d, darts);
  let k = 0;
  const inside = darts.map((p) => (k += inLens(d, p) ? 1 : 0));
  const share = (n: number) => inside[n - 1] / n;
  const bar = (n: number) => errorBar(B, share(n), n);
  const AY: Axis = { min: 0, max: round(B, 2), label: 'estimated area' };
  const picture = (n: number): PlanePart => ({
    kind: 'plane',
    id: 'lens',
    label: n ? `${comma(n)} darts in the box${n > DRAWN ? ` (the first ${DRAWN} drawn)` : ''}` : `Two circles of radius 1, ${fmt(d)} apart`,
    x: LENS_X,
    y: LENS_Y,
    equal: true,
    shapes: [
      { kind: 'path', id: 'c1', points: arc(0, 0, 2 * Math.PI, 96), closed: true, faint: true },
      { kind: 'path', id: 'c2', points: arc(d, 0, 2 * Math.PI, 96), closed: true, faint: true },
      { kind: 'path', id: 'lens', points: lensOutline(d), closed: true, fill: true, fillOpacity: 0.18, label: 'lens' },
      { kind: 'path', id: 'box', points: [[box.x0, box.y0], [box.x1, box.y0], [box.x1, box.y1], [box.x0, box.y1]].map(([x, y]) => [round(x, 2), round(y, 2)] as Vec), closed: true, dashed: true, label: `box, area ${fmt(B)}` },
      ...dartShapes(darts, (p) => inLens(d, p), n),
    ],
    handles: [{ id: 'd', at: [d, 0], label: 'the second circle’s centre', mark: 'key', step: LENS_RANGE.step, min: [LENS_RANGE.min, 0], max: [LENS_RANGE.max, 0] }],
  });
  const plane = (n: number, opts: { estimate: boolean; exact: boolean }): PlanePart =>
    chart('plane', 'The running estimate of the area', LOG_X('darts n (log scale)'), AY, [
      ...(opts.exact ? [bandShape(AY, A, B * Math.sqrt((A / B) * (1 - A / B))), targetLine(A, `exact ${fmt(A, 3)}`)] : []),
      ...(opts.estimate ? runningPath('estimate', estimates, n, { tone: 1, label: 'estimate' }) : []),
      ...(opts.estimate
        ? [
            { kind: 'path', id: 'bar', points: [[lx(n), clampTo(AY, estimates[n - 1] - bar(n))], [lx(n), clampTo(AY, estimates[n - 1] + bar(n))]], tone: 3, label: 'error bar' } as Shape,
            { kind: 'point', id: 'now', at: [lx(n), round(estimates[n - 1], 2)], mark: 'key', size: 'md' } as Shape,
          ]
        : []),
    ]);
  const counts = (n: number): Readout[] => [
    { id: 'n', label: 'darts n', value: comma(n) },
    { id: 'inside', label: 'inside the lens', value: comma(inside[n - 1]), mark: 'found' },
    { id: 'box', label: 'box area', value: fmt(B) },
  ];
  const estimateItems = (n: number): Readout[] => [
    ...counts(n),
    { id: 'estimate', label: 'box area × inside / n', value: fmt(estimates[n - 1], 3), mark: 'key' },
    { id: 'bar', label: 'error bar 2B√(p̂(1 − p̂))/√n', value: pm(bar(n), 3), tone: 3 },
  ];
  const vars = (n: number): Record<string, number> => ({ d, 'box area': round(B, 2), n, ...(n ? { inside: inside[n - 1] } : {}) });
  const est = (n: number) => fmt(estimates[n - 1], 3);

  yield plotFrame([picture(0), plane(0, { estimate: false, exact: false }), readouts([{ id: 'd', label: 'centres apart d', value: fmt(d) }, { id: 'box', label: 'box area', value: fmt(B) }])], {
    line: 3,
    note: `Two circles of radius 1, centres ${fmt(d)} apart, overlap in a lens. Its area takes some work to find by geometry, so estimate it instead: throw darts uniformly into the dashed box around it, ${fmt(box.x1 - box.x0)} wide and 2 tall, and count those landing in both circles. Drag the second centre to change the lens.`,
    vars: vars(0),
    stats: { n: 0 },
    checkpoint: askInOrder('To turn the share of darts inside the lens into its area, what else do you need?', AREA_ASK, AREA_ASK[1]),
  });

  const first = estimateChoices(d, inside[15], 16);
  yield plotFrame([picture(16), plane(16, { estimate: false, exact: false }), readouts(counts(16))], {
    line: 4,
    note: `16 darts: ${inside[15]} landed in the lens. The box has area ${fmt(B)}, and a dart is equally likely to land anywhere in it, so the share inside estimates the lens's share of the box.`,
    vars: vars(16),
    stats: { n: 16 },
    checkpoint: ask(`${inside[15]} of 16 darts landed in the lens, and the box has area ${fmt(B)}. What is the estimate of the lens's area?`, first.answer, first.slips),
  });

  yield plotFrame([picture(16), plane(16, { estimate: true, exact: false }), readouts(estimateItems(16))], {
    line: 5,
    note: `The estimate is ${fmt(B)} × ${inside[15]} / 16 = ${est(16)}. Not knowing the answer, the darts can still say how far off they probably are: with p̂ = ${fmt(share(16), 3)} the share inside, the error bar is 2 × ${fmt(B)} × √(p̂(1 − p̂)) / √16 = ± ${fmt(bar(16), 3)}.`,
    vars: vars(16),
    stats: { n: 16 },
    checkpoint: askInOrder('Quadruple to 64 darts. How wide will the error bar be?', BAR_ASK, BAR_ASK[1]),
  });

  for (const n of [64, 256, 1024]) {
    const before = n / 4;
    yield plotFrame([picture(n), plane(n, { estimate: true, exact: false }), readouts(estimateItems(n))], {
      line: n === 64 ? 7 : 5,
      note: `${comma(n)} darts: the estimate is ${est(n)} ± ${fmt(bar(n), 3)}. The error bar went from ± ${fmt(bar(before), 3)} to ± ${fmt(bar(n), 3)}, ${fmt(bar(n) / bar(before), 2)} as wide for four times the darts (it wobbles a little, as p̂ does).`,
      vars: vars(n),
      stats: { n },
    });
  }

  const inBar = Math.abs(estimates[MAX_N - 1] - A) <= bar(MAX_N);
  yield plotFrame([picture(MAX_N), plane(MAX_N, { estimate: true, exact: false }), readouts(estimateItems(MAX_N))], {
    line: 5,
    note: `4,096 darts: the estimate is ${est(MAX_N)} ± ${fmt(bar(MAX_N), 3)}. Geometry gives the exact area, so the estimate can be checked.`,
    vars: vars(MAX_N),
    stats: { n: MAX_N },
    checkpoint: askInOrder(`Will the exact area be within ± ${fmt(bar(MAX_N), 3)} of the estimate?`, ['Yes', 'No'], inBar ? 'Yes' : 'No'),
  });

  yield plotFrame(
    [
      picture(MAX_N),
      plane(MAX_N, { estimate: true, exact: true }),
      readouts([...estimateItems(MAX_N), { id: 'exact', label: 'exact area', value: fmt(A, 4) }, { id: 'error', label: 'estimate − exact', value: signed(estimates[MAX_N - 1] - A, 4) }]),
    ],
    {
      line: 6,
      note: `The exact area is ${fmt(A, 4)}${d === 0 ? ': the circles coincide, so the lens is a whole circle and its area is π' : d === 1 ? ' = 2π/3 − √3/2, two 120° slices of a circle less two triangles'
        : ''}. The estimate ${est(MAX_N)} is off by ${fmt(Math.abs(estimates[MAX_N - 1] - A), 4)}, ${inBar ? 'inside' : 'outside'} its error bar. The same darts would measure any shape you can test a point against, which is why Monte Carlo is used where no formula exists.`,
      vars: vars(MAX_N),
      stats: { n: MAX_N },
    },
  );
}

function* run(input: MonteCarloInput): Generator<Frame<PlotState>> {
  if (input.story === 'dice') yield* diceStory(input.seed);
  else if (input.story === 'darts') yield* dartsStory(input.seed);
  else if (input.story === 'runs') yield* runsStory(input.seed);
  else yield* areaStory(input.d, input.seed);
}

// ───────────────────────────── custom text and drags ─────────────────────────────

const onStep = (v: number, step: number) => Math.abs(v / step - Math.round(v / step)) < 1e-9;
const MAX_SEED = 4294967295;
const okSeed = (s: number) => Number.isInteger(s) && s >= 0 && s <= MAX_SEED;

export function parseMonteCarlo(text: string): { value: MonteCarloInput } | { error: string } {
  const story = (text.toLowerCase().match(/[a-z]+/) ?? [''])[0] as Story;
  const xs = numbersIn(text);
  if (!STORIES.includes(story)) return { error: 'Start with dice, darts, runs or area, e.g. darts seed 7, or area d 1 seed 7.' };
  if (story === 'area') {
    const { min, max, step } = LENS_RANGE;
    if (xs.length !== 2) return { error: 'Give the distance d between the centres and a seed, e.g. area d 1 seed 7.' };
    const [d, seed] = xs;
    if (!onStep(d, step) || d < min || d > max) return { error: `d is a multiple of 0.25 from ${min} to ${max}.` };
    if (!okSeed(seed)) return { error: 'The seed is a whole number, 0 or more.' };
    return { value: { story, d, seed } };
  }
  if (xs.length !== 1 || !okSeed(xs[0])) return { error: `Give one seed, a whole number 0 or more, e.g. ${story} seed 7.` };
  return { value: { story, seed: xs[0] } };
}

export function formatMonteCarlo(input: MonteCarloInput): string {
  return input.story === 'area' ? `area d ${plain(input.d)} seed ${input.seed}` : `${input.story} seed ${input.seed}`;
}

export function dragMonteCarlo(input: MonteCarloInput, _handle: string, to: Vec): MonteCarloInput {
  if (input.story !== 'area') return input;
  return { ...input, d: snap(to[0], LENS_RANGE.step, LENS_RANGE.min, LENS_RANGE.max) };
}

const example = (id: string, label: string, make: (seed: number) => MonteCarloInput) => ({ id, label, make: ({ seed }: { seed: number }) => make(seed), sized: false });

export const monteCarlo = defineAlgorithm<MonteCarloInput, PlotState>({
  kind: 'algorithm',
  slug: 'monte-carlo',
  view: 'plot',
  input: {
    examples: [
      example('dice', 'A die’s running average settles on 3.5', (seed) => ({ story: 'dice', seed })),
      example('darts', 'Darts in a square estimate π', (seed) => ({ story: 'darts', seed })),
      example('runs', 'Twenty runs at once: the band holds most', (seed) => ({ story: 'runs', seed })),
      example('area', 'The area of a lens, checked against geometry', (seed) => ({ story: 'area', d: 1, seed })),
    ],
    custom: {
      label: 'dice, darts or runs with a seed; area with the distance d between the centres (0 to 1.75, in quarters) and a seed',
      placeholder: 'e.g. darts seed 7, or area d 1 seed 7',
      parse: parseMonteCarlo,
      format: formatMonteCarlo,
    },
    drag: dragMonteCarlo,
  },
  pseudocode,
  stats: [{ key: 'n', label: 'Samples so far' }],
  legend: [
    { neutral: 'Shapes, guides and darts outside' },
    { mark: 'found', label: 'A dart inside the shape' },
    { mark: 'key', label: 'The newest running average or estimate; the centre you drag' },
    { tone: 1, label: 'The running average or estimate' },
    { tone: 2, label: 'The band ± 2σ/√n where most runs sit' },
    { tone: 3, label: 'The error bar the darts give themselves' },
  ],
  run,
  content: {
    idea: 'Average many independent samples and the average settles on the expected value: the law of large numbers. A die’s running average settles on 3.5, and the share of random darts inside a quarter circle, times 4, settles on π. Monte Carlo turns this into a way to estimate anything that is an average, such as the area of a shape you can only test points against.',
    invariant: 'After n samples the average’s typical miss is σ/√n, so it sits inside the band ± 2σ/√n in most runs (about 19 in 20): four times the samples halve the band, and each extra correct decimal place costs 100 times the samples. Early luck is never paid back; it is swamped.',
    whenToUse: 'Whenever a quantity is an average or a probability you can simulate but not easily compute: areas and volumes of awkward shapes, the odds in a game, risk in finance, light bouncing in rendering, and the expected loss a training step estimates from a mini-batch.',
    traits: [
      { label: 'Works on any shape you can test a point against', good: true },
      { label: 'Miss shrinks like 1/√n: slow', good: false },
      { label: 'Gives its own error bar', good: true },
      { label: 'Same seed, same run', good: null },
    ],
    experiments: [
      { example: 'dice', prompt: 'Press New values a few times. Does a lucky start ever get paid back in the total, or does the average settle anyway?' },
      { example: 'darts', prompt: 'Before each frame, guess whether the estimate will be inside the band. How often is it outside?' },
      { example: 'runs', prompt: 'Compare the spread of the 20 runs at 64 and at 1,024 darts. Is it a quarter, or a sixteenth?' },
      { example: 'area', prompt: 'Drag the second centre to 0: the lens becomes a whole circle. What should the estimate approach then?' },
    ],
  },
});
