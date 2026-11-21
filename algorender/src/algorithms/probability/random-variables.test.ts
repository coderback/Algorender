// Property tests for random variables, expectation and variance (B5 of the
// math and ML path): the distributions count the right outcomes, E[X] is the
// balance point and Var(X) the weighted squared spread, against plain
// reference sums; expectations add and independent variances add; the
// binomial's paths, bars and simulation agree with n·p and n·p·(1 − p); and
// every question is answered by the frame after it, never by its own.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Frame } from '@/engine/types';
import { numbersIn } from '@/viz/plot/frame';
import { fmt } from '@/viz/plot/geometry';
import { expectGoodPlotTrace, planeOf, readout, traceOf } from '@/viz/plot/testing';
import type { PlotState, Shape, Vec } from '@/viz/plot/types';
import {
  binomialPmf,
  choose,
  countSlips,
  distributionOf,
  dragRv,
  expectation,
  FAIR,
  formatRv,
  LIMITS,
  meanAbsGap,
  parseRv,
  power,
  probsOf,
  randomVariables,
  sampleStats,
  SIM_RUNS,
  simulateBinomial,
  sumWeights,
  total,
  valuesOf,
  variance,
  type RvInput,
} from './random-variables';

const trace = (input: RvInput) => traceOf(randomVariables, input).frames;
const good = (frames: readonly Frame<PlotState>[]) => expectGoodPlotTrace(randomVariables, frames);
const f3 = (v: number) => fmt(v, 3);
const close = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(b));

function roundTrips(input: RvInput) {
  const custom = randomVariables.input.custom!;
  const text = custom.format(input as never);
  expect(custom.parse(text), text).toEqual({ value: input });
}

/** How many frames each story makes: fixed by the shape of its input, never by the values a drag changes. */
function frameCount(input: RvInput): number {
  if (input.story === 'rule') return distributionOf(input.rule).length + 2;
  if (input.story === 'balance') return input.counts.length + 3;
  if (input.story === 'spread') return input.a.length + 2;
  if (input.story === 'sum') return 4;
  return input.n + 7;
}

const tickets = (k: number) =>
  fc.array(fc.integer({ min: LIMITS.tickets[0], max: LIMITS.tickets[1] }), { minLength: k, maxLength: k }).filter((c) => total(c) > 0);
const anyInput: fc.Arbitrary<RvInput> = fc.oneof(
  fc.constantFrom<RvInput>({ story: 'rule', rule: 'sum' }, { story: 'rule', rule: 'max' }),
  fc.integer({ min: LIMITS.kinds[0], max: LIMITS.kinds[1] }).chain((k) => tickets(k).map((counts): RvInput => ({ story: 'balance', counts }))),
  fc.integer({ min: LIMITS.kinds[0], max: LIMITS.kinds[1] }).chain((k) => fc.tuple(tickets(k), tickets(k)).map(([a, b]): RvInput => ({ story: 'spread', a, b }))),
  fc
    .array(fc.integer({ min: LIMITS.weights[0], max: LIMITS.weights[1] }), { minLength: 6, maxLength: 6 })
    .filter((x) => total(x) > 0)
    .map((x): RvInput => ({ story: 'sum', x })),
  fc.record({ n: fc.integer({ min: LIMITS.n[0], max: LIMITS.n[1] }), p10: fc.integer({ min: 1, max: 9 }), seed: fc.integer({ min: 0, max: 999_999 }) }).map(({ n, p10, seed }): RvInput => ({ story: 'binomial', n, p: p10 / 10, seed })),
);

const examples = randomVariables.input.examples.map((ex) => ({ id: ex.id, input: ex.make({ seed: 7, size: 0 }) as RvInput }));

describe('random-variables', () => {
  it('plays every example, round-trips its text, and every drag keeps the frame count', () => {
    for (const { id, input } of examples) {
      const frames = trace(input);
      good(frames);
      roundTrips(input);
      expect(frames.length, id).toBe(frameCount(input));
      for (const f of frames)
        for (const part of f.state.parts) {
          if (part.kind !== 'plane') continue;
          for (const h of part.handles)
            for (const to of [[h.at[0] + h.step, h.at[1] + h.step], [h.at[0] - h.step, h.at[1] - h.step], h.min, h.max, [0, 0], [99, 99]] as Vec[]) {
              const moved = dragRv(input, h.id, to);
              const again = trace(moved);
              good(again);
              roundTrips(moved);
              expect(again.length, `${id} dragging ${h.id} to ${to}`).toBe(frames.length);
            }
        }
    }
  });

  it('plays any input in bounds, with handles on the shapes they move', () => {
    fc.assert(
      fc.property(anyInput, (input) => {
        const frames = trace(input);
        good(frames);
        roundTrips(input);
        expect(frames.length).toBe(frameCount(input));
        expect(frames.filter((f) => f.checkpoint).length).toBeGreaterThanOrEqual(3);
        for (const f of frames)
          for (const part of f.state.parts) {
            if (part.kind !== 'plane') continue;
            const bars = part.shapes.flatMap((s) => (s.kind === 'bars' ? s.bars : []));
            for (const h of part.handles) {
              if (h.id === 'p') {
                // The binomial's handle is the balance line through n·p.
                if (input.story !== 'binomial') throw new Error('p handle outside the binomial');
                const line = part.shapes.find((s) => s.id === 'mean');
                expect(line?.kind === 'line' && close(line.through[0], input.n * input.p, 1e-6)).toBe(true);
                expect(h.at[0]).toBeCloseTo(input.n * input.p, 9);
                continue;
              }
              // A bar's handle sits on the top of that bar, at the input's own count.
              const b = bars.find((x) => x.x0 < h.at[0] && x.x1 > h.at[0]);
              expect(b?.y, `${h.id} in ${part.id}`).toBe(h.at[1]);
              const i = Number(h.id.slice(1)) - 1;
              const own = input.story === 'balance' ? input.counts : input.story === 'spread' ? input[h.id[0] as 'a' | 'b'] : input.story === 'sum' ? input.x : [];
              expect(h.at[1]).toBe(own[i]);
            }
          }
      }),
      { numRuns: 120 },
    );
  });

  it('refuses inputs outside the stories, and drags that would empty a bag', () => {
    for (const text of ['rule min', 'balance 1 2', 'balance 1 2 3 4 5 6 7', 'balance 0 0 0', 'balance 1 9 1', 'balance 1 2.5 1', 'spread 1 2 3', 'spread 1 2 3 | 1 2', 'sum 1 1 1 1 1', 'sum 0 0 0 0 0 0', 'sum 7 1 1 1 1 1', 'binomial 1 0.5', 'binomial 9 0.5', 'binomial 6 0.35', 'binomial 6 1', 'binomial 6 0.5 seed 1.5', 'coins 6'])
      expect(parseRv(text), text).toHaveProperty('error');
    expect(parseRv('binomial 6 0.5')).toEqual({ value: { story: 'binomial', n: 6, p: 0.5, seed: 7 } });
    const bag: RvInput = { story: 'balance', counts: [0, 3, 0] };
    expect(dragRv(bag, 't2', [2, 0])).toBe(bag);
    expect(dragRv(bag, 't2', [2, 1])).toEqual({ story: 'balance', counts: [0, 1, 0] });
    expect(dragRv({ story: 'binomial', n: 6, p: 0.5, seed: 1 }, 'p', [0, 0])).toEqual({ story: 'binomial', n: 6, p: 0.1, seed: 1 });
    expect(dragRv({ story: 'binomial', n: 6, p: 0.5, seed: 1 }, 'p', [4.3, 0])).toEqual({ story: 'binomial', n: 6, p: 0.7, seed: 1 });
    expect(formatRv({ story: 'spread', a: [1, 2, 1], b: [2, 0, 2] })).toBe('spread 1 2 1 | 2 0 2');
  });

  it('E[X] and Var(X) match plain sums, the gaps cancel, and Var = E[X²] − E[X]²', () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(fc.integer({ min: -20, max: 20 }), fc.integer({ min: 0, max: 9 })), { minLength: 1, maxLength: 8 }).filter((xs) => xs.some(([, c]) => c > 0)), (pairs) => {
        const values = pairs.map(([x]) => x);
        const probs = probsOf(pairs.map(([, c]) => c));
        // The long way round: a list of tickets, each value repeated by its count.
        const list = pairs.flatMap(([x, c]) => Array(c).fill(x) as number[]);
        const mean = list.reduce((s, x) => s + x, 0) / list.length;
        const spread = list.reduce((s, x) => s + (x - mean) ** 2, 0) / list.length;
        expect(expectation(values, probs)).toBeCloseTo(mean, 9);
        expect(variance(values, probs)).toBeCloseTo(spread, 9);
        expect(variance(values, probs)).toBeCloseTo(expectation(values.map((x) => x * x), probs) - mean * mean, 7);
        expect(expectation(values.map((x) => x - mean), probs)).toBeCloseTo(0, 9);
        expect(meanAbsGap(values, probs)).toBeCloseTo(list.reduce((s, x) => s + Math.abs(x - mean), 0) / list.length, 9);
        // Shifting moves the mean and leaves the spread; scaling by 2 doubles one and quadruples the other.
        expect(expectation(values.map((x) => 2 * x + 3), probs)).toBeCloseTo(2 * mean + 3, 9);
        expect(variance(values.map((x) => x + 3), probs)).toBeCloseTo(spread, 7);
        expect(variance(values.map((x) => 2 * x), probs)).toBeCloseTo(4 * spread, 7);
      }),
      { numRuns: 200 },
    );
  });

  it('counts the outcomes of two dice', () => {
    const sum = distributionOf('sum');
    const max = distributionOf('max');
    expect(sum.map((d) => d.x)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(sum.map((d) => d.count)).toEqual(sum.map((d) => 6 - Math.abs(d.x - 7)));
    expect(max.map((d) => d.count)).toEqual([1, 3, 5, 7, 9, 11]);
    for (const dist of [sum, max]) expect(total(dist.map((d) => d.count))).toBe(36);
    // The slips are real alternatives, never the answer itself where they differ from it in kind.
    expect(countSlips('sum', 8)).toEqual([3, 6, 7, 6]);
    expect(countSlips('max', 3)).toEqual([3, 6, 9, 3]);
  });

  it('expectations of X + Y add for any loading, and variances add since the dice are independent', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 6 }), { minLength: 6, maxLength: 6 }).filter((x) => total(x) > 0), fc.array(fc.integer({ min: 0, max: 6 }), { minLength: 6, maxLength: 6 }).filter((x) => total(x) > 0), (x, y) => {
        const faces = [1, 2, 3, 4, 5, 6];
        const sw = sumWeights(x, y);
        expect(total(sw)).toBe(total(x) * total(y));
        const sums = sw.map((_, i) => i + 2);
        const ps = probsOf(sw);
        expect(expectation(sums, ps)).toBeCloseTo(expectation(faces, probsOf(x)) + expectation(faces, probsOf(y)), 9);
        expect(variance(sums, ps)).toBeCloseTo(variance(faces, probsOf(x)) + variance(faces, probsOf(y)), 8);
      }),
      { numRuns: 150 },
    );
    expect(variance([1, 2, 3, 4, 5, 6], probsOf(FAIR))).toBeCloseTo(35 / 12, 12);
  });

  it('builds the binomial from paths: Pascal’s rule, bars adding to 1, mean n·p and variance n·p·(1 − p)', () => {
    for (let n = 0; n <= 8; n++)
      for (let k = 0; k <= n; k++) {
        if (n > 0) expect(choose(n, k)).toBe(choose(n - 1, k) + choose(n - 1, k - 1));
        expect(Number.isInteger(choose(n, k))).toBe(true);
      }
    expect(choose(6, 3)).toBe(20);
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 8 }), fc.integer({ min: 1, max: 9 }), (n, p10) => {
        const p = p10 / 10;
        const pmf = binomialPmf(n, p);
        const ks = pmf.map((_, k) => k);
        expect(total(pmf)).toBeCloseTo(1, 12);
        expect(expectation(ks, pmf)).toBeCloseTo(n * p, 12);
        expect(variance(ks, pmf)).toBeCloseTo(n * p * (1 - p), 12);
        // Each bar is C(n, k) paths of probability pᵏ(1 − p)ⁿ⁻ᵏ.
        ks.forEach((k) => expect(pmf[k]).toBeCloseTo(choose(n, k) * p ** k * (1 - p) ** (n - k), 14));
        expect(power(p, 3)).toBeCloseTo(p ** 3, 15);
      }),
      { numRuns: 60 },
    );
  });

  it('simulates the same runs from the same seed, and their average settles near n·p', () => {
    expect(simulateBinomial(6, 0.5, 50, 3)).toEqual(simulateBinomial(6, 0.5, 50, 3));
    expect(simulateBinomial(6, 0.5, 50, 3)).not.toEqual(simulateBinomial(6, 0.5, 50, 4));
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 8 }), fc.integer({ min: 1, max: 9 }), fc.integer({ min: 0, max: 999_999 }), (n, p10, seed) => {
        const p = p10 / 10;
        const runs = simulateBinomial(n, p, 1000, seed);
        expect(runs.every((k) => Number.isInteger(k) && k >= 0 && k <= n)).toBe(true);
        const { mean, variance: v } = sampleStats(runs);
        // Five standard errors either way.
        expect(Math.abs(mean - n * p)).toBeLessThan(5 * Math.sqrt((n * p * (1 - p)) / 1000));
        expect(Math.abs(v - n * p * (1 - p))).toBeLessThan(0.25 * n * p * (1 - p) + 0.05);
      }),
      { numRuns: 80 },
    );
  });

  it('answers each question in the frame after it', () => {
    const check = (input: RvInput) => {
      const frames = trace(input);
      const next = (i: number) => frames[i + 1].state;
      frames.forEach((f, i) => {
        const c = f.checkpoint;
        if (!c) return;
        const said = c.choices[c.answer];
        const q = c.question;
        if (input.story === 'rule') {
          const dist = distributionOf(input.rule);
          if (q.startsWith('How many')) {
            const v = numbersIn(q).at(-1)!;
            const b = planeOf(next(i)).shapes.flatMap((s) => (s.kind === 'bars' ? s.bars : [])).find((x) => x.id === `b${v}`);
            expect(b?.label).toBe(`${said}/36`);
            expect(b?.mark).toBe('key');
          } else {
            expect(said).toBe('1');
            expect(total(dist.map((d) => d.count))).toBe(36);
          }
        } else if (input.story === 'balance') {
          const ps = probsOf(input.counts);
          const xs = valuesOf(input.counts);
          if (q.includes('total') || q.includes('Start a total')) expect(readout(next(i), 'sum')).toBe(said);
          else if (q.startsWith('Weight each gap')) {
            expect(said).toBe('0');
            expect(readout(next(i), 'left')).toBe(readout(next(i), 'right'));
            expect(c.choices).toContain(f3(meanAbsGap(xs, ps)));
          } else expect(readout(next(i), 'mean')).toBe(said);
        } else if (input.story === 'spread') {
          if (q.startsWith('What is the next term')) expect(readout(next(i), 'term')).toBe(said);
          else {
            const [va, vb] = [Number(readout(next(i), 'varA')), Number(readout(next(i), 'varB'))];
            const xs = valuesOf(input.a);
            const [ea, eb] = [variance(xs, probsOf(input.a)), variance(xs, probsOf(input.b))];
            expect(said).toBe(close(ea, eb) ? 'Neither: the same spread' : ea > eb ? 'Bag A' : 'Bag B');
            if (Math.abs(va - vb) > 0.002) expect(said).toBe(va > vb ? 'Bag A' : 'Bag B');
          }
        } else if (input.story === 'sum') {
          if (q.startsWith('What is E[X + Y]')) expect(readout(next(i), 'es')).toBe(said);
          else if (q.includes('Var(X + Y)?')) expect(readout(next(i), 'vs')).toBe(said);
          else {
            const [v2, vs] = [Number(readout(next(i), 'v2')), Number(readout(next(i), 'vs'))];
            if (Math.abs(v2 - vs) > 0.002) expect(said).toBe(v2 > vs ? '2X' : 'X + Y');
          }
        } else {
          const { n, p } = input;
          if (q.startsWith('How many paths')) {
            const [h, flip] = numbersIn(q);
            const node = planeOf(next(i), 'paths').shapes.find((s) => s.id === `n${flip}-${h}`);
            expect(node?.kind === 'point' && node.label).toBe(said);
            expect(said).toBe(String(choose(flip, h)));
          } else if (q.includes('What is P(K')) {
            const k = numbersIn(q.slice(q.indexOf('P(K'))).at(0)!;
            const b = planeOf(next(i), 'bars').shapes.flatMap((s) => (s.kind === 'bars' ? s.bars : [])).find((x) => x.id === `k${k}`);
            expect(b?.label).toBe(said);
          } else if (q.includes('E[K]')) expect(readout(next(i), 'mean')).toBe(said);
          else if (q.includes('Var(K)')) expect(readout(next(i), 'var')).toBe(said);
          else {
            // The simulated average after 1000 runs is closest to the answer of all the choices.
            const avg = Number(readout(next(i), 'avg'));
            const dist = (s: string) => Math.abs(Number(s) - avg);
            for (const other of c.choices) if (other !== said) expect(dist(said)).toBeLessThan(dist(other));
            expect(said).toBe(fmt(n * p));
          }
        }
      });
    };
    for (const { input } of examples) check(input);
    fc.assert(fc.property(anyInput, check), { numRuns: 150 });
  });

  it('never gives a question’s answer away in its own frame', () => {
    const PHRASES: Record<string, string[]> = {
      'Bag A': ['a spreads more', 'bag a spreads'],
      'Bag B': ['b spreads more', 'bag b spreads'],
      'Neither: the same spread': ['same spread'],
      '2X': ['2x spreads', 'var(2x)'],
      'X + Y': ['x + y spreads', 'var(2x)'],
      'The same spread': ['same spread', 'var(2x)'],
    };
    const check = (input: RvInput) => {
      const frames = trace(input);
      frames.forEach((f) => {
        const c = f.checkpoint;
        if (!c) return;
        const said = c.choices[c.answer];
        const shown = [f.note, ...f.state.parts.flatMap((p) => (p.kind === 'readouts' ? p.items.map((r) => `${r.label} ${r.value}`) : []))].join(' | ');
        const where = `${formatRv(input)}: "${c.question}" (${said}) in "${shown}"`;
        if (input.story === 'rule') {
          if (!c.question.startsWith('How many')) expect(shown.includes('36/36'), where).toBe(false);
          else for (const giveaway of [`${said}/36`, `${said} boxed`, `${said} of the 36`]) expect(shown.includes(giveaway), where).toBe(false);
        } else if (/^[−-]?\d/.test(said)) {
          // A number the frame names for another reason can't be told apart: the question's own numbers, the
          // counts and values, and what this frame works out (a value with no tickets adds nothing, so the next
          // total can be the one shown now; two values as far either side of μ can add the same term).
          const own = input.story === 'balance' ? input.counts : input.story === 'spread' ? [...input.a, ...input.b] : input.story === 'sum' ? input.x : [input.n, input.p];
          const worked = Object.values(f.vars).flatMap((v) => (typeof v === 'number' ? [v, Math.abs(v), v * v] : []));
          const known = [...numbersIn(c.question), ...own, ...own.map((_, i) => i + 1), total(own), ...worked];
          if (input.story === 'binomial' && c.question.startsWith('After')) return;
          const value = Number(said.replace('−', '-'));
          if (!known.some((k) => Math.abs(k - value) < 0.0015)) expect(numbersIn(shown), where).not.toContain(value);
          // Nor does the frame talk about the value it asks about.
          const asked = /x = (\d+)\?|P\((\d+)\) ×/.exec(c.question);
          if (asked) expect(f.note.includes(`x = ${asked[1] ?? asked[2]}:`) || f.note.includes(`x = ${asked[1] ?? asked[2]} is`), where).toBe(false);
        } else {
          expect(PHRASES[said], said).toBeDefined();
          for (const phrase of PHRASES[said]) expect(shown.toLowerCase().includes(phrase), `${where} says "${phrase}"`).toBe(false);
        }
      });
    };
    for (const { input } of examples) check(input);
    fc.assert(fc.property(anyInput, check), { numRuns: 150 });
  });

  it('writes only sums and products that check, digit for digit, in the two-dice notes', () => {
    const num = (s: string | undefined) => Number(s?.replace('−', '-'));
    const check = (x: number[]) => {
      const frames = trace({ story: 'sum', x });
      // A loaded die can put E[X] a hair below a half-thousandth while E[X + Y] lands a hair above it.
      expect(readout(frames[1].state, 'es')).toBe(f3(num(readout(frames[1].state, 'ex')) + num(readout(frames[1].state, 'ey'))));
      for (const f of frames) {
        const n = '(−?\\d+(?:\\.\\d+)?)';
        for (const m of f.note.matchAll(new RegExp(`${n} = ${n} \\+ ${n}`, 'g'))) expect(f3(num(m[2]) + num(m[3])), m[0]).toBe(f3(num(m[1])));
        for (const m of f.note.matchAll(new RegExp(`${n} × ${n} = ${n}`, 'g'))) expect(f3(num(m[1]) * num(m[2])), m[0]).toBe(f3(num(m[3])));
      }
    };
    check([...FAIR]);
    check([1, 0, 0, 0, 0, 1]);
    // The fair die: 2.917 + 2.917 is 5.834, so the note says the parts were rounded instead.
    expect(trace({ story: 'sum', x: [...FAIR] })[2].note).toContain('Var(X + Y) = 5.833, which is 2.917 + 2.917 before they were rounded');
    fc.assert(fc.property(fc.array(fc.integer({ min: 0, max: 6 }), { minLength: 6, maxLength: 6 }).filter((x) => total(x) > 0), check), { numRuns: 300 });
  });

  it('draws the dice story’s outcomes from the rule', () => {
    for (const rule of ['sum', 'max'] as const) {
      const frames = trace({ story: 'rule', rule });
      const table = frames[0].state.parts.find((p) => p.kind === 'image');
      if (table?.kind !== 'image') throw new Error('no outcome table');
      const f = rule === 'sum' ? (a: number, b: number) => a + b : Math.max;
      for (let b = 1; b <= 6; b++) for (let a = 1; a <= 6; a++) expect(table.values![(b - 1) * 6 + (a - 1)]).toBe(String(f(a, b)));
      // Each value frame boxes exactly the cells it counts.
      distributionOf(rule).forEach((d, i) => {
        const img = frames[i + 1].state.parts.find((p) => p.kind === 'image');
        if (img?.kind !== 'image') throw new Error('no outcome table');
        expect(img.boxes?.length).toBe(d.count);
      });
    }
  });

  it('draws the balance point and σ where the maths puts them', () => {
    for (const { input } of examples) {
      const frames = trace(input);
      const shapes = (i: number, plane = 'plane'): readonly Shape[] => planeOf(frames[i].state, plane).shapes;
      const lineAt = (s: readonly Shape[], id: string) => {
        const l = s.find((x) => x.id === id);
        if (l?.kind !== 'line') throw new Error(`no line ${id}`);
        return l.through[0];
      };
      if (input.story === 'balance') {
        const E = expectation(valuesOf(input.counts), probsOf(input.counts));
        expect(lineAt(shapes(input.counts.length + 1), 'mean')).toBeCloseTo(E, 4);
        expect(E).toBeCloseTo(2.2, 12);
      }
      if (input.story === 'spread') {
        const last = frames.length - 1;
        const sigma = shapes(last, 'a').find((s) => s.id === 'sigmaA');
        if (sigma?.kind !== 'path') throw new Error('no σ');
        const sA = Math.sqrt(variance(valuesOf(input.a), probsOf(input.a)));
        expect(sigma.points[1][0] - sigma.points[0][0]).toBeCloseTo(2 * sA, 3);
      }
      if (input.story === 'binomial') {
        expect(lineAt(shapes(input.n + 2, 'bars'), 'mean')).toBeCloseTo(input.n * input.p, 6);
        // Every simulation frame shows a prefix of the same seeded runs.
        const runs = simulateBinomial(input.n, input.p, 1000, input.seed);
        SIM_RUNS.forEach((R, s) => expect(readout(frames[input.n + 4 + s].state, 'avg')).toBe(fmt(sampleStats(runs.slice(0, R)).mean, 3)));
      }
    }
  });
});
