// Property tests for softmax (B7 of the math and ML path): the maths against
// plain loops and the float32 rules, softmax regression's gradient against
// measured slopes and its boundaries against the scores, every question's
// answer is what the next frame shows, questions about trained models are
// right on every seed, and no frame, label or caption gives an answer away.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Checkpoint, Frame } from '@/engine/types';
import { DATA_BOX } from '@/ml/datasets';
import { mentions, statesAnswer } from '@/testing/answers';
import { LONG_MS } from '@/testing/timing';
import { expectGoodPlotTrace, planeOf, readout, traceOf } from '@/viz/plot/testing';
import type { HeatmapShape, PlotState, Vec } from '@/viz/plot/types';
import {
  accuracy,
  ADD_CHOICES,
  argmax,
  BIG_MAX,
  BIG_MIN,
  BIG_T,
  boundaryRay,
  CLASSES,
  classAt,
  DEFAULT_LOGITS,
  DIVIDE_CHOICES,
  DOUBLE_CHOICES,
  dragSoftmax,
  eToThe,
  exp32,
  expChoices,
  formatSoftmax,
  gradient,
  halveChoices,
  HUGE_CHOICES,
  K,
  LN_FLOAT32_MAX,
  LN0_CHOICES,
  logSumExp,
  loss32,
  lossOf,
  lossScores,
  meanCrossEntropy,
  MEET_CHOICES,
  meetingPoint,
  modelLoss,
  naive32,
  overflowScores,
  p3,
  parseSoftmax,
  probsAt,
  scaled,
  scoresAt,
  SHAPE_CHOICES,
  SHIFT_CHOICES,
  sigmoid,
  softmax,
  softmaxOf,
  stable32,
  STEPS,
  topTwo,
  train,
  underChoices,
  type Model,
  type SoftmaxInput,
  type Story,
} from './softmax';

const trace = (input: SoftmaxInput) => traceOf(softmax, input).frames;
const good = (frames: readonly Frame<PlotState>[]) => expectGoodPlotTrace(softmax, frames);
const said = (c: Checkpoint) => c.choices[c.answer];
const answer = (frames: readonly Frame<PlotState>[], i: number) => {
  const c = frames[i].checkpoint;
  if (!c) throw new Error(`frame ${i} asks nothing`);
  return said(c);
};
const FRAMES: Record<Story, number> = { bars: 7, regions: 5, overflow: 7 };
const SEEDS = Array.from({ length: 200 }, (_, k) => k * 7919 + 3);

// Inputs the custom text accepts: scores on a 0.1 grid with one top, T on a 0.25 grid, the query on a 0.25 grid.
const logitsArb = fc.array(fc.integer({ min: -30, max: 50 }), { minLength: K, maxLength: K }).filter((xs) => xs.filter((v) => v === Math.max(...xs)).length === 1).map((xs) => xs.map((v) => v / 10));
const barsArb = fc.record({ story: fc.constant('bars' as const), logits: logitsArb, t: fc.integer({ min: 1, max: 16 }).map((k) => k / 4) });
const regionsArb = fc.record({ story: fc.constant('regions' as const), seed: fc.integer({ min: 0, max: 1_000_000 }), q: fc.tuple(fc.integer({ min: -11, max: 11 }), fc.integer({ min: -11, max: 11 })).map(([x, y]): Vec => [x / 4, y / 4]) });
const overflowArb = fc.record({ story: fc.constant('overflow' as const), big: fc.integer({ min: BIG_MIN, max: BIG_MAX }) });
const anyInput: fc.Arbitrary<SoftmaxInput> = fc.oneof(barsArb, regionsArb, overflowArb);

function roundTrips(input: SoftmaxInput) {
  const text = formatSoftmax(input);
  expect(parseSoftmax(text), text).toEqual({ value: input });
}

describe('softmax', () => {
  it('plays every example from several seeds, round-trips its text, and every drag keeps the frame count', () => {
    for (const ex of softmax.input.examples) {
      for (const seed of [0, 7, 12345]) {
        const input = ex.make({ seed, size: 0 }) as SoftmaxInput;
        const frames = trace(input);
        good(frames);
        roundTrips(input);
        expect(frames.length).toBe(FRAMES[input.story]);
        for (const part of frames[0].state.parts) {
          if (part.kind !== 'plane') continue;
          for (const h of part.handles) {
            const moves: Vec[] = [[h.at[0] + h.step, h.at[1] + h.step], [h.at[0] - h.step, h.at[1] - 3 * h.step], [h.min[0], h.min[1]], [h.max[0], h.max[1]], [-9, -9], [9, 9], [h.at[0] + 0.37, h.at[1] + 1.23]];
            for (const to of moves) {
              const moved = dragSoftmax(input, h.id, to);
              const again = trace(moved);
              good(again);
              roundTrips(moved);
              expect(again.length, `${ex.id} dragging ${h.id} to ${to}`).toBe(frames.length);
            }
          }
        }
      }
    }
  });

  it('plays any input it accepts, with a fixed frame count and enough questions', () => {
    fc.assert(
      fc.property(anyInput, (input) => {
        const frames = trace(input);
        good(frames);
        roundTrips(input);
        expect(frames.length).toBe(FRAMES[input.story]);
        expect(frames.filter((f) => f.checkpoint).length).toBe(FRAMES[input.story] - 1);
      }),
      { numRuns: 60 },
    );
  });

  it('uses its seed only where the story is random', () => {
    const [bars, regions, overflow] = softmax.input.examples;
    const run = (ex: typeof bars, seed: number) => JSON.stringify(trace(ex.make({ seed, size: 0 }) as SoftmaxInput));
    expect(run(regions, 4)).not.toBe(run(regions, 3));
    expect(run(regions, 3)).toBe(run(regions, 3));
    expect(run(bars, 4)).toBe(run(bars, 3));
    expect(run(overflow, 4)).toBe(run(overflow, 3));
  });

  it('refuses inputs it can’t draw, and each handle moves only its own value', () => {
    for (const text of ['walk 1 2', 'bars 1 2 3 T 1', 'bars 2 2 1 0 T 1', 'bars 6 1 1 0 T 1', 'bars 1.25 1 0 0 T 1', 'bars 2 1 0 0 T 0', 'bars 2 1 0 0 T 0.3', 'bars 2 1 0 0 T 5', 'regions seed 1', 'regions seed -1 query 0 0', 'regions seed 1 query 0.1 0', 'regions seed 1 query 3 0', 'overflow 50', 'overflow 103', 'overflow 1000.5', 'overflow 2000000'])
      expect(parseSoftmax(text), text).toHaveProperty('error');
    expect(parseSoftmax('Bars 2, 1.5, 1, -0.5, T = 0.5')).toEqual({ value: { story: 'bars', logits: [2, 1.5, 1, -0.5], t: 0.5 } });
    expect(parseSoftmax('regions seed 7 query -1.25 2.75')).toEqual({ value: { story: 'regions', seed: 7, q: [-1.25, 2.75] } });
    expect(parseSoftmax('overflow 104')).toEqual({ value: { story: 'overflow', big: 104 } });
    const bars: SoftmaxInput = { story: 'bars', logits: [...DEFAULT_LOGITS], t: 1 };
    expect(dragSoftmax(bars, 't', [2.4, 0.7])).toEqual({ ...bars, t: 2.5 });
    expect(dragSoftmax(bars, 't', [-1, 0])).toEqual({ ...bars, t: 0.25 });
    expect(dragSoftmax(bars, 'z3', [3, 1.23])).toEqual({ ...bars, logits: [2, 1.5, 1, 1.2] });
    expect(dragSoftmax(bars, 'z3', [3, 99])).toEqual({ ...bars, logits: [2, 1.5, 1, 5] });
    // A drag that would tie the top score is refused.
    expect(dragSoftmax(bars, 'z1', [1, 2])).toBe(bars);
    expect(dragSoftmax(bars, 'q', [1, 1])).toBe(bars);
    const regions: SoftmaxInput = { story: 'regions', seed: 1, q: [0, 0] };
    expect(dragSoftmax(regions, 'q', [1.1, -9])).toEqual({ ...regions, q: [1, -2.75] });
    const overflow: SoftmaxInput = { story: 'overflow', big: 1000 };
    expect(dragSoftmax(overflow, 'q', [1, 1])).toBe(overflow);
    // The handles sit at the input's own values.
    const f = trace({ story: 'bars', logits: [0.3, -2, 4.1, 1], t: 2.75 })[0].state;
    expect(planeOf(f, 'scores').handles.map((h) => h.at)).toEqual([[0, 0.3], [1, -2], [2, 4.1], [3, 1]]);
    expect(planeOf(f, 'temperature').handles[0].at).toEqual([2.75, 0]);
    expect(planeOf(trace({ story: 'regions', seed: 2, q: [-1.5, 2] })[0].state).handles[0].at).toEqual([-1.5, 2]);
  });
});

describe('the maths against plain loops', () => {
  const zs = fc.array(fc.double({ min: -30, max: 30, noNaN: true }), { minLength: 1, maxLength: 8 });

  it('softmax is e^(z/T) over their total: positive, adding up to 1, the order kept', () => {
    fc.assert(
      fc.property(zs, fc.double({ min: 0.1, max: 10, noNaN: true }), fc.double({ min: -500, max: 500, noNaN: true }), (z, T, c) => {
        const p = softmaxOf(z, T);
        const e = z.map((v) => Math.exp(v / T));
        const s = e.reduce((a, b) => a + b, 0);
        if (Number.isFinite(s)) p.forEach((v, i) => expect(v).toBeCloseTo(e[i] / s, 12));
        expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
        expect(p.every((v) => v >= 0 && v <= 1)).toBe(true);
        for (let i = 0; i < z.length; i++) for (let j = 0; j < z.length; j++) if (z[i] > z[j]) expect(p[i]).toBeGreaterThanOrEqual(p[j]);
        // Adding the same number to every score changes nothing.
        softmaxOf(z.map((v) => v + c), T).forEach((v, i) => expect(v).toBeCloseTo(p[i], 9));
      }),
      { numRuns: 200 },
    );
  });

  it('a smaller temperature sharpens the top share, a huge one flattens it, and the top never changes', () => {
    fc.assert(
      fc.property(logitsArb, fc.integer({ min: 1, max: 16 }), (z, k) => {
        const T = k / 4;
        const [a] = topTwo(z);
        expect(softmaxOf(z, T / 2)[a]).toBeGreaterThan(softmaxOf(z, T)[a]);
        expect(argmax(softmaxOf(z, T / 2))).toBe(a);
        for (const v of softmaxOf(z, BIG_T)) expect(Math.abs(v - 1 / K)).toBeLessThan(0.03);
        expect(softmaxOf(z, 0.01)[a]).toBeGreaterThan(0.99);
      }),
      { numRuns: 200 },
    );
  });

  it('with two classes softmax is the sigmoid of the gap; log-sum-exp and the loss match plain logs', () => {
    fc.assert(
      fc.property(fc.double({ min: -20, max: 20, noNaN: true }), fc.double({ min: -20, max: 20, noNaN: true }), (a, b) => {
        expect(softmaxOf([a, b])[0]).toBeCloseTo(sigmoid(a - b), 12);
        expect(softmaxOf([a - b, 0])[0]).toBeCloseTo(sigmoid(a - b), 12);
      }),
      { numRuns: 100 },
    );
    fc.assert(
      fc.property(zs, (z) => {
        expect(logSumExp(z)).toBeCloseTo(Math.log(z.reduce((t, v) => t + Math.exp(v), 0)), 9);
        z.forEach((_, y) => expect(lossOf(z, y)).toBeCloseTo(-Math.log(softmaxOf(z)[y]), 9));
      }),
      { numRuns: 100 },
    );
    // Big scores: log-sum-exp stays finite where the plain log overflows.
    expect(logSumExp([1000, 999, 998])).toBeCloseTo(1000 + Math.log(1 + Math.exp(-1) + Math.exp(-2)), 9);
    expect(Math.log(Math.exp(1000))).toBe(Infinity);
    expect(meanCrossEntropy([[2, 0], [0, 2]], [0, 1])).toBeCloseTo(-Math.log(sigmoid(2)), 12);
  });

  it('float32: e overflows past e^88.72 and underflows below e^−103.97, and the safe way never does', () => {
    expect(LN_FLOAT32_MAX).toBeCloseTo(88.7228, 4);
    expect(exp32(88)).toBeLessThan(Infinity);
    expect(exp32(89)).toBe(Infinity);
    expect(exp32(-103)).toBeGreaterThan(0);
    expect(exp32(-BIG_MIN)).toBe(0);
    for (const big of [BIG_MIN, 1000, 54321, BIG_MAX]) {
      const z = overflowScores(big);
      const n = naive32(z);
      expect(n.e).toEqual([Infinity, Infinity, Infinity]);
      expect(n.p.every(Number.isNaN)).toBe(true);
      const s = stable32(z);
      expect(s.shifted).toEqual([0, -1, -2]);
      s.p.forEach((v, i) => expect(v).toBeCloseTo(softmaxOf([2, 1, 0])[i], 6));
      const u = naive32(z.map((v) => v - 2 * big));
      expect(u.e).toEqual([0, 0, 0]);
      expect(u.p.every(Number.isNaN)).toBe(true);
      const l = loss32(lossScores(big), 2);
      expect(l.fromP).toBe(Infinity);
      expect(l.lse).toBeCloseTo(lossOf([2, 1, 2 - 120], 2), 4);
    }
    expect(eToThe(1000)).toBe('1.97 × 10⁴³⁴');
    expect(eToThe(-1000)).toBe('5.08 × 10⁻⁴³⁵');
    expect(eToThe(1000, 0)).toBe('2 × 10⁴³⁴');
  });

  it('softmax regression: the gradient matches measured slopes, and the boundaries are where scores tie', () => {
    const { points, models } = train(5);
    for (const W of [models[3], models[STEPS]]) {
      const g = gradient(W, points);
      const h = 1e-6;
      for (let k = 0; k < 3; k++)
        for (let j = 0; j < 3; j++) {
          const nudge = (d: number): Model => W.map((w, kk) => w.map((v, jj) => (kk === k && jj === j ? v + d : v)) as unknown as Model[number]);
          expect(g[k][j]).toBeCloseTo((modelLoss(nudge(h), points) - modelLoss(nudge(-h), points)) / (2 * h), 5);
        }
    }
    const W = models[STEPS];
    const P = meetingPoint(W)!;
    const zP = scoresAt(W, ...P);
    expect(zP[1]).toBeCloseTo(zP[0], 9);
    expect(zP[2]).toBeCloseTo(zP[0], 9);
    probsAt(W, ...P).forEach((v) => expect(v).toBeCloseTo(1 / 3, 9));
    for (const [i, j] of [[0, 1], [0, 2], [1, 2]] as const) {
      const d = boundaryRay(W, i, j);
      for (const t of [0.3, 1, 2.5]) {
        const at: Vec = [P[0] + t * d[0], P[1] + t * d[1]];
        const z = scoresAt(W, ...at);
        expect(z[i]).toBeCloseTo(z[j], 9);
        expect(z[3 - i - j]).toBeLessThan(z[i]);
        // A step off the line either way lands in i's region or j's.
        const n: Vec = [-d[1] * 0.05, d[0] * 0.05];
        expect([classAt(W, at[0] + n[0], at[1] + n[1]), classAt(W, at[0] - n[0], at[1] - n[1])].sort()).toEqual([i, j].sort());
      }
    }
  });
});

describe('questions about trained models are right on every seed', () => {
  it('the loss falls, the three boundaries meet inside the plot, and doubling keeps every region', { timeout: LONG_MS }, () => {
    for (const seed of SEEDS) {
      const { points, models, losses } = train(seed);
      const W = models[STEPS];
      expect(losses[STEPS], `seed ${seed}`).toBeLessThan(losses[0]);
      expect(losses[0]).toBeCloseTo(Math.log(3), 12);
      expect(accuracy(W, points)).toBeGreaterThan(0.8);
      const P = meetingPoint(W);
      expect(P, `seed ${seed}`).not.toBeNull();
      expect(Math.max(Math.abs(P![0]), Math.abs(P![1])), `seed ${seed}`).toBeLessThan(2);
      const W2 = scaled(W, 2);
      for (let r = 0; r < 12; r++)
        for (let c = 0; c < 12; c++) {
          const x = -2.9 + (5.8 * c) / 11;
          const y = -2.9 + (5.8 * r) / 11;
          expect(classAt(W2, x, y)).toBe(classAt(W, x, y));
          const k = classAt(W, x, y);
          expect(probsAt(W2, x, y)[k]).toBeGreaterThanOrEqual(probsAt(W, x, y)[k]);
        }
    }
  });
});

describe('every question’s answer is what the next frame shows', () => {
  it('the bars', () => {
    fc.assert(
      fc.property(barsArb, (input) => {
        const frames = trace(input);
        const { logits: z, t } = input;
        const [a, b] = topTwo(z);
        const p = softmaxOf(z, t);
        expect(answer(frames, 0)).toBe(CLASSES[a]);
        expect(Math.max(...CLASSES.map((_, i) => Number(readout(frames[1].state, `e${i}`)?.split(' ')[0])))).toBeGreaterThan(0);
        expect(answer(frames, 1)).toBe(p3(p[a]));
        expect(readout(frames[2].state, `p${a}`)).toBe(answer(frames, 1));
        expect(answer(frames, 2)).toBe(ADD_CHOICES[0]);
        CLASSES.forEach((_, i) => expect(readout(frames[3].state, `p${i}`)).toBe(readout(frames[2].state, `p${i}`)));
        expect(answer(frames, 3)).toBe(halveChoices(CLASSES[a])[0]);
        expect(Number(readout(frames[4].state, 'after'))).toBeGreaterThanOrEqual(Number(readout(frames[4].state, 'before')));
        expect(softmaxOf(z, t / 2)[a]).toBeGreaterThan(p[a]);
        expect(answer(frames, 4)).toBe(HUGE_CHOICES[0]);
        CLASSES.forEach((_, i) => expect(Math.abs(Number(readout(frames[5].state, `p${i}`)) - 0.25)).toBeLessThan(0.03));
        expect(answer(frames, 5)).toBe(p3(sigmoid(z[a] - z[b])));
        expect(readout(frames[6].state, 'two')).toBe(answer(frames, 5));
        expect(readout(frames[6].state, 'sig')).toBe(answer(frames, 5));
        // The temperature's curve appears only once its questions have been asked.
        for (let i = 0; i <= 4; i++) expect(planeOf(frames[i].state, 'temperature').shapes).toEqual([]);
        expect(planeOf(frames[5].state, 'temperature').shapes.length).toBeGreaterThan(0);
        // The note's claim about half the probability is right.
        expect(frames[2].note).toContain(p[a] > 0.5 ? 'more than half' : 'less than half');
      }),
      { numRuns: 100 },
    );
    // The default example: the top class gets less than half, and dividing the scores by their total would say 0.5.
    const frames = trace({ story: 'bars', logits: [...DEFAULT_LOGITS], t: 1 });
    expect(frames[1].checkpoint!.choices).toEqual(['0.25', '0.486', '0.5', '0.947']);
    expect(frames[2].note).toContain('2 ÷ 4 = 0.5');
  });

  it('the regions', { timeout: LONG_MS }, () => {
    fc.assert(
      fc.property(regionsArb, (input) => {
        const frames = trace(input);
        const W = train(input.seed).models[STEPS];
        expect(answer(frames, 0)).toBe('1.099');
        expect(frames[0].checkpoint!.choices).toEqual(['0', '0.333', '0.693', '1.099']);
        expect(readout(frames[1].state, 'loss')).toBe(answer(frames, 0));
        expect(answer(frames, 1)).toBe(SHAPE_CHOICES[0]);
        expect(frames[2].note).toContain('a straight line');
        expect(answer(frames, 2)).toBe(MEET_CHOICES[0]);
        for (const k of [0, 1, 2]) expect(readout(frames[3].state, `m${k}`)).toBe('0.333');
        expect(answer(frames, 3)).toBe(DOUBLE_CHOICES[0]);
        const heat = (i: number) => planeOf(frames[i].state).shapes.find((s): s is HeatmapShape => s.kind === 'heatmap')!.values;
        expect(heat(4)).toEqual(heat(2));
        const pq = probsAt(W, ...input.q);
        const k = argmax(pq);
        expect(Number(readout(frames[4].state, 'after'))).toBeGreaterThanOrEqual(Number(readout(frames[4].state, 'before')));
        expect(readout(frames[4].state, 'before')).toBe(p3(pq[k]));
        // No regions before training, and the query is drawn where the input puts it.
        for (const i of [0, 1]) expect(planeOf(frames[i].state).shapes.some((s) => s.kind === 'heatmap')).toBe(false);
        const q = planeOf(frames[0].state).shapes.find((s) => s.id === 'query');
        expect(q?.kind === 'point' && q.at).toEqual(input.q);
        // The heatmap is the model's argmax over the data box.
        const cell = heat(2)[0];
        expect(cell).toBe(classAt(W, DATA_BOX.x.min + 0.1, DATA_BOX.y.max - 0.1));
      }),
      { numRuns: 25 },
    );
  });

  it('the overflow', () => {
    fc.assert(
      fc.property(overflowArb, ({ big }) => {
        const frames = trace({ story: 'overflow', big });
        expect(answer(frames, 0)).toBe('∞');
        expect(frames[0].checkpoint!.choices).toEqual(expChoices(big));
        expect(readout(frames[1].state, 'e^z0')).toBe('∞');
        expect(answer(frames, 1)).toBe('NaN');
        expect(readout(frames[2].state, 'p0')).toBe('NaN');
        expect(answer(frames, 2)).toBe(SHIFT_CHOICES[0]);
        softmaxOf([2, 1, 0]).forEach((v, i) => expect(readout(frames[3].state, `p${i}`)).toBe(p3(v)));
        expect(answer(frames, 3)).toBe('0');
        expect(frames[3].checkpoint!.choices).toEqual(underChoices(big));
        expect(readout(frames[4].state, 'e^z0')).toBe('0');
        expect(answer(frames, 4)).toBe(LN0_CHOICES[0]);
        expect(readout(frames[5].state, 'fromp')).toBe('∞');
        const l = loss32(lossScores(big), 2);
        expect(answer(frames, 5)).toBe(p3(l.lse));
        expect(readout(frames[6].state, 'lse')).toBe(answer(frames, 5));
        expect(answer(frames, 5)).toBe('120.313');
      }),
      { numRuns: 40 },
    );
    expect(DIVIDE_CHOICES).toContain('NaN');
  });
});

describe('no frame, label or caption gives an answer away', () => {
  /** Word answers, and the phrases that would state them. */
  const PHRASES: Record<string, string[]> = {
    [ADD_CHOICES[0]]: ['the same', 'cancel', 'changes nothing', 'only sees the gaps', 'stay put'],
    [HUGE_CHOICES[0]]: ['equal shares', '1/4', 'flatten'],
    [SHAPE_CHOICES[0]]: ['straight', 'a line'],
    [MEET_CHOICES[0]]: ['1/3', 'one third', 'equal'],
    [DOUBLE_CHOICES[0]]: ['same regions', 'no boundary moves', 'keep their order', 'T = 1/2'],
    [SHIFT_CHOICES[0]]: ['the same', 'cancel', 'shifting'],
    [LN0_CHOICES[0]]: ['∞', 'infinite', 'ln 0'],
    '∞': ['∞', 'infinity', 'overflow'],
    NaN: ['nan', 'not a number'],
    '0': ['underflow', 'rounds to 0'],
  };
  const phrasesFor = (answer: string) => (answer in PHRASES ? PHRASES[answer] : /stays on top/.test(answer) ? ['bigger share', 'sharpen', 'stays on top', 'up from'] : (CLASSES as readonly string[]).includes(answer) ? ['leads', 'the most', 'biggest share'] : null);
  const planeLabels = (f: Frame<PlotState>) => f.state.parts.map((p) => ('label' in p ? p.label : ''));
  const labelShapes = (f: Frame<PlotState>) => f.state.parts.flatMap((p) => (p.kind === 'plane' ? p.shapes.flatMap((s) => (s.kind === 'label' ? [s.text] : [])) : []));

  it('in its note, readouts, labels or plane captions', () => {
    fc.assert(
      fc.property(anyInput, (input) => {
        for (const f of trace(input)) {
          const c = f.checkpoint;
          if (!c) continue;
          const right = said(c);
          const readoutText = f.state.parts.flatMap((p) => (p.kind === 'readouts' ? p.items.map((r) => `${r.label} ${r.value}`) : []));
          const shown = [f.note, ...readoutText, ...planeLabels(f), ...labelShapes(f)].join(' \n ');
          const where = `${formatSoftmax(input)}: "${c.question}" (${right})`;
          const phrases = phrasesFor(right);
          if (phrases) for (const ph of phrases) expect(mentions(shown, ph), `${where} says "${ph}"`).toBe(false);
          else {
            // A number: neither the note nor a probability readout says it. A single digit (a share
            // that rounds to 1, the 9 weights) turns up in any formula, so only the readouts are checked for it.
            if ((right.match(/\d/g) ?? []).length >= 2) expect(mentions(f.note, right), where).toBe(false);
            const probs = f.state.parts.flatMap((p) => (p.kind === 'readouts' ? p.items.filter((r) => /^(p\d|two|sig|lse|after)$/.test(r.id)).map((r) => r.value) : []));
            expect(probs, where).not.toContain(right);
          }
        }
      }),
      { numRuns: 80 },
    );
  });

  it('in an example label, a legend row, or the idea under the title', () => {
    const checkpoints = softmax.input.examples.flatMap((ex) => [0, 1, 2].flatMap((seed) => trace(ex.make({ seed, size: 0 }) as SoftmaxInput).flatMap((f) => (f.checkpoint ? [f.checkpoint] : []))));
    const legend = softmax.legend.map((row) => (typeof row === 'string' ? row : 'label' in row ? row.label : row.neutral));
    const texts = [...softmax.input.examples.map((ex) => ex.label), ...legend, softmax.content.idea];
    for (const text of texts)
      for (const c of checkpoints) {
        const right = said(c);
        expect(statesAnswer(text, c), `"${text}" answers "${c.question}"`).toBe(false);
        for (const ph of phrasesFor(right) ?? []) expect(mentions(text, ph), `"${text}" says "${ph}" (${c.question})`).toBe(false);
      }
  });
});
