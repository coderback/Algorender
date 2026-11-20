// Property tests for derivative rules (B4 of the math and ML path): every
// rule agrees with a measured central difference, a product grows by two
// strips and a corner that vanishes like h², and the floating-point story's
// errors are what the formulas give, with its best-h claims holding.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { fmt } from '@/viz/plot/geometry';
import { expectGoodPlotTrace, planeOf, readout, traceOf } from '@/viz/plot/testing';
import type { Vec } from '@/viz/plot/types';
import {
  bestH,
  centralDiff,
  cube,
  cubeSlope,
  derivativeRules,
  dragRules,
  ERROR_FLOOR,
  errorTable,
  forwardDiff,
  GALLERY,
  GALLERY_DEFAULTS,
  GALLERY_FNS,
  logError,
  parseRules,
  product,
  productDf,
  productDg,
  productF,
  productG,
  productRule,
  productStrips,
  wrongGuess,
  type GalleryFn,
  type GalleryPoints,
  type RulesInput,
} from './derivative-rules';

const FRAMES = { product: 8, gallery: 3 * GALLERY_FNS.length + 1, numeric: 17 } as const;

function roundTrips(input: RulesInput) {
  const custom = derivativeRules.input.custom!;
  const text = custom.format(input as never);
  expect(custom.parse(text), text).toEqual({ value: input });
}

const framesOf = (input: RulesInput) => traceOf(derivativeRules, input).frames;
const answerOf = (frame: { checkpoint?: { choices: readonly string[]; answer: number } }) => (frame.checkpoint ? frame.checkpoint.choices[frame.checkpoint.answer] : undefined);
const close = (a: number, b: number, eps: number) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(b));

const onGrid = (lo: number, hi: number, step: number) => fc.integer({ min: Math.round(lo / step), max: Math.round(hi / step) }).map((k) => Math.round(k * step * 1e6) / 1e6);
const halves = onGrid(0.5, 2, 0.5);
const galleryPoints: fc.Arbitrary<GalleryPoints> = fc.record(
  Object.fromEntries(GALLERY_FNS.map((fn) => [fn, onGrid(GALLERY[fn].range[0], GALLERY[fn].range[1], GALLERY[fn].step)])) as Record<GalleryFn, fc.Arbitrary<number>>,
);

describe('derivative-rules', () => {
  it('plays every example, round-trips its text, and every drag keeps the frame count', () => {
    for (const ex of derivativeRules.input.examples) {
      const input = ex.make({ seed: 0, size: 0 }) as RulesInput;
      const frames = framesOf(input);
      expectGoodPlotTrace(derivativeRules, frames, { handlesOnStep: false });
      expect(frames.length, ex.id).toBe(FRAMES[input.story]);
      roundTrips(input);
      const handles = new Map<string, { at: Vec; step: number; min: Vec; max: Vec }>();
      for (const f of frames) for (const part of f.state.parts) if (part.kind === 'plane') for (const h of part.handles) if (!handles.has(h.id)) handles.set(h.id, h);
      expect(handles.size, ex.id).toBe(input.story === 'gallery' ? GALLERY_FNS.length : 1);
      for (const [id, h] of handles) {
        for (const to of [
          [h.at[0] + h.step, h.at[1] - h.step],
          [h.min[0], h.max[1]],
          [h.max[0], h.min[1]],
          [0, 0],
        ] as Vec[]) {
          const moved = derivativeRules.input.drag!(input as never, id, to) as RulesInput;
          const again = framesOf(moved);
          expectGoodPlotTrace(derivativeRules, again, { handlesOnStep: false });
          roundTrips(moved);
          expect(again.length, `${ex.id} dragging ${id}`).toBe(frames.length);
        }
      }
    }
  });

  it('keeps every handle on its curve and on its step along x', () => {
    for (const ex of derivativeRules.input.examples) {
      const input = ex.make({ seed: 0, size: 0 }) as RulesInput;
      for (const f of framesOf(input))
        for (const part of f.state.parts) {
          if (part.kind !== 'plane') continue;
          for (const h of part.handles) {
            expect(Math.abs(h.at[0] / h.step - Math.round(h.at[0] / h.step))).toBeLessThan(1e-9);
            const P = part.shapes.find((s) => s.id === 'P');
            expect(P?.kind === 'point' && P.at[0] === h.at[0] && P.at[1] === h.at[1]).toBe(true);
          }
        }
    }
  });

  it('refuses inputs off the grid, and drags snap and clamp', () => {
    expect(parseRules('product at 3')).toHaveProperty('error');
    expect(parseRules('numeric at 0.7')).toHaveProperty('error');
    expect(parseRules('gallery ln 0')).toHaveProperty('error');
    expect(parseRules('gallery sigmoid 0.3')).toHaveProperty('error');
    expect(parseRules('gallery cosine 1')).toHaveProperty('error');
    expect(parseRules('gallery sigmoid 0, nonsense')).toHaveProperty('error');
    expect(parseRules('hello')).toHaveProperty('error');
    expect(parseRules('gallery relu −1.5')).toEqual({ value: { story: 'gallery', at: { ...GALLERY_DEFAULTS, relu: -1.5 } } });
    expect(parseRules('Product 1.5')).toEqual({ value: { story: 'product', a: 1.5 } });
    expect(dragRules({ story: 'product', a: 2 }, 'a', [0.8, 99])).toEqual({ story: 'product', a: 1 });
    expect(dragRules({ story: 'numeric', a: 1 }, 'a', [-5, 0])).toEqual({ story: 'numeric', a: 0.5 });
    const g: RulesInput = { story: 'gallery', at: GALLERY_DEFAULTS };
    expect(dragRules(g, 'ln', [-3, 0])).toEqual({ story: 'gallery', at: { ...GALLERY_DEFAULTS, ln: 0.25 } });
    expect(dragRules(g, 'sigmoid', [2.3, 0])).toEqual({ story: 'gallery', at: { ...GALLERY_DEFAULTS, sigmoid: 2.5 } });
    expect(dragRules(g, 'nope', [1, 1])).toBe(g);
  });

  it('every rule matches a central difference at random points away from corners', () => {
    fc.assert(
      fc.property(fc.constantFrom(...GALLERY_FNS), fc.double({ min: 0, max: 1, noNaN: true }), (fn, t) => {
        const s = GALLERY[fn];
        const lo = fn === 'ln' ? 0.2 : s.range[0];
        const x = lo + t * (s.range[1] - lo);
        if (fn === 'relu' && Math.abs(x) < 1e-3) return;
        const d = s.df(x)!;
        expect(close(centralDiff(s.f, x, 1e-5), d, 1e-6)).toBe(true);
      }),
      { numRuns: 200 },
    );
    // ReLU has no slope at its corner: the two sides disagree.
    expect(GALLERY.relu.df(0)).toBeNull();
    expect(forwardDiff(GALLERY.relu.f, 0, 1e-3)).toBe(1);
    expect(Math.abs(forwardDiff(GALLERY.relu.f, 0, -1e-3))).toBe(0);
  });

  it('the product rule holds, for the story’s f and g and for any two of the gallery’s functions', () => {
    fc.assert(
      fc.property(fc.double({ min: -3, max: 3, noNaN: true }), (a) => {
        expect(productRule(a)).toBeCloseTo(3 * a * a + 2 * a, 9);
        expect(close(centralDiff(product, a, 1e-5), productRule(a), 1e-7)).toBe(true);
        expect(wrongGuess(a)).toBe(productDf(a) * productDg(a));
      }),
      { numRuns: 100 },
    );
    const smooth = GALLERY_FNS.filter((fn) => fn !== 'relu');
    fc.assert(
      fc.property(fc.constantFrom(...smooth), fc.constantFrom(...smooth), fc.double({ min: 0.3, max: 2, noNaN: true }), (u, v, x) => {
        const f = GALLERY[u];
        const g = GALLERY[v];
        const rule = f.df(x)! * g.f(x) + f.f(x) * g.df(x)!;
        expect(close(centralDiff((t) => f.f(t) * g.f(t), x, 1e-5), rule, 1e-6)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('the rectangle’s strips and corner add up to the change, and the strips alone miss it by O(h²)', () => {
    fc.assert(
      fc.property(fc.double({ min: -3, max: 3, noNaN: true }), fc.double({ min: -1, max: 1, noNaN: true }), (a, h) => {
        if (Math.abs(h) < 1e-6) return;
        const s = productStrips(a, h);
        expect(s.f).toBe(productF(a));
        expect(s.g).toBe(productG(a));
        expect(Math.abs(s.top + s.right + s.corner - s.change)).toBeLessThan(1e-9 * Math.max(1, Math.abs(s.change)) + 1e-12);
        const linear = productG(a) * productDf(a) * h + productF(a) * productDg(a) * h;
        expect(Math.abs(s.change - linear)).toBeLessThanOrEqual((3 * Math.abs(a) + 2) * h * h + 1e-9);
      }),
      { numRuns: 200 },
    );
  });

  it('draws the product story from its own numbers', () => {
    fc.assert(
      fc.property(halves, (a) => {
        const frames = framesOf({ story: 'product', a });
        expectGoodPlotTrace(derivativeRules, frames, { handlesOnStep: false });
        const s = productStrips(a, 0.5);
        expect(answerOf(frames[1])).toBe(s.right > s.top ? 'The right strip, f·Δg' : 'The top strip, g·Δf');
        expect(answerOf(frames[2])).toBe('A quarter as big');
        expect(answerOf(frames[3])).toBe('Go down');
        expect(answerOf(frames[5])).toBe('f′·g + f·g′');
        expect(answerOf(frames[6])).toBe('The corner');
        expect(readout(frames[6].state, 'rule')).toBe(fmt(productRule(a)));
        expect(readout(frames[7].state, 'wrong')).toBe(fmt(wrongGuess(a)));
        expect(Number(readout(frames[6].state, 'measured'))).toBeCloseTo(productRule(a), 4);
        // The rectangle is g(a) wide and f(a) tall; the strips sit on its top and right edges.
        for (let i = 2; i <= 5; i++) {
          const area = planeOf(frames[i].state, 'area');
          const rect = area.shapes.find((x) => x.id === 'rect');
          const corner = area.shapes.find((x) => x.id === 'corner');
          expect(rect?.kind === 'path' && rect.points[2][0] === productG(a) && rect.points[2][1] === productF(a)).toBe(true);
          expect(corner?.kind === 'path' && corner.points[0][0] === productG(a) && corner.points[0][1] === productF(a)).toBe(true);
          // Q, the secant's second point, stays on the plane.
          const Q = planeOf(frames[i].state).shapes.find((x) => x.id === 'Q');
          expect(Q?.kind === 'point' && Q.at[1] === product(a + [0.5, 0.25, 0.1, 0.01][i - 2])).toBe(true);
        }
      }),
      { numRuns: 4 },
    );
  });

  it('asks the gallery’s rule questions with the rule’s answers', () => {
    const frames = framesOf({ story: 'gallery', at: GALLERY_DEFAULTS });
    const first = (fn: GalleryFn) => frames[3 * GALLERY_FNS.indexOf(fn)];
    expect(answerOf(first('cube'))).toBe('12');
    expect(answerOf(first('exp'))).toBe(fmt(Math.E, 3));
    expect(answerOf(first('ln'))).toBe('0.5');
    expect(answerOf(first('sigmoid'))).toBe('0.25');
    expect(answerOf(first('tanh'))).toBe('1');
    expect(answerOf(first('relu'))).toBe('0');
    expect(answerOf(frames[3 * GALLERY_FNS.indexOf('sigmoid') + 1])).toBe('At x = 0');
    expect(answerOf(frames[3 * GALLERY_FNS.indexOf('tanh') + 1])).toBe('0.42');
    expect(answerOf(frames[3 * GALLERY_FNS.indexOf('exp') + 1])).toBe('7.39');
    expect(first('tanh').checkpoint!.choices).toEqual(['0', '0.25', '0.5', '1']);
    expect(first('cube').checkpoint!.choices).toHaveLength(4);
    // At ReLU's corner there is no slope.
    const corner = framesOf({ story: 'gallery', at: { ...GALLERY_DEFAULTS, relu: 0 } });
    expect(answerOf(corner[3 * GALLERY_FNS.indexOf('relu')])).toBe('None: no single slope');
    expect(readout(corner[3 * GALLERY_FNS.indexOf('relu') + 1].state, 'rule')).toBe('none');
  });

  it('plays the gallery at random points, with the measured slope beside the rule', () => {
    fc.assert(
      fc.property(galleryPoints, (at) => {
        const input: RulesInput = { story: 'gallery', at };
        const frames = framesOf(input);
        expectGoodPlotTrace(derivativeRules, frames, { handlesOnStep: false });
        expect(frames.length).toBe(FRAMES.gallery);
        roundTrips(input);
        GALLERY_FNS.forEach((fn, i) => {
          const d = GALLERY[fn].df(at[fn]);
          if (d == null) return;
          const B = frames[3 * i + 1].state;
          expect(readout(B, 'rule')).toBe(fmt(d, 4));
          expect(Math.abs(Number(readout(B, 'measured')) - d)).toBeLessThan(1e-4 + 1e-6 * Math.abs(d));
        });
      }),
      { numRuns: 40 },
    );
  });

  it('measures (x³)′ in floating point: the errors are the formulas’, falling like h and h², then rising', () => {
    for (const a of [0.5, 1, 1.5, 2]) {
      const rows = errorTable(a);
      const exact = 3 * a * a;
      expect(cubeSlope(a)).toBe(exact);
      rows.forEach((r, i) => {
        const h = Number(`1e-${i + 1}`);
        expect(r.h).toBe(h);
        expect(r.forward).toBe((cube(a + h) - cube(a)) / h);
        expect(r.central).toBe((cube(a + h) - cube(a - h)) / (2 * h));
        expect(r.forwardError).toBe(Math.abs(r.forward - exact));
        expect(r.centralError).toBe(Math.abs(r.central - exact));
        expect(r.storedH).toBe(a + h - a);
      });
      // While truncation rules: forward errs by 3a·h + h², central by h².
      for (const r of rows.slice(0, 3)) {
        expect(close(r.forwardError, 3 * a * r.h + r.h * r.h, 1e-3)).toBe(true);
        expect(close(r.centralError, r.h * r.h, 1e-3)).toBe(true);
      }
      const best = bestH(rows);
      expect(best.forward.k).toBeGreaterThanOrEqual(7);
      expect(best.forward.k).toBeLessThanOrEqual(9);
      expect(best.central.k).toBeGreaterThanOrEqual(4);
      expect(best.central.k).toBeLessThanOrEqual(7);
      expect(best.central.centralError).toBeLessThan(best.forward.forwardError);
      expect(rows.every((r) => r.forwardError >= best.forward.forwardError && r.centralError >= best.central.centralError)).toBe(true);
      // Past the best h, the errors come back: the smallest h is far worse.
      expect(rows[14].centralError).toBeGreaterThan(1000 * best.central.centralError);
      expect(rows[14].forwardError).toBeGreaterThan(1000 * best.forward.forwardError);
      // Central beats forward at every h until rounding takes over.
      for (const r of rows.slice(0, best.central.k)) expect(r.centralError).toBeLessThan(r.forwardError);
    }
    expect(logError(0)).toBe(Math.log10(ERROR_FLOOR));
    expect(logError(1e-8)).toBe(-8);
  });

  it('draws the numeric story from its table, inside its chart, and asks what the table says', () => {
    for (const a of [0.5, 1, 1.5, 2]) {
      const input: RulesInput = { story: 'numeric', a };
      const frames = framesOf(input);
      expectGoodPlotTrace(derivativeRules, frames, { handlesOnStep: false });
      const rows = errorTable(a);
      const best = bestH(rows);
      expect(answerOf(frames[0])).toBe('Central');
      expect(answerOf(frames[1])).toBe('10 times');
      expect(answerOf(frames[2])).toBe('100 times');
      // The frame of the best central h asks whether it keeps falling: it doesn't.
      expect(answerOf(frames[best.central.k])).toBe('No');
      expect(answerOf(frames[15])).toBe(`h = 10${['⁻', ...String(best.central.k).split('').map((c) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(c)])].join('')}`);
      expect(frames[16].checkpoint).toBeUndefined();
      const chart = planeOf(frames[15].state, 'errors');
      for (const s of chart.shapes) {
        if (s.kind !== 'path' || (s.id !== 'forward' && s.id !== 'central')) continue;
        expect(s.points.length).toBe(15);
        s.points.forEach(([k, y], i) => {
          expect(k).toBe(i + 1);
          expect(y).toBe(logError(s.id === 'forward' ? rows[i].forwardError : rows[i].centralError));
          expect(y).toBeGreaterThanOrEqual(chart.y.min);
          expect(y).toBeLessThanOrEqual(chart.y.max);
        });
      }
      roundTrips(input);
    }
  });
});
