import { defineAlgorithm } from '@/engine/module';
import { createRng } from '@/engine/random';
import type { Checkpoint, Frame } from '@/engine/types';
import { ask, askInOrder, numbersIn, plotFrame } from '@/viz/plot/frame';
import { fmt, round } from '@/viz/plot/geometry';
import type { Bar, Handle, ImageBox, ImagePart, PlanePart, PlotPart, PlotState, Readout, Shape } from '@/viz/plot/types';

// Random variables, expectation and variance (B5 of the math and ML path).
// A random variable is a rule that turns every outcome into a number; its
// distribution is a bar per value, the chance of landing there. The expected
// value E[X] = Σ x·P(x) is where those bars balance, and the variance is the
// probability-weighted squared distance from that balance point. Expectations
// of a sum add; variances add when the parts are independent. n coin flips
// make the binomial distribution, built from paths of heads and tails and
// checked against a seeded simulation.

// ───────────────────────────── the maths ─────────────────────────────

export type RuleId = 'sum' | 'max';
export type RvInput =
  | { story: 'rule'; rule: RuleId }
  | { story: 'balance'; counts: number[] }
  | { story: 'spread'; a: number[]; b: number[] }
  | { story: 'sum'; x: number[] }
  | { story: 'binomial'; n: number; p: number; seed: number };
export type Story = RvInput['story'];

/** Bounds for custom input and drags. */
export const LIMITS = { kinds: [3, 6], tickets: [0, 8], weights: [0, 6], n: [2, 8], p: [0.1, 0.9], seed: [0, 999_999] } as const;
/** Tickets are drawn on a fixed axis, so dragging one bar never rescales the others. */
const TICKET_TOP = 10;
/** How far above a draggable bar its share is written, clear of the handle. */
const SHARE_LIFT = 1.2;
const WEIGHT_TOP = 7;

export const RULES: Record<RuleId, { name: string; text: string; f: (a: number, b: number) => number }> = {
  sum: { name: 'the sum of the two dice', text: 'X = first + second', f: (a, b) => a + b },
  max: { name: 'the larger of the two dice', text: 'X = the larger of the two', f: (a, b) => Math.max(a, b) },
};
const FACES = [1, 2, 3, 4, 5, 6];

/** Each value X takes and how many of the 36 outcomes give it, smallest value first. */
export function distributionOf(rule: RuleId): { x: number; count: number }[] {
  const counts = new Map<number, number>();
  for (const a of FACES) for (const b of FACES) counts.set(RULES[rule].f(a, b), (counts.get(RULES[rule].f(a, b)) ?? 0) + 1);
  return [...counts.entries()].sort((p, q) => p[0] - q[0]).map(([x, count]) => ({ x, count }));
}

/** The values 1..k a bag of k kinds of ticket carries. */
export const valuesOf = (counts: readonly number[]) => counts.map((_, i) => i + 1);
export const total = (xs: readonly number[]) => xs.reduce((s, v) => s + v, 0);
/** P(x) for each kind of ticket: tickets marked x over all the tickets. */
export const probsOf = (counts: readonly number[]) => counts.map((c) => c / total(counts));

/** E[X] = Σ x · P(x), term by term. */
export function expectation(values: readonly number[], probs: readonly number[]): number {
  let e = 0;
  for (let i = 0; i < values.length; i++) e += values[i] * probs[i];
  return e;
}

/** Var(X) = Σ P(x) · (x − E[X])²: the mean first, then the weighted squared gaps. */
export function variance(values: readonly number[], probs: readonly number[]): number {
  const mu = expectation(values, probs);
  let v = 0;
  for (let i = 0; i < values.length; i++) v += probs[i] * (values[i] - mu) * (values[i] - mu);
  return v;
}

/** Σ P(x) · |x − E[X]|: the weighted gaps with their signs dropped instead of squared. */
export function meanAbsGap(values: readonly number[], probs: readonly number[]): number {
  const mu = expectation(values, probs);
  return values.reduce((s, x, i) => s + probs[i] * Math.abs(x - mu), 0);
}

/**
 * Weights of X + Y for two dice whose faces 1..6 come up in proportion to
 * `x` and `y` (independently): entry s − 2 is the weight of the sum s, and
 * the weights add to total(x) · total(y).
 */
export function sumWeights(x: readonly number[], y: readonly number[]): number[] {
  const out = Array(11).fill(0);
  for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) out[a + b - 2] += x[a - 1] * y[b - 1];
  return out;
}
export const FAIR = [1, 1, 1, 1, 1, 1];

/** n choose k, the number of paths of n flips with k heads (exact for n ≤ 8). */
export function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let c = 1;
  for (let i = 1; i <= k; i++) c = (c * (n - k + i)) / i;
  return c;
}

/** bᵉ by repeated multiplication: plain IEEE products, the same in every engine (Math.pow need not be). */
export function power(b: number, e: number): number {
  let r = 1;
  for (let i = 0; i < e; i++) r *= b;
  return r;
}

/** P(K = k) = C(n, k) · pᵏ · (1 − p)ⁿ⁻ᵏ for k = 0..n. */
export const binomialPmf = (n: number, p: number) => Array.from({ length: n + 1 }, (_, k) => choose(n, k) * power(p, k) * power(1 - p, n - k));

/** Runs shown by the simulation, each a prefix of one long seeded sequence. */
export const SIM_RUNS = [10, 100, 1000] as const;

/** Heads in each of `runs` runs of n flips, a flip being heads when the generator's number is below p. */
export function simulateBinomial(n: number, p: number, runs: number, seed: number): number[] {
  const rng = createRng(seed);
  const out: number[] = [];
  for (let r = 0; r < runs; r++) {
    let heads = 0;
    for (let i = 0; i < n; i++) if (rng() < p) heads++;
    out.push(heads);
  }
  return out;
}

/** The average of the samples and their average squared gap from it (dividing by how many there are). */
export function sampleStats(samples: readonly number[]): { mean: number; variance: number } {
  const mean = total(samples) / samples.length;
  return { mean, variance: samples.reduce((s, k) => s + (k - mean) * (k - mean), 0) / samples.length };
}

/** The usual slips when counting the outcomes that give X = v. */
export function countSlips(rule: RuleId, v: number): number[] {
  const dist = distributionOf(rule);
  const count = (x: number) => dist.find((d) => d.x === x)?.count ?? 0;
  if (rule === 'sum') {
    // Pairs {a, b} counted once rather than as (a, b) and (b, a); then each doubled, doubles included;
    // the bars taken to keep climbing (v − 1 ways); the bar taken to stay level with the last one.
    const unordered = Math.ceil(count(v) / 2);
    return [unordered, 2 * unordered, v - 1, count(v - 1)].filter((w) => w > 0);
  }
  // Only the outcomes where the first die shows v; both dice at v counted twice; max ≤ v instead of max = v; the last bar again.
  return [v, 2 * v, v * v, count(v - 1)].filter((w) => w > 0);
}

// ───────────────────────────── drawing ─────────────────────────────

const pseudocode = [
  'X ← rule(outcome)',
  'P(X = x) ← count(x) / total',
  'E[X] ← Σ x · P(x)',
  'Σ (x − E[X]) · P(x) = 0',
  'Var(X) ← Σ P(x) · (x − E[X])²',
  'σ ← √Var(X)',
  'E[X + Y] = E[X] + E[Y]',
  'independent: Var(X+Y) = Var(X)+Var(Y)',
  'ways(i,h) = ways(i−1,h)+ways(i−1,h−1)',
  'P(K = k) = C(n, k) · pᵏ · (1 − p)ⁿ⁻ᵏ',
  'E[K] = n·p,  Var(K) = n·p·(1 − p)',
  'repeat: flip n coins, count the heads',
];

const readouts = (items: Readout[]): PlotPart => ({ kind: 'readouts', id: 'readouts', label: 'Values', items });
const f3 = (v: number) => fmt(v, 3);
const bar = (id: string, x: number, y: number, extra: Partial<Bar> = {}): Bar => ({ id, x0: x - 0.34, x1: x + 0.34, y, ...extra });
const ticks = (xs: readonly number[]) => xs.map((x) => ({ at: x, label: String(x) }));

/** The balance point: a dashed upright line through E[X] on the axis. */
const balanceLine = (id: string, mu: number, label: string): Shape => ({ kind: 'line', id, through: [round(mu, 4), 0], dir: [0, 1], mark: 'found', dashed: true, label });
/** μ − σ to μ + σ, drawn as a bracket at height y. */
const sigmaBar = (id: string, mu: number, sigma: number, y: number): Shape => ({
  kind: 'path',
  id,
  points: [
    [round(mu - sigma, 4), y],
    [round(mu + sigma, 4), y],
  ],
  tone: 3,
  dots: true,
  label: `σ = ${fmt(sigma)}`,
});

// ───────────────────────────── 1. a rule from outcomes to numbers ─────────────────────────────

function outcomeTable(rule: RuleId, done: ReadonlySet<number>, current: number | null): ImagePart {
  const pixels: number[] = [];
  const values: string[] = [];
  const boxes: ImageBox[] = [];
  for (let b = 1; b <= 6; b++)
    for (let a = 1; a <= 6; a++) {
      const v = RULES[rule].f(a, b);
      pixels.push(v === current ? 0.85 : done.has(v) ? 0.4 : 0.1);
      values.push(String(v));
      if (v === current) boxes.push({ id: `c${a}${b}`, x: a - 1, y: b - 1, w: 1, h: 1, mark: 'key' });
    }
  return { kind: 'image', id: 'outcomes', label: 'The 36 outcomes: first die across, second die down, and X in each cell', width: 6, height: 6, pixels, scale: 'signed', values, boxes, size: 216, matrix: true };
}

function* ruleStory(rule: RuleId): Generator<Frame<PlotState>> {
  const r = RULES[rule];
  const dist = distributionOf(rule);
  const xs = dist.map((d) => d.x);
  const top = round((Math.max(...dist.map((d) => d.count)) / 36) * 1.3, 2);
  const plane = (shown: ReadonlySet<number>, current: number | null): PlanePart => ({
    kind: 'plane',
    id: 'plane',
    label: `The distribution of X, ${r.name}`,
    x: { min: xs[0] - 0.6, max: xs[xs.length - 1] + 0.6, label: 'x', ticks: ticks(xs) },
    y: { min: 0, max: top, label: 'P(X = x)' },
    equal: false,
    shapes: [{ kind: 'bars', id: 'bars', bars: dist.filter((d) => shown.has(d.x)).map((d) => bar(`b${d.x}`, d.x, round(d.count / 36, 4), { label: `${d.count}/36`, mark: d.x === current ? 'key' : null })) }],
    handles: [],
  });
  const countQuestion = (v: number): Checkpoint | undefined => {
    const count = dist.find((d) => d.x === v)!.count;
    return ask(`How many of the 36 outcomes give X = ${v}?`, String(count), countSlips(rule, v).map(String));
  };

  yield plotFrame([outcomeTable(rule, new Set(), null), plane(new Set(), null)], {
    line: 0,
    note: `Roll two dice: 36 equally likely outcomes, one cell of the table each. A random variable is a rule that turns every outcome into a number; here X is ${r.name}, written in its cell. Count the cells for each value of X and you have its distribution.`,
    checkpoint: countQuestion(xs[0]),
  });

  const shown = new Set<number>();
  for (let i = 0; i < dist.length; i++) {
    const { x, count } = dist[i];
    shown.add(x);
    const last = i === dist.length - 1;
    yield plotFrame([outcomeTable(rule, shown, x), plane(new Set(shown), x)], {
      line: 1,
      note: `X = ${x} in the ${count === 1 ? 'one boxed cell' : `${count} boxed cells`}, so P(X = ${x}) = ${count}/36, the height of its bar.`,
      vars: { x, count, 'P(X = x)': round(count / 36, 4) },
      checkpoint: last
        ? ask('Every value now has its bar. What do the heights of all the bars add up to?', '1', ['36', String(dist.length)])
        : countQuestion(dist[i + 1].x),
    });
  }

  const mode = dist.reduce((m, d) => (d.count > m.count ? d : m));
  yield plotFrame([outcomeTable(rule, shown, null), plane(shown, null), readouts([{ id: 'total', label: 'all the bars', value: '36/36 = 1', mark: 'found' }])], {
    line: 1,
    note: `Every outcome lands in exactly one bar, so the heights add up to 36/36 = 1. The values with their probabilities are the distribution of X: the most likely value is ${mode.x}, with ${mode.count} of the 36 outcomes.`,
  });
}

// ───────────────────────────── 2. the balance point ─────────────────────────────

function ticketPlane(id: string, label: string, counts: readonly number[], o: { current?: number | null; handles?: boolean; tone?: 2; extra?: Shape[]; handlePrefix?: string } = {}): PlanePart {
  const xs = valuesOf(counts);
  const T = total(counts);
  const prefix = o.handlePrefix ?? 't';
  // A draggable bar's handle sits on its top, so its share is written a little above it.
  const dragged = o.handles !== false;
  return {
    kind: 'plane',
    id,
    label,
    x: { min: 0.4, max: counts.length + 0.6, label: 'x, the number on the ticket', ticks: ticks(xs) },
    y: { min: 0, max: TICKET_TOP, label: 'tickets' },
    equal: false,
    shapes: [
      { kind: 'bars', id: `${id}-bars`, bars: counts.map((c, i) => bar(`${id}${i + 1}`, i + 1, c, { ...(dragged ? {} : { label: `${c}/${T}` }), ...(o.tone ? { tone: o.tone } : { mark: o.current === i + 1 ? 'key' : null }) })) },
      ...(dragged ? counts.map((c, i): Shape => ({ kind: 'label', id: `${id}-share${i + 1}`, at: [i + 1, c + SHARE_LIFT], text: `${c}/${T}` })) : []),
      ...(o.extra ?? []),
    ],
    handles: o.handles === false ? [] : counts.map((c, i): Handle => ({ id: `${prefix}${i + 1}`, at: [i + 1, c], label: `tickets marked ${i + 1}`, step: 1, min: [i + 1, LIMITS.tickets[0]], max: [i + 1, LIMITS.tickets[1]], ...(o.tone ? { tone: o.tone } : { mark: 'key' }) })),
  };
}

function* balanceStory(counts: readonly number[]): Generator<Frame<PlotState>> {
  const xs = valuesOf(counts);
  const T = total(counts);
  const ps = probsOf(counts);
  const E = expectation(xs, ps);
  const k = counts.length;
  const label = `A bag of ${T} tickets; X is the number on one drawn at random`;
  const tallest = xs[counts.indexOf(Math.max(...counts))];

  const totalQuestion = (sum: number, i: number) =>
    ask(i === 0 ? `Start a total at 0. What will it be after x = ${xs[i]}?` : `What will the total be after x = ${xs[i]}?`, f3(sum + xs[i] * ps[i]), [f3(sum + xs[i]), f3(sum + ps[i]), f3(sum + xs[i] * counts[i])]);

  yield plotFrame([ticketPlane('plane', label, counts), readouts([{ id: 'T', label: 'tickets in the bag', value: String(T) }])], {
    line: 2,
    note: `Draw one ticket from the bag and let X be its number. The bars count the tickets; P(x), written on each bar, is the share marked x. The expected value E[X] = Σ x · P(x) adds up every value weighted by its chance. Drag the bars to change the bag.`,
    vars: { T },
    checkpoint: totalQuestion(0, 0),
  });

  let sum = 0;
  for (let i = 0; i < k; i++) {
    const x = xs[i];
    const term = x * ps[i];
    sum += term;
    yield plotFrame(
      [
        ticketPlane('plane', label, counts, { current: x }),
        readouts([
          { id: 'term', label: `${x} × P(${x})`, value: f3(term), mark: 'key' },
          { id: 'sum', label: 'Σ so far', value: f3(sum), mark: 'found' },
        ]),
      ],
      {
        line: 2,
        note: `x = ${x}: P(${x}) = ${counts[i]}/${T} = ${f3(ps[i])}, so this value adds ${x} × ${f3(ps[i])} = ${f3(term)}, and the total is now ${f3(sum)}.${i === k - 1 ? ` That is E[X], the long-run average of the number drawn.` : ''}`,
        vars: { x, 'P(x)': round(ps[i], 4), 'x·P(x)': round(term, 4), total: round(sum, 4) },
        checkpoint:
          i < k - 1
            ? totalQuestion(sum, i + 1)
            : ask(
                `Weight each gap x − E[X] by P(x), counting gaps to the left as negative, and add them up. What do you get?`,
                '0',
                [f3(meanAbsGap(xs, ps)), f3(E)],
              ),
      },
    );
  }

  const left = xs.reduce((s, x, i) => s + (x < E ? (E - x) * ps[i] : 0), 0);
  const right = xs.reduce((s, x, i) => s + (x > E ? (x - E) * ps[i] : 0), 0);
  // The two pulls are equal; rounding them apart could show them a thousandth out, so show one number for both.
  const pull = (left + right) / 2;
  const gaps: Shape[] = xs.flatMap((x, i): Shape[] =>
    counts[i] === 0 || Math.abs(x - E) < 1e-9
      ? []
      : [
          {
            kind: 'path',
            id: `gap${x}`,
            points: [
              [x, round(counts[i] / 2, 2)],
              [round(E, 4), round(counts[i] / 2, 2)],
            ],
            mark: x > E ? 'compare' : 'reject',
            dashed: true,
          },
        ],
  );
  const S = expectation(xs, counts);
  const newE = (S + k) / (T + 1);
  yield plotFrame(
    [
      ticketPlane('plane', label, counts, { extra: [balanceLine('mean', E, `E[X] = ${f3(E)}`), ...gaps] }),
      readouts([
        { id: 'mean', label: 'E[X]', value: f3(E), mark: 'found' },
        { id: 'left', label: 'pull from the left', value: f3(pull), mark: 'reject' },
        { id: 'right', label: 'pull from the right', value: f3(pull), mark: 'compare' },
      ]),
    ],
    {
      line: 3,
      note: `The gaps to the right of E[X], each weighted by its chance, add up to ${f3(pull)}, and so do the gaps to the left: they cancel. So E[X] = ${f3(E)} is where the bars balance, like weights on a see-saw. ${Math.abs(E - tallest) > 1e-9 ? `It is not under the tallest bar, at ${tallest}.` : 'Here it sits under the tallest bar.'}`,
      vars: { 'E[X]': round(E, 4), 'Σ (x − E[X])·P(x)': 0 },
      checkpoint: ask(`Put one more ticket marked ${k} in the bag. Where does the balance point move to?`, f3(newE), [f3((S + k) / T), f3((E + k) / 2), f3(E)]),
    },
  );

  const more = counts.map((c, i) => (i === k - 1 ? c + 1 : c));
  yield plotFrame(
    [
      ticketPlane('plane', `The bag with one more ticket marked ${k}`, more, { current: k, handles: false, extra: [balanceLine('mean', newE, `E[X] = ${f3(newE)}`)] }),
      readouts([
        { id: 'old', label: 'E[X] before', value: f3(E) },
        { id: 'mean', label: 'E[X] now', value: f3(newE), mark: 'found' },
      ]),
    ],
    {
      line: 2,
      note: `Now ${T + 1} tickets carry numbers adding to ${fmt(S + k)}, so E[X] = ${fmt(S + k)}/${T + 1} = ${f3(newE)}. The new ticket pulls the balance point towards ${k}, but only a little: it is just one ticket of ${T + 1}.`,
      vars: { 'E[X]': round(newE, 4) },
    },
  );
}

// ───────────────────────────── 3. the spread ─────────────────────────────

function* spreadStory(a: readonly number[], b: readonly number[]): Generator<Frame<PlotState>> {
  const xs = valuesOf(a);
  const k = a.length;
  const pa = probsOf(a);
  const pb = probsOf(b);
  const [muA, muB] = [expectation(xs, pa), expectation(xs, pb)];
  const [varA, varB] = [variance(xs, pa), variance(xs, pb)];
  const plane = (o: { current?: number | null; extra?: Shape[] } = {}) => ticketPlane('a', `Bag A: ${total(a)} tickets`, a, { current: o.current ?? null, handlePrefix: 'a', extra: [balanceLine('meanA', muA, `μ = ${f3(muA)}`), ...(o.extra ?? [])] });
  const planeB = (extra: Shape[] = []) => ticketPlane('b', `Bag B: ${total(b)} tickets`, b, { tone: 2, handlePrefix: 'b', extra: [balanceLine('meanB', muB, `μ = ${f3(muB)}`), ...extra] });

  const termQuestion = (i: number) => {
    const x = xs[i];
    const d = x - muA;
    return ask(`What is the next term, P(${x}) × (${x} − ${f3(muA)})²?`, f3(pa[i] * d * d), [f3(pa[i] * d), f3(d * d), f3(pa[i] * x * x)]);
  };
  const which = varA > varB + 1e-9 ? 'Bag A' : varB > varA + 1e-9 ? 'Bag B' : 'Neither: the same spread';

  yield plotFrame([plane(), planeB(), readouts([{ id: 'mu', label: 'E[X] for bag A', value: f3(muA), mark: 'found' }])], {
    line: 4,
    note: `Two bags, each balancing at its E[X], written μ (mu) for short. How far from μ does X tend to land? The gaps x − μ cancel when weighted, so square each gap first: Var(X) = Σ P(x) · (x − μ)², the average squared distance from μ. Start with bag A, value by value.`,
    vars: { μ: round(muA, 4) },
    checkpoint: termQuestion(0),
  });

  let sum = 0;
  for (let i = 0; i < k; i++) {
    const x = xs[i];
    const d = x - muA;
    const term = pa[i] * d * d;
    sum += term;
    const gap: Shape[] =
      Math.abs(d) < 1e-9
        ? []
        : [
            {
              kind: 'path',
              id: 'gap',
              points: [
                [round(muA, 4), round(a[i] + 0.6, 2)],
                [x, round(a[i] + 0.6, 2)],
              ],
              mark: d > 0 ? 'compare' : 'reject',
              dashed: true,
              label: `(x − μ)² = ${f3(d * d)}`,
            },
          ];
    yield plotFrame(
      [
        plane({ current: x, extra: gap }),
        planeB(),
        readouts([
          { id: 'term', label: `P(${x}) × (${x} − μ)²`, value: f3(term), mark: 'key' },
          { id: 'sum', label: 'Var so far', value: f3(sum), mark: 'found' },
        ]),
      ],
      {
        line: 4,
        note: `${Math.abs(d) < 1e-9 ? `x = ${x} sits right at μ, so its squared gap is 0 and it adds nothing, however likely it is.` : `x = ${x} is ${f3(Math.abs(d))} ${d > 0 ? 'above' : 'below'} μ; squared, that is ${f3(d * d)}, and weighted by P(${x}) = ${a[i]}/${total(a)} it adds ${f3(term)}.`}${i === k - 1 ? ` So bag A's variance is ${f3(sum)}.` : ''}`,
        vars: { x, 'x − μ': round(d, 4), 'P(x)·(x − μ)²': round(term, 4), Var: round(sum, 4) },
        checkpoint: i < k - 1 ? termQuestion(i + 1) : askInOrder(`Bag B balances at ${f3(muB)}. Which bag spreads more, with the bigger variance?`, ['Bag A', 'Bag B', 'Neither: the same spread'], which),
      },
    );
  }

  const [sA, sB] = [Math.sqrt(varA), Math.sqrt(varB)];
  yield plotFrame(
    [
      plane({ extra: [sigmaBar('sigmaA', muA, sA, TICKET_TOP - 1)] }),
      planeB([sigmaBar('sigmaB', muB, sB, TICKET_TOP - 1)]),
      readouts([
        { id: 'varA', label: 'Var, bag A', value: f3(varA), mark: 'found' },
        { id: 'varB', label: 'Var, bag B', value: f3(varB), tone: 2 },
        { id: 'sdA', label: 'σ, bag A', value: f3(sA) },
        { id: 'sdB', label: 'σ, bag B', value: f3(sB) },
      ]),
    ],
    {
      line: 5,
      note: `Bag B's variance is ${f3(varB)} against bag A's ${f3(varA)}: ${which === 'Neither: the same spread' ? 'the same spread' : `${which === 'Bag A' ? 'A' : 'B'} spreads more`}${Math.abs(muA - muB) < 1e-9 ? ', though both balance at the same point' : ''}. A variance is in squared units, so take its square root, the standard deviation σ, to get back to the units of the numbers on the tickets: ${f3(sA)} for A and ${f3(sB)} for B, drawn as μ ± σ.`,
      vars: { 'Var A': round(varA, 4), 'Var B': round(varB, 4) },
    },
  );
}

// ───────────────────────────── 4. two dice: what adds ─────────────────────────────

// A fair die's variance is 35/12, shown as 2.917, and 2.917 + 2.917 is 5.834, not the 5.833 that 35/6 rounds
// to. So a sum or a multiple is written out digit by digit only when the shown numbers really give the shown
// answer; otherwise the note says the parts were rounded.
/** "c = a + b" when the three-place numbers add up, else "c: a + b before they were rounded". */
const shownSum = (c: number, a: number, b: number) =>
  f3(round(a, 3) + round(b, 3)) === f3(c) ? `${f3(c)} = ${f3(a)} + ${f3(b)}` : `${f3(c)}, which is ${f3(a)} + ${f3(b)} before they were rounded`;
/** "k × a = c" when the three-place numbers multiply out, else "c, k × a before it was rounded". */
const shownTimes = (c: number, k: number, a: number) =>
  f3(k * round(a, 3)) === f3(c) ? `${k} × ${f3(a)} = ${f3(c)}` : `${f3(c)}, which is ${k} × ${f3(a)} before it was rounded`;

function diePlane(id: string, label: string, weights: readonly number[], o: { tone?: 2; drag?: boolean; extra?: Shape[] }): PlanePart {
  const W = total(weights);
  return {
    kind: 'plane',
    id,
    label,
    x: { min: 0.4, max: 6.6, label: 'face', ticks: ticks(FACES) },
    y: { min: 0, max: WEIGHT_TOP, label: 'weight' },
    equal: false,
    shapes: [{ kind: 'bars', id: `${id}-bars`, bars: weights.map((w, i) => bar(`${id}${i + 1}`, i + 1, w, { label: `${w}/${W}`, ...(o.tone ? { tone: o.tone } : {}) })) }, ...(o.extra ?? [])],
    handles: o.drag ? weights.map((w, i): Handle => ({ id: `x${i + 1}`, at: [i + 1, w], label: `weight of face ${i + 1}`, step: 1, min: [i + 1, LIMITS.weights[0]], max: [i + 1, LIMITS.weights[1]], mark: 'key' })) : [],
  };
}

function sumPlane(id: string, label: string, weights: readonly number[], W: number, xs: readonly number[], extra: Shape[]): PlanePart {
  const top = Math.max(...weights.map((w) => w / W));
  return {
    kind: 'plane',
    id,
    label,
    x: { min: 1.4, max: 12.6, label: 'value', ticks: ticks(xs) },
    y: { min: 0, max: round(Math.max(0.2, top * 1.25), 2) },
    equal: false,
    shapes: [{ kind: 'bars', id: `${id}-bars`, bars: weights.flatMap((w, i) => (w === 0 ? [] : [bar(`${id}${xs[i]}`, xs[i], round(w / W, 4), { label: `${w}/${W}` })])) }, ...extra],
    handles: [],
  };
}

function* sumStory(x: readonly number[]): Generator<Frame<PlotState>> {
  const y = FAIR;
  const [px, py] = [probsOf(x), probsOf(y)];
  const [ex, ey] = [expectation(FACES, px), expectation(FACES, py)];
  const [vx, vy] = [variance(FACES, px), variance(FACES, py)];
  const sw = sumWeights(x, y);
  const W = total(x) * total(y);
  const sums = sw.map((_, i) => i + 2);
  const ps = sw.map((w) => w / W);
  const [es, vs] = [expectation(sums, ps), variance(sums, ps)];
  // E[X + Y] is shown as the sum of the shown E[X] and E[Y] (die Y is fair, so that is E[X + Y] rounded), so
  // the note's "E[X + Y] = E[X] + E[Y]" always checks: computed apart, the two sides can round a thousandth apart.
  const esShown = f3(round(ex, 3) + round(ey, 3));
  const dieX = (extra: Shape[] = []) => diePlane('x', 'Die X: drag a bar to load it', x, { drag: true, extra: [balanceLine('meanX', ex, `E[X] = ${f3(ex)}`), ...extra] });
  const dieY = diePlane('y', 'Die Y: a fair die', y, { tone: 2, extra: [balanceLine('meanY', ey, `E[Y] = ${f3(ey)}`)] });
  const sumOf = (extra: Shape[] = []) => sumPlane('sum', `X + Y: ${W} equally weighted pairs`, sw, W, sums, [balanceLine('meanS', es, `E = ${esShown}`), ...extra]);

  yield plotFrame([dieX(), dieY, readouts([{ id: 'ex', label: 'E[X]', value: f3(ex) }, { id: 'ey', label: 'E[Y]', value: f3(ey), tone: 2 }])], {
    line: 6,
    note: `Two dice, rolled independently: neither cares what the other shows. Die Y is fair, so it balances at ${f3(ey)}; die X can be loaded by dragging its bars, and balances at ${f3(ex)}. Their total, X + Y, is a new random variable with its own distribution.`,
    vars: { 'E[X]': round(ex, 4), 'E[Y]': round(ey, 4) },
    checkpoint: ask('What is E[X + Y], the balance point of the total?', esShown, [f3((ex + ey) / 2), f3(ex * ey)]),
  });

  yield plotFrame([dieX(), dieY, sumOf(), readouts([{ id: 'ex', label: 'E[X]', value: f3(ex) }, { id: 'ey', label: 'E[Y]', value: f3(ey), tone: 2 }, { id: 'es', label: 'E[X + Y]', value: esShown, mark: 'found' }])], {
    line: 6,
    note: `Pair every face of X with every face of Y and add: the bars of X + Y balance at ${esShown} = ${f3(ex)} + ${f3(ey)}. Expectations add, always, even for random variables that depend on each other.`,
    vars: { 'E[X + Y]': round(es, 4) },
    checkpoint: ask(`Var(X) = ${f3(vx)} and Var(Y) = ${f3(vy)}. What is Var(X + Y)?`, f3(vs), [f3((Math.sqrt(vx) + Math.sqrt(vy)) ** 2), f3((vx + vy) / 2)]),
  });

  const sd = Math.sqrt(vs);
  const which = 4 * vx > vs + 1e-9 ? '2X' : vs > 4 * vx + 1e-9 ? 'X + Y' : 'The same spread';
  yield plotFrame(
    [
      dieX(),
      dieY,
      sumOf([sigmaBar('sigmaS', es, sd, round(Math.max(...ps) * 1.12, 3))]),
      readouts([
        { id: 'vx', label: 'Var(X)', value: f3(vx) },
        { id: 'vy', label: 'Var(Y)', value: f3(vy), tone: 2 },
        { id: 'vs', label: 'Var(X + Y)', value: f3(vs), mark: 'found' },
      ]),
    ],
    {
      line: 7,
      note: `Var(X + Y) = ${shownSum(vs, vx, vy)}: for independent random variables the variances add too. Standard deviations don't: σ = √${f3(vs)} = ${f3(sd)}, less than ${f3(Math.sqrt(vx))} + ${f3(Math.sqrt(vy))}, because a high roll on one die is often softened by a lower roll on the other.`,
      vars: { 'Var(X + Y)': round(vs, 4) },
      checkpoint: askInOrder('Now roll die X alone and double it. Which spreads more, 2X or X + Y?', ['2X', 'X + Y', 'The same spread'], which),
    },
  );

  const twice = Array(11).fill(0);
  x.forEach((w, i) => (twice[2 * (i + 1) - 2] = w));
  const v2 = 4 * vx;
  yield plotFrame(
    [
      sumOf([sigmaBar('sigmaS', es, sd, round(Math.max(...ps) * 1.12, 3))]),
      sumPlane('twice', `2X: die X doubled`, twice, total(x), sums, [balanceLine('mean2', 2 * ex, `E = ${f3(2 * ex)}`), ...(v2 > 0 ? [sigmaBar('sigma2', 2 * ex, Math.sqrt(v2), round((Math.max(...x) / total(x)) * 1.12, 3))] : [])]),
      readouts([
        { id: 'vs', label: 'Var(X + Y)', value: f3(vs) },
        { id: 'v2', label: 'Var(2X) = 4 Var(X)', value: f3(v2), mark: 'found' },
      ]),
    ],
    {
      line: 7,
      note: `2X balances at ${f3(2 * ex)}, but it only lands on even numbers, and doubling stretches every gap from the mean by 2, so every squared gap by 4: Var(2X) = ${shownTimes(v2, 4, vx)}, against ${f3(vs)} for X + Y. Adding two independent dice is not the same as doubling one: the second die's luck is its own.`,
      vars: { 'Var(2X)': round(v2, 4) },
    },
  );
}

// ───────────────────────────── 5. the binomial ─────────────────────────────

const SUPS = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const sup = (k: number) => String(k).replace(/\d/g, (d) => SUPS[Number(d)]);

/** The flip whose middle node the paths story asks about next. */
const middle = (i: number) => Math.floor(i / 2);

function latticePlane(n: number, upTo: number): PlanePart {
  const shapes: Shape[] = [];
  for (let i = 1; i <= upTo; i++)
    for (let h = 0; h < i; h++) {
      shapes.push({ kind: 'path', id: `t${i}-${h}`, points: [[i - 1, h], [i, h]], faint: true });
      shapes.push({ kind: 'path', id: `h${i}-${h}`, points: [[i - 1, h], [i, h + 1]], faint: true });
    }
  for (let i = 0; i <= upTo; i++) for (let h = 0; h <= i; h++) shapes.push({ kind: 'point', id: `n${i}-${h}`, at: [i, h], label: String(choose(i, h)), mark: i === upTo ? 'key' : null, size: 'sm' });
  return {
    kind: 'plane',
    id: 'paths',
    label: 'Paths of the flips: one step right per flip, and one up for each head',
    x: { min: -0.4, max: n + 0.6, label: 'flips so far', ticks: ticks(Array.from({ length: n + 1 }, (_, i) => i)) },
    y: { min: -0.4, max: n + 0.6, label: 'heads so far' },
    equal: false,
    shapes,
    handles: [],
  };
}

function* binomialStory(n: number, p: number, seed: number): Generator<Frame<PlotState>> {
  const q = 1 - p;
  const pmf = binomialPmf(n, p);
  const ks = Array.from({ length: n + 1 }, (_, k) => k);
  const mean = n * p;
  const vr = n * p * q;
  const sd = Math.sqrt(vr);
  const runs = simulateBinomial(n, p, SIM_RUNS[SIM_RUNS.length - 1], seed);
  const observed = SIM_RUNS.map((R) => ks.map((k) => runs.slice(0, R).filter((h) => h === k).length / R));
  const top = round(Math.max(...pmf, ...observed.flat()) * 1.2, 2);
  const kStar = Math.min(n, Math.max(0, Math.round(mean)));
  const pText = fmt(p, 1);

  const handle: Handle = { id: 'p', at: [round(mean, 6), 0], label: `balance point n·p (drag to change p)`, step: round(n / 10, 6), min: [round(n * LIMITS.p[0], 6), 0], max: [round(n * LIMITS.p[1], 6), 0], mark: 'found' };
  const bars = (o: { sim?: number; mean?: boolean; sigma?: boolean; handles?: boolean } = {}): PlanePart => ({
    kind: 'plane',
    id: 'bars',
    label: o.sim === undefined ? `The distribution of K, the number of heads in ${n} flips` : `True chances (bars) against ${SIM_RUNS[o.sim]} simulated runs`,
    x: { min: -0.6, max: n + 0.6, label: 'k heads', ticks: ticks(ks) },
    y: { min: 0, max: top, label: 'P(K = k)' },
    equal: false,
    shapes: [
      {
        kind: 'bars',
        id: 'pmf',
        bars: [
          ...ks.map((k) => ({ id: `k${k}`, x0: o.sim === undefined ? k - 0.34 : k - 0.36, x1: o.sim === undefined ? k + 0.34 : k - 0.02, y: round(pmf[k], 4), label: o.sim === undefined ? f3(pmf[k]) : undefined })),
          ...(o.sim === undefined ? [] : ks.map((k): Bar => ({ id: `s${k}`, x0: k + 0.02, x1: k + 0.36, y: round(observed[o.sim!][k], 4), tone: 2, label: fmt(observed[o.sim!][k]) }))),
        ],
      },
      ...(o.mean ? [balanceLine('mean', mean, `n·p = ${fmt(mean)}`)] : []),
      ...(o.sigma ? [sigmaBar('sigma', mean, sd, round(top * 0.9, 2))] : []),
    ],
    handles: o.handles ? [handle] : [],
  });

  yield plotFrame([latticePlane(n, 0)], {
    line: 8,
    note: `Flip a coin ${n} times; each flip lands heads with probability p = ${pText}, whatever the others did. K, the number of heads, is a random variable. Draw a run of flips as a path: one step right per flip, and one step up for each head. Every path starts at the corner.`,
    vars: { n, p },
  });

  for (let i = 1; i <= n; i++) {
    const next = i + 1;
    const h = middle(next);
    const answer = choose(next, h);
    yield plotFrame([latticePlane(n, i)], {
      line: 8,
      note:
        i === 1
          ? `After one flip a path is at 0 heads (tails) or 1 head (heads): one way each. A path reaches h heads after flip i from h heads (then tails) or from h − 1 heads (then heads), so the ways add.`
          : `Flip ${i}: each point adds the ways from the point straight behind it and the one diagonally below, Pascal's triangle again. The numbers in column ${i} count the orders of heads and tails, C(${i}, h).`,
      vars: { flip: i },
      checkpoint:
        i < n
          ? ask(`How many paths reach ${h} head${h === 1 ? '' : 's'} after flip ${next}?`, String(answer), [String(choose(i, h)), String(choose(i, h) * choose(i, h - 1)), String(2 ** next)].filter((w) => w !== '0'))
          : ask(
              `Each path with ${kStar} heads has probability p${sup(kStar)} × (1 − p)${sup(n - kStar)}. What is P(K = ${kStar})?`,
              f3(pmf[kStar]),
              [f3(choose(n, kStar) * power(p, kStar)), f3(power(p, kStar) * power(q, n - kStar)), f3(choose(n, kStar) / 2 ** n)],
            ),
    });
  }

  yield plotFrame([latticePlane(n, n), bars()], {
    line: 9,
    note: `Every path with k heads has the same probability, pᵏ(1 − p)ⁿ⁻ᵏ, and C(${n}, k) paths have k heads, so P(K = k) = C(${n}, k) · pᵏ · (1 − p)ⁿ⁻ᵏ: the binomial distribution. Its bars add up to 1.`,
    vars: { [`P(K = ${kStar})`]: round(pmf[kStar], 4) },
    checkpoint: ask('Where do these bars balance: what is E[K]?', fmt(mean), [fmt(n / 2), fmt(p), fmt(vr)]),
  });

  yield plotFrame([latticePlane(n, n), bars({ mean: true, handles: true }), readouts([{ id: 'mean', label: 'E[K] = n·p', value: fmt(mean), mark: 'found' }])], {
    line: 10,
    note: `One flip is worth 1 head with probability p and 0 otherwise, so it averages p heads. Expectations add, so ${n} flips average ${n} × ${pText} = ${fmt(mean)}. Drag the balance point to change p.`,
    vars: { 'E[K]': round(mean, 4) },
    checkpoint: ask('The flips are independent. What is Var(K)?', fmt(vr), [fmt(mean), fmt(n * p * p), fmt(sd)]),
  });

  yield plotFrame([latticePlane(n, n), bars({ mean: true, sigma: true, handles: true }), readouts([{ id: 'mean', label: 'E[K] = n·p', value: fmt(mean), mark: 'found' }, { id: 'var', label: 'Var(K) = n·p·(1 − p)', value: fmt(vr) }, { id: 'sd', label: 'σ', value: fmt(sd) }])], {
    line: 10,
    note: `One flip lands 1 − p from its mean with chance p and p from it with chance 1 − p, so its variance is p(1 − p)² + (1 − p)p² = p(1 − p). Independent flips add their variances: Var(K) = ${n} × ${pText} × ${fmt(q, 1)} = ${fmt(vr)}, and σ = ${fmt(sd)}.`,
    vars: { 'Var(K)': round(vr, 4), σ: round(sd, 4) },
  });

  for (let s = 0; s < SIM_RUNS.length; s++) {
    const R = SIM_RUNS[s];
    const stats = sampleStats(runs.slice(0, R));
    const closest = [n * q, n / 2, vr].filter((w) => Math.abs(w - mean) >= 0.5);
    yield plotFrame(
      [
        bars({ sim: s, mean: true, handles: true }),
        readouts([
          { id: 'runs', label: 'runs', value: String(R) },
          { id: 'avg', label: 'average heads', value: fmt(stats.mean, 3), tone: 2 },
          { id: 'var', label: 'average squared gap', value: fmt(stats.variance, 3), tone: 2 },
          { id: 'mean', label: 'E[K]', value: fmt(mean), mark: 'found' },
        ]),
      ],
      {
        line: 11,
        note:
          s === 0
            ? `Now simulate: flip ${n} coins, count the heads, and repeat. After ${R} runs the share of runs at each k (the second bar of each pair) is rough, and the average number of heads is ${fmt(stats.mean, 3)}.`
            : s === 1
              ? `After ${R} runs the average number of heads is ${fmt(stats.mean, 3)}, and each simulated bar is now a share of ${R} runs instead of ${SIM_RUNS[0]}.`
              : `After ${R} runs the average number of heads is ${fmt(stats.mean, 3)} against E[K] = ${fmt(mean)}, and the runs' average squared gap from their average is ${fmt(stats.variance, 3)} against Var(K) = ${fmt(vr)}. Averages of many runs settle near the expected value, which a later lesson makes precise.`,
        vars: { runs: R, average: round(stats.mean, 4) },
        checkpoint:
          s === 1 && closest.length
            ? ask(`After ${SIM_RUNS[2]} runs, which will the average number of heads be closest to?`, fmt(mean), closest.map((w) => fmt(w)))
            : undefined,
      },
    );
  }
}

// ───────────────────────────── input ─────────────────────────────

function* run(input: RvInput): Generator<Frame<PlotState>> {
  if (input.story === 'rule') yield* ruleStory(input.rule);
  else if (input.story === 'balance') yield* balanceStory(input.counts);
  else if (input.story === 'spread') yield* spreadStory(input.a, input.b);
  else if (input.story === 'sum') yield* sumStory(input.x);
  else yield* binomialStory(input.n, input.p, input.seed);
}

const STORIES: Story[] = ['rule', 'balance', 'spread', 'sum', 'binomial'];
const whole = (v: number, [lo, hi]: readonly [number, number]) => Number.isInteger(v) && v >= lo && v <= hi;

function ticketsError(counts: readonly number[], name = 'the bag'): string | null {
  if (counts.length < LIMITS.kinds[0] || counts.length > LIMITS.kinds[1]) return `Give ${name} ${LIMITS.kinds[0]} to ${LIMITS.kinds[1]} counts, the tickets marked 1, 2, 3 and so on.`;
  if (!counts.every((c) => whole(c, LIMITS.tickets))) return `Each count of tickets is a whole number from ${LIMITS.tickets[0]} to ${LIMITS.tickets[1]}.`;
  if (total(counts) === 0) return `${name[0].toUpperCase()}${name.slice(1)} needs at least one ticket.`;
  return null;
}

export function parseRv(text: string): { value: RvInput } | { error: string } {
  const words: string[] = text.toLowerCase().match(/[a-z]+/g) ?? [];
  const story = STORIES.find((s) => s === words[0]);
  if (!story) return { error: 'Start with rule, balance, spread, sum or binomial.' };
  if (story === 'rule') {
    const rule = (['sum', 'max'] as RuleId[]).find((r) => r === words[1]);
    return rule ? { value: { story, rule } } : { error: 'Then sum or max, e.g. rule max.' };
  }
  if (story === 'balance') {
    const counts = numbersIn(text);
    const error = ticketsError(counts);
    return error ? { error } : { value: { story, counts } };
  }
  if (story === 'spread') {
    const [left, right] = text.split('|');
    if (right === undefined) return { error: 'Give bag A, then | and bag B, e.g. spread 1 2 4 2 1 | 3 1 2 1 3.' };
    const [a, b] = [numbersIn(left), numbersIn(right)];
    const error = ticketsError(a, 'bag A') ?? ticketsError(b, 'bag B');
    if (error) return { error };
    if (a.length !== b.length) return { error: 'Give both bags the same kinds of ticket: as many counts in each.' };
    return { value: { story, a, b } };
  }
  if (story === 'sum') {
    const x = numbersIn(text);
    if (x.length !== 6 || !x.every((w) => whole(w, LIMITS.weights)) || total(x) === 0) return { error: `Give die X six weights, whole numbers from ${LIMITS.weights[0]} to ${LIMITS.weights[1]}, e.g. sum 1 1 1 1 1 1.` };
    return { value: { story, x } };
  }
  const nums = numbersIn(text);
  const seed = words.includes('seed') ? nums[2] : 7;
  const [n, p] = nums;
  if (!whole(n, LIMITS.n)) return { error: `Give n, ${LIMITS.n[0]} to ${LIMITS.n[1]} flips, then p, e.g. binomial 6 0.5.` };
  if (!(p >= LIMITS.p[0] - 1e-9 && p <= LIMITS.p[1] + 1e-9 && Math.abs(p * 10 - Math.round(p * 10)) < 1e-9)) return { error: `p is a chance from ${LIMITS.p[0]} to ${LIMITS.p[1]}, in steps of 0.1.` };
  if (nums.length !== (words.includes('seed') ? 3 : 2) || !whole(seed, LIMITS.seed)) return { error: 'After n and p, optionally seed and a whole number, e.g. binomial 6 0.5 seed 7.' };
  return { value: { story, n, p: round(p, 1), seed } };
}

export function formatRv(input: RvInput): string {
  if (input.story === 'rule') return `rule ${input.rule}`;
  if (input.story === 'balance') return `balance ${input.counts.join(' ')}`;
  if (input.story === 'spread') return `spread ${input.a.join(' ')} | ${input.b.join(' ')}`;
  if (input.story === 'sum') return `sum ${input.x.join(' ')}`;
  return `binomial ${input.n} ${input.p} seed ${input.seed}`;
}

/** Sets entry i of a list of counts, clamped, unless that would leave nothing in it. */
function setCount(xs: readonly number[], i: number, to: number, [lo, hi]: readonly [number, number]): number[] | null {
  const next = [...xs];
  next[i] = Math.round(Math.min(hi, Math.max(lo, to)));
  return total(next) > 0 ? next : null;
}

export function dragRv(input: RvInput, handle: string, to: readonly [number, number]): RvInput {
  const i = Number(handle.slice(1)) - 1;
  if (input.story === 'balance' && handle[0] === 't') {
    const counts = setCount(input.counts, i, to[1], LIMITS.tickets);
    return counts ? { ...input, counts } : input;
  }
  if (input.story === 'spread' && (handle[0] === 'a' || handle[0] === 'b')) {
    const side = handle[0];
    const counts = setCount(input[side], i, to[1], LIMITS.tickets);
    return counts ? { ...input, [side]: counts } : input;
  }
  if (input.story === 'sum' && handle[0] === 'x') {
    const x = setCount(input.x, i, to[1], LIMITS.weights);
    return x ? { ...input, x } : input;
  }
  if (input.story === 'binomial' && handle === 'p') {
    const p = round(Math.min(LIMITS.p[1], Math.max(LIMITS.p[0], Math.round((to[0] / input.n) * 10) / 10)), 1);
    return { ...input, p };
  }
  return input;
}

const example = (id: string, label: string, make: (seed: number) => RvInput) => ({ id, label, make: ({ seed }: { seed: number }) => make(seed), sized: false });

export const randomVariables = defineAlgorithm<RvInput, PlotState>({
  kind: 'algorithm',
  slug: 'random-variables',
  view: 'plot',
  input: {
    examples: [
      example('dice-sum', 'Two dice: X = the sum', () => ({ story: 'rule', rule: 'sum' })),
      example('dice-max', 'Two dice: X = the larger', () => ({ story: 'rule', rule: 'max' })),
      example('tickets', 'E[X], the balance point', () => ({ story: 'balance', counts: [4, 3, 1, 1, 1] })),
      example('spread', 'Var(X), the spread', () => ({ story: 'spread', a: [1, 2, 4, 2, 1], b: [3, 1, 2, 1, 3] })),
      example('two-dice', 'X + Y: what adds', () => ({ story: 'sum', x: [...FAIR] })),
      example('coins', 'Binomial: 6 fair coins', (seed) => ({ story: 'binomial', n: 6, p: 0.5, seed })),
      example('biased-coins', 'Binomial: 6 coins, p = 0.3', (seed) => ({ story: 'binomial', n: 6, p: 0.3, seed })),
    ],
    custom: {
      label: 'rule sum|max, balance with ticket counts, spread A | B, sum with die X’s weights, or binomial n p (seed s)',
      placeholder: 'e.g. balance 4 3 1 1 1',
      parse: parseRv,
      format: formatRv,
    },
    drag: dragRv,
  },
  pseudocode,
  stats: [],
  legend: [
    { neutral: 'Probability bars (or tickets and weights, which give them)' },
    { mark: 'key', label: 'The value being worked on' },
    { mark: 'found', label: 'The balance point E[X]' },
    { mark: 'compare', label: 'A gap to the right of E[X]' },
    { mark: 'reject', label: 'A gap to the left of E[X]' },
    { tone: 2, label: 'Bag B, die Y, or the simulated runs' },
    { tone: 3, label: 'One standard deviation σ either side of E[X]' },
  ],
  run,
  content: {
    idea: 'A random variable is a rule that turns each outcome of a chance experiment into a number: the sum of two dice, the winnings of a bet, the number of heads in n flips. Its distribution gives each value a probability. The expected value E[X] = Σ x·P(x) is where those probability bars balance, and the variance Var(X) = Σ P(x)·(x − E[X])² is the average squared distance from that balance point; its square root σ is the spread in X’s own units.',
    invariant: 'The probabilities add to 1, and the weighted gaps Σ (x − E[X])·P(x) always cancel to 0, which is why the variance squares them. E[X + Y] = E[X] + E[Y] for any X and Y; Var(X + Y) = Var(X) + Var(Y) when they are independent, while Var(2X) = 4 Var(X). n independent flips with chance p give the binomial: P(K = k) = C(n, k)pᵏ(1 − p)ⁿ⁻ᵏ, with mean n·p and variance n·p·(1 − p).',
    whenToUse: 'Whenever an outcome is uncertain: the average reward an agent expects, the expected loss a model minimises, how much a prediction varies, the noise in a measurement. Machine learning’s losses are expectations over the data, and its error bars are standard deviations.',
    traits: [
      { label: 'E[X] is the balance point, not the most likely value', good: null },
      { label: 'Expectations always add', good: true },
      { label: 'Variances add only for independent parts', good: null },
    ],
    experiments: [
      { example: 'dice-sum', prompt: 'Predict each bar before it appears: the sums climb one way at a time to 7, then fall.' },
      { example: 'dice-max', prompt: 'The cells where the larger die is m form an L. Count its cells before each bar appears.' },
      { example: 'tickets', prompt: 'Drag the bar for 5 up and down: one far ticket moves the balance point more than one near it.' },
      { example: 'spread', prompt: 'Both bags balance at 3. Drag bag A’s middle bar down and watch its variance grow, though its balance point stays put.' },
      { example: 'two-dice', prompt: 'Load die X by dragging its bars: E[X + Y] is always E[X] + E[Y], and with X piled on one face, 2X can spread less than X + Y.' },
      { example: 'coins', prompt: 'Predict how many paths reach the middle of each column before it appears: each number adds the two behind it.' },
      { example: 'biased-coins', prompt: 'Drag the balance point to p = 0.7: the bars flip over, and the variance n·p·(1 − p) stays the same.' },
    ],
  },
});
