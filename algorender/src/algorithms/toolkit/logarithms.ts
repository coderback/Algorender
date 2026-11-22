import { defineAlgorithm } from '@/engine/module';
import type { Frame } from '@/engine/types';
import { ask, askInOrder, numbersIn, plain, plotFrame } from '@/viz/plot/frame';
import { fmt, round } from '@/viz/plot/geometry';
import type { Bar, PlanePart, PlotPart, PlotState, Readout, Shape, Vec } from '@/viz/plot/types';

// Exponents and logarithms in four short stories: doubling up to N (and
// halving back down) counts log₂ N; a log scale turns doubling into equal
// steps; logs turn a product into a sum (and not a sum into anything nice);
// compound interest split ever finer levels off at e; and ln undoes eˣ, the
// mirror image across y = x.

export type LogInput =
  | { story: 'doubling'; n: number }
  | { story: 'product'; a: number; b: number }
  | { story: 'compound' }
  | { story: 'mirror'; x: number };
export type Story = LogInput['story'];

/** Bounds for custom input. */
export const LIMITS = { n: [2, 100_000], factor: [1, 1024], x: [-3, 2] } as const;

/** Doublings from 1 until the value reaches n: the smallest k with 2^k ≥ n. */
export const doublings = (n: number) => {
  let k = 0;
  for (let v = 1; v < n; v *= 2) k++;
  return k;
};

/** Halvings from n until the value is 1 or less: the same count as the doublings. */
export const halvings = (n: number) => {
  let k = 0;
  for (let v = n; v > 1; v /= 2) k++;
  return k;
};

/** How often interest is paid in a year, from yearly to every minute. */
export const PERIODS = [1, 2, 4, 12, 52, 365, 8760, 525_600] as const;
const PERIOD_NAMES = ['yearly', 'half-yearly', 'quarterly', 'monthly', 'weekly', 'daily', 'hourly', 'every minute'];
const PERIOD_TICKS = ['1', '2', '4', '12', '52', '365', '8760', '525600'];

/** £1 at 100% a year, paid in n equal parts: (1 + 1/n)ⁿ. */
export const compound = (n: number) => (1 + 1 / n) ** n;

const pseudocode = [
  'v ← 1; count ← 0',
  'while v < N: v ← 2·v; count ← count + 1',
  'log₂ N ≈ count: doublings from 1 to N',
  'halve N until it reaches 1: same count',
  'log scale: each doubling is one step',
  'log(a·b) = log a + log b',
  '(1 + 1/n)ⁿ → e ≈ 2.718 as n grows',
  'ln undoes eˣ: ln(eˣ) = x',
];

const readouts = (items: Readout[]): PlotPart => ({ kind: 'readouts', id: 'readouts', label: 'Values', items });

function chart(id: string, label: string, bars: Bar[], extra: Shape[], x: PlanePart['x'], y: PlanePart['y']): PlanePart {
  return { kind: 'plane', id, label, x, y, equal: false, shapes: [{ kind: 'bars', id: `${id}-bars`, bars }, ...extra], handles: [] };
}

const pow2 = (k: number) => 2 ** k;
/** Big numbers with a thin space every three digits: 100 000, not 100000. */
const big = (v: number) => (Number.isInteger(v) && Math.abs(v) >= 10_000 ? String(v).replace(/B(?=(d{3})+(?!d))/g, ' ') : fmt(v));

// ───────────────────────────── doubling and halving ─────────────────────────────

function* doubling(n: number): Generator<Frame<PlotState>> {
  const K = doublings(n);
  const exact = Math.log2(n);
  const xAxis = { min: -0.6, max: K + 0.6, label: 'doublings', ticks: Array.from({ length: K + 1 }, (_, k) => ({ at: k, label: String(k) })) };
  const yAxis = { min: 0, max: Math.max(pow2(K), n) * 1.08, label: 'value' };
  const target: Shape = { kind: 'line', id: 'target', through: [0, n], dir: [1, 0], dashed: true, label: `N = ${big(n)}` };
  const bar = (k: number, mark: Bar['mark'] = null): Bar => ({ id: `d${k}`, x0: k - 0.35, x1: k + 0.35, y: pow2(k), mark, label: k >= K - 2 || k === 0 ? fmt(pow2(k)) : undefined });
  const bars = (upTo: number) => Array.from({ length: upTo + 1 }, (_, k) => bar(k, k === upTo ? 'key' : null));
  const plane = (b: Bar[]) => chart('plane', 'Doubling from 1', b, [target], xAxis, yAxis);

  yield plotFrame([plane(bars(0)), readouts([{ id: 'v', label: 'value', value: '1' }, { id: 'count', label: 'doublings', value: '0' }])], {
    line: 0,
    note: `Start at 1 and keep doubling: 1, 2, 4, 8, … The question a logarithm answers is how many doublings it takes to reach N = ${big(n)}.`,
    vars: { v: 1, count: 0 },
    checkpoint: ask(`How many doublings take 1 up to ${big(n)} or more?`, String(K), [String(K + 3), String(2 * K + 3), String(Math.round(n / 2)), String(Math.max(1, K - 3))]),
  });

  for (let k = 1; k <= K; k++) {
    const v = pow2(k);
    const nextV = pow2(k + 1);
    yield plotFrame([plane(bars(k)), readouts([{ id: 'v', label: 'value', value: fmt(v), mark: 'key' }, { id: 'count', label: 'doublings', value: String(k) }])], {
      line: 1,
      note:
        k < K
          ? `Doubling ${k}: ${fmt(v / 2)} × 2 = ${fmt(v)}, still below ${big(n)}. Each bar is twice the one before, so the bars shoot up faster and faster.`
          : `Doubling ${k}: ${fmt(v / 2)} × 2 = ${fmt(v)}, and that reaches ${big(n)}. It took only ${K} doublings to reach a number as big as ${big(n)}: doubling grows fast.`,
      vars: { v, count: k },
      checkpoint:
        k < K - 2
          ? ask(`What is the value after doubling ${k + 1}?`, fmt(nextV), [fmt(v + 2), fmt(3 * v), fmt(v + 10), fmt(v * v)])
          : k < K
            ? askInOrder(`Will doubling ${k + 1} reach ${big(n)}?`, ['Yes', 'No'], nextV >= n ? 'Yes' : 'No')
            : undefined,
    });
  }

  const final: PlotPart = readouts([
    { id: 'count', label: 'doublings to reach N', value: String(K) },
    { id: 'log', label: `log₂ ${big(n)}`, value: fmt(exact, 2), mark: 'found' },
  ]);
  yield plotFrame([plane(bars(K)), final], {
    line: 2,
    note: `So log₂ ${big(n)} is about ${K}: the number of doublings from 1. More precisely, log₂ ${big(n)} = ${fmt(exact, 2)}: 2 to the power ${fmt(exact, 2)} is about ${big(n)}. A logarithm is an exponent: the power you need.`,
    vars: { count: K, 'log₂ N': round(exact, 2) },
    checkpoint: ask(`Now go backwards: halve ${big(n)} again and again. How many halvings bring it down to 1 or below?`, String(halvings(n)), [String(K + 2), String(2 * K), String(Math.round(n / 2)), String(K + 5)]),
  });

  const H = halvings(n);
  const halves = Array.from({ length: H + 1 }, (_, i): Bar => ({ id: `h${i}`, x0: i - 0.35, x1: i + 0.35, y: n / pow2(i), mark: i === H ? 'found' : 'compare', label: i === 0 || i >= H - 1 ? fmt(n / pow2(i)) : undefined }));
  yield plotFrame(
    [
      chart('plane', 'Halving back down', halves, [{ kind: 'line', id: 'target', through: [0, 1], dir: [1, 0], dashed: true, label: 'one' }], { ...xAxis, max: H + 0.6, label: 'halvings', ticks: Array.from({ length: H + 1 }, (_, i) => ({ at: i, label: String(i) })) }, yAxis),
      readouts([{ id: 'count', label: 'halvings', value: String(H), mark: 'found' }]),
    ],
    {
      line: 3,
      note: `Halving is doubling run backwards, so it takes the same ${H} steps to get from ${big(n)} down to ${fmt(n / pow2(H), 2)}. That is why binary search finds an item among ${big(n)} sorted ones in at most ${H} looks: each look halves what is left.`,
      vars: { count: H },
      checkpoint: askInOrder(
        'Redraw the doubling bars on a log scale, where each grid line is double the one below. What shape do they make?',
        ['A straight staircase of equal steps', 'A curve that shoots up', 'Bars all the same height'],
        'A straight staircase of equal steps',
      ),
    },
  );

  const logBars = Array.from({ length: K + 1 }, (_, k): Bar => ({ id: `d${k}`, x0: k - 0.35, x1: k + 0.35, y: k, mark: k === K ? 'found' : null, label: k === 0 || k === K ? fmt(pow2(k)) : undefined }));
  const logTicks = Array.from({ length: K + 1 }, (_, k) => ({ at: k, label: fmt(pow2(k)) })).filter((_, k) => K <= 10 || k % 2 === 0 || k === K);
  yield plotFrame(
    [
      chart('plane', 'The same bars on a log scale', logBars, [{ kind: 'line', id: 'target', through: [0, exact], dir: [1, 0], dashed: true, label: `N = ${big(n)}` }], xAxis, {
        min: 0,
        max: K + 0.6,
        label: 'value (log scale)',
        ticks: logTicks,
      }),
      readouts([{ id: 'log', label: `log₂ ${big(n)}`, value: fmt(exact, 2), mark: 'found' }]),
    ],
    {
      line: 4,
      note: `On a log scale each bar is drawn at the height of its logarithm, so every doubling is one equal step and the bars rise in a straight staircase. Charts of things that keep multiplying (savings, epidemics) use log scales to turn a rocket into a straight line.`,
      vars: { 'log₂ N': round(exact, 2) },
    },
  );
}

// ───────────────────────────── products become sums ─────────────────────────────

function* product(a: number, b: number): Generator<Frame<PlotState>> {
  const la = Math.log2(a);
  const lb = Math.log2(b);
  const lab = Math.log2(a * b);
  const lsum = Math.log2(a + b);
  const ticks = [
    { at: 0, label: `log₂ ${fmt(a)}` },
    { at: 1, label: `log₂ ${fmt(b)}` },
    { at: 2, label: `log₂ ${fmt(a * b)}` },
    { at: 3, label: `log₂ ${fmt(a + b)}` },
  ];
  const plane = (bars: Bar[]) => chart('plane', 'Logarithms as bars', bars, [], { min: -0.6, max: 3.6, ticks }, { min: 0, max: Math.max(1, lab) * 1.15, label: 'log₂ (doublings)' });
  const A: Bar = { id: 'a', x0: -0.35, x1: 0.35, y: la, tone: 1, label: fmt(la) };
  const B: Bar = { id: 'b', x0: 0.65, x1: 1.35, y: lb, tone: 2, label: fmt(lb) };
  const vars = { a, b };

  yield plotFrame([plane([]), readouts([{ id: 'a', label: 'a', value: fmt(a), tone: 1 }, { id: 'b', label: 'b', value: fmt(b), tone: 2 }, { id: 'ab', label: 'a × b', value: fmt(a * b) }])], {
    line: 5,
    note: `Take a = ${fmt(a)} and b = ${fmt(b)}. Their product is ${fmt(a * b)}. Measure each number by its logarithm: how many doublings from 1 it takes.`,
    vars,
    checkpoint: ask(`What is log₂ ${fmt(a)}?`, fmt(la), [fmt(a / 2), fmt(la + 1), fmt(a * 2)]),
  });
  yield plotFrame([plane([A]), readouts([{ id: 'la', label: `log₂ ${fmt(a)}`, value: fmt(la), tone: 1 }])], {
    line: 5,
    note: `log₂ ${fmt(a)} = ${fmt(la)}: ${Number.isInteger(la) ? `${fmt(la)} doublings make ${fmt(a)}` : `${fmt(a)} is not a whole power of 2, so it takes a fractional number of doublings`}.`,
    vars: { ...vars, 'log₂ a': round(la, 2) },
    checkpoint: ask(`What is log₂ ${fmt(b)}?`, fmt(lb), [fmt(b / 2), fmt(lb + 1), fmt(b * 2)]),
  });
  yield plotFrame([plane([A, B]), readouts([{ id: 'la', label: `log₂ ${fmt(a)}`, value: fmt(la), tone: 1 }, { id: 'lb', label: `log₂ ${fmt(b)}`, value: fmt(lb), tone: 2 }])], {
    line: 5,
    note: `log₂ ${fmt(b)} = ${fmt(lb)}. Now the product: to make ${fmt(a)} × ${fmt(b)}, first double up to ${fmt(a)}, then double ${fmt(lb)} more times on top of that.`,
    vars: { ...vars, 'log₂ a': round(la, 2), 'log₂ b': round(lb, 2) },
    checkpoint: ask(`So what is log₂ ${fmt(a * b)}?`, fmt(lab), [fmt(la * lb), fmt(lsum), fmt(lab + 1)]),
  });
  const stacked: Bar[] = [A, B, { id: 'ab-a', x0: 1.65, x1: 2.35, y: la, tone: 1 }, { id: 'ab-b', x0: 1.65, x1: 2.35, y0: la, y: lab, tone: 2, label: fmt(lab) }];
  yield plotFrame(
    [
      plane(stacked),
      readouts([
        { id: 'lab', label: `log₂ ${fmt(a * b)}`, value: fmt(lab), mark: 'found' },
        { id: 'sum', label: `log₂ ${fmt(a)} + log₂ ${fmt(b)}`, value: fmt(la + lb) },
      ]),
    ],
    {
      line: 5,
      note: `log₂ ${fmt(a * b)} = ${fmt(lab)} = ${fmt(la)} + ${fmt(lb)}${Number.isInteger(la) && Number.isInteger(lb) ? '' : ' (each rounded to two places, so the last digit can be off by one)'}: the doublings add up. Logs turn multiplying into adding, in any base. That is why models add log-probabilities instead of multiplying probabilities: the sum stays a sensible size.`,
      vars: { ...vars, 'log₂ ab': round(lab, 2) },
      checkpoint: askInOrder(`Is log₂(${fmt(a)} + ${fmt(b)}) also ${fmt(la)} + ${fmt(lb)}?`, ['Yes', 'No'], Math.abs(lsum - (la + lb)) < 0.005 ? 'Yes' : 'No'),
    },
  );
  yield plotFrame(
    [
      plane([...stacked, { id: 'sum', x0: 2.65, x1: 3.35, y: lsum, mark: 'reject', label: fmt(lsum) }]),
      readouts([
        { id: 'lsum', label: `log₂ ${fmt(a + b)}`, value: fmt(lsum), mark: 'reject' },
        { id: 'sum', label: `log₂ ${fmt(a)} + log₂ ${fmt(b)}`, value: fmt(la + lb) },
      ]),
    ],
    {
      line: 5,
      note:
        Math.abs(lsum - (la + lb)) < 0.005
          ? `This time log₂(${fmt(a)} + ${fmt(b)}) = ${fmt(lsum)} does match: ${fmt(a)} + ${fmt(b)} happens to equal ${fmt(a)} × ${fmt(b)}. That is a coincidence of these numbers, not a rule.`
          : `No: log₂(${fmt(a)} + ${fmt(b)}) = log₂ ${fmt(a + b)} = ${fmt(lsum)}, not ${fmt(la + lb)}. Logs split products, never sums: there is no rule for the log of a sum.`,
      vars: { ...vars, 'log₂(a+b)': round(lsum, 2) },
    },
  );
}

// ───────────────────────────── e from compound interest ─────────────────────────────

function* interest(): Generator<Frame<PlotState>> {
  const e = Math.E;
  const xAxis = { min: -0.5, max: PERIODS.length - 0.5, label: 'payments a year', ticks: PERIOD_TICKS.map((label, at) => ({ at, label })) };
  const yAxis = { min: 1.9, max: 2.85, label: '£ after a year' };
  const pts = (upTo: number): Vec[] => PERIODS.slice(0, upTo + 1).map((n, i) => [i, compound(n)]);
  const eLine: Shape = { kind: 'line', id: 'e', through: [0, e], dir: [1, 0], dashed: true, mark: 'found', label: 'e ≈ 2.718' };

  for (let i = 0; i < PERIODS.length; i++) {
    const n = PERIODS[i];
    const v = compound(n);
    const shapes: Shape[] = [...(i >= 4 ? [eLine] : []), { kind: 'path', id: 'growth', points: pts(i), dots: true }, { kind: 'point', id: 'now', at: [i, v], mark: 'key', label: `£${fmt(v, 4)}` }];
    const next = PERIODS[i + 1];
    yield plotFrame(
      [
        { kind: 'plane', id: 'plane', label: '£1 at 100% a year, paid in n parts', x: xAxis, y: yAxis, equal: false, shapes, handles: [] },
        readouts([
          { id: 'n', label: 'payments n', value: fmt(n) },
          { id: 'rate', label: 'each payment', value: `${fmt(100 / n, 4)}%` },
          { id: 'v', label: '(1 + 1/n)ⁿ', value: fmt(v, 5), mark: 'key' },
        ]),
      ],
      {
        line: 6,
        note:
          i === 0
            ? 'A bank pays 100% interest once a year: £1 becomes £2. Now split that 100% into smaller payments made more often, each added to the pot so it earns interest too.'
            : i === 1
              ? `Two payments of 50%: £1 → £1.50 → £2.25. The second payment earns interest on the first, so you beat £2.`
              : i < PERIODS.length - 1
                ? `Paid ${PERIOD_NAMES[i]} (n = ${big(n)}), £1 grows to £${fmt(v, 4)}. More payments help, but each extra split helps less than the last.`
                : `Every minute (n = ${big(n)}): £${fmt(v, 5)}. The totals creep up towards 2.71828…, a number called e, and never pass it. It is the most £1 can grow at 100% a year, however finely you split it.`,
        vars: { n, value: round(v, 5) },
        checkpoint:
          i === 0
            ? askInOrder('Pay 50% twice a year instead. Will you end with more than £2, exactly £2, or less?', ['More than £2', 'Exactly £2', 'Less than £2'], 'More than £2')
            : i === 1
              ? askInOrder('Keep splitting into more, smaller payments. Will the total grow without limit?', ['Yes, without limit', 'No, it levels off'], 'No, it levels off')
              : next !== undefined && (i === 3 || i === 5)
                ? askInOrder(`Paid ${PERIOD_NAMES[i + 1]}, will £1 grow past £2.72?`, ['Yes', 'No'], compound(next) > 2.72 ? 'Yes' : 'No')
                : undefined,
      },
    );
  }
}

// ───────────────────────────── ln mirrors eˣ ─────────────────────────────

function* mirror(x: number): Generator<Frame<PlotState>> {
  const ex = Math.exp(x);
  const axis = { min: -3.5, max: 8 };
  const sample = (from: number, to: number, g: (t: number) => number): Vec[] => Array.from({ length: 121 }, (_, i) => from + ((to - from) * i) / 120).map((t) => [t, g(t)] as Vec);
  const expCurve: Shape = { kind: 'path', id: 'exp', points: sample(-3.5, Math.log(8), Math.exp), tone: 1, label: 'y = eˣ' };
  const lnCurve: Shape = { kind: 'path', id: 'ln', points: sample(Math.exp(-3.5), 8, Math.log), tone: 2, label: 'y = ln x' };
  const diagonal: Shape = { kind: 'line', id: 'diag', through: [0, 0], dir: [1, 1], dashed: true, label: 'y = x' };
  const P: Shape = { kind: 'point', id: 'P', at: [x, ex], mark: 'key', label: 'P' };
  const handle = { id: 'x', at: [x, round(ex, 2)] as Vec, label: 'P on eˣ', mark: 'key' as const, step: 0.1, min: [LIMITS.x[0], -Infinity] as Vec, max: [LIMITS.x[1], Infinity] as Vec };
  const plane = (shapes: Shape[]): PlanePart => ({ kind: 'plane', id: 'plane', label: 'eˣ and ln x', x: { ...axis, label: 'x' }, y: { ...axis, label: 'y' }, equal: true, shapes, handles: [handle] });
  const vars = { x, 'eˣ': round(ex, 3) };

  yield plotFrame([plane([diagonal, expCurve, P]), readouts([{ id: 'x', label: 'x', value: fmt(x) }, { id: 'ex', label: 'eˣ', value: fmt(ex, 3), tone: 1 }])], {
    line: 7,
    note: `y = eˣ is e = 2.718… raised to the power x. P = (${fmt(x)}, ${fmt(ex, 3)}) is on it: put in ${fmt(x)}, get out ${fmt(ex, 3)}. Drag P along the curve.`,
    vars,
    checkpoint: askInOrder('Swap P’s coordinates to get Q = (eˣ, x). Which curve is Q on?', ['The curve that undoes eˣ', 'y = eˣ itself', 'The line y = x'], 'The curve that undoes eˣ'),
  });
  yield plotFrame(
    [plane([diagonal, expCurve, lnCurve, P, { kind: 'point', id: 'Q', at: [ex, x], mark: 'found', label: 'Q' }]), readouts([{ id: 'ex', label: 'eˣ', value: fmt(ex, 3), tone: 1 }, { id: 'ln', label: `ln ${fmt(ex, 3)}`, value: fmt(x), tone: 2 }])],
    {
      line: 7,
      note: `Q = (${fmt(ex, 3)}, ${fmt(x)}) is on y = ln x, the natural logarithm: it takes ${fmt(ex, 3)} back to ${fmt(x)}. Swapping inputs and outputs reflects a graph in the line y = x, so ln x is eˣ seen in a mirror.`,
      vars: { ...vars, 'ln(eˣ)': round(x, 3) },
      checkpoint: ask('Logs grow slowly. Roughly what is ln 1000?', fmt(Math.log(1000), 1), [fmt(1000 / Math.E, 0), fmt(Math.log2(1000), 1), fmt(Math.log10(1000), 1)]),
    },
  );
  yield plotFrame(
    [
      plane([diagonal, expCurve, lnCurve, P, { kind: 'point', id: 'Q', at: [ex, x], mark: 'found', label: 'Q' }]),
      readouts([
        { id: 'ln1000', label: 'ln 1000', value: fmt(Math.log(1000), 2), mark: 'found' },
        { id: 'log1000', label: 'log₂ 1000', value: fmt(Math.log2(1000), 2) },
        { id: 'ln2', label: 'ln 2', value: fmt(Math.LN2, 3) },
      ]),
    ],
    {
      line: 7,
      note: `ln 1000 = ${fmt(Math.log(1000), 2)}: logs grow slowly, because eˣ grows fast. ln is the log to base e. It is log₂ times ln 2 = ${fmt(Math.LN2, 3)} (${fmt(Math.log2(1000), 2)} × ${fmt(Math.LN2, 3)} = ${fmt(Math.log(1000), 2)}), so every base gives the same shape, just scaled.`,
      vars: { 'ln 1000': round(Math.log(1000), 2) },
    },
  );
}

function* run(input: LogInput): Generator<Frame<PlotState>> {
  if (input.story === 'doubling') yield* doubling(input.n);
  else if (input.story === 'product') yield* product(input.a, input.b);
  else if (input.story === 'compound') yield* interest();
  else yield* mirror(input.x);
}

const STORIES: Story[] = ['doubling', 'product', 'compound', 'mirror'];

export function parseLog(text: string): { value: LogInput } | { error: string } {
  const word = (text.toLowerCase().match(/[a-z]+/) ?? [''])[0];
  const story = STORIES.find((s) => s === word);
  if (!story) return { error: 'Start with doubling, product, compound or mirror.' };
  const xs = numbersIn(text);
  const within = (v: number, [lo, hi]: readonly [number, number]) => v >= lo && v <= hi;
  if (story === 'compound') return { value: { story } };
  if (story === 'doubling') {
    if (xs.length !== 1 || !Number.isInteger(xs[0]) || !within(xs[0], LIMITS.n)) return { error: `Give one whole number N from ${LIMITS.n[0]} to ${fmt(LIMITS.n[1])}, e.g. doubling 1000.` };
    return { value: { story, n: xs[0] } };
  }
  if (story === 'product') {
    if (xs.length !== 2 || !xs.every((v) => within(v, LIMITS.factor))) return { error: `Give two numbers from ${LIMITS.factor[0]} to ${LIMITS.factor[1]}, e.g. product 8 4.` };
    return { value: { story, a: round(xs[0], 2), b: round(xs[1], 2) } };
  }
  if (xs.length !== 1 || !within(xs[0], LIMITS.x)) return { error: `Give one x from ${LIMITS.x[0]} to ${LIMITS.x[1]}, e.g. mirror 1.5.` };
  return { value: { story, x: round(xs[0], 1) } };
}

function format(input: LogInput): string {
  if (input.story === 'doubling') return `doubling ${input.n}`;
  if (input.story === 'product') return `product ${plain(input.a)} ${plain(input.b)}`;
  if (input.story === 'compound') return 'compound';
  return `mirror ${plain(input.x, 1)}`;
}

const example = (id: string, label: string, input: LogInput) => ({ id, label, make: () => input, sized: false });

export const logarithms = defineAlgorithm<LogInput, PlotState>({
  kind: 'algorithm',
  slug: 'logarithms',
  view: 'plot',
  input: {
    examples: [
      example('doubling', 'Doubling to 1000', { story: 'doubling', n: 1000 }),
      example('big', 'Doubling to 100 000', { story: 'doubling', n: 100_000 }),
      example('product', 'log(8 × 4) = log 8 + log 4', { story: 'product', a: 8, b: 4 }),
      example('product-uneven', 'log(10 × 100)', { story: 'product', a: 10, b: 100 }),
      example('compound', 'Compound interest and e', { story: 'compound' }),
      example('mirror', 'ln mirrors eˣ', { story: 'mirror', x: 1.5 }),
    ],
    custom: {
      label: 'A story: doubling N, product a b, compound, or mirror x',
      placeholder: 'e.g. doubling 1000',
      parse: parseLog,
      format,
    },
    drag: (input, _handle, to) => (input.story === 'mirror' ? { ...input, x: round(Math.min(LIMITS.x[1], Math.max(LIMITS.x[0], to[0])), 1) } : input),
  },
  pseudocode,
  stats: [],
  legend: [
    { neutral: 'Bars and curves' },
    { mark: 'key', label: 'The newest value' },
    { mark: 'compare', label: 'Halving back down' },
    { mark: 'found', label: 'The logarithm, or e' },
    { mark: 'reject', label: 'A log of a sum (no rule)' },
    { tone: 1, label: 'log a, or eˣ' },
    { tone: 2, label: 'log b, or ln x' },
  ],
  run,
  content: {
    idea: 'An exponent says how many copies of a number to multiply together: 3⁴ = 81 is four 3s, four triplings from 1. A logarithm runs that backwards: log₃ 81 = 4 is the number of triplings that make 81. Because these steps add up, logs turn products into sums, and e = 2.718… is where compound growth levels off when it is split ever finer.',
    invariant: 'log(a·b) = log a + log b in every base, and ln is the log to base e: ln(eˣ) = x. There is no rule for log(a + b). Doubling from 1 to N and halving N back to 1 take the same ⌈log₂ N⌉ steps.',
    whenToUse: 'Whenever things multiply: growth, halving searches (binary search takes about log₂ n looks), probabilities of many independent events (models add log-probabilities instead of multiplying tiny numbers), and charts that span many orders of magnitude, drawn on log scales.',
    traits: [
      { label: 'log(a·b) = log a + log b', good: null },
      { label: 'Grows very slowly', good: null },
      { label: 'No rule for log(a + b)', good: false },
    ],
    experiments: [
      { example: 'big', prompt: 'Predict before you play: how many doublings from 1 pass 100 000? Then check against log₂ 100 000.' },
      { example: 'product', prompt: '8 = 2³ and 4 = 2²: the stacked bar shows 3 + 2 = 5 doublings, and 2⁵ = 32 = 8 × 4.' },
      { example: 'compound', prompt: 'Watch how little hourly payments add over daily ones: the totals level off just under e.' },
      { example: 'mirror', prompt: 'Drag P along eˣ and watch Q trace ln x on the other side of the mirror line.' },
    ],
  },
});
