// B3 of the math and ML path, "Projections and least squares": every number
// the lesson quotes is measured here from the code that draws it, and must
// appear in the lesson exactly as written. The embedded visualisers are
// checked too: each preset exists, and the prediction challenge asks at least
// its goal.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { design, fitPoints, leastSquares, NUDGE, normalEquations, predict, residuals, solveSystem, sse, type LsqInput } from '@/algorithms/linear-algebra/least-squares';
import { mse, REVISION } from '@/algorithms/ml/supervised-learning';

const xsOf = (pts: readonly Vec[]) => pts.map((p) => p[0]);
import { project } from '@/algorithms/linear-algebra/dot-product';
import { dot, norm } from '@/algorithms/linear-algebra/shared';
import { fmt, fmtVec } from '@/viz/plot/geometry';
import { readout, traceOf } from '@/viz/plot/testing';
import type { PlotState, Vec } from '@/viz/plot/types';

const body = readFileSync(fileURLToPath(new URL('./projections-least-squares.mdx', import.meta.url)), 'utf8').replace(/\s+/g, ' ');
/** LaTeX writes a minus as -, captions and readouts as −. */
const tex = (s: string) => s.replace(/−/g, '-');

const inputOf = (preset: string) => {
  const ex = leastSquares.input.examples.find((e) => e.id === preset);
  if (!ex) throw new Error(`least-squares has no example ${preset}`);
  return ex.make({ seed: 0, size: 0 }) as LsqInput;
};
const framesOf = (preset: string) => traceOf(leastSquares, inputOf(preset)).frames as { state: PlotState; checkpoint?: unknown }[];

describe('projections-least-squares embeds', () => {
  it('embeds real presets, with one prediction challenge that asks at least its goal', () => {
    const found = [...body.matchAll(/<(Explore|PredictChallenge) slug="([a-z-]+)" settings=\{\{ preset: '([a-z-]+)'(?:, step: '(\d+)')? \}\}[^>]*?(?:goal=\{(\d+)\})?[^>]*\/>/g)].map((m) => ({
      tag: m[1],
      slug: m[2],
      preset: m[3],
      step: m[4] === undefined ? null : Number(m[4]),
      goal: m[5] === undefined ? null : Number(m[5]),
    }));
    expect(found.map((e) => e.preset)).toEqual(['shadow', 'line', 'quadratic']);
    expect(found.filter((e) => e.tag === 'PredictChallenge')).toHaveLength(1);
    for (const e of found) {
      expect(e.slug).toBe('least-squares');
      const frames = framesOf(e.preset);
      if (e.step !== null) expect(e.step).toBeLessThan(frames.length);
      if (e.goal !== null) expect(frames.filter((f) => f.checkpoint).length, `${e.preset} asks fewer than ${e.goal}`).toBeGreaterThanOrEqual(e.goal);
    }
  });
});

describe('projections-least-squares quotes', () => {
  it('drops y = (1, 3) onto a = (4, 2)', () => {
    const input = inputOf('shadow');
    if (input.story !== 'shadow') throw new Error('not a shadow');
    const { a, y } = input;
    expect([fmtVec(a), fmtVec(y)]).toEqual(['(4, 2)', '(1, 3)']);
    expect(body).toContain('multiple $t \\cdot a$ of $a = (4, 2)$');
    expect(body).toContain('closest to $y = (1, 3)$');
    const frames = framesOf('shadow');
    expect([readout(frames[2].state, 'ay'), readout(frames[2].state, 'aa'), readout(frames[2].state, 't'), readout(frames[2].state, 'p')]).toEqual(['10', '20', '0.5', '(2, 1)']);
    expect(body).toContain('Here $a \\cdot y = 10$ and $a \\cdot a = 20$, so $t = 0.5$ and $p = (2, 1)$');
    const e = readout(frames[3].state, 'e')!;
    expect(e).toBe('(−1, 2)');
    expect(body).toContain(`The gap is $e = ${tex(e)}$`);
    const ev: Vec = [y[0] - project(y, a)[0], y[1] - project(y, a)[1]];
    expect([ev[0] * a[0], ev[1] * a[1], dot(ev, a)]).toEqual([-4, 4, 0]);
    expect(body).toContain('$e \\cdot a = -4 + 4 = 0$');
    expect(readout(frames[3].state, 'len')).toBe('2.236');
    expect(norm(ev) ** 2).toBeCloseTo(5, 12);
    expect(body).toContain('$\\sqrt{5} \\approx 2.236$');
  });

  it('fits the five points with the normal equations', () => {
    const input = inputOf('line');
    if (input.story !== 'line') throw new Error('not a line');
    const pts = input.points;
    expect(pts.map((p) => fmtVec(p)).join(', ')).toBe('(1, 1), (2, 3), (3, 2), (4, 5), (5, 4)');
    expect(body).toContain('Five points: $(1, 1)$, $(2, 3)$, $(3, 2)$, $(4, 5)$ and $(5, 4)$');
    expect(body).toContain('there are 5 equations and only 2 unknowns');
    const X = design(pts.map((p) => p[0]), 1);
    const ys = pts.map((p) => p[1]);
    expect(body).toContain(`\\begin{bmatrix} ${X.map((r) => r.join(' & ')).join(' \\\\ ')} \\end{bmatrix}`);
    expect(body).toContain(`\\begin{bmatrix} ${ys.join(' \\\\ ')} \\end{bmatrix}`);
    const { XtX, Xty } = normalEquations(X, ys);
    expect(XtX).toEqual([
      [5, 15],
      [15, 55],
    ]);
    expect(Xty).toEqual([15, 53]);
    expect(body).toContain('X^\\mathsf{T} X = \\begin{bmatrix} 5 & 15 \\\\ 15 & 55 \\end{bmatrix}, \\quad X^\\mathsf{T} y = \\begin{bmatrix} 15 \\\\ 53 \\end{bmatrix}');
    expect(body).toContain('5b + 15w &= 15 \\\\ 15b + 55w &= 53');
    // Elimination by hand: R2 − 3·R1.
    expect([XtX[1][1] - 3 * XtX[0][1], Xty[1] - 3 * Xty[0]]).toEqual([10, 8]);
    expect(body).toContain('the second row minus 3 times the first leaves $10w = 8$, so $w = 0.8$');
    expect(Xty[0] - 15 * 0.8).toBeCloseTo(3, 12);
    expect(body).toContain('$5b = 15 - 15 \\times 0.8 = 3$, so $b = 0.6$');
    const w = solveSystem(XtX, Xty)!;
    expect(w.map((v) => fmt(v, 3))).toEqual(['0.6', '0.8']);
    expect(body).toContain('$\\hat{y} = 0.6 + 0.8x$');
    const frames = framesOf('line');
    expect([readout(frames[4].state, 'sum'), readout(frames[4].state, 'xsum'), readout(frames[4].state, 'sse')]).toEqual(['0', '0', '3.6']);
    expect(fmt(sse(pts, w), 3)).toBe('3.6');
    expect(body).toContain('their squares add up to 3.6');
    expect(NUDGE).toBe(0.1);
    expect(readout(frames[5].state, 'nsse')).toBe('4.15');
    expect(body).toContain('Raise the slope by 0.1 and that grows to 4.15');
    // Lines through the middle: the flat line through (mean x, mean y).
    const mx = xsOf(pts).reduce((s, x) => s + x, 0) / pts.length;
    const my = ys.reduce((s, v) => s + v, 0) / ys.length;
    expect([mx, my]).toEqual([3, 3]);
    const flat = residuals(pts, [my, 0]);
    expect(flat.reduce((s, e) => s + e, 0)).toBe(0);
    expect(flat.reduce((s, e, i) => s + e * pts[i][0], 0)).toBe(8);
    expect(sse(pts, [my, 0])).toBe(10);
    expect(body).toContain('For the five points that middle is $(3, 3)$, and the flat line $\\hat{y} = 3$ has $\\Sigma e = 0$, yet $\\Sigma x \\cdot e = 8$ and a squared error of 10, against 3.6 for the best line');
  });

  it('finds the supervised-learning lesson’s revision line exactly', () => {
    const pts: Vec[] = REVISION.map((p) => [p.x, p.y]);
    const [b, w] = fitPoints(pts, 1)!;
    expect([fmt(w, 3), fmt(b, 3)]).toEqual(['1.05', '1.35']);
    expect(fmt(mse(w, b, REVISION.map((p) => p.x), REVISION.map((p) => p.y)), 3)).toBe('0.295');
    expect(fmt(sse(pts, [b, w]) / pts.length, 3)).toBe('0.295');
    expect(body).toContain('gives exactly the line it promised: $w = 1.05$ and $b = 1.35$, with a mean squared error of 0.295');
  });

  it('bends the fit with x² on the six curved points', () => {
    const input = inputOf('quadratic');
    if (input.story !== 'quadratic') throw new Error('not a quadratic');
    expect(input.points).toHaveLength(6);
    expect(body).toContain('The best line through these six points has a squared error of 14.676');
    const lineW = fitPoints(input.points, 1)!;
    expect(fmt(sse(input.points, lineW), 3)).toBe('14.676');
    const w = fitPoints(input.points, 2)!;
    expect(w.map((c) => fmt(c, 3))).toEqual(['8.4', '−4.132', '0.625']);
    expect(body).toContain('$\\hat{y} = 8.4 - 4.132x + 0.625x^2$');
    expect(fmt(sse(input.points, w), 3)).toBe('0.093');
    expect(body).toContain('gets it down to 0.093');
    const frames = framesOf('quadratic');
    expect(readout(frames[3].state, 'sse')).toBe('0.093');
    expect(readout(frames[3].state, 'lsse')).toBe('14.676');
    expect(residuals(input.points, w).length).toBe(6);
  });

  it('checks the quiz and the probes', () => {
    // Quiz: y = (4, 1) onto a = (0, 2).
    const a: Vec = [0, 2];
    const y: Vec = [4, 1];
    expect([dot(a, y), dot(a, a)]).toEqual([2, 4]);
    expect(fmtVec(project(y, a))).toBe('(0, 1)');
    expect(body).toContain('Drop y = (4, 1) onto the line along a = (0, 2)');
    expect(body).toContain('a·y = 2 and a·a = 4, so t = 0.5 and p = 0.5·(0, 2) = (0, 1). The gap (4, 0)');
    // Quiz: 8 points give a 2×2 XᵀX.
    const { XtX } = normalEquations(design([1, 2, 3, 4, 5, 6, 7, 8], 1), [0, 0, 0, 0, 0, 0, 0, 0]);
    expect([XtX.length, XtX[0].length]).toEqual([2, 2]);
    // Probe: residuals 3, −3, 0 against 1, −1, 0.5.
    const squares = (es: number[]) => es.reduce((s, e) => s + e * e, 0);
    expect([squares([3, -3, 0]), squares([1, -1, 0.5])]).toEqual([18, 2.25]);
    // Probe: the point (1, 5) and the line ŷ = 1 + 2x, measured three ways.
    expect(5 - predict([1, 2], 1)).toBe(2);
    expect(fmt(Math.abs(2 * 1 - 5 + 1) / Math.sqrt(5), 2)).toBe('0.89');
    expect((5 - 1) / 2 - 1).toBe(1);
    expect(body).toContain('At x = 1 the line predicts 3, so the residual is 5 − 3 = 2');
    // Probe: (1, 2), (2, 2), (3, 5); lines ŷ = 3 and ŷ = 1.5x through the mean point (2, 3).
    const probe: Vec[] = [
      [1, 2],
      [2, 2],
      [3, 5],
    ];
    expect(fitPoints(probe, 1)!.map((c) => fmt(c, 6))).toEqual(['0', '1.5']);
    const xe = (w: number[]) => residuals(probe, w).reduce((s, e, i) => s + e * probe[i][0], 0);
    expect(residuals(probe, [3, 0])).toEqual([-1, -1, 2]);
    expect(residuals(probe, [0, 1.5])).toEqual([0.5, -1, 0.5]);
    expect([xe([3, 0]), xe([0, 1.5])]).toEqual([3, 0]);
    expect(body).toContain('A’s residuals −1, −1, 2 give Σx·e = 3, while B’s 0.5, −1, 0.5 give Σx·e = 0');
  });
});
