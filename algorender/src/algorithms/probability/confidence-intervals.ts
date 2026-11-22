import { defineAlgorithm } from '@/engine/module';
import { createRng } from '@/engine/random';
import type { Frame } from '@/engine/types';
import { ask, askInOrder, numbersIn, plotFrame } from '@/viz/plot/frame';
import { fmt, round } from '@/viz/plot/geometry';
import type { Axis, Bar, LineShape, PlanePart, PlotPart, PlotState, Readout, Shape } from '@/viz/plot/types';

// Standard errors, confidence intervals and the bootstrap (B6 of the math and
// ML path). One sample's average x̄ estimates the true average μ, but another
// sample would give another x̄: how far off might this one be? The spread of
// single values s, divided by √n, is the standard error, the typical miss of
// x̄. By the central limit theorem x̄ lands within 2 standard errors of μ in
// about 95% of samples, so the interval x̄ ± 2 SE catches μ in about 95% of
// samples: the 95% belongs to the method, not to one interval. The bootstrap
// gets the same answer with no formula: resample the sample with replacement,
// and keep the middle 95% of the resample averages.
//
// The population is a die loaded towards 5 and 6, so every roll is a whole
// number and every average of 25 rolls a multiple of 0.04: no exp or log, and
// the numbers are the same on every machine.

// ───────────────────────────── the maths ─────────────────────────────

/** One roll: a uniform u picks one of 8 equally likely slots; 5 and 6 have two slots each. */
export const FACES = [1, 2, 3, 4, 5, 5, 6, 6] as const;
/** The die's chances: 1/8 for each of 1 to 4, 1/4 for 5 and for 6. */
export const CHANCES = [1, 1, 1, 1, 2, 2].map((w) => w / 8);
/** E[X] = (1 + 2 + 3 + 4)/8 + (5 + 6)/4 = 4; E[X²] = 19, so Var(X) = 19 − 16 = 3. */
export const MU = 4;
export const SIGMA = Math.sqrt(3);

/** Rolls per sample, the bigger sample, intervals per run, and the many samples (or resamples). */
export const N = 25;
export const BIG_N = 100;
export const SAMPLES = 50;
export const MANY = 1000;
/** The middle 95% of 1,000 resample averages: drop 25 from each end. */
export const DROP = 25;

export const roll = (u: () => number) => FACES[Math.floor(u() * FACES.length)];
export const drawRolls = (u: () => number, n: number) => Array.from({ length: n }, () => roll(u));

export const total = (xs: readonly number[]) => xs.reduce((s, v) => s + v, 0);
export const mean = (xs: readonly number[]) => total(xs) / xs.length;

/** The sample standard deviation: squared gaps from x̄, added, divided by n − 1, square-rooted. */
export function sampleSd(xs: readonly number[]): number {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) * (x - m), 0) / (xs.length - 1));
}

/** The standard error of the average: s / √n. */
export const standardError = (xs: readonly number[]) => sampleSd(xs) / Math.sqrt(xs.length);

/** The spread (standard deviation, dividing by the count) of many values, e.g. 1,000 averages. */
export function spread(values: readonly number[]): number {
  const m = mean(values);
  return Math.sqrt(values.reduce((s, v) => s + (v - m) * (v - m), 0) / values.length);
}

export type Interval = { xbar: number; se: number; lo: number; hi: number; caught: boolean };

/** x̄ ± k·SE, and whether it catches the true average. */
export function interval(xs: readonly number[], k = 2, mu = MU): Interval {
  const xbar = mean(xs);
  const se = standardError(xs);
  const lo = xbar - k * se;
  const hi = xbar + k * se;
  return { xbar, se, lo, hi, caught: lo <= mu && mu <= hi };
}

/** `count` samples of `n` rolls, one after another from the generator. */
export const drawSamples = (u: () => number, count: number, n: number) => Array.from({ length: count }, () => drawRolls(u, n));

/** One resample: n picks from the sample with replacement, each index ⌊u·n⌋. */
export const resample = (sample: readonly number[], u: () => number) => sample.map(() => sample[Math.floor(u() * sample.length)]);

/** The averages of `count` resamples. */
export const resampleMeans = (sample: readonly number[], count: number, u: () => number) => Array.from({ length: count }, () => mean(resample(sample, u)));

/** The middle share of some values: sorted, with the same number dropped from each end. */
export function middle(values: readonly number[], share = 0.95): { lo: number; hi: number; drop: number } {
  const sorted = [...values].sort((a, b) => a - b);
  const drop = Math.round((values.length * (1 - share)) / 2);
  return { lo: sorted[drop], hi: sorted[values.length - 1 - drop], drop };
}

/** The share of `k`·SE intervals from fresh samples of n that catch μ (for tests and the lesson). */
export function coverage(seed: number, count: number, n = N, k = 2): number {
  const u = createRng(seed);
  let caught = 0;
  for (let i = 0; i < count; i++) if (interval(drawRolls(u, n), k).caught) caught++;
  return caught / count;
}

// ───────────────────────────── the runs each story draws ─────────────────────────────

/** Every story starts with the same 25 rolls from its seed, so sample 1 is the same everywhere. */
export function firstSample(seed: number) {
  const u = createRng(seed);
  return { u, sample: drawRolls(u, N) };
}

export function standardErrorRun(seed: number) {
  const { u, sample } = firstSample(seed);
  const second = drawRolls(u, N);
  const means = drawSamples(u, MANY, N).map(mean);
  const big = drawRolls(u, BIG_N);
  const bigMeans = drawSamples(u, MANY, BIG_N).map(mean);
  return { sample, second, means, big, bigMeans };
}

export function intervalsRun(seed: number) {
  const { u, sample } = firstSample(seed);
  const small = [sample, ...drawSamples(u, SAMPLES - 1, N)];
  const big = drawSamples(u, SAMPLES, BIG_N);
  return { small, big, two: small.map((s) => interval(s)), one: small.map((s) => interval(s, 1)), bigTwo: big.map((s) => interval(s)) };
}

export function bootstrapRun(seed: number) {
  const { u, sample } = firstSample(seed);
  const first = resample(sample, u);
  const means = [mean(first), ...resampleMeans(sample, MANY - 1, u)];
  const big = drawRolls(u, BIG_N);
  const bigMeans = resampleMeans(big, MANY, u);
  return { sample, first, means, cut: middle(means), big, bigMeans, bigCut: middle(bigMeans) };
}

// ───────────────────────────── input ─────────────────────────────

export type CiInput = { story: 'standard-error' | 'intervals' | 'bootstrap'; seed: number };
export type Story = CiInput['story'];
export const STORIES: Story[] = ['standard-error', 'intervals', 'bootstrap'];

const pseudocode = [
  'roll the die n times: a sample',
  'x̄ = (sum of the rolls) / n',
  's = √(Σ(x − x̄)² / (n − 1))',
  'SE = s / √n',
  'interval: x̄ − 2·SE to x̄ + 2·SE',
  'repeat for many samples',
  'resample: n picks, with replacement',
  'keep the middle 95% of the averages',
];

// ───────────────────────────── drawing helpers ─────────────────────────────

/** 1,000 rather than 1000. */
export const comma = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const readouts = (items: Readout[], label = 'Values'): PlotPart => ({ kind: 'readouts', id: 'readouts', label, items });
const chart = (id: string, label: string, x: Axis, y: Axis, shapes: Shape[]): PlanePart => ({ kind: 'plane', id, label, x, y, equal: false, shapes, handles: [] });
const between = (lo: number, hi: number) => `${fmt(lo)} to ${fmt(hi)}`;
const clampX = (axis: Axis, v: number) => round(Math.min(axis.max, Math.max(axis.min, v)), 2);

const FACES_X: Axis = { min: 0.4, max: 6.6, label: 'face', ticks: [1, 2, 3, 4, 5, 6].map((f) => ({ at: f, label: String(f) })) };
/** Averages of rolls, from 2 to 6. */
const AVG_X: Axis = { min: 2, max: 6, label: 'average of the rolls' };

const faceCounts = (rolls: readonly number[]) => [1, 2, 3, 4, 5, 6].map((f) => rolls.filter((r) => r === f).length);

/** The faces chart: the sample's counts (and a resample's beside them). */
function facesPlane(sample: readonly number[] | null, o: { top: number; label: string; extra?: Shape[]; resample?: readonly number[] }): PlanePart {
  const counts = sample ? faceCounts(sample) : [0, 0, 0, 0, 0, 0];
  const side = o.resample ? 0.18 : 0;
  const bars: Bar[] = counts.map((c, i) => ({ id: `f${i + 1}`, x0: round(i + 1 - 0.3 - side, 2), x1: round(i + 1 + 0.3 - side, 2), y: c, ...(sample ? { label: String(c) } : {}) }));
  const shapes: Shape[] = [{ kind: 'bars', id: 'counts', bars }];
  if (o.resample) {
    const again = faceCounts(o.resample);
    shapes.push({ kind: 'bars', id: 'again', bars: again.map((c, i) => ({ id: `r${i + 1}`, x0: round(i + 1 + 0.14, 2), x1: round(i + 1 + 0.46, 2), y: c, tone: 1, label: String(c) })) });
  }
  return chart('rolls', o.label, FACES_X, { min: 0, max: o.top, label: 'rolls' }, [...shapes, ...(o.extra ?? [])]);
}

/** A vertical marker at an average. */
const marker = (id: string, x: number, label: string, paint: Pick<LineShape, 'mark' | 'tone' | 'dashed'> = {}): Shape => ({
  kind: 'line',
  id,
  through: [round(x, 2), 0],
  dir: [0, 1],
  label,
  ...paint,
});

/** A horizontal span from lo to hi at height y. */
const span = (id: string, lo: number, hi: number, y: number, axis: Axis, paint: { tone?: 1 | 2 | 3 | 4; label?: string; mark?: 'key' | 'reject' }): Shape => ({
  kind: 'path',
  id,
  points: [
    [clampX(axis, lo), round(y, 2)],
    [clampX(axis, hi), round(y, 2)],
  ],
  ...paint,
});

/** A histogram of averages of n rolls, one bar per multiple of 0.04 (so 4 values of a 100-roll average share a bar). */
export function averageBars(id: string, values: readonly number[], n: number, paint: (centre: number) => Pick<Bar, 'mark' | 'tone'> = () => ({})): Bar[] {
  const counts = new Map<number, number>();
  for (const v of values) {
    const bin = Math.round((Math.round(v * n) * 25) / n);
    counts.set(bin, (counts.get(bin) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([bin]) => bin / 25 >= AVG_X.min && bin / 25 <= AVG_X.max)
    .sort((a, b) => a[0] - b[0])
    .map(([bin, c]) => ({ id: `${id}${bin}`, x0: round((bin - 0.5) / 25, 2), x1: round((bin + 0.5) / 25, 2), y: c, ...paint(bin / 25) }));
}

const tallest = (...lists: Bar[][]) => Math.max(1, ...lists.flat().map((b) => b.y));
/** The top of a count axis: 15% above the tallest bar, rounded up to a multiple of 5. */
const topOf = (h: number) => 5 * Math.ceil((h * 1.15) / 5);

// ───────────────────────────── story 1: the standard error ─────────────────────────────

/** The answer and the slips for "how far is x̄ typically from μ?": s itself, s/n, and s²/n (the variance over n). */
export function missChoices(sample: readonly number[]) {
  const s = sampleSd(sample);
  const n = sample.length;
  return { answer: fmt(s / Math.sqrt(n), 3), slips: [fmt(s, 3), fmt(s / n, 3), fmt((s * s) / n, 3)] };
}

/** A measured value within 20% of what it estimates: what a note may call "close". */
export const closeTo = (value: number, target: number) => Math.abs(value - target) <= 0.2 * target;
/** A ratio a note may call "about half". */
export const halfish = (ratio: number) => ratio >= 0.4 && ratio <= 0.6;
/** Two intervals a note may call "nearly the same": both ends within 0.1. */
export const nearlySame = (a: { lo: number; hi: number }, b: { lo: number; hi: number }) => Math.abs(a.lo - b.lo) <= 0.1 && Math.abs(a.hi - b.hi) <= 0.1;
/** σ/√25, the true spread of averages of 25 rolls. */
export const TRUE_SE = SIGMA / Math.sqrt(N);

export const SPREAD_ASK = ['About s, like single rolls', 'About the standard error s/√n', 'About s/n'];
export const BIGGER_ASK = ['The same', 'Half as big', 'A quarter as big'];
export const STAND_IN = ['The spread s of these 25 rolls', 'A fair die’s spread, 1.71', 'Nothing: we must know σ'];

function* standardErrorStory(seed: number): Generator<Frame<PlotState>> {
  const { sample, second, means, big, bigMeans } = standardErrorRun(seed);
  const xbar = mean(sample);
  const s = sampleSd(sample);
  const se = standardError(sample);
  const sBig = sampleSd(big);
  const seBig = standardError(big);
  const top = Math.max(10, ...faceCounts(sample)) + 2;
  const small = averageBars('a', means, N);
  const large = averageBars('b', bigMeans, BIG_N, () => ({ tone: 3 }));
  const meansTop = topOf(tallest(small, large));
  const xbarLine = marker('xbar', xbar, `x̄ = ${fmt(xbar)}`, { mark: 'key' });
  const rolls = (o: { s?: boolean }) =>
    facesPlane(sample, { top, label: 'The 25 rolls', extra: [xbarLine, ...(o.s ? [span('s', xbar - s, xbar + s, top - 1, FACES_X, { tone: 2, label: 'x̄ ± s' })] : [])] });
  const averages = (o: { se?: boolean; many?: boolean; big?: boolean }): PlanePart =>
    chart('averages', o.many ? (o.big ? `1,000 averages of 25 rolls, and of 100` : '1,000 averages of 25 rolls each') : 'Where averages of 25 rolls land', AVG_X, { min: 0, max: meansTop, label: 'samples' }, [
      ...(o.many ? [{ kind: 'bars', id: 'many', bars: small } as Shape] : []),
      ...(o.big ? [{ kind: 'bars', id: 'big', bars: large } as Shape, marker('mu', MU, 'μ = 4', { dashed: true })] : o.many ? [marker('mu', MU, 'μ = 4', { dashed: true })] : []),
      { kind: 'point', id: 'xbar', at: [round(xbar, 2), 0], mark: 'key', size: 'md', label: 'x̄' },
      ...(o.se ? [span('se', xbar - se, xbar + se, meansTop * 0.9, AVG_X, { tone: 2, label: 'x̄ ± SE' })] : []),
    ]);
  const base: Readout[] = [
    { id: 'n', label: 'rolls n', value: String(N) },
    { id: 'xbar', label: 'average x̄', value: fmt(xbar), mark: 'key' },
  ];
  const sItem: Readout = { id: 's', label: 'spread of rolls s', value: fmt(s), tone: 2 };
  const seItem: Readout = { id: 'se', label: 'standard error s/√n', value: fmt(se, 3), tone: 2 };
  const vars = (o: Record<string, number> = {}) => ({ n: N, 'x̄': round(xbar, 2), ...o });

  yield plotFrame([facesPlane(null, { top, label: 'The 25 rolls' }), averages({}), readouts([{ id: 'n', label: 'rolls n', value: String(N) }])], {
    line: 0,
    note: 'This die may be loaded, and nobody has told us how. What we want is its true average μ, the expected value of one roll. All we can see is rolls, so roll it 25 times: a sample of n = 25. The average of the sample, x̄ (“x bar”), is our estimate of μ.',
    vars: { n: N },
    stats: { samples: 0 },
  });

  yield plotFrame([rolls({}), averages({}), readouts(base)], {
    line: 1,
    note: `The 25 rolls add up to ${total(sample)}, so x̄ = ${total(sample)} / 25 = ${fmt(xbar)}. That is our estimate of μ. But it came from 25 particular rolls.`,
    vars: vars(),
    stats: { samples: 1 },
    checkpoint: askInOrder('Roll 25 more times. Will the new x̄ most likely be the same as this one?', ['Yes', 'No'], 'No'),
  });

  yield plotFrame([rolls({ s: true }), averages({}), readouts([...base, sItem])], {
    line: 2,
    note: `${mean(second) === xbar ? `The next 25 rolls happen to give the same x̄, ${fmt(xbar)}, but most samples don’t` : `The next 25 rolls give x̄ = ${fmt(mean(second))}`}: every sample has its own x̄. How far could ours be from μ? That depends on how much single rolls spread. We don't know the die's σ, so we measure the spread of our own rolls: s = ${fmt(s)}, the square root of the squared gaps from x̄, added and divided by n − 1 = 24. (Dividing by 24, not 25, makes up for measuring the gaps from x̄: no point makes the squared gaps smaller than x̄ does, so they come out a little smaller than gaps from μ would.)`,
    vars: vars({ s: round(s, 2) }),
    stats: { samples: 2 },
    checkpoint: ask('How far is x̄ typically from μ, give or take?', missChoices(sample).answer, missChoices(sample).slips),
  });

  yield plotFrame([rolls({ s: true }), averages({ se: true }), readouts([...base, sItem, seItem])], {
    line: 3,
    note: `The standard error is SE = s/√n = s/5 ≈ ${fmt(se, 3)}. In an average, high and low rolls partly cancel, so x̄ is typically only about ${fmt(se, 3)} from μ, though single rolls stray ${fmt(s)}. It estimates the central limit theorem's σ/√n, with s standing in for the σ we don't know.`,
    vars: vars({ s: round(s, 2), SE: round(se, 3) }),
    stats: { samples: 2 },
    checkpoint: askInOrder('Check it: take 1,000 fresh samples of 25 rolls. How widely will their 1,000 averages spread?', SPREAD_ASK, SPREAD_ASK[1]),
  });

  const sd = spread(means);
  yield plotFrame(
    [
      rolls({ s: true }),
      averages({ se: true, many: true }),
      readouts([...base, sItem, seItem, { id: 'spread', label: 'spread of 1,000 averages', value: fmt(sd, 3) }, { id: 'sigma', label: 'true σ/√n', value: fmt(SIGMA / Math.sqrt(N), 3) }]),
    ],
    {
      line: 5,
      note: `The 1,000 averages spread by ${fmt(sd, 3)} (their standard deviation)${closeTo(se, sd) ? `: about the standard error, ${fmt(se, 3)}, from our one sample` : `. Our one sample's SE, ${fmt(se, 3)}, is further off: its s, ${fmt(s)}, happened to come out ${s < SIGMA ? 'small' : 'large'}`}. Now the secret: this die lands 5 or 6 twice as often as each other face, so μ = (1 + 2 + 3 + 4)/8 + (5 + 6)/4 = 4, E[X²] = (1 + 4 + 9 + 16)/8 + (25 + 36)/4 = 19, σ² = 19 − 4² = 3 and σ = √3 ≈ 1.73: σ/√n = ${fmt(TRUE_SE, 3)}. ${closeTo(se, TRUE_SE) ? "One sample's SE came close to it without knowing σ." : "One sample's SE is only an estimate of it, and this sample's is a rough one."}`,
      vars: vars({ s: round(s, 2), SE: round(se, 3), spread: round(sd, 3) }),
      stats: { samples: 2 + MANY },
      checkpoint: askInOrder('Roll 100 times instead of 25. About how big will the standard error be?', BIGGER_ASK, BIGGER_ASK[1]),
    },
  );

  yield plotFrame(
    [
      facesPlane(big, { top: topOf(Math.max(...faceCounts(big))), label: 'The 100 rolls', extra: [marker('xbar', mean(big), `x̄ = ${fmt(mean(big))}`, { mark: 'key' })] }),
      averages({ many: true, big: true }),
      readouts([
        { id: 'n', label: 'rolls n', value: String(BIG_N) },
        { id: 'xbar', label: 'average x̄', value: fmt(mean(big)), mark: 'key' },
        { id: 's', label: 'spread of rolls s', value: fmt(sBig), tone: 2 },
        { id: 'se', label: 'standard error s/√n', value: fmt(seBig, 3), tone: 2 },
        { id: 'spread', label: 'spread of 1,000 averages', value: fmt(spread(bigMeans), 3), tone: 3 },
      ]),
    ],
    {
      line: 3,
      note: `100 rolls: x̄ = ${fmt(mean(big))} and s = ${fmt(sBig)}. Single rolls spread no less than before (s settles near σ; it doesn't shrink), but SE = s/10 ≈ ${fmt(seBig, 3)}, against ${fmt(se, 3)} for 25 rolls${halfish(seBig / se) ? ': about half, since dividing by √100 = 10 instead of √25 = 5 halves it' : `. Dividing by √100 = 10 instead of √25 = 5 halves the SE on average, but each SE also carries its own sample's s, and the 25 rolls' s, ${fmt(s)}, came out ${s < sBig ? 'small' : 'large'}`}. 1,000 averages of 100 rolls (in colour) pile up about twice as tightly as averages of 25, spreading by ${fmt(spread(bigMeans), 3)}. More rolls don't make single rolls less spread out; they make the average more precise.`,
      vars: { n: BIG_N, 'x̄': round(mean(big), 2), s: round(sBig, 2), SE: round(seBig, 3) },
      stats: { samples: 3 + 2 * MANY },
    },
  );
}

// ───────────────────────────── story 2: 50 confidence intervals ─────────────────────────────

/** Sample k (1 at the top) sits at height 51 − k. */
const rowY = (k: number) => SAMPLES + 1 - k;
// Two blank rows under the last interval keep the x-axis label, drawn just above the axis, clear of it.
const ROWS_Y: Axis = { min: -2, max: SAMPLES + 1, label: 'sample', ticks: [1, 10, 20, 30, 40, 50].map((k) => ({ at: rowY(k), label: String(k) })) };

export const SHARE_ASK = ['About 68%', 'About 95%', 'About 99.7%'];
export const MISS_ASK = ['About 0', 'About 2 or 3', 'About 10', 'About 25'];
export const CHANCE_ASK = ['Yes, a 95% chance', 'No: it either holds μ or it doesn’t'];
export const MORE_ASK = ['More often', 'About as often', 'Less often'];
export const ONE_SE_ASK = ['About 50%', 'About 68%', 'About 95%'];

function intervalShapes(prefix: string, list: readonly Interval[], upto: number, newest = false): Shape[] {
  return list.slice(0, upto).flatMap((iv, i): Shape[] => {
    const k = i + 1;
    const mark = !iv.caught ? ('reject' as const) : newest && k === upto ? ('key' as const) : undefined;
    return [span(`${prefix}${k}`, iv.lo, iv.hi, rowY(k), AVG_X, mark ? { mark } : {}), { kind: 'point', id: `${prefix}m${k}`, at: [clampX(AVG_X, iv.xbar), rowY(k)], size: 'sm', ...(mark ? { mark } : {}) }];
  });
}

/** The first interval in the run that caught μ (the first one if none did). */
export const firstCaught = (list: readonly Interval[]) => Math.max(0, list.findIndex((iv) => iv.caught));

function* intervalsStory(seed: number): Generator<Frame<PlotState>> {
  const { two, one, bigTwo } = intervalsRun(seed);
  const caught = (list: readonly Interval[], upto = list.length) => list.slice(0, upto).filter((iv) => iv.caught).length;
  const muLine = marker('mu', MU, 'μ = 4', { dashed: true });
  const plane = (label: string, shapes: Shape[]) => chart('plane', label, AVG_X, ROWS_Y, [muLine, ...shapes]);
  const tally = (list: readonly Interval[], upto: number, extra: Readout[] = []): PlotPart =>
    readouts([
      { id: 'samples', label: 'intervals', value: String(upto) },
      { id: 'caught', label: 'caught μ', value: String(caught(list, upto)) },
      { id: 'missed', label: 'missed μ', value: String(upto - caught(list, upto)), mark: 'reject' },
      ...extra,
    ]);
  const first = two[0];
  // The ends as the note works them out from the numbers it shows: x̄ (2 places) ± twice SE (3 places), so the sums add up.
  const twice = round(2 * round(first.se, 3), 3);
  const shownEnds = `${fmt(first.xbar - twice, 3)} to ${fmt(first.xbar + twice, 3)}`;
  const firstItems: Readout[] = [
    { id: 'xbar', label: 'sample 1’s x̄', value: fmt(first.xbar), mark: 'key' },
    { id: 'se', label: 'its SE', value: fmt(first.se, 3) },
    { id: 'interval', label: 'x̄ ± 2 SE', value: shownEnds },
  ];

  yield plotFrame([plane('Intervals x̄ ± 2 SE, one per sample of 25 rolls', []), readouts([{ id: 'n', label: 'rolls per sample', value: String(N) }, { id: 'mu', label: 'true μ', value: '4' }])], {
    line: 0,
    note: 'Here the die is known: μ = 4, the dashed line (in real life you wouldn’t know it). Take a sample of 25 rolls and its standard error SE. By the central limit theorem, x̄ lands roughly on a normal curve centred on μ, with spread σ/√n, which each sample’s SE estimates.',
    vars: { n: N, 'μ': MU },
    stats: { samples: 0 },
    checkpoint: askInOrder('By the 68–95–99.7 rule, in what share of samples does x̄ land within 2 SE of μ?', SHARE_ASK, SHARE_ASK[1]),
  });

  yield plotFrame([plane('Sample 1', intervalShapes('i', two, 1, true)), readouts(firstItems)], {
    line: 4,
    note: `About 95% of samples put x̄ within 2 SE of μ. Sample 1: x̄ = ${fmt(first.xbar)} and SE ≈ ${fmt(first.se, 3)}, so 2 SE ≈ ${fmt(twice, 3)} and the interval x̄ ± 2 SE runs from ${shownEnds}. In real life this is all you would have: one interval, and no dashed line.`,
    vars: { n: N, 'x̄': round(first.xbar, 2), SE: round(first.se, 3) },
    stats: { samples: 1 },
    checkpoint: askInOrder('Whenever x̄ lands within 2 SE of μ, is μ within 2 SE of x̄?', ['Yes', 'No'], 'Yes'),
  });

  yield plotFrame([plane('10 samples, 10 intervals', intervalShapes('i', two, 10, true)), tally(two, 10)], {
    line: 5,
    note: `Distance works both ways: x̄ within 2 SE of μ means μ within 2 SE of x̄. So the interval catches μ exactly when its x̄ landed within 2 SE of μ, which happens in about 95% of samples. Ten samples, ten intervals, each from its own x̄ and SE: ${caught(two, 10)} of 10 caught μ.`,
    vars: { intervals: 10, caught: caught(two, 10) },
    stats: { samples: 10 },
    checkpoint: askInOrder('In a typical run of 50 such intervals, about how many miss μ?', MISS_ASK, MISS_ASK[1]),
  });

  const k = firstCaught(two);
  const pick = two[k];
  const missed = SAMPLES - caught(two);
  const high = two.filter((iv) => !iv.caught && iv.xbar > MU).length;
  const lean = missed >= 2 && high > missed - high ? ` ${high === missed ? `All ${missed}` : `${high} of the ${missed}`} misses landed high: samples heavy in 5s and 6s spread less, so their intervals are narrower.` : '';
  yield plotFrame([plane('50 samples, 50 intervals', intervalShapes('i', two, SAMPLES)), tally(two, SAMPLES)], {
    line: 5,
    note: `All 50: ${caught(two)} caught μ and ${missed} missed (marked). About 5% of 50 is 2.5 (a little more, as s wobbles too), so a typical run misses 2 or 3; this one missed ${missed}${missed === 0 ? ', which happens in a few runs out of a hundred' : ''}.${lean} The intervals differ in place and in width, because each sample has its own x̄ and its own s.`,
    vars: { intervals: SAMPLES, caught: caught(two), missed },
    stats: { samples: SAMPLES },
    checkpoint: askInOrder(`Sample ${k + 1}’s interval runs from ${between(pick.lo, pick.hi)}. Is there a 95% chance that μ lies between ${fmt(pick.lo)} and ${fmt(pick.hi)}?`, CHANCE_ASK, CHANCE_ASK[1]),
  });

  yield plotFrame([plane('50 samples, 50 intervals', intervalShapes('i', two, SAMPLES)), tally(two, SAMPLES, [{ id: 'pick', label: `sample ${k + 1}`, value: between(pick.lo, pick.hi) }])], {
    line: 4,
    note: `No. μ is one fixed number, and sample ${k + 1}'s interval is two fixed numbers: it either holds μ or it doesn't (${pick.caught ? 'this one does' : 'this one doesn’t'}). Nothing is left to chance. The 95% describes the method: of all the samples you might have drawn, about 95% give an interval that catches μ. That is what “95% confidence” means.`,
    vars: { intervals: SAMPLES, caught: caught(two) },
    stats: { samples: SAMPLES },
    checkpoint: askInOrder('Use 100 rolls per sample instead of 25. Will the intervals catch μ more often?', MORE_ASK, MORE_ASK[1]),
  });

  yield plotFrame([plane('50 samples of 100 rolls', intervalShapes('j', bigTwo, SAMPLES)), tally(bigTwo, SAMPLES, [{ id: 'n', label: 'rolls per sample', value: String(BIG_N) }])], {
    line: 5,
    note: `With 100 rolls the standard error is half as big, so the intervals are half as wide: about ± ${fmt(2 * SIGMA / Math.sqrt(BIG_N))} instead of ± ${fmt(2 * SIGMA / Math.sqrt(N))}. ${caught(bigTwo)} of 50 caught μ this time, and over many runs it is still about 95%. More data makes the intervals tighter, not surer: the 95% comes from the 2 in x̄ ± 2 SE.`,
    vars: { n: BIG_N, caught: caught(bigTwo) },
    stats: { samples: 2 * SAMPLES },
    checkpoint: askInOrder('Back to 25 rolls, but with x̄ ± 1 SE. In about what share of samples will the interval catch μ?', ONE_SE_ASK, ONE_SE_ASK[1]),
  });

  yield plotFrame([plane('The same 50 samples of 25, now x̄ ± 1 SE', intervalShapes('i', one, SAMPLES)), tally(one, SAMPLES, [{ id: 'k', label: 'interval', value: 'x̄ ± 1 SE' }])], {
    line: 4,
    note: `x̄ lands within 1 SE of μ in about 68% of samples, so x̄ ± 1 SE catches μ about 68% of the time: here ${caught(one)} of 50. Half as wide, and far less often right. Wider intervals buy confidence: ± 1 SE for about 68%, ± 2 SE for about 95%, ± 3 SE for about 99.7%.`,
    vars: { caught: caught(one) },
    stats: { samples: 2 * SAMPLES },
  });
}

// ───────────────────────────── story 3: the bootstrap ─────────────────────────────

export const REPLACE_ASK = ['Exactly x̄, every time', 'A different average each time'];
export const CENTRE_ASK = ['Around x̄', 'Around the true μ', 'Around 3.5, a fair die’s average'];
export const HALF_ASK = ['About the same width', 'About half as wide', 'About a quarter as wide'];

function* bootstrapStory(seed: number): Generator<Frame<PlotState>> {
  const { sample, first, means, cut, big, bigMeans, bigCut } = bootstrapRun(seed);
  const xbar = mean(sample);
  const se = standardError(sample);
  const sd = spread(means);
  const top = Math.max(10, ...faceCounts(sample), ...faceCounts(first)) + 2;
  const inside = (v: number) => v >= cut.lo - 1e-9 && v <= cut.hi + 1e-9;
  const plain = averageBars('a', means, N);
  const marked = averageBars('a', means, N, (v) => (inside(v) ? {} : { mark: 'reject' }));
  const large = averageBars('b', bigMeans, BIG_N, () => ({ tone: 3 }));
  const meansTop = topOf(tallest(plain, large));
  const xbarLine = marker('xbar', xbar, `x̄ = ${fmt(xbar)}`, { mark: 'key' });
  const rolls = (resampled?: readonly number[]) => facesPlane(sample, { top, label: resampled ? 'The 25 rolls, and resample 1 (in colour)' : 'The 25 rolls', extra: [xbarLine], resample: resampled });
  const averages = (label: string, shapes: Shape[]) => chart('averages', label, AVG_X, { min: 0, max: meansTop, label: 'resamples' }, [xbarLine, ...shapes]);
  const base: Readout[] = [
    { id: 'n', label: 'rolls n', value: String(N) },
    { id: 'xbar', label: 'average x̄', value: fmt(xbar), mark: 'key' },
    { id: 'se', label: 'standard error s/√n', value: fmt(se, 3), tone: 2 },
  ];
  const vars = (o: Record<string, number> = {}) => ({ n: N, 'x̄': round(xbar, 2), SE: round(se, 3), ...o });

  yield plotFrame([rolls(), averages('Averages of resamples', []), readouts(base)], {
    line: 0,
    note: `One sample of 25 rolls, x̄ = ${fmt(xbar)}, and the formula's SE ≈ ${fmt(se, 3)}. The bootstrap gets an interval with no formula at all. Pretend the sample is the whole population and draw new samples from it: a resample makes 25 picks from these 25 rolls, with replacement, so each pick can be any of the 25 rolls, no matter which were picked before.`,
    vars: vars(),
    stats: { samples: 0 },
    checkpoint: askInOrder('If the 25 picks were made without replacement instead, what would each resample’s average be?', REPLACE_ASK, REPLACE_ASK[0]),
  });

  yield plotFrame([rolls(first), averages('Averages of resamples', [{ kind: 'point', id: 'first', at: [round(mean(first), 2), 0], tone: 1, size: 'md', label: 'resample 1' }]), readouts([...base, { id: 'first', label: 'resample 1’s average', value: fmt(mean(first)), tone: 1 }])], {
    line: 6,
    note: `Without replacement, every resample would be the same 25 rolls in a new order, with average exactly x̄: no information. With replacement, some rolls are picked twice or more and others not at all. Resample 1 (in colour beside the sample's counts) has average ${fmt(mean(first))}.`,
    vars: vars({ 'resample 1': round(mean(first), 2) }),
    stats: { samples: 1 },
    checkpoint: askInOrder('Make 1,000 resamples. Where will their 1,000 averages pile up?', CENTRE_ASK, CENTRE_ASK[0]),
  });

  yield plotFrame([rolls(), averages('1,000 resample averages', [{ kind: 'bars', id: 'resamples', bars: plain }]), readouts([...base, { id: 'centre', label: 'average of the 1,000', value: fmt(mean(means), 3) }])], {
    line: 6,
    note: `The 1,000 resample averages pile up around x̄ = ${fmt(xbar)} (their own average is ${fmt(mean(means), 3)}): resampling knows only the sample, never μ. Each bar is one possible average, a multiple of 0.04.`,
    vars: vars({ resamples: MANY }),
    stats: { samples: MANY },
    checkpoint: askInOrder('How widely do the 1,000 resample averages spread?', SPREAD_ASK, SPREAD_ASK[1]),
  });

  yield plotFrame(
    [rolls(), averages('1,000 resample averages', [{ kind: 'bars', id: 'resamples', bars: plain }]), readouts([...base, { id: 'centre', label: 'average of the 1,000', value: fmt(mean(means), 3) }, { id: 'spread', label: 'their spread', value: fmt(sd, 3) }])],
    {
      line: 7,
      note: `They spread by ${fmt(sd, 3)}, close to the formula's SE ≈ ${fmt(se, 3)}: resampling found the standard error by brute force. Now cut off the tails, keeping the middle 95% of the 1,000 averages as the interval.`,
      vars: vars({ spread: round(sd, 2) }),
      stats: { samples: MANY },
      checkpoint: ask('To keep the middle 95% of the 1,000 sorted averages, how many do you drop from each end?', String(DROP), ['2.5', '50', '5']),
    },
  );

  const formula = interval(sample);
  yield plotFrame(
    [
      rolls(),
      averages('The middle 95% of the resample averages', [
        { kind: 'bars', id: 'resamples', bars: marked },
        span('boot', cut.lo, cut.hi, meansTop * 0.92, AVG_X, { tone: 1, label: 'bootstrap' }),
        span('formula', formula.lo, formula.hi, meansTop * 0.82, AVG_X, { tone: 2, label: 'x̄ ± 2 SE' }),
      ]),
      readouts([...base, { id: 'boot', label: 'bootstrap 95%', value: between(cut.lo, cut.hi), tone: 1 }, { id: 'formula', label: 'x̄ ± 2 SE', value: between(formula.lo, formula.hi), tone: 2 }]),
    ],
    {
      line: 7,
      note: `Drop the 25 lowest and the 25 highest (2.5% of 1,000 at each end, marked): 950 are left, 95%. They run from ${fmt(cut.lo)}, the 26th lowest, to ${fmt(cut.hi)}, the 26th highest. The formula's x̄ ± 2 SE gives ${between(formula.lo, formula.hi)}: ${nearlySame(cut, formula) ? 'nearly the same interval, found without the formula' : 'close, though not the same, since the bootstrap reads its ends off the resample averages themselves'}.`,
      vars: vars({ low: round(cut.lo, 2), high: round(cut.hi, 2) }),
      stats: { samples: MANY },
      checkpoint: askInOrder('Bootstrap a sample of 100 rolls instead of 25. How wide will its interval be?', HALF_ASK, HALF_ASK[1]),
    },
  );

  yield plotFrame(
    [
      facesPlane(big, { top: topOf(Math.max(...faceCounts(big))), label: 'A sample of 100 rolls', extra: [marker('xbar', mean(big), `x̄ = ${fmt(mean(big))}`, { mark: 'key' })] }),
      averages('1,000 resample averages, 25 rolls and 100', [
        { kind: 'bars', id: 'resamples', bars: plain },
        { kind: 'bars', id: 'big', bars: large },
        span('boot', cut.lo, cut.hi, meansTop * 0.92, AVG_X, { tone: 1, label: '25 rolls' }),
        span('bigboot', bigCut.lo, bigCut.hi, meansTop * 0.82, AVG_X, { tone: 3, label: '100 rolls' }),
      ]),
      readouts([
        { id: 'boot', label: 'bootstrap 95%, 25 rolls', value: between(cut.lo, cut.hi), tone: 1 },
        { id: 'big', label: 'bootstrap 95%, 100 rolls', value: between(bigCut.lo, bigCut.hi), tone: 3 },
        { id: 'widths', label: 'widths', value: `${fmt(cut.hi - cut.lo)} and ${fmt(bigCut.hi - bigCut.lo)}` },
      ]),
    ],
    {
      line: 7,
      note: `A fresh sample of 100 rolls, x̄ = ${fmt(mean(big))}, bootstrapped the same way: its middle 95% runs from ${between(bigCut.lo, bigCut.hi)}, ${fmt(bigCut.hi - bigCut.lo)} wide against ${fmt(cut.hi - cut.lo)} for 25 rolls${halfish((bigCut.hi - bigCut.lo) / (cut.hi - cut.lo)) ? ': about half, as the standard error halves' : `, ${fmt((bigCut.hi - bigCut.lo) / (cut.hi - cut.lo))} times as wide. On average it is half as wide, as the standard error halves, but each sample's own spread moves its interval, and these two samples spread by ${fmt(sampleSd(sample))} and ${fmt(sampleSd(big))}`}. The bootstrap needs only the sample and a computer, so it works where no formula is known.`,
      vars: { n: BIG_N, low: round(bigCut.lo, 2), high: round(bigCut.hi, 2) },
      stats: { samples: 2 * MANY },
    },
  );
}

function* run(input: CiInput): Generator<Frame<PlotState>> {
  if (input.story === 'standard-error') yield* standardErrorStory(input.seed);
  else if (input.story === 'intervals') yield* intervalsStory(input.seed);
  else yield* bootstrapStory(input.seed);
}

// ───────────────────────────── custom text ─────────────────────────────

const MAX_SEED = 4294967295;

export function parseConfidence(text: string): { value: CiInput } | { error: string } {
  const story = (text.toLowerCase().match(/[a-z][a-z-]*/) ?? [''])[0] as Story;
  if (!STORIES.includes(story)) return { error: 'Start with standard-error, intervals or bootstrap, then a seed, e.g. intervals seed 7.' };
  const xs = numbersIn(text.slice(story.length));
  if (xs.length !== 1 || !Number.isInteger(xs[0]) || xs[0] < 0 || xs[0] > MAX_SEED) return { error: `Give one seed, a whole number 0 or more, e.g. ${story} seed 7.` };
  return { value: { story, seed: xs[0] } };
}

export const formatConfidence = (input: CiInput) => `${input.story} seed ${input.seed}`;

const example = (id: Story, label: string) => ({ id, label, make: ({ seed }: { seed: number }) => ({ story: id, seed }) as CiInput, sized: false });

export const confidenceIntervals = defineAlgorithm<CiInput, PlotState>({
  kind: 'algorithm',
  slug: 'confidence-intervals',
  view: 'plot',
  input: {
    examples: [
      example('standard-error', 'How far off is one sample’s average?'),
      example('intervals', '50 intervals x̄ ± 2 SE against the true μ'),
      example('bootstrap', 'The bootstrap: resample, keep the middle 95%'),
    ],
    custom: {
      label: 'standard-error, intervals or bootstrap, with a seed',
      placeholder: 'e.g. intervals seed 7',
      parse: parseConfidence,
      format: formatConfidence,
    },
  },
  pseudocode,
  stats: [{ key: 'samples', label: 'Samples so far' }],
  legend: [
    { neutral: 'Rolls, averages, and intervals that catch μ' },
    { mark: 'key', label: 'This sample’s average x̄, the newest interval' },
    { mark: 'reject', label: 'An interval that misses μ; averages cut from the tails' },
    { tone: 1, label: 'A resample, and the bootstrap interval' },
    { tone: 2, label: 'Spans of s, SE, or x̄ ± 2 SE' },
    { tone: 3, label: 'Samples of 100 rolls' },
  ],
  run,
  content: {
    idea: 'One sample’s average x̄ estimates the true average μ, and another sample would give another x̄. The standard error SE = s/√n, the spread of single values over √n, says how far x̄ typically lands from μ. Because x̄ usually lands within 2 SE of μ, the interval x̄ ± 2 SE usually catches μ, and many samples side by side show how often. The bootstrap finds the same interval with no formula: resample the sample with replacement many times, sort the averages and keep the middle of them.',
    invariant: 'The confidence belongs to the method, not to one interval: over many samples about 95% of the intervals x̄ ± 2 SE catch μ, while any one interval simply holds μ or doesn’t. More data narrows the intervals (SE halves when n quadruples) but leaves their success rate at about 95%; only the multiplier sets it (± 1 SE about 68%, ± 2 SE about 95%).',
    whenToUse: 'Whenever a number comes from a sample: a poll, an A/B test’s conversion rate, a model’s accuracy on a test set, a benchmark’s average time. Report it with its standard error or interval, and bootstrap when there is no formula (a median, a ratio, an F1 score).',
    traits: [
      { label: 'SE shrinks like 1/√n', good: null },
      { label: 'About 95% of intervals catch μ, whatever n', good: true },
      { label: 'One interval holds μ or not: no 95% chance', good: null },
      { label: 'The bootstrap needs no formula', good: true },
    ],
    experiments: [
      { example: 'standard-error', prompt: 'Press New values a few times. How far does one sample’s SE stray from the true σ/√n = 0.346?' },
      { example: 'intervals', prompt: 'Press New values and count the misses each time. How often do all 50 catch μ? How often do 5 or more miss?' },
      { example: 'bootstrap', prompt: 'Compare the bootstrap interval with x̄ ± 2 SE over a few seeds. Which is usually wider?' },
    ],
  },
});
