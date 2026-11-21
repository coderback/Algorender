// B4 of the math and ML path, "Jacobians: the local linear map": every number
// the lesson quotes is measured here from the code that draws it, and must
// appear in the lesson exactly as written. The embedded visualisers are
// checked too: each preset exists, the prediction challenge asks at least its
// goal, and the one exercise practises this lesson's visualiser.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  areaScale,
  CENTRAL_H,
  CHAIN_T,
  CHAIN_W,
  chainCost,
  chainNumbers,
  CHECK_H,
  CHORD_H,
  col1,
  col2,
  DET_SIZE,
  det2,
  forwardColumn,
  jacobian,
  linearGap,
  MAPS,
  numericJacobian,
  relativeGap,
  SIZES,
  vjp,
  type JacobianInput,
} from '@/algorithms/calculus/jacobian';
import { getExercise } from '@/content/exercises';
import { PLANE_MAPS } from '@/content/exercises/calculus';
import { fmt, fmtVec } from '@/viz/plot/geometry';
import { readout, traceOf } from '@/viz/plot/testing';
import type { Mat2, PlotState, Vec } from '@/viz/plot/types';

const source = readFileSync(fileURLToPath(new URL('./jacobians.mdx', import.meta.url)), 'utf8');
const body = source.replace(/\s+/g, ' ');
/** LaTeX writes a minus as -, captions and readouts as −. */
const tex = (s: string) => s.replace(/−/g, '-');

const inputOf = (preset: string) => {
  const ex = jacobian.input.examples.find((e) => e.id === preset);
  if (!ex) throw new Error(`jacobian has no example ${preset}`);
  return ex.make({ seed: 0, size: 0 }) as JacobianInput;
};
const framesOf = (preset: string) => traceOf(jacobian, inputOf(preset)).frames as { state: PlotState; note: string; checkpoint?: unknown }[];
const bend = MAPS.bend;
const close = (a: readonly number[], b: readonly number[]) => a.every((x, i) => Math.abs(x - b[i]) < 1e-9);
const bmatrix = (m: Mat2) => tex(`\\begin{bmatrix} ${fmt(m[0])} & ${fmt(m[1])} \\\\ ${fmt(m[2])} & ${fmt(m[3])} \\end{bmatrix}`);

describe('jacobians embeds', () => {
  it('embeds real presets, with one prediction challenge that asks at least its goal', () => {
    // The goal is read from the whole tag: an optional group after a lazy [^>]*? would never capture it.
    const found = [...body.matchAll(/<(Explore|PredictChallenge) slug="([a-z-]+)" settings=\{\{ preset: '([a-z-]+)'(?:, step: '(\d+)')? \}\}[^>]*\/>/g)].map((m) => {
      const goal = /goal=\{(\d+)\}/.exec(m[0]);
      return { tag: m[1], slug: m[2], preset: m[3], step: m[4] === undefined ? null : Number(m[4]), goal: goal ? Number(goal[1]) : null };
    });
    expect(found).toHaveLength((source.match(/<(Explore|PredictChallenge) /g) ?? []).length);
    expect(found.map((e) => e.preset)).toEqual(['zoom', 'columns', 'chain', 'polar']);
    expect(found.filter((e) => e.tag === 'PredictChallenge').map((e) => [e.preset, e.goal])).toEqual([['chain', 4]]);
    for (const e of found) {
      expect(e.slug).toBe('jacobian');
      const frames = framesOf(e.preset);
      if (e.step !== null) expect(e.step).toBeLessThan(frames.length);
      if (e.goal !== null) expect(frames.filter((f) => f.checkpoint).length, `${e.preset} asks fewer than ${e.goal}`).toBeGreaterThanOrEqual(e.goal);
    }
  });

  it('embeds one exercise, which practises this lesson’s visualiser', () => {
    const used = [...source.matchAll(/exercise="([a-z-]+)"/g)].map((m) => m[1]);
    expect(used).toEqual(['jacobian-numeric']);
    expect(getExercise('jacobian-numeric')?.visualiser).toBe('jacobian');
    // The exercise's bend is the lesson's bend.
    for (const p of [[1, 1], [-2, 0.5], [0.3, -1.7]] as Vec[]) expect(PLANE_MAPS.bend.F(p[0], p[1])).toEqual(bend.f(p));
    const linear = PLANE_MAPS.linear;
    expect(linear.J(5, -3)).toEqual(linear.J(0, 0));
    expect(body).toContain('the last example in the exercise below shows');
    expect(getExercise('jacobian-numeric')?.examples.at(-1)?.id).toBe('linear');
  });
});

describe('jacobians quotes', () => {
  it('bends the plane with F(x, y) = (x + y²/4, y − x²/4), and J at p = (1, 1)', () => {
    expect(bend.formula).toBe('F(x, y) = (x + y²/4, y − x²/4)');
    expect(body).toContain('F(x, y) = \\left(x + \\frac{y^2}{4},\\ y - \\frac{x^2}{4}\\right)');
    for (const p of [[0.5, -1.5], [2, 1], [-1, 2]] as Vec[]) expect(close(bend.f(p), [p[0] + p[1] ** 2 / 4, p[1] - p[0] ** 2 / 4])).toBe(true);
    const { p, story, map } = inputOf('zoom');
    expect([story, map, fmtVec(p)]).toEqual(['zoom', 'bend', '(1, 1)']);
    expect(inputOf('columns')).toEqual({ story: 'columns', map: 'bend', p: [1, 1] });
    expect(fmtVec(bend.f(p))).toBe('(1.25, 0.75)');
    expect(body).toContain('Take the point $p = (1, 1)$. Then $F(p) = (1 + \\tfrac14,\\ 1 - \\tfrac14) = (1.25, 0.75)$');
    // The partial derivatives, as the module writes them and as measured.
    expect(bend.entries).toEqual(['1', 'y/2', '−x/2', '1']);
    for (const q of [[1, 1], [-1.5, 0.5], [2, -2]] as Vec[]) expect(numericJacobian(bend.f, q).every((v, i) => Math.abs(v - bend.jac(q)[i]) < 1e-6)).toBe(true);
    expect(body).toContain('\\frac{\\partial F_1}{\\partial x} &= 1, & \\frac{\\partial F_1}{\\partial y} &= \\frac{y}{2}');
    expect(body).toContain('\\frac{\\partial F_2}{\\partial x} &= -\\frac{x}{2}, & \\frac{\\partial F_2}{\\partial y} &= 1');
    const J = bend.jac(p);
    expect(body).toContain(`-\\frac{x}{2} & 1 \\end{bmatrix} = ${bmatrix(J)}`);
  });

  it('measures the gap between the square’s image and the parallelogram', () => {
    const p = inputOf('zoom').p;
    expect([...SIZES]).toEqual([0.8, 0.4, 0.2, 0.1]);
    const gaps = SIZES.map((s) => fmt(linearGap(bend, p, s), 3));
    const ratios = SIZES.map((s) => fmt(relativeGap(bend, p, s), 3));
    expect(gaps.slice(0, 3)).toEqual(['0.226', '0.057', '0.014']);
    expect(ratios).toEqual(['0.283', '0.141', '0.071', '0.035']);
    expect(body).toContain('For the square of side 0.8, the two outlines are up to 0.226 apart. Halve the square to side 0.4 and the biggest gap drops to 0.057');
    expect(body).toContain('At side 0.2 it is 0.014');
    expect(body).toContain('the gap goes from 0.283 to 0.141, then 0.071, then 0.035, halving each time');
    // Why a quarter: F(p + (a, b)) = F(p) + J·(a, b) + (b²/4, −a²/4), exactly.
    expect(body).toContain('F(p + (a, b)) = F(p) + J \\begin{bmatrix} a \\\\ b \\end{bmatrix} + \\begin{bmatrix} b^2/4 \\\\ -a^2/4 \\end{bmatrix}');
    for (const [q, a, b] of [
      [[1, 1], 0.3, -0.7],
      [[-1.5, 0.5], 1.2, 0.4],
      [[2, -2], -0.8, -0.1],
    ] as [Vec, number, number][]) {
      const [j0, j1, j2, j3] = bend.jac(q);
      const Fq = bend.f(q);
      expect(close(bend.f([q[0] + a, q[1] + b]), [Fq[0] + j0 * a + j1 * b + b * b / 4, Fq[1] + j2 * a + j3 * b - a * a / 4])).toBe(true);
    }
    // About a quarter each time the square halves.
    for (let i = 1; i < SIZES.length; i++) expect(linearGap(bend, p, SIZES[i]) / linearGap(bend, p, SIZES[i - 1])).toBeCloseTo(0.25, 2);
    // The frames show the same readouts.
    const frames = framesOf('zoom');
    expect([readout(frames[2].state, 'gap'), readout(frames[3].state, 'gap'), readout(frames[4].state, 'gap')]).toEqual(gaps.slice(0, 3));
    expect(readout(frames[5].state, 'ratio')).toBe('0.035');
  });

  it('reads J’s columns and det J at p, at the origin and at q', () => {
    const p = inputOf('columns').p;
    const J = bend.jac(p);
    expect([fmtVec(col1(J)), fmtVec(col2(J))]).toEqual(['(1, −0.5)', '(0.5, 1)']);
    expect(body).toContain('Column 1 of $J$ is $(1, -0.5)$');
    expect(body).toContain('by about $h \\times (1, -0.5)$');
    expect(CHORD_H).toBe(0.5);
    expect(fmtVec(forwardColumn(bend, p, 0, CHORD_H), 3)).toBe('(1, −0.625)');
    expect(body).toContain('A real step of $h = 0.5$ gives $(1, -0.625)$ for each unit of step');
    expect(CENTRAL_H).toBe(0.01);
    expect(close(numericJacobian(bend.f, p, CENTRAL_H), J)).toBe(true);
    expect(body).toContain('With $h = 0.01$ it gives column 1 as $(1, -0.5)$ and column 2, from a step along $y$, as $(0.5, 1)$, exactly');
    expect(det2(J)).toBe(1.25);
    expect(J[0] * J[3] - J[1] * J[2]).toBe(1.25);
    expect(body).toContain('The determinant is $1 \\times 1 - 0.5 \\times (-0.5) = 1.25$');
    expect(DET_SIZE).toBe(0.25);
    expect(fmt(areaScale(bend, p, DET_SIZE), 3)).toBe('1.316');
    expect(fmt(areaScale(bend, p, 0.001), 3)).toBe('1.25');
    expect(body).toContain('A square of side 0.25 at $p$ comes out with 1.316 times its area');
    expect(bend.detText).toBe('1 + xy/4');
    expect(body).toContain('\\det J = 1 \\cdot 1 - \\frac{y}{2} \\cdot \\left(-\\frac{x}{2}\\right) = 1 + \\frac{xy}{4}');
    for (const [x, y] of [
      [0.5, -1.5],
      [2, 1],
      [-1, 2],
    ])
      expect(det2(bend.jac([x, y]))).toBeCloseTo(1 * 1 - (y / 2) * (-x / 2), 12);
    expect(bend.jac([0, 0])).toEqual([1, 0, -0, 1]);
    expect(det2(bend.jac([0, 0]))).toBe(1);
    expect(body).toContain('At the origin, $J$ is the identity matrix and $\\det J = 1$');
    const q = bend.flat(p);
    expect(q).toEqual([2, -2]);
    const Jq = bend.jac(q);
    expect(det2(Jq)).toBe(0);
    expect(body).toContain('At $q = (2, -2)$, $\\det J = 0$');
    expect(body).toContain(`J = ${bmatrix(Jq)}`);
    expect([fmtVec(col1(Jq)), fmtVec(col2(Jq))]).toEqual(['(1, −1)', '(−1, 1)']);
    expect(body).toContain('Its columns $(1, -1)$ and $(-1, 1)$ lie on one line');
    // The misconceptions' corrections: the transposed J at p, and det J at three points.
    const T: Mat2 = [J[0], J[2], J[1], J[3]];
    expect(body).toContain(`it would be $${bmatrix(T)}$`);
    expect(fmtVec(col1(T))).toBe('(1, 0.5)');
    expect(body).toContain('towards $(1, 0.5)$ instead of $(1, -0.5)$');
    expect(body).toContain('it is 1 at the origin, 1.25 at $p = (1, 1)$ and 0 at $q = (2, -2)$');
  });

  it('backprops through x → F → W → L at x = (2, 2)', () => {
    const { p: x, story, map } = inputOf('chain');
    expect([story, map, fmtVec(x)]).toEqual(['chain', 'bend', '(2, 2)']);
    expect(CHAIN_W).toEqual([1, 0, 1, 1]);
    expect(body).toContain(`W = ${bmatrix(CHAIN_W)}`);
    const n = chainNumbers(bend, x);
    expect([fmtVec(n.u), fmtVec(n.v), fmtVec(CHAIN_T), fmt(n.L)]).toEqual(['(3, 1)', '(3, 4)', '(2, 2)', '2.5']);
    expect(body).toContain('At $x = (2, 2)$, the forward pass gives $u = (3, 1)$ and $v = (3, 4)$, and with $t = (2, 2)$ the loss is 2.5');
    expect([n.gv, n.gu, n.gx]).toEqual([
      [1, 2],
      [3, 2],
      [1, 5],
    ]);
    expect(body).toContain('$\\partial L/\\partial v = [1, 2]$. Times $W$, one column at a time, that becomes $[3, 2]$');
    expect(body).toContain(`$J_F(x) = ${bmatrix(n.J)}$, it gives $\\partial L/\\partial x = [1, 5]$`);
    expect(CHECK_H).toBe(0.001);
    expect(n.numeric.map((g) => fmt(g))).toEqual(['1', '5']);
    expect(body).toContain('nudge each coordinate of $x$ by ±0.001 and work out $L$ again: you get the same $[1, 5]$');
    // The challenge's numbers are said only after it.
    expect(source.indexOf('[1, 5]')).toBeGreaterThan(source.indexOf('<PredictChallenge'));
    expect(source.indexOf('(3, 4)')).toBeGreaterThan(source.indexOf('<PredictChallenge'));
  });

  it('counts the multiplications, a row at a time against the product first', () => {
    const two = chainCost(2, 2);
    expect(two).toEqual({ rowByRow: 8, matricesFirst: 12 });
    expect(2 ** 2).toBe(4);
    expect(2 ** 3 + 2 ** 2).toBe(two.matricesFirst);
    expect(body).toContain('a row times a $2 \\times 2$ matrix takes $2^2 = 4$ multiplications, so the two steps take 8');
    expect(body).toContain('Multiplying $W J_F$ first takes $2^3 = 8$, and then the row times the result takes another 4, so 12 in all');
    const wide = chainCost(1000, 2);
    expect(wide).toEqual({ rowByRow: 2_000_000, matricesFirst: 1_001_000_000 });
    expect(Math.floor(wide.matricesFirst / wide.rowByRow)).toBe(500);
    expect(body).toContain('a row at a time takes 2,000,000 multiplications, and building the product first takes 1,001,000,000, about 500 times as many');
  });

  it('runs polar coordinates at p = (2, 0.5): det J = r', () => {
    const input = inputOf('polar');
    expect(input).toEqual({ story: 'columns', map: 'polar', p: [2, 0.5] });
    expect(MAPS.polar.detText).toBe('r');
    expect(det2(MAPS.polar.jac(input.p))).toBeCloseTo(2, 12);
    expect(det2(MAPS.polar.jac([0.7, -1.2]))).toBeCloseTo(0.7, 12);
    expect(det2(MAPS.polar.jac([0, 0.5]))).toBe(0);
    expect(body).toContain('At $p = (2, 0.5)$ that is 2, so tiny squares there come out with twice their area');
    expect(fmt((0.5 * 180) / Math.PI, 0)).toBe('29');
    expect(body).toContain('The point $p = (2, 0.5)$ means 2 out, turned 0.5 radians (about 29°)');
    // J's entries as the module writes them, and the slope of sin by a central difference.
    expect(MAPS.polar.entries).toEqual(['cos θ', '−r·sin θ', 'sin θ', 'r·cos θ']);
    expect(body).toContain('J = \\begin{bmatrix} \\cos\\theta & -r\\sin\\theta \\\\ \\sin\\theta & r\\cos\\theta \\end{bmatrix}');
    expect([fmt((Math.sin(0.51) - Math.sin(0.49)) / 0.02, 3), fmt(Math.cos(0.5), 3)]).toEqual(['0.878', '0.878']);
    expect(body).toContain('$(\\sin 0.51 - \\sin 0.49) / 0.02 \\approx 0.878$, and $\\cos 0.5 \\approx 0.878$ too');
    expect(numericJacobian(MAPS.polar.f, input.p).every((v, i) => Math.abs(v - MAPS.polar.jac(input.p)[i]) < 1e-6)).toBe(true);
  });

  it('spreads the right answers across positions', () => {
    const answers = [...source.matchAll(/answer: (\d+),/g)].map((m) => Number(m[1]));
    expect(answers.length).toBe(12);
    expect(new Set(answers).size).toBeGreaterThanOrEqual(3);
    expect(answers.filter((a) => a === 0).length).toBeLessThanOrEqual(3);
  });

  it('checks the quiz and the probes', () => {
    // Quiz: F(x, y) = (x² + y, 3y) at (2, 1).
    const quiz1 = (v: Vec): Vec => [v[0] ** 2 + v[1], 3 * v[1]];
    expect(numericJacobian(quiz1, [2, 1]).map((v) => fmt(v))).toEqual(['4', '1', '0', '3']);
    expect(body).toContain("q: 'F(x, y) = (x² + y, 3y). What is its Jacobian at (2, 1)?', choices: ['[[4, 0], [1, 3]]', '[[2, 1], [0, 3]]', '[[4, 1], [0, 3]]', '[[4, 1], [0, 1]]'], answer: 2,");
    // Quiz: the bend at (2, 1) against (1, 1).
    expect(bend.jac([2, 1])).toEqual([1, 0.5, -1, 1]);
    expect(det2(bend.jac([2, 1]))).toBe(1.5);
    expect(det2(bend.jac([1, 1]))).toBe(1.25);
    expect(body).toContain('At (2, 1), J = [[1, 0.5], [−1, 1]], so det J = 1 × 1 − 0.5 × (−1) = 1.5');
    // Quiz: [2, −1] times [[1, 3], [0, 2]], and with J's rows used as columns.
    const J5: Mat2 = [1, 3, 0, 2];
    expect(vjp([2, -1], J5)).toEqual([2, 4]);
    expect(vjp([2, -1], [J5[0], J5[2], J5[1], J5[3]])).toEqual([-1, -2]);
    expect(body).toContain("choices: ['[2, −2]', '[2, 4]', '[−1, −2]', '[2, 6]'], answer: 1,");
    // Probe: F(x, y) = (x·y, x + 4y) at (3, 5).
    const probe1 = (v: Vec): Vec => [v[0] * v[1], v[0] + 4 * v[1]];
    expect(numericJacobian(probe1, [3, 5]).map((v) => fmt(v))).toEqual(['5', '3', '1', '4']);
    // Probes: (x², y) at (1, 0) and (3, 0); (2x, x·y) has det J = 2x.
    expect(numericJacobian((v) => [v[0] ** 2, v[1]], [3, 0]).map((v) => fmt(v))).toEqual(['6', '0', '0', '1']);
    expect(fmt(det2(numericJacobian((v) => [2 * v[0], v[0] * v[1]], [3, 0])))).toBe('6');
    expect(fmt(det2(numericJacobian((v) => [2 * v[0], v[0] * v[1]], [1, 0])))).toBe('2');
    // Probes: 100 wide.
    expect(chainCost(100, 1).rowByRow).toBe(10_000);
    expect(100 ** 3).toBe(1_000_000);
  });
});
