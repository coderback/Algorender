import { defineAlgorithm } from '@/engine/module';
import type { Frame } from '@/engine/types';
import { ask, askInOrder, plotFrame } from '@/viz/plot/frame';
import { fmt, round } from '@/viz/plot/geometry';
import type { Bar, Handle, PlanePart, PlotPart, PlotState } from '@/viz/plot/types';

export const MAX_OUTCOMES = 6;
/** Surprise bars are drawn up to this many bits; an infinite surprise is drawn at the cap. */
const CAP = 8;
const STEP = 0.01;

/** A true distribution P and a model's guess Q over the same named outcomes. */
export type EntropyInput = { names: string[]; p: number[]; q: number[] };

const pseudocode = [
  'surprise(x) = log₂(1 / p(x))   bits',
  'H(P) = Σ p(x) · log₂(1 / p(x))',
  'H(P, Q) = Σ p(x) · log₂(1 / q(x))',
  'KL(P‖Q) = H(P, Q) − H(P)  ≥ 0',
];

export const surprise = (p: number) => (p > 0 ? -Math.log2(p) : Infinity);
/** Σ p log 1/q, with 0 · log(1/0) taken as 0 (an outcome that never happens costs nothing). */
export function crossEntropy(p: readonly number[], q: readonly number[]): number {
  return p.reduce((sum, pi, i) => (pi === 0 ? sum : sum + pi * surprise(q[i])), 0);
}
export const entropy = (p: readonly number[]) => crossEntropy(p, p);

const bits = (b: number) => (Number.isFinite(b) ? `${fmt(b, 3)} bits` : '∞ bits');
const pct = (p: number) => `${round(p * 100, 1)}%`;

/** Bars per outcome, side by side when two series are shown (P left, Q right). */
function slots(n: number, i: number, which: 'p' | 'q' | 'both-p' | 'both-q'): Pick<Bar, 'x0' | 'x1'> {
  if (which === 'p' || which === 'q') return { x0: i - 0.32, x1: i + 0.32 };
  return which === 'both-p' ? { x0: i - 0.36, x1: i - 0.02 } : { x0: i + 0.02, x1: i + 0.36 };
}

type View = { focus: number | null; shown: number; withQ: boolean; qSurprise: boolean; handles: boolean };

function planes(input: EntropyInput, v: View): PlanePart[] {
  const { names, p, q } = input;
  const n = names.length;
  const ticks = names.map((name, i) => ({ at: i, label: name }));
  const x = { min: -0.6, max: n - 0.4, ticks };
  const probBars: Bar[] = p.map((pi, i) => ({
    id: `p${i}`,
    ...slots(n, i, v.withQ ? 'both-p' : 'p'),
    y: pi,
    mark: v.focus === i ? 'key' : null,
    label: pct(pi),
  }));
  if (v.withQ) q.forEach((qi, i) => probBars.push({ id: `q${i}`, ...slots(n, i, 'both-q'), y: qi, tone: 2, label: pct(qi) }));
  const handles: Handle[] = v.handles
    ? [
        ...p.map((pi, i): Handle => ({ id: `p${i}`, at: [round((slots(n, i, v.withQ ? 'both-p' : 'p').x0 + slots(n, i, v.withQ ? 'both-p' : 'p').x1) / 2, 4), pi], label: `P(${names[i]})`, step: STEP, min: [-1, 0], max: [n, 1] })),
        ...(v.withQ ? q.map((qi, i): Handle => ({ id: `q${i}`, at: [round(i + 0.19, 4), qi], label: `Q(${names[i]})`, tone: 2, step: STEP, min: [-1, 0], max: [n, 1] })) : []),
      ]
    : [];

  const surpriseBars: Bar[] = [];
  for (let i = 0; i < v.shown; i++) {
    const s = surprise(p[i]);
    if (p[i] === 0) continue;
    surpriseBars.push({ id: `sp${i}`, ...slots(n, i, v.qSurprise ? 'both-p' : 'p'), y: Math.min(CAP, s), mark: v.focus === i ? 'key' : null, label: fmt(s, 2) });
    if (v.qSurprise) {
      const sq = surprise(q[i]);
      surpriseBars.push({ id: `sq${i}`, ...slots(n, i, 'both-q'), y: Math.min(CAP, sq), tone: 2, label: Number.isFinite(sq) ? fmt(sq, 2) : '∞' });
    }
  }
  const top = Math.min(CAP, Math.max(3, ...surpriseBars.map((b) => b.y)) + 0.6);
  return [
    { kind: 'plane', id: 'plane', label: v.withQ ? 'How often: P (truth) and Q (model)' : 'How often each outcome happens, P', x, y: { min: 0, max: 1.12 }, equal: false, shapes: [{ kind: 'bars', id: 'probs', bars: probBars }], handles },
    { kind: 'plane', id: 'surprise', label: 'Surprise in bits, log₂(1/p)', x, y: { min: 0, max: top, label: 'bits' }, equal: false, shapes: [{ kind: 'bars', id: 'bits', bars: surpriseBars }], handles: [] },
  ];
}

function* run(input: EntropyInput): Generator<Frame<PlotState>> {
  const { names, p, q } = input;
  const n = names.length;
  const H = entropy(p);
  const CE = crossEntropy(p, q);
  const KL = CE - H;
  const readouts = (items: { id: string; label: string; value: string; tone?: 2; mark?: 'found' | 'key' }[]): PlotPart => ({ kind: 'readouts', id: 'readouts', label: 'Information', items });
  const live = p.map((pi, i) => i).filter((i) => p[i] > 0);
  let running = 0;

  yield plotFrame([...planes(input, { focus: null, shown: 0, withQ: false, qSurprise: false, handles: true }), readouts([])], {
    line: 0,
    note: `How much do you learn from seeing one outcome? A rare one tells you more than a common one. Measure it as surprise, log₂(1/p) bits: an outcome with chance 1/2 is worth 1 bit, 1/4 is 2 bits, 1/8 is 3. Drag the bars to change P.`,
    checkpoint: live.length ? ask(`How many bits of surprise is ${names[live[0]]}, which happens ${pct(p[live[0]])} of the time?`, fmt(surprise(p[live[0]]), 2), [fmt(p[live[0]], 2), fmt(surprise(p[live[0]]) + 1, 2), fmt(2 * surprise(p[live[0]]) + 0.5, 2)]) : undefined,
  });

  for (let k = 0; k < live.length; k++) {
    const i = live[k];
    const s = surprise(p[i]);
    running += p[i] * s;
    const next = live[k + 1];
    yield plotFrame([...planes(input, { focus: i, shown: i + 1, withQ: false, qSurprise: false, handles: false }), readouts([{ id: 'sum', label: 'Σ so far', value: bits(running), mark: 'key' }])], {
      line: 0,
      note: `${names[i]} happens ${pct(p[i])} of the time, so seeing it is worth log₂(1/${fmt(p[i], 3)}) = ${fmt(s, 3)} bits. Weighted by how often it happens, it adds ${fmt(p[i], 3)} × ${fmt(s, 3)} = ${fmt(p[i] * s, 3)} bits to the average.`,
      vars: { p: p[i], surprise: round(s, 3), 'p·surprise': round(p[i] * s, 3) },
      checkpoint:
        next !== undefined
          ? ask(`How many bits of surprise is ${names[next]} (${pct(p[next])})?`, fmt(surprise(p[next]), 2), [fmt(p[next], 2), fmt(surprise(p[next]) + 1, 2), fmt(Math.max(0, surprise(p[next]) - 1), 2)])
          : undefined,
    });
  }

  const uniform = Math.log2(n);
  yield plotFrame([...planes(input, { focus: null, shown: n, withQ: false, qSurprise: false, handles: false }), readouts([{ id: 'H', label: 'H(P)', value: bits(H), mark: 'found' }, { id: 'max', label: `most for ${n} outcomes`, value: bits(uniform) }])], {
    line: 1,
    note: `The entropy H(P) is the average surprise: ${bits(H)} per outcome${Math.abs(H - uniform) < 1e-9 ? `, the most possible for ${n} outcomes, because all are equally likely` : H < 1e-9 ? ': nothing is uncertain' : `, less than the ${bits(uniform)} of ${n} equally likely outcomes`}. It is also the fewest bits per outcome any code can average: give short codes to common outcomes.`,
    vars: { 'H(P)': round(H, 4) },
    checkpoint: askInOrder(
      `A model believes Q instead (next, in orange). If you code the outcomes for Q but they really follow P, will you need more bits per outcome, fewer, or the same?`,
      ['More', 'Fewer', 'The same'],
      KL > 1e-9 ? 'More' : 'The same',
    ),
  });

  yield plotFrame([...planes(input, { focus: null, shown: n, withQ: true, qSurprise: true, handles: false }), readouts([{ id: 'H', label: 'H(P)', value: bits(H), mark: 'found' }, { id: 'CE', label: 'H(P, Q)', value: bits(CE), tone: 2 }])], {
    line: 2,
    note: Number.isFinite(CE)
      ? `Under the model Q every outcome gets surprise log₂(1/q): the orange bars. Averaged over what really happens (P), that is the cross-entropy H(P, Q) = ${bits(CE)}. This is exactly the loss a classifier minimises.`
      : `Q gives some outcome that really happens a probability of 0, so when it happens its surprise is infinite and H(P, Q) = ∞. A model must never rule out what can happen.`,
    vars: { 'H(P)': round(H, 4), 'H(P,Q)': Number.isFinite(CE) ? round(CE, 4) : '∞' },
  });

  yield plotFrame([...planes(input, { focus: null, shown: n, withQ: true, qSurprise: true, handles: true }), readouts([{ id: 'H', label: 'H(P)', value: bits(H), mark: 'found' }, { id: 'CE', label: 'H(P, Q)', value: bits(CE), tone: 2 }, { id: 'KL', label: 'KL(P‖Q)', value: bits(KL), mark: 'key' }])], {
    line: 3,
    note: !Number.isFinite(KL)
      ? 'KL(P‖Q) is infinite: no finite number of extra bits pays for an outcome the model calls impossible. Drag Q’s bars up from zero.'
      : KL < 1e-9
        ? 'Q matches P, so the cross-entropy equals the entropy and KL(P‖Q) = 0: no bits wasted. Drag a bar to see the cost of being wrong.'
        : `The extra cost of believing Q is KL(P‖Q) = H(P, Q) − H(P) = ${fmt(CE, 3)} − ${fmt(H, 3)} = ${bits(KL)} per outcome. It is never negative, and it is 0 only when Q = P. Drag the bars to see what moves it.`,
    vars: { 'H(P)': round(H, 4), 'H(P,Q)': Number.isFinite(CE) ? round(CE, 4) : '∞', 'KL(P‖Q)': Number.isFinite(KL) ? round(KL, 4) : '∞' },
  });
}

const normalise = (xs: readonly number[]) => {
  const total = xs.reduce((a, b) => a + b, 0);
  return xs.map((x) => round(x / total, 4));
};

/** Sets outcome i to v and rescales the others so the total stays 1. */
export function reweigh(xs: readonly number[], i: number, v: number): number[] {
  const target = Math.min(1, Math.max(0, v));
  const rest = xs.reduce((a, b, k) => (k === i ? a : a + b), 0);
  const others = xs.length - 1;
  return xs.map((x, k) => (k === i ? round(target, 4) : round(rest > 0 ? (x / rest) * (1 - target) : (1 - target) / others, 4)));
}

const example = (id: string, label: string, names: string[], p: number[], q: number[]) => ({ id, label, make: () => ({ names, p, q }), sized: false });

export const entropyModule = defineAlgorithm<EntropyInput, PlotState>({
  kind: 'algorithm',
  slug: 'entropy',
  view: 'plot',
  input: {
    examples: [
      example('weather', 'Weather', ['sun', 'cloud', 'rain', 'snow'], [0.5, 0.25, 0.125, 0.125], [0.25, 0.25, 0.25, 0.25]),
      example('coin', 'Fair coin, biased guess', ['heads', 'tails'], [0.5, 0.5], [0.9, 0.1]),
      example('die', 'Loaded die', ['1', '2', '3', '4', '5', '6'], [0.5, 0.1, 0.1, 0.1, 0.1, 0.1], [1 / 6, 1 / 6, 1 / 6, 1 / 6, 1 / 6, 1 / 6].map((x) => round(x, 4))),
      example('sure', 'Almost certain', ['yes', 'no', 'maybe'], [0.98, 0.01, 0.01], [0.5, 0.25, 0.25]),
      example('ruled-out', 'Model rules one out', ['A', 'B', 'C'], [0.5, 0.25, 0.25], [0.6, 0.4, 0]),
    ],
    custom: {
      label: `Outcomes with P, then | and Q (2 to ${MAX_OUTCOMES} outcomes; normalised for you)`,
      placeholder: 'e.g. sun 0.5, cloud 0.25, rain 0.25 | 0.4, 0.4, 0.2',
      parse: (text) => {
        const [left, right] = text.split('|');
        if (right === undefined) return { error: 'Separate P and Q with |, e.g. sun 0.5, rain 0.5 | 0.9, 0.1.' };
        const pairs = [...left.matchAll(/([A-Za-z][\w-]*|\d+(?=\s+\d))\s*[:=]?\s*(\d*\.?\d+)/g)];
        const names = pairs.map((m) => m[1]);
        const p = pairs.map((m) => Number(m[2]));
        const q = (right.match(/\d*\.?\d+/g) ?? []).map(Number);
        if (names.length < 2 || names.length > MAX_OUTCOMES) return { error: `Name 2 to ${MAX_OUTCOMES} outcomes, each with a weight.` };
        if (new Set(names).size !== names.length) return { error: 'Give each outcome a different name.' };
        if (q.length !== names.length) return { error: `Q needs ${names.length} weights, one per outcome.` };
        if (p.reduce((a, b) => a + b, 0) <= 0 || q.reduce((a, b) => a + b, 0) <= 0) return { error: 'P and Q each need some weight.' };
        return { value: { names, p: normalise(p), q: normalise(q) } };
      },
      format: ({ names, p, q }) => `${names.map((name, i) => `${name} ${p[i]}`).join(', ')} | ${q.join(', ')}`,
    },
    drag: (input, handle, to) => {
      const i = Number(handle.slice(1));
      return handle[0] === 'p' ? { ...input, p: reweigh(input.p, i, to[1]) } : { ...input, q: reweigh(input.q, i, to[1]) };
    },
  },
  pseudocode,
  stats: [],
  legend: [
    { neutral: 'P, the true frequencies' },
    { tone: 2, label: 'Q, the model’s guess' },
    { mark: 'key', label: 'The outcome being measured' },
    { mark: 'found', label: 'Entropy, the average surprise' },
  ],
  run,
  content: {
    idea: 'Information is surprise: an outcome with chance p is worth log₂(1/p) bits. Entropy is the average surprise of a distribution; cross-entropy is the average surprise when you expect Q but the world follows P; and KL divergence is the difference, the price of the wrong belief.',
    invariant: 'H(P) ≤ log₂(n), with equality for a uniform distribution. H(P, Q) ≥ H(P), so KL(P‖Q) = H(P, Q) − H(P) ≥ 0, with equality only when Q = P. If Q gives probability 0 to anything P can do, both are infinite.',
    whenToUse: 'Cross-entropy is the loss almost every classifier and language model is trained on; KL divergence measures how far one distribution is from another (VAEs, RLHF, knowledge distillation). Entropy bounds lossless compression: Huffman codes come within a bit of it.',
    traits: [
      { label: 'Measured in bits', good: null },
      { label: 'KL is never negative', good: true },
      { label: 'KL is not symmetric', good: null },
    ],
    experiments: [
      { example: 'weather', prompt: 'Sun 1 bit, cloud 2, rain and snow 3 each: the entropy is 1.75 bits, and a code like 0, 10, 110, 111 achieves it exactly.' },
      { example: 'coin', prompt: 'Believing the coin lands heads 90% of the time costs 0.74 extra bits per toss, mostly from the tails you didn’t expect.' },
      { example: 'ruled-out', prompt: 'Q gives C a probability of 0, so the first C is infinitely surprising. Drag Q’s bar for C up a little.' },
      { example: 'sure', prompt: 'When one outcome is near certain, the entropy is tiny: there is almost nothing left to learn.' },
    ],
  },
});
