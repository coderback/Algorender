// Property tests for the Jacobian visualiser (B4 of the math and ML path):
// the exact Jacobians against central differences, the linear guess whose
// error relative to the square shrinks in proportion, det J as an area scale,
// backprop's vector–Jacobian products against nudging, and every frame
// drawing and asking what the maths says.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { apply, fmt, fmtVec } from '@/viz/plot/geometry';
import { expectGoodPlotTrace, planeOf, readout, traceOf } from '@/viz/plot/testing';
import type { PlotState, Vec } from '@/viz/plot/types';
import {
  areaScale,
  chainCost,
  chainLoss,
  chainNumbers,
  CHAIN_T,
  CHAIN_W,
  col1,
  col2,
  det2,
  forwardColumn,
  gridLines,
  jacobian,
  linearGap,
  MAPS,
  matMul,
  numericJacobian,
  parseJacobian,
  relativeGap,
  SIZES,
  vjp,
  type JacobianInput,
  type MapId,
} from './jacobian';

type F = { state: PlotState; note: string; checkpoint?: { choices: readonly string[]; answer: number } };
const frames = (input: JacobianInput) => traceOf(jacobian, input).frames as F[];
const answer = (f: F) => f.checkpoint!.choices[f.checkpoint!.answer];
const close = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(b));
const row = (g: Vec, d = 2) => `[${fmt(g[0], d)}, ${fmt(g[1], d)}]`;

function roundTrips(input: JacobianInput) {
  const custom = jacobian.input.custom!;
  const text = custom.format(input as never);
  expect(custom.parse(text), text).toEqual({ value: input });
}

const half = (lo: number, hi: number) => fc.integer({ min: Math.round(lo * 2), max: Math.round(hi * 2) }).map((v) => v / 2 + 0);
const mapId = fc.constantFrom<MapId>('bend', 'polar');
/** A map and a point p it allows (on the 0.5 step). */
const mapAndP = mapId.chain((map) => fc.tuple(fc.constant(map), fc.tuple(half(MAPS[map].min[0], MAPS[map].max[0]), half(MAPS[map].min[1], MAPS[map].max[1])) as fc.Arbitrary<Vec>));
/** Any point in a map's box, not just on the step. */
const mapAndPoint = mapId.chain((map) =>
  fc.tuple(fc.constant(map), fc.tuple(fc.double({ min: MAPS[map].min[0], max: MAPS[map].max[0], noNaN: true }), fc.double({ min: MAPS[map].min[1], max: MAPS[map].max[1], noNaN: true })) as fc.Arbitrary<Vec>),
);

describe('jacobian', () => {
  it('plays every example, round-trips its text and every drag keeps the frame count', () => {
    for (const ex of jacobian.input.examples) {
      const input = ex.make({ seed: 0, size: 0 }) as JacobianInput;
      const fs = frames(input);
      expectGoodPlotTrace(jacobian, fs as never);
      roundTrips(input);
      for (const f of fs)
        for (const part of f.state.parts) {
          if (part.kind !== 'plane') continue;
          for (const h of part.handles) {
            for (const to of [
              [h.at[0] + h.step, h.at[1] - h.step],
              [h.min[0], h.max[1]],
              [h.max[0], h.min[1]],
              [0, 0],
            ] as Vec[]) {
              const moved = jacobian.input.drag!(input as never, h.id, to) as JacobianInput;
              const again = frames(moved);
              expectGoodPlotTrace(jacobian, again as never);
              roundTrips(moved);
              expect(again.length, `${ex.id} dragging ${h.id}`).toBe(fs.length);
            }
          }
        }
    }
  });

  it('has fixed frame counts and enough questions for a prediction challenge in every story', () => {
    const count = (input: JacobianInput) => {
      const fs = frames(input);
      return [fs.length, fs.filter((f) => f.checkpoint).length];
    };
    for (const map of ['bend', 'polar'] as MapId[]) {
      const p = MAPS[map].max;
      expect(count({ story: 'zoom', map, p })).toEqual([7, 4]);
      expect(count({ story: 'columns', map, p })).toEqual([5, 4]);
      expect(count({ story: 'chain', map, p })).toEqual([6, 5]);
    }
    // At the loss's minimum every gradient is 0, and the questions still have wrong answers to offer.
    expect(chainNumbers(MAPS.polar, [2, 0]).gx).toEqual([0, 0]);
    expect(count({ story: 'chain', map: 'polar', p: [2, 0] })).toEqual([6, 5]);
  });

  it('the exact Jacobian matches central differences everywhere, and the polar map has det J = r', () => {
    fc.assert(
      fc.property(mapAndPoint, ([map, p]) => {
        const m = MAPS[map];
        const J = m.jac(p);
        const N = numericJacobian(m.f, p, 1e-5);
        J.forEach((x, i) => expect(close(N[i], x, 1e-6), `${map} at ${p}: entry ${i}`).toBe(true));
        if (map === 'polar') expect(close(det2(J), p[0], 1e-12)).toBe(true);
        else expect(close(det2(J), 1 + (p[0] * p[1]) / 4, 1e-12)).toBe(true);
      }),
      { numRuns: 150 },
    );
  });

  it('the linear guess is off by O(size²): halving the square halves the gap relative to its size', () => {
    fc.assert(
      fc.property(mapAndPoint, fc.double({ min: 0.01, max: 0.8, noNaN: true }), ([map, p], s) => {
        const m = MAPS[map];
        const r1 = relativeGap(m, p, s);
        const r2 = relativeGap(m, p, s / 2);
        if (map === 'bend') {
          // A quadratic map: the error is exactly (s²/4)(u_y², −u_x²), worst at the far corner.
          expect(close(r1, (s * Math.SQRT2) / 4, 1e-9)).toBe(true);
          expect(close(r2 / r1, 0.5, 1e-9)).toBe(true);
        } else {
          expect(r2 / r1).toBeGreaterThan(0.4);
          expect(r2 / r1).toBeLessThan(0.6);
        }
        // Relative to the square, the gap is at most a constant times its size.
        expect(r1 / s).toBeLessThan(2);
      }),
      { numRuns: 150 },
    );
  });

  it('det J is the area scale of a tiny square’s image', () => {
    fc.assert(
      fc.property(mapAndPoint, ([map, p]) => {
        const m = MAPS[map];
        expect(Math.abs(areaScale(m, p, 1e-3) - det2(m.jac(p)))).toBeLessThan(1e-3);
      }),
      { numRuns: 150 },
    );
    // The bend's det J = 1 + xy/4 is linear in each variable, so a square's area scale is det J at its centre.
    const bend = MAPS.bend;
    expect(areaScale(bend, [1, 1], 0.25)).toBeCloseTo(det2(bend.jac([1.125, 1.125])), 2);
  });

  it('backprop’s vector–Jacobian products equal the nudged gradient of the whole chain', () => {
    fc.assert(
      fc.property(mapAndPoint, ([map, x]) => {
        const m = MAPS[map];
        const n = chainNumbers(m, x);
        const L = (y: Vec) => chainLoss(m, y);
        const h = 1e-5;
        const nudged: Vec = [(L([x[0] + h, x[1]]) - L([x[0] - h, x[1]])) / (2 * h), (L([x[0], x[1] + h]) - L([x[0], x[1] - h])) / (2 * h)];
        expect(close(n.gx[0], nudged[0], 1e-5) && close(n.gx[1], nudged[1], 1e-5), `${map} at ${x}`).toBe(true);
        expect(close(n.numeric[0], n.gx[0], 1e-4) && close(n.numeric[1], n.gx[1], 1e-4)).toBe(true);
        // Multiplying the matrices first gives the same row, at a higher price.
        const viaProduct = vjp(n.gv, matMul(CHAIN_W, n.J));
        expect(close(viaProduct[0], n.gx[0], 1e-9) && close(viaProduct[1], n.gx[1], 1e-9)).toBe(true);
        expect(n.L).toBeCloseTo(((n.v[0] - CHAIN_T[0]) ** 2 + (n.v[1] - CHAIN_T[1]) ** 2) / 2, 12);
      }),
      { numRuns: 150 },
    );
    expect(chainCost(2, 2)).toEqual({ rowByRow: 8, matricesFirst: 12 });
    expect(chainCost(1000, 2)).toEqual({ rowByRow: 2_000_000, matricesFirst: 1_001_000_000 });
  });

  it('draws the warped grid on F of the grid lines, and the moved grid never changes with p', () => {
    for (const map of ['bend', 'polar'] as MapId[]) {
      const m = MAPS[map];
      const out = planeOf(frames({ story: 'zoom', map, p: m.min })[0].state, 'out');
      for (const line of gridLines(m)) {
        const path = out.shapes.find((s) => s.id === line.id);
        if (path?.kind !== 'path') throw new Error(`no grid line ${line.id}`);
        const n = path.points.length - 1;
        path.points.forEach((q, k) => {
          const at: Vec = [line.from[0] + ((line.to[0] - line.from[0]) * k) / n, line.from[1] + ((line.to[1] - line.from[1]) * k) / n];
          const fx = m.f(at);
          expect(Math.hypot(q[0] - fx[0], q[1] - fx[1]), `${map} ${line.id} point ${k}`).toBeLessThan(0.0075);
        });
      }
      const other = planeOf(frames({ story: 'zoom', map, p: m.max })[0].state, 'out');
      expect(other.shapes.filter((s) => s.id.startsWith('g'))).toEqual(out.shapes.filter((s) => s.id.startsWith('g')));
    }
  });

  it('zoom: shrinks the square, magnifies the image onto the parallelogram on J’s columns, and asks honestly', () => {
    fc.assert(
      fc.property(mapAndP, ([map, p]) => {
        const m = MAPS[map];
        const J = m.jac(p);
        const fs = frames({ story: 'zoom', map, p });
        expectGoodPlotTrace(jacobian, fs as never);
        expect(answer(fs[0])).toBe('No');
        expect(answer(fs[1])).toBe('B');
        expect(answer(fs[2])).toBe('It about halves');
        const ratio = relativeGap(m, p, SIZES[1]) / relativeGap(m, p, SIZES[0]);
        expect(ratio).toBeGreaterThan(0.4);
        expect(ratio).toBeLessThan(0.6);
        expect(answer(fs[3])).toBe(fmt(linearGap(m, p, SIZES[2]), 3));
        // The magnified linear guess is the parallelogram on J's columns, and the true image closes in on it.
        const lin = planeOf(fs[2].state, 'zoom').shapes.find((s) => s.id === 'lin');
        if (lin?.kind !== 'path') throw new Error('no linear guess');
        const corners = [[0, 0], col1(J), [J[0] + J[1], J[2] + J[3]], col2(J)] as Vec[];
        lin.points.forEach((q, k) => expect(Math.hypot(q[0] - corners[k][0], q[1] - corners[k][1])).toBeLessThan(0.0075));
        const gaps = SIZES.map((s, i) => readout(fs[i + 2].state, 'ratio'));
        expect(gaps).toEqual(SIZES.map((s) => fmt(relativeGap(m, p, s), 3)));
        // Every zoom frame keeps one magnified box, so the picture doesn't jump.
        const boxes = fs.slice(1, 6).map((f) => JSON.stringify([planeOf(f.state, 'zoom').x.min, planeOf(f.state, 'zoom').x.max, planeOf(f.state, 'zoom').y.min, planeOf(f.state, 'zoom').y.max]));
        expect(new Set(boxes).size).toBe(1);
      }),
      { numRuns: 60 },
    );
  });

  it('columns: asks for J’s entries and det J, measures them, and finds a point where det J = 0', () => {
    fc.assert(
      fc.property(mapAndP, ([map, p]) => {
        const m = MAPS[map];
        const J = m.jac(p);
        const fs = frames({ story: 'columns', map, p });
        expectGoodPlotTrace(jacobian, fs as never);
        if (m.askFormulas) {
          // Polar's entries need sin and cos of the angle: asked as formulas, not numbers.
          expect(answer(fs[0])).toBe('sin θ');
          expect(answer(fs[1])).toBe('(−r·sin θ, r·cos θ)');
        } else {
          expect(answer(fs[0])).toBe(fmt(J[2]));
          expect(answer(fs[1])).toBe(fmtVec(col2(J)));
        }
        expect(answer(fs[2])).toBe(fmt(det2(J)));
        const q = m.flat(p);
        expect(Math.abs(det2(m.jac(q)))).toBeLessThan(1e-12);
        expect(answer(fs[3])).toBe('0');
        // The "one Jacobian everywhere" slip, det J at p, is always offered.
        expect(fs[3].checkpoint!.choices).toContain(fmt(det2(J)));
        expect(readout(fs[1].state, 'col1')).toBe(fmtVec(col1(J)));
        expect(readout(fs[1].state, 'chord')).toBe(fmtVec(forwardColumn(m, p, 0, 0.5), 3));
        expect(readout(fs[3].state, 'det')).toBe(fmt(det2(J)));
        // The column arrows leave F(p) along J's columns.
        const c2 = planeOf(fs[2].state, 'out').shapes.find((s) => s.id === 'c2');
        if (c2?.kind !== 'vector') throw new Error('no column 2');
        const d = [c2.to[0] - c2.from[0], c2.to[1] - c2.from[1]];
        expect(Math.hypot(d[0] - J[1], d[1] - J[3])).toBeLessThan(0.015);
      }),
      { numRuns: 60 },
    );
  });

  it('chain: works ∂L/∂v, ∂L/∂u and ∂L/∂x row by row and checks them by nudging', () => {
    fc.assert(
      fc.property(mapAndP, ([map, x]) => {
        const m = MAPS[map];
        const n = chainNumbers(m, x);
        const fs = frames({ story: 'chain', map, p: x });
        expectGoodPlotTrace(jacobian, fs as never);
        expect(answer(fs[0])).toBe(row(n.gv));
        expect(answer(fs[1])).toBe(fmt(n.gu[0]));
        expect(answer(fs[2])).toBe(fmt(n.gx[1]));
        expect(answer(fs[3])).toBe('The row times W, then that row times J_F');
        expect(answer(fs[4])).toBe(fmt(n.numeric[0]));
        expect(readout(fs[2].state, 'gu')).toBe(row(vjp(n.gv, CHAIN_W)));
        expect(readout(fs[3].state, 'gx')).toBe(row(n.gx));
        expect(readout(fs[5].state, 'numeric')).toBe(row(n.numeric, 4));
        expect(n.u).toEqual(m.f(x));
        expect(n.v).toEqual(apply(CHAIN_W, n.u));
      }),
      { numRuns: 60 },
    );
    // The preset's numbers: x = (2, 2) → u = (3, 1) → v = (3, 4), L = 2.5, and ∂L/∂x = [1, 5].
    const n = chainNumbers(MAPS.bend, [2, 2]);
    expect([n.u, n.v, n.L, n.gv, n.gu, n.gx]).toEqual([[3, 1], [3, 4], 2.5, [1, 2], [3, 2], [1, 5]]);
  });

  it('refuses unknown stories and maps, and points off the step or outside the box', () => {
    expect(parseJacobian('zoom bend (1, 1)')).toEqual({ value: { story: 'zoom', map: 'bend', p: [1, 1] } });
    expect(parseJacobian('chain polar (1.5, -0.5)')).toEqual({ value: { story: 'chain', map: 'polar', p: [1.5, -0.5] } });
    expect(parseJacobian('spin bend (1, 1)')).toHaveProperty('error');
    expect(parseJacobian('zoom twist (1, 1)')).toHaveProperty('error');
    expect(parseJacobian('zoom bend (1.25, 1)')).toHaveProperty('error');
    expect(parseJacobian('zoom bend (3, 1)')).toHaveProperty('error');
    expect(parseJacobian('columns polar (0, 1)')).toHaveProperty('error');
    expect(parseJacobian('columns polar (1)')).toHaveProperty('error');
    // Drags snap to halves and stay in the box.
    const input: JacobianInput = { story: 'zoom', map: 'polar', p: [1, 0] };
    expect(jacobian.input.drag!(input as never, 'p', [0.1, 9.3])).toEqual({ ...input, p: [0.5, 1.5] });
    expect(jacobian.input.drag!(input as never, 'q', [2, 1])).toBe(input);
  });

  it('every pseudo-code line fits the code panel', () => {
    for (const line of jacobian.pseudocode) expect([...line].length, line).toBeLessThanOrEqual(42);
  });
});
