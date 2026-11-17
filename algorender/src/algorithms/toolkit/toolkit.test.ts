import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { AnyAlgorithm } from '@/engine/module';
import { expectGoodPlotTrace, planeOf, readout, traceOf } from '@/viz/plot/testing';
import type { ImagePart, PlotState, Shape, Vec } from '@/viz/plot/types';
import { apply, BASES, formulaOf, functionsModule, KNOB, parseFunctions, type BaseId, type FunctionsInput } from './functions';
import { compound, doublings, halvings, logarithms, parseLog, PERIODS, type LogInput } from './logarithms';
import { parseSigma, pi, sigma, sigmaNotation, TERMS, type SigmaInput, type TermId } from './sigma-notation';
import { parseCircle, rotate, toRadians, unitCircle, WAVE_STEP, type CircleInput } from './unit-circle';

const shapeIn = (state: PlotState, id: string, plane = 'plane'): Shape | undefined => planeOf(state, plane).shapes.find((s) => s.id === id);
const num = (s: string | undefined) => Number((s ?? 'NaN').replace(/−/g, '-').replace(/[°%£]/g, ''));
const close = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(b));

/** Custom text round-trips: format, parse, the same input. */
function roundTrips<I>(module: AnyAlgorithm, input: I) {
  const custom = module.input.custom!;
  const text = custom.format(input as never);
  const parsed = custom.parse(text);
  expect(parsed, text).toEqual({ value: input });
}

const half = (lo: number, hi: number) => fc.integer({ min: lo * 2, max: hi * 2 }).map((v) => v / 2);

describe('functions', () => {
  const input = fc.record({
    base: fc.constantFrom(...(Object.keys(BASES) as BaseId[])),
    a: half(KNOB.min, KNOB.max),
    h: half(KNOB.min, KNOB.max),
    k: half(KNOB.min, KNOB.max),
  }) as fc.Arbitrary<FunctionsInput>;

  it('plays every example as a good trace', () => {
    for (const ex of functionsModule.input.examples) expectGoodPlotTrace(functionsModule, traceOf(functionsModule, ex.make({ seed: 0, size: 0 })).frames);
  });

  it('writes the formulas the way you would by hand', () => {
    expect(functionsModule.input.examples.map((ex) => formulaOf(ex.make({ seed: 0, size: 0 }) as FunctionsInput))).toEqual(['(x − 2)² − 1', '2x + 1', '−|x + 1| + 3', '2√(x + 3)', '0.5x² − 2']);
    expect(formulaOf({ base: 'line', a: 3, h: 1, k: 0 })).toBe('3(x − 1)');
    expect(formulaOf({ base: 'square', a: 0, h: 1, k: 2 })).toBe('2');
  });

  it('moves each table point (x, f(x)) to (x + h, a·f(x) + k), on the drawn curve, with the same frames for every input of a base', () => {
    const lengths = new Map<BaseId, number>();
    fc.assert(
      fc.property(input, (inp) => {
        const frames = traceOf(functionsModule, inp).frames;
        expectGoodPlotTrace(functionsModule, frames);
        if (!lengths.has(inp.base)) lengths.set(inp.base, frames.length);
        expect(frames.length).toBe(lengths.get(inp.base));
        const b = BASES[inp.base];
        const last = frames[frames.length - 1].state;
        for (const x of b.xs) {
          const p = shapeIn(last, `p${x}`);
          expect(p?.kind).toBe('point');
          if (p?.kind !== 'point') continue;
          expect(p.at[0]).toBeCloseTo(x + inp.h, 9);
          expect(p.at[1]).toBeCloseTo(inp.a * b.f(x) + inp.k, 9);
          expect(apply(inp, p.at[0])).toBeCloseTo(p.at[1], 9);
        }
        const curve = shapeIn(last, 'curve');
        if (curve?.kind === 'path') for (const [x, y] of curve.points) expect(y).toBeCloseTo(apply(inp, x), 9);
        // The anchor is where f's (0, 0) lands, and the unit point where (1, 1) lands.
        const handles = planeOf(last).handles;
        expect(handles.map((h) => h.at)).toEqual([
          [inp.h, inp.k],
          [inp.h + 1, inp.k + inp.a],
        ]);
        expect(apply(inp, inp.h)).toBeCloseTo(inp.k, 9);
        expect(apply(inp, inp.h + 1)).toBeCloseTo(inp.k + inp.a, 9);
      }),
      { numRuns: 60 },
    );
  });

  it('answers its shift question with the direction the curve really moves: f(x − h) goes right when h > 0', () => {
    for (const h of [-2, 0, 1.5]) {
      const frames = traceOf(functionsModule, { base: 'square', a: 1, h, k: 0 }).frames;
      const asking = frames.find((f) => f.checkpoint?.question.includes('replace x by'))!;
      const answer = asking.checkpoint!.choices[asking.checkpoint!.answer];
      expect(answer).toBe(h === 0 ? 'Stays put' : h > 0 ? `Right by ${h}` : `Left by ${-h}`);
      const after = frames[frames.indexOf(asking) + 1].state;
      const vertex = shapeIn(after, 'p0');
      expect(vertex?.kind === 'point' && vertex.at[0]).toBe(h);
    }
  });

  it('turns drags into knobs and round-trips its custom text', () => {
    const start: FunctionsInput = { base: 'square', a: 1, h: 2, k: -1 };
    expect(functionsModule.input.drag!(start, 'anchor', [-1.5, 3])).toEqual({ ...start, h: -1.5, k: 3 });
    expect(functionsModule.input.drag!(start, 'unit', [3, 1])).toEqual({ ...start, a: 2 });
    fc.assert(fc.property(input, (inp) => roundTrips(functionsModule, inp)));
    expect(parseFunctions('cube a=1')).toHaveProperty('error');
    expect(parseFunctions('square a=5')).toHaveProperty('error');
    expect(parseFunctions('square h=0.3')).toHaveProperty('error');
    expect(parseFunctions('abs')).toEqual({ value: { base: 'abs', a: 1, h: 0, k: 0 } });
  });
});

describe('logarithms', () => {
  it('plays every example as a good trace', () => {
    for (const ex of logarithms.input.examples) expectGoodPlotTrace(logarithms, traceOf(logarithms, ex.make({ seed: 0, size: 0 })).frames, { handlesOnStep: false });
  });

  it('counts doublings and halvings as ⌈log₂ N⌉, and draws each doubling bar at 2^k', () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 100_000 }), (n) => {
        const k = Math.ceil(Math.log2(n) - 1e-12);
        expect(doublings(n)).toBe(k);
        expect(halvings(n)).toBe(k);
        const frames = traceOf(logarithms, { story: 'doubling', n }).frames;
        expectGoodPlotTrace(logarithms, frames);
        const top = frames.find((f) => f.line === 2)!;
        expect(readout(top.state, 'count')).toBe(String(k));
        const bars = planeOf(top.state).shapes.find((s) => s.kind === 'bars');
        expect(bars?.kind === 'bars' && bars.bars.map((b) => b.y)).toEqual(Array.from({ length: k + 1 }, (_, i) => 2 ** i));
        // The log-scale bars are the exponents: a straight staircase.
        const logBars = planeOf(frames[frames.length - 1].state).shapes.find((s) => s.kind === 'bars');
        expect(logBars?.kind === 'bars' && logBars.bars.map((b) => b.y)).toEqual(Array.from({ length: k + 1 }, (_, i) => i));
      }),
      { numRuns: 40 },
    );
  });

  it('stacks log a and log b into exactly log(a·b), and shows log(a + b) is not that sum', () => {
    fc.assert(
      fc.property(fc.integer({ min: 100, max: 102_400 }), fc.integer({ min: 100, max: 102_400 }), (p, q) => {
        const a = p / 100;
        const b = q / 100;
        const frames = traceOf(logarithms, { story: 'product', a, b }).frames;
        expectGoodPlotTrace(logarithms, frames);
        const stacked = frames.find((f) => readout(f.state, 'lab') !== undefined)!;
        const bars = planeOf(stacked.state).shapes.find((s) => s.kind === 'bars');
        const top = bars?.kind === 'bars' ? bars.bars.find((x) => x.id === 'ab-b')! : null;
        expect(top!.y).toBeCloseTo(Math.log2(a) + Math.log2(b), 9);
        expect(top!.y0).toBeCloseTo(Math.log2(a), 9);
      }),
      { numRuns: 40 },
    );
  });

  it('grows £1 towards e and never past it', () => {
    const values = PERIODS.map(compound);
    for (let i = 1; i < values.length; i++) expect(values[i]).toBeGreaterThan(values[i - 1]);
    for (const v of values) expect(v).toBeLessThan(Math.E);
    expect(Math.E - values[values.length - 1]).toBeLessThan(1e-5);
  });

  it('mirrors P on eˣ to Q on ln x, and drags P along the curve', () => {
    for (const x of [-3, -1.2, 0, 0.7, 2]) {
      const frames = traceOf(logarithms, { story: 'mirror', x }).frames;
      expectGoodPlotTrace(logarithms, frames, { handlesOnStep: false });
      const Q = shapeIn(frames[1].state, 'Q');
      expect(Q?.kind).toBe('point');
      if (Q?.kind === 'point') expect(Math.log(Q.at[0])).toBeCloseTo(Q.at[1], 9);
    }
    expect(logarithms.input.drag!({ story: 'mirror', x: 1 }, 'x', [1.4, 99])).toEqual({ story: 'mirror', x: 1.4 });
  });

  it('round-trips its custom text and rejects what it cannot show', () => {
    const inputs: LogInput[] = [{ story: 'doubling', n: 1000 }, { story: 'product', a: 10, b: 2.5 }, { story: 'compound' }, { story: 'mirror', x: -1.5 }];
    for (const inp of inputs) roundTrips(logarithms, inp);
    for (const bad of ['doubling 1', 'doubling 2.5', 'product 0.5 2', 'mirror 3', 'tripling 4']) expect(parseLog(bad), bad).toHaveProperty('error');
  });
});

describe('sigma notation', () => {
  it('plays every example as a good trace', () => {
    for (const ex of sigmaNotation.input.examples) expectGoodPlotTrace(sigmaNotation, traceOf(sigmaNotation, ex.make({ seed: 0, size: 0 })).frames);
  });

  it('adds the terms by the loop the Σ stands for, matching each closed form, with a running total that never falls', () => {
    for (const term of Object.keys(TERMS) as TermId[]) {
      for (let n = 1; n <= 12; n++) {
        expect(sigma(n, TERMS[term].f)).toBe(TERMS[term].closed(n));
        const frames = traceOf(sigmaNotation, { story: 'series', term, n }).frames;
        expectGoodPlotTrace(sigmaNotation, frames);
        const totals = frames.map((f) => readout(f.state, 'total')).map(num);
        for (let i = 1; i < totals.length; i++) expect(totals[i]).toBeGreaterThanOrEqual(totals[i - 1]);
        expect(totals[totals.length - 1]).toBe(TERMS[term].closed(n));
      }
    }
  });

  it('multiplies to n! with Π, starting from 1', () => {
    const fact = [1, 1, 2, 6, 24, 120, 720, 5040, 40320];
    for (let n = 1; n <= 8; n++) {
      expect(pi(n, (i) => i)).toBe(fact[n]);
      const frames = traceOf(sigmaNotation, { story: 'product', n }).frames;
      expectGoodPlotTrace(sigmaNotation, frames);
      expect(num(readout(frames[frames.length - 1].state, 'prod'))).toBe(fact[n]);
    }
  });

  const data = fc.array(fc.integer({ min: 0, max: 10 }), { minLength: 2, maxLength: 8 });

  it('puts the mean at Σxᵢ / n, where the gaps above and below cancel, and lets the bars be dragged', () => {
    fc.assert(
      fc.property(data, (xs) => {
        const frames = traceOf(sigmaNotation, { story: 'mean', xs }).frames;
        expectGoodPlotTrace(sigmaNotation, frames);
        const m = xs.reduce((s, x) => s + x, 0) / xs.length;
        const line = shapeIn(frames[frames.length - 1].state, 'mean', 'data');
        expect(line?.kind === 'line' && line.through[1]).toBeCloseTo(m, 12);
        const gaps = xs.map((x) => x - m);
        expect(Math.abs(gaps.reduce((s, g) => s + g, 0))).toBeLessThan(1e-9);
        expect(num(readout(frames[frames.length - 1].state, 'above')) + num(readout(frames[frames.length - 1].state, 'below'))).toBeCloseTo(0, 9);
        // The handles sit on the bars' tops, at the data's own values.
        expect(planeOf(frames[0].state, 'data').handles.map((h) => h.at)).toEqual(xs.map((x, k) => [k + 1, x]));
      }),
      { numRuns: 40 },
    );
    const input: SigmaInput = { story: 'mean', xs: [2, 4, 9, 5] };
    expect(sigmaNotation.input.drag!(input, 'x3', [3, 6.4])).toEqual({ story: 'mean', xs: [2, 4, 6, 5] });
    expect(sigmaNotation.input.drag!(input, 'x1', [1, 40])).toEqual({ story: 'mean', xs: [10, 4, 9, 5] });
  });

  it('shows Σxᵢ² as the diagonal of the table of products, and (Σxᵢ)² as the whole table', () => {
    fc.assert(
      fc.property(data, (xs) => {
        const frames = traceOf(sigmaNotation, { story: 'square', xs }).frames;
        expectGoodPlotTrace(sigmaNotation, frames);
        const t = frames[1].state.parts.find((p): p is ImagePart => p.kind === 'image')!;
        const cells = t.values!.map(num);
        const n = xs.length;
        const diagonal = xs.reduce((s, _, k) => s + cells[k * n + k], 0);
        expect(diagonal).toBe(xs.reduce((s, x) => s + x * x, 0));
        expect(cells.reduce((s, v) => s + v, 0)).toBe(xs.reduce((s, x) => s + x, 0) ** 2);
        const c = frames[0].checkpoint!;
        const s2 = diagonal;
        const sq = xs.reduce((s, x) => s + x, 0) ** 2;
        expect(c.choices[c.answer]).toBe(s2 === sq ? 'They are equal' : s2 > sq ? 'Σ xᵢ² is bigger' : '(Σ xᵢ)² is bigger');
      }),
      { numRuns: 40 },
    );
  });

  it('fills a double sum row by row, and the total factors as (Σi)(Σj)', () => {
    for (let rows = 2; rows <= 4; rows++) {
      for (let cols = 2; cols <= 5; cols++) {
        const frames = traceOf(sigmaNotation, { story: 'double', rows, cols }).frames;
        expectGoodPlotTrace(sigmaNotation, frames);
        expect(frames.length).toBe(rows * cols + 2);
        // The k-th fill frame has filled exactly the first k cells in reading order.
        frames.slice(1, -1).forEach((f, k) => {
          const t = f.state.parts.find((p): p is ImagePart => p.kind === 'image')!;
          expect(t.values!.map((v) => v !== '')).toEqual(Array.from({ length: rows * cols }, (_, i) => i <= k));
        });
        const total = (rows * (rows + 1) * cols * (cols + 1)) / 4;
        expect(num(readout(frames[frames.length - 1].state, 'total'))).toBe(total);
        expect(num(readout(frames[frames.length - 1].state, 'factored'))).toBe(total);
      }
    }
  });

  it('round-trips its custom text and rejects what it cannot show', () => {
    const inputs: SigmaInput[] = [
      { story: 'series', term: 'odd', n: 7 },
      { story: 'product', n: 5 },
      { story: 'mean', xs: [1, 0, 10] },
      { story: 'square', xs: [3, 3] },
      { story: 'double', rows: 2, cols: 5 },
    ];
    for (const inp of inputs) roundTrips(sigmaNotation, inp);
    for (const bad of ['series cube 3', 'series i 13', 'product 9', 'mean 4', 'mean 1 2 11', 'double 5 2', 'sum 3']) expect(parseSigma(bad), bad).toHaveProperty('error');
  });
});

describe('unit circle', () => {
  it('plays every example as a good trace', () => {
    for (const ex of unitCircle.input.examples) expectGoodPlotTrace(unitCircle, traceOf(unitCircle, ex.make({ seed: 0, size: 0 })).frames, { handlesOnStep: false });
  });

  it('puts P at (cos θ, sin θ), with the arc as long as θ in radians and cos² + sin² = 1', () => {
    fc.assert(
      fc.property(fc.integer({ min: -360, max: 360 }), (deg) => {
        const frames = traceOf(unitCircle, { story: 'circle', deg }).frames;
        expectGoodPlotTrace(unitCircle, frames, { handlesOnStep: false });
        const t = toRadians(deg);
        const last = frames[frames.length - 1].state;
        const P = shapeIn(last, 'P');
        expect(P?.kind === 'point' && P.at).toEqual([Math.cos(t), Math.sin(t)]);
        const arc = shapeIn(last, 'arc');
        if (arc?.kind === 'path') {
          let length = 0;
          for (let i = 1; i < arc.points.length; i++) length += Math.hypot(arc.points[i][0] - arc.points[i - 1][0], arc.points[i][1] - arc.points[i - 1][1]);
          expect(length).toBeCloseTo(Math.abs(t), 2);
        }
        expect(readout(last, 'one')).toBe('1');
        const c = frames[1].checkpoint!;
        const cos = Math.cos(t);
        expect(c.choices[c.answer]).toBe(Math.abs(cos) < 1e-9 ? 'Zero' : cos > 0 ? 'Positive' : 'Negative');
      }),
      { numRuns: 60 },
    );
  });

  it('traces sin θ every 30° for one full turn, and asks the sign of the next point right', () => {
    const frames = traceOf(unitCircle, { story: 'wave' }).frames;
    expect(frames.length).toBe(360 / WAVE_STEP + 2);
    frames.slice(0, -2).forEach((f, k) => {
      const s = Math.sin(toRadians((k + 1) * WAVE_STEP));
      const c = f.checkpoint!;
      expect(c.choices[c.answer]).toBe(Math.abs(s) < 1e-9 ? 'Zero' : s > 0 ? 'Positive' : 'Negative');
    });
  });

  it('turns v without changing its length, matching a quarter turn (x, y) → (−y, x)', () => {
    const vec = half(-3, 3);
    fc.assert(
      fc.property(fc.integer({ min: -360, max: 360 }), vec, vec, (deg, x, y) => {
        const v: Vec = [x, y];
        const frames = traceOf(unitCircle, { story: 'rotate', deg, v }).frames;
        expectGoodPlotTrace(unitCircle, frames);
        const w = shapeIn(frames[frames.length - 1].state, 'w');
        expect(w?.kind).toBe('vector');
        if (w?.kind === 'vector') {
          expect(close(Math.hypot(...w.to), Math.hypot(x, y), 1e-12) || Math.hypot(x, y) < 1e-12).toBe(true);
          expect(w.to).toEqual(rotate(v, toRadians(deg)));
        }
      }),
      { numRuns: 60 },
    );
    const q = rotate([2, 1], toRadians(90));
    expect(q[0]).toBeCloseTo(-1, 12);
    expect(q[1]).toBeCloseTo(2, 12);
  });

  it('shows what Math.sin does with degrees, and the right value once converted', () => {
    for (const deg of [30, 90, 180, 270]) {
      const frames = traceOf(unitCircle, { story: 'degrees', deg }).frames;
      expectGoodPlotTrace(unitCircle, frames);
      expect(num(readout(frames[1].state, 'got'))).toBeCloseTo(Math.sin(deg), 3);
      expect(num(readout(frames[2].state, 'right'))).toBeCloseTo(Math.sin(toRadians(deg)), 3);
    }
  });

  it('turns a drag into an angle, and round-trips its custom text', () => {
    const at = (to: Vec) => unitCircle.input.drag!({ story: 'circle', deg: 0 }, 'P', to);
    expect(at([0, 1])).toEqual({ story: 'circle', deg: 90 });
    expect(at([-1, 0])).toEqual({ story: 'circle', deg: 180 });
    expect(at([0, -1])).toEqual({ story: 'circle', deg: 270 });
    expect(at([1, 1])).toEqual({ story: 'circle', deg: 45 });
    const inputs: CircleInput[] = [{ story: 'circle', deg: 135 }, { story: 'wave' }, { story: 'rotate', deg: -45, v: [1.5, -2] }, { story: 'degrees', deg: 90 }];
    for (const inp of inputs) roundTrips(unitCircle, inp);
    for (const bad of ['circle 400', 'circle 12.5', 'rotate 90 1', 'rotate 90 0.3 1', 'square 4']) expect(parseCircle(bad), bad).toHaveProperty('error');
  });
});
