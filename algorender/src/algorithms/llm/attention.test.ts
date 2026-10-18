import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { expectGoodPlotTrace, planeOf, traceOf } from '@/viz/plot/testing';
import type { BarsShape, ImagePart, VectorShape } from '@/viz/plot/types';
import { allowedFor, attention, attentionRow, Q_MAX, queryOf, SENTENCES, type AttentionInput, type SentenceId } from './attention';
import { attendFromScratch, D, embed, kvCache, MAX_GENERATE, MIN_GENERATE, projections, sequenceOf, steps, type KvInput } from './kv-cache';
import { attend, softmax } from './vectors';

const tenth = fc.integer({ min: -Q_MAX * 10, max: Q_MAX * 10 }).map((k) => k / 10 + 0);
const attentionInput: fc.Arbitrary<AttentionInput> = fc
  .record({
    sentence: fc.constantFrom(...(Object.keys(SENTENCES) as SentenceId[])),
    focus: fc.integer({ min: 0, max: 6 }),
    q: fc.option(fc.tuple(tenth, tenth), { nil: null }),
    mask: fc.boolean(),
  })
  .map((x) => ({ ...x, focus: Math.min(x.focus, SENTENCES[x.sentence].length - 1) }));

const kvInput: fc.Arbitrary<KvInput> = fc.record({ text: fc.constantFrom('robot' as const, 'recipe' as const), generate: fc.integer({ min: MIN_GENERATE, max: MAX_GENERATE }) });

describe('attention', () => {
  it('plays every example as a good trace', () => {
    for (const ex of attention.input.examples) expectGoodPlotTrace(attention, traceOf(attention, ex.make({ seed: 1, size: 0 })).frames);
  });

  it('weights are softmax(q·k/√d) over the visible keys, add up to 1, and the output is Σ w·v', () => {
    fc.assert(
      fc.property(attentionInput, (input) => {
        const words = SENTENCES[input.sentence];
        for (let i = 0; i < words.length; i++) {
          const r = attentionRow(input, i);
          const q = queryOf(input, i);
          const allowed = allowedFor(input, i);
          const e = words.map((w, j) => (allowed[j] ? Math.exp((q[0] * w.k[0] + q[1] * w.k[1]) / Math.sqrt(2)) : 0));
          const total = e.reduce((s, x) => s + x, 0);
          r.weights.forEach((w, j) => expect(w).toBeCloseTo(e[j] / total, 12));
          expect(r.weights.reduce((s, w) => s + w, 0)).toBeCloseTo(1, 12);
          if (input.mask) r.weights.forEach((w, j) => j > i && expect(w).toBe(0));
          const out = [0, 1].map((k) => words.reduce((s, w, j) => s + r.weights[j] * w.v[k], 0));
          expect(r.output[0]).toBeCloseTo(out[0], 12);
          expect(r.output[1]).toBeCloseTo(out[1], 12);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('draws the scores, weights and output it narrates, on any input', () => {
    fc.assert(
      fc.property(attentionInput, (input) => {
        const frames = traceOf(attention, input).frames;
        expectGoodPlotTrace(attention, frames);
        const row = attentionRow(input, input.focus);
        const weights = frames.flatMap((f) => f.state.parts).find((p) => p.kind === 'plane' && p.id === 'weights');
        expect(weights).toBeDefined();
        const bars = (weights as { shapes: readonly BarsShape[] }).shapes[0].bars;
        bars.forEach((b, j) => expect(b.y).toBeCloseTo(row.weights[j], 3));
        const last = frames.find((f) => f.state.parts.some((p) => p.kind === 'plane' && p.id === 'values' && p.shapes.some((s) => s.id === 'out')))!;
        const out = planeOf(last.state, 'values').shapes.find((s) => s.id === 'out') as VectorShape;
        expect(out.to[0]).toBeCloseTo(row.output[0], 2);
        expect(out.to[1]).toBeCloseTo(row.output[1], 2);
        // The q handle sits on the q arrow, at the input's own query.
        const keys = planeOf(frames[0].state, 'keys');
        expect(keys.handles[0].at).toEqual(queryOf(input, input.focus));
        expect((keys.shapes.find((s) => s.id === 'q') as VectorShape).to).toEqual(keys.handles[0].at);
      }),
      { numRuns: 60 },
    );
  });

  it('round-trips dragged and custom input through the text box', () => {
    const custom = attention.input.custom!;
    fc.assert(
      fc.property(attentionInput, tenth, tenth, (input, x, y) => {
        const dragged = attention.input.drag!(input, 'q', [x, y]);
        expect(dragged.q).toEqual([x, y]);
        for (const value of [input, dragged]) {
          const parsed = custom.parse(custom.format(value));
          expect(parsed).toEqual({ value });
        }
      }),
    );
    expect(custom.parse('pronoun, query = 9')).toHaveProperty('error');
    expect(custom.parse('pronoun, query = 2, q = (3, 0)')).toHaveProperty('error');
    expect(custom.parse('nonsense')).toHaveProperty('error');
  });

  it('“it” attends most to “cat”, and the mask stops “cat” reading its verb', () => {
    const pronoun = attention.input.examples[0].make({ seed: 0, size: 0 });
    const r = attentionRow(pronoun, 4);
    expect(r.weights.indexOf(Math.max(...r.weights))).toBe(1);
    const open = attentionRow({ ...pronoun, focus: 1 }, 1);
    const masked = attentionRow({ ...pronoun, focus: 1, mask: true }, 1);
    expect(open.weights.indexOf(Math.max(...open.weights))).toBe(2);
    expect(masked.weights.indexOf(Math.max(...masked.weights))).toBe(1);
  });

  it('softmax is shift-invariant and gives masked entries exactly 0', () => {
    fc.assert(
      fc.property(fc.array(fc.double({ min: -20, max: 20, noNaN: true }), { minLength: 1, maxLength: 8 }), fc.double({ min: -50, max: 50, noNaN: true }), (xs, c) => {
        const a = softmax(xs);
        const b = softmax(xs.map((x) => x + c));
        a.forEach((w, i) => expect(w).toBeCloseTo(b[i], 9));
        const allowed = xs.map((_, i) => i % 2 === 0);
        softmax(xs, allowed).forEach((w, i) => !allowed[i] && expect(w).toBe(0));
      }),
    );
  });
});

describe('kv-cache', () => {
  it('plays every example as a good trace', () => {
    for (const ex of kvCache.input.examples) {
      for (const size of [MIN_GENERATE, 6, MAX_GENERATE]) expectGoodPlotTrace(kvCache, traceOf(kvCache, ex.make({ seed: 0, size })).frames);
    }
  });

  it('attending over the cache gives exactly what recomputing everything gives, at every step', () => {
    fc.assert(
      fc.property(kvInput, (input) => {
        const { all } = sequenceOf(input);
        const cache = { k: [] as number[][], v: [] as number[][] };
        for (const s of steps(input)) {
          // Rows not yet cached are computed once and appended; earlier rows are never touched again.
          while (cache.k.length < s.length) {
            const i = cache.k.length;
            const p = projections(embed(all[i], i));
            cache.k.push(p.k);
            cache.v.push(p.v);
          }
          const last = s.length - 1;
          const cached = attend(projections(embed(all[last], last)).q, cache.k, cache.v);
          const fresh = attendFromScratch(all, last);
          expect(cached.output).toEqual(fresh.output);
          expect(cached.weights).toEqual(fresh.weights);
        }
      }),
    );
  });

  it('counts projections by the formulas and draws K and V a row per cached token', () => {
    fc.assert(
      fc.property(kvInput, (input) => {
        const { prompt, generated } = sequenceOf(input);
        const p = prompt.length;
        const G = generated.length;
        const frames = traceOf(kvCache, input).frames;
        const end = frames.at(-1)!.stats;
        // Without a cache: p + (p + 1) + … + (p + G − 1). With one: the prefill, then one row per step.
        expect(end.withoutCache).toBe((G * (2 * p + G - 1)) / 2);
        expect(end.withCache).toBe(p + G - 1);
        const last = steps(input).at(-1)!;
        expect(last.length).toBe(p + G - 1);
        for (const f of frames) {
          for (const part of f.state.parts) {
            if (part.kind !== 'image') continue;
            const img = part as ImagePart;
            expect(img.width).toBe(D);
            expect(img.pixels.every((x) => Math.abs(x) <= 1 + 1e-9)).toBe(true);
          }
        }
        expect(frames.length).toBe(3 * G + 1 + 1);
      }),
    );
  });

  it('round-trips custom input', () => {
    const custom = kvCache.input.custom!;
    fc.assert(
      fc.property(kvInput, (input) => {
        expect(custom.parse(custom.format(input))).toEqual({ value: input });
      }),
    );
    expect(custom.parse('robot, generate = 12')).toHaveProperty('error');
  });
});

describe('pseudo-code', () => {
  it('fits the code panel', () => {
    for (const m of [attention, kvCache]) for (const line of m.pseudocode) expect(line.length).toBeLessThanOrEqual(42);
  });
});
