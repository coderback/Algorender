// B3 of the math and ML path, determinants and inverses: every number the
// lesson quotes is measured here from the code that draws it (or, for the
// quiz and the probes, worked out by the module's own helpers), and must
// appear in the lesson exactly as written. The embedded visualisers are
// checked too: each preset exists, and the prediction challenge asks at least
// its goal.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { eliminate, inverse2, inverseMatrix, matVec, squashMatrix, squashPoints, type InverseInput } from '@/algorithms/linear-algebra/inverse-matrix';
import { col2, det } from '@/algorithms/linear-algebra/shared';
import { apply, fmt, fmtVec } from '@/viz/plot/geometry';
import { readout, traceOf } from '@/viz/plot/testing';
import type { Mat2, PlotState } from '@/viz/plot/types';

const body = readFileSync(fileURLToPath(new URL('./determinants-inverses.mdx', import.meta.url)), 'utf8').replace(/\s+/g, ' ');
/** LaTeX writes a minus as -, captions as −. */
const tex = (s: string) => s.replace(/−/g, '-');

const inputOf = (preset: string) => {
  const ex = inverseMatrix.input.examples.find((e) => e.id === preset);
  if (!ex) throw new Error(`inverse-matrix has no example ${preset}`);
  return ex.make({ seed: 0, size: 0 }) as InverseInput;
};
const framesOf = (preset: string) => traceOf(inverseMatrix, inputOf(preset)).frames as { state: PlotState; checkpoint?: unknown; note: string }[];
const lastOf = (preset: string) => framesOf(preset).at(-1)!.state;
const rows2 = (m: Mat2) => `[[${fmt(m[0])}, ${fmt(m[1])}], [${fmt(m[2])}, ${fmt(m[3])}]]`;
const bmatrix = (m: Mat2) => `\\begin{bmatrix} ${tex(fmt(m[0]))} & ${tex(fmt(m[1]))} \\\\ ${tex(fmt(m[2]))} & ${tex(fmt(m[3]))} \\end{bmatrix}`;

describe('determinants-inverses embeds', () => {
  it('embeds real presets, with enough questions for the challenge', () => {
    const found = [...body.matchAll(/<(Explore|PredictChallenge) slug="([a-z-]+)" settings=\{\{ preset: '([a-z-]+)'(?:, step: '(\d+)')? \}\}(?:[^>]*?goal=\{(\d+)\})?[^>]*\/>/g)];
    expect(found.length).toBeGreaterThanOrEqual(4);
    expect(found.filter((m) => m[1] === 'PredictChallenge')).toHaveLength(1);
    for (const m of found) {
      expect(m[2]).toBe('inverse-matrix');
      const frames = framesOf(m[3]);
      if (m[4] !== undefined) expect(Number(m[4])).toBeLessThan(frames.length);
      if (m[5] !== undefined) expect(frames.filter((f) => f.checkpoint).length).toBeGreaterThanOrEqual(Number(m[5]));
    }
    expect(body).toContain('<CodeExercise exercise="solve-system" />');
  });
});

describe('determinants-inverses quotes', () => {
  it('measures the area story: det 3, the half square from 0.5 to 1.5, and the flip at −3', () => {
    const { m } = inputOf('area') as unknown as { m: Mat2 };
    const D = det(m);
    expect(body).toContain(`A = ${bmatrix(m)}`);
    expect(body).toContain(`$$ \\det A = ${fmt(m[0])} \\times ${fmt(m[3])} - ${fmt(m[1])} \\times ${fmt(m[2])} = ${fmt(D)} $$`);
    const tri = readout(lastOf('area'), 'tri')!;
    expect(body).toContain(`goes from 0.5 to ${tri}`);
    expect(body).toContain(`$$ \\det A = ${fmt(m[0])} \\times ${fmt(m[3])} - ${fmt(m[1])} \\times ${fmt(m[2])} = ${fmt(D)} $$ The square of area 1 becomes a parallelogram of area ${fmt(D)}`);
    // The caption says what to watch, never the answers.
    expect(body).toContain(`caption="A = ${rows2(m)}. Watch the unit square become a parallelogram`);
    const flip = (inputOf('flip') as unknown as { m: Mat2 }).m;
    expect(body).toContain(`$A = ${bmatrix(flip)}$`);
    expect(body).toContain(`$\\det A = ${tex(fmt(det(flip)))}$`);
    expect(Math.abs(det(flip))).toBe(Math.abs(D));
  });

  it('measures the squash story: the columns, the three points and where they land', () => {
    const { u, k } = inputOf('squash') as unknown as { u: [number, number]; k: number };
    const m = squashMatrix(u, k);
    expect(det(m)).toBe(0);
    expect(body).toContain(`$u = ${fmtVec(u)}$`);
    expect(body).toContain(`$${fmtVec(col2(m))}$`);
    const [P, Q, S] = squashPoints(k);
    expect(body).toContain(`$P = ${tex(fmtVec(P))}$, $Q = ${tex(fmtVec(Q))}$ and $S = ${tex(fmtVec(S))}$`);
    const frames = framesOf('squash');
    const land = readout(frames[1].state, 'land')!;
    for (const p of [P, Q, S]) expect(fmtVec(apply(m, p))).toBe(land);
    expect(body).toContain(`on the same spot, $${land}$`);
    expect(body).toContain(`Columns ${fmtVec(u)} and ${fmtVec(col2(m))} on one line. Watch where P, Q and S land, and whether anything lands on w = (0, 1).`);
    expect(frames[0].checkpoint).toBeDefined();
    expect(frames.at(-1)!.note).toContain('w = (0, 1)');
  });

  it('measures the undo story: det 2, the inverse, the dot-product check and det A⁻¹ = 0.5', () => {
    const { m } = inputOf('undo') as unknown as { m: Mat2 };
    const inv = inverse2(m)!;
    const D = det(m);
    expect(body).toContain(`$A = ${bmatrix(m)}$, $\\det A = ${fmt(m[0])} \\times ${fmt(m[3])} - ${fmt(m[1])} \\times ${fmt(m[2])} = ${fmt(D)}$`);
    expect(body).toContain(`\\frac{1}{${fmt(D)}}${bmatrix([m[3], -m[1], -m[2], m[0]])} = ${bmatrix(inv)}`);
    expect(body).toContain(`caption="A = ${rows2(m)}. Work out det A, build A⁻¹ from the recipe`);
    const [r1, r2] = [apply(inv, [m[0], m[2]])[0], apply(inv, [m[0], m[2]])[1]];
    expect(body).toContain(`$1 \\times 2 + (-0.5) \\times 2 = ${fmt(r1)}$`);
    expect(body).toContain(`$(-1) \\times 2 + 1 \\times 2 = ${fmt(r2)}$`);
    expect([inv[0], inv[1], inv[2], inv[3]]).toEqual([1, -0.5, -1, 1]);
    expect(body).toContain(`$\\det A^{-1} = 1 / \\det A = ${readout(lastOf('undo'), 'detinv')}$`);
  });

  it('measures the elimination: the system, the multiples, x, the check and det A from the pivots', () => {
    const { A, b } = inputOf('eliminate') as unknown as { A: number[][]; b: number[] };
    expect(body).toContain(A.map((row, i) => `${row.map((v) => tex(fmt(v))).join(' & ')} & ${tex(fmt(b[i]))}`).join(' \\\\ '));
    const r = eliminate(A, b);
    const multiples = r.steps.flatMap((s) => (s.kind === 'eliminate' ? [s.factor] : []));
    expect(r.swaps).toBe(0);
    // The prose before the challenge explains the rule on other numbers, so it never works the first question.
    const before = body.slice(0, body.indexOf('<PredictChallenge'));
    expect(before).not.toContain(`${fmt(A[1][0])} / ${fmt(A[0][0])}`);
    expect(before).not.toContain(`${fmt(multiples[0])} times`);
    expect(body).toContain(`The multiples were ${multiples.slice(0, -1).map((f) => fmt(f)).join(', ')} and ${fmt(multiples.at(-1)!)}`);
    expect(body).toContain(`$x = (${r.x!.map((v) => tex(fmt(v))).join(', ')})$`);
    expect(body).toContain(`$b = (${matVec(A, r.x!).map((v) => tex(fmt(v))).join(', ')})$`);
    expect(body).toContain(`$${r.pivots.map((p) => fmt(p)).join(' \\times ')} = ${fmt(r.det)}$`);
    expect(readout(lastOf('eliminate'), 'det')).toBe(`${r.pivots.map((p) => fmt(p)).join('·')} = ${fmt(r.det)}`);
  });

  it('measures the pivots of the undo matrix: their product is det A, as ad − bc', () => {
    const { m } = inputOf('undo') as unknown as { m: Mat2 };
    const r = eliminate([[m[0], m[1]], [m[2], m[3]]], [0, 0]);
    expect(r.swaps).toBe(0);
    expect(r.det).toBe(det(m));
    expect(body).toContain(`$${bmatrix(m)}$, the pivots are ${r.pivots.map((p) => fmt(p)).join(' and ')}, whose product is ${fmt(r.det)}`);
    expect(r.pivots[1]).toBe(m[3] - (m[1] * m[2]) / m[0]);
  });

  it('writes the hook’s equations as Ax = b', () => {
    const { A, b } = inputOf('eliminate') as unknown as { A: number[][]; b: number[] };
    expect(body).toContain(`$$ A = \\begin{bmatrix} ${A.map((row) => row.map((v) => tex(fmt(v))).join(' & ')).join(' \\\\ ')} \\end{bmatrix} $$`);
    expect(body).toContain(`right-hand sides into $b = (${b.map((v) => tex(fmt(v))).join(', ')})$`);
    expect(body).toContain(`$${A[0].map((v, j) => `${fmt(v)}x_${j + 1}`).join(' + ')}$, the left side of the first equation`);
  });

  it('measures the zero pivot and the singular system', () => {
    const { A, b } = inputOf('pivot') as unknown as { A: number[][]; b: number[] };
    const r = eliminate(A, b);
    expect(r.swaps).toBe(1);
    expect(body).toContain(`the pivots are ${r.pivots.slice(0, -1).map((p) => fmt(p)).join(', ')} and ${fmt(r.pivots.at(-1)!)} with one swap, so $\\det A = ${tex(fmt(r.det))}$`);
    const s = inputOf('singular') as unknown as { A: number[][]; b: number[] };
    const sr = eliminate(s.A, s.b);
    expect(sr.x).toBeNull();
    expect(body).toContain(`$A = ${bmatrix(s.A.flat() as unknown as Mat2)}$`);
    expect(body).toContain(`$b = (${s.b.join(', ')})$`);
    expect(body).toContain(`$0x_1 + 0x_2 = ${fmt(sr.M[1][2])}$`);
    expect(readout(lastOf('singular'), 'x')).toBe('no solution');
  });

  it('works out the quiz and the probes with the module’s own helpers', () => {
    expect(det([3, 1, 2, 4])).toBe(10);
    expect(inverse2([3, 1, 5, 2])).toEqual([2, -1, -5, 3]);
    expect(det([2, 6, 1, 3])).toBe(0);
    expect(eliminate([[2, 6], [1, 3]], [4, 2]).missing).toBe(1);
    expect(eliminate([[2, 1], [0, 3]], [7, 9]).x).toEqual([2, 3]);
    expect(-(2 * -1 * 3)).toBe(6);
    expect(inverse2([7, 6, 8, 7])).toEqual([7, -6, -8, 7]);
    expect(inverse2([4, 2, 2, 2])).toEqual([0.5, -0.5, -0.5, 1]);
    expect(det([5, 10, 7, 14])).toBe(0);
    expect(apply([5, 10, 7, 14], [10, -5])).toEqual([0, 0]);
    // Flipping each entry of [[2, 1], [1, 1]] doesn't undo it: the top-left cell of the product is 2.
    expect(0.5 * 2 + 1 * 1).toBe(2);
    expect(inverse2([2, 1, 1, 1])).toEqual([1, -1, -1, 2]);
    expect(det([0, 2, 1, 1])).toBe(-2);
    expect(eliminate([[0, 2], [1, 1]], [4, 3]).x).toEqual([1, 2]);
    for (const quoted of ['3 × 4 − 1 × 2 = 10', '[[2, −1], [−5, 3]]', '2 × 3 − 6 × 1 = 0', 'y = 3, then 2x + 3 = 7, so x = 2', '2 × (−1) × 3 = −6', '[[7, −6], [−8, 7]]', '[[0.5, −0.5], [−0.5, 1]]', '5 × 14 − 10 × 7 = 0', '0.5 \\times 2 + 1 \\times 1 = 2', 'det = 0 × 1 − 2 × 1 = −2', 'x = (1, 2)'])
      expect(body).toContain(quoted);
  });
});
