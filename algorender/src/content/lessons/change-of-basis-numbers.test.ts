// The change-of-basis lesson (B3 of the math and ML path): every number it
// quotes is measured here from the code that draws it, and must appear in the
// lesson exactly as written. Its embeds are checked too: each preset exists,
// and the prediction challenge asks at least its goal.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { basisMatrix, changeOfBasis, coordsIn, diagonalised, eigenbasisOf, fromCoords, inverse2, type CobInput } from '@/algorithms/linear-algebra/change-of-basis';
import { det } from '@/algorithms/linear-algebra/shared';
import { apply, fmt, fmtVec } from '@/viz/plot/geometry';
import { readout, traceOf } from '@/viz/plot/testing';
import type { Mat2, PlotState, Vec } from '@/viz/plot/types';

const body = readFileSync(fileURLToPath(new URL('./change-of-basis.mdx', import.meta.url)), 'utf8').replace(/\s+/g, ' ');
/** LaTeX writes a minus as -, prose as −. */
const tex = (s: string) => s.replace(/−/g, '-');

const inputOf = (preset: string) => changeOfBasis.input.examples.find((e) => e.id === preset)!.make({ seed: 0, size: 0 }) as CobInput;
const framesOf = (preset: string) => traceOf(changeOfBasis, inputOf(preset)).frames as { state: PlotState; note: string; checkpoint?: { choices: readonly string[]; answer: number } }[];
const answer = (f: { checkpoint?: { choices: readonly string[]; answer: number } }) => f.checkpoint!.choices[f.checkpoint!.answer];

describe('change-of-basis lesson', () => {
  it('embeds real presets, with one prediction challenge that asks at least its goal', () => {
    const found = [...body.matchAll(/<(Explore|PredictChallenge) slug="([a-z-]+)" settings=\{\{ preset: '([a-z-]+)'(?:, step: '(\d+)')? \}\}(?:[^>]*?goal=\{(\d+)\})?[^>]*\/>/g)];
    expect(found.length).toBeGreaterThanOrEqual(3);
    expect(found.filter((m) => m[1] === 'PredictChallenge')).toHaveLength(1);
    for (const m of found) {
      expect(m[2]).toBe('change-of-basis');
      const frames = framesOf(m[3]);
      if (m[4] !== undefined) expect(Number(m[4])).toBeLessThan(frames.length);
      if (m[5] !== undefined) expect(frames.filter((f) => f.checkpoint).length).toBeGreaterThanOrEqual(Number(m[5]));
    }
    expect([...body.matchAll(/exercise="([a-z-]+)"/g)].map((m) => m[1])).toEqual(['basis-coords']);
  });

  it('reads v = (3, 3) on the grid of b₁ = (2, 1), b₂ = (−1, 1) as c = (2, 1), with P⁻¹ and det P', () => {
    const input = inputOf('coords');
    if (input.story !== 'coords') throw new Error('coords preset');
    const { b1, b2, v } = input;
    const frames = framesOf('coords');
    const c = readout(frames[2].state, 'c')!;
    expect(c).toBe(fmtVec(coordsIn(b1, b2, v)));
    expect(body).toContain(`$v = ${fmtVec(v)}$`);
    expect(body).toContain(`$b_1 = ${fmtVec(b1)}$ and $b_2 = ${tex(fmtVec(b2))}$`);
    expect(body).toContain(`$c = ${c}$`);
    const cv = coordsIn(b1, b2, v);
    expect(body).toContain(`$v$ is ${fmt(cv[0])} steps along $b_1$ and ${fmt(cv[1])} along $b_2$`);
    expect(body).toContain(`&= ${fmt(cv[0])}\\,b_1 + ${fmt(cv[1])}\\,b_2`);
    expect(body).toContain(`&= ${tex(fmtVec([cv[0] * b1[0], cv[0] * b1[1]]))} + ${tex(fmtVec([cv[1] * b2[0], cv[1] * b2[1]]))} = ${fmtVec(v)}`);
    // Listing b₂ first swaps the coordinates (the checkpoint asks it).
    expect(answer(frames[4])).toBe(fmtVec([cv[1], cv[0]]));
    expect(body).toContain(`the coordinates become $${fmtVec([cv[1], cv[0]])}$`);
    const P = basisMatrix(b1, b2);
    expect(body).toContain(`$$ P = \\begin{bmatrix} ${P[0]} & ${P[1]} \\\\ ${P[2]} & ${P[3]} \\end{bmatrix} $$`);
    const D = det(P);
    expect(readout(frames[4].state, 'det')).toBe(fmt(D));
    const term = (x: number) => (x < 0 ? `(${tex(fmt(x))})` : fmt(x));
    expect(body).toContain(`\\det P &= ${term(P[0])} \\cdot ${term(P[3])} - ${term(P[1])} \\cdot ${term(P[2])} = ${fmt(D)}`);
    const scaled = inverse2(P)!.map((x) => Math.round(x * D)) as unknown as Mat2;
    expect(body).toContain(`P^{-1} = \\tfrac{1}{${fmt(D)}}\\begin{bmatrix} ${scaled[0]} & ${scaled[1]} \\\\ ${scaled[2]} & ${scaled[3]} \\end{bmatrix}`);
    // c = (1/det)·(row 1 of the scaled inverse · v, row 2 · v), each written as its two products.
    const sum = (a: number, b: number) => `${tex(fmt(a))} ${b < 0 ? '-' : '+'} ${fmt(Math.abs(b))}`;
    const row = (i: number) => sum(scaled[2 * i] * v[0], scaled[2 * i + 1] * v[1]);
    expect(body).toContain(`c = P^{-1} v &= \\tfrac{1}{${fmt(D)}}(${row(0)},\\ ${row(1)}) = ${c}`);
    // The note on that frame writes the inverse out in numbers.
    expect(frames[4].note).toContain(`P⁻¹ = (1/${fmt(D)})·[[${scaled[0]}, ${scaled[1]}], [${fmt(scaled[2])}, ${scaled[3]}]]`);
  });

  it('goes back from c = (3, 1) on the grid of (1, 1) and (−1, 1) to (2, 4), row by row', () => {
    const input = inputOf('back');
    if (input.story !== 'back') throw new Error('back preset');
    const { b1, b2, c } = input;
    const frames = framesOf('back');
    const v = readout(frames[3].state, 'v')!;
    expect(v).toBe(fmtVec(fromCoords(b1, b2, c)));
    expect(body).toContain(`$b_1 = ${fmtVec(b1)}$ and $b_2 = ${tex(fmtVec(b2))}$, a vector has coordinates $c = ${fmtVec(c)}$`);
    expect(body).toContain(`along $b_1$ reach $${fmtVec([c[0] * b1[0], c[0] * b1[1]])}$`);
    expect(body).toContain(`adds $${tex(fmtVec([c[1] * b2[0], c[1] * b2[1]]))}$, so the tip is at $${v}$`);
    const P = basisMatrix(b1, b2);
    const term = (x: number) => (x < 0 ? `(${tex(fmt(x))})` : fmt(x));
    expect(body).toContain(`$${term(P[0])} \\times ${fmt(c[0])} + ${term(P[1])} \\times ${fmt(c[1])} = ${fmt(apply(P, c)[0])}$`);
    expect(body).toContain(`$${term(P[2])} \\times ${fmt(c[0])} + ${term(P[3])} \\times ${fmt(c[1])} = ${fmt(apply(P, c)[1])}$`);
    const further = fmtVec(fromCoords(b1, b2, [c[0], c[1] + 1]));
    expect(answer(frames[2])).toBe(further);
    expect(body).toContain(`moving the tip to $${further}$`);
  });

  it('turns A = [[2, 1], [1, 2]] into D = [[3, 0], [0, 1]] in its eigenbasis', () => {
    const input = inputOf('eigenbasis');
    if (input.story !== 'eigenbasis') throw new Error('eigenbasis preset');
    const m = input.m;
    const e = eigenbasisOf(m)!;
    const [l1, l2] = e.lambdas;
    expect(body).toContain(`$A = \\begin{bmatrix} ${m[0]} & ${m[1]} \\\\ ${m[2]} & ${m[3]} \\end{bmatrix}$`);
    expect(body).toContain(`$b_1 = ${fmtVec(e.b1)}$ goes to $A b_1 = ${fmtVec(apply(m, e.b1))}$, which is $${fmt(l1)} b_1$`);
    expect(body).toContain(`$b_2 = ${tex(fmtVec(e.b2))}$ goes to $A b_2 = ${tex(fmtVec(apply(m, e.b2)))}$, which is $${fmt(l2)} b_2$`);
    expect(body).toContain(`$\\lambda_1 = ${fmt(l1)}$ and $\\lambda_2 = ${fmt(l2)}$`);
    const frames = framesOf('eigenbasis');
    expect(answer(frames[1])).toBe(fmtVec([l1, l2]));
    expect(body).toContain(`coordinates $(1, 1)$ in this basis lands at $${fmtVec([l1, l2])}$`);
    expect(body).toContain(`multiplies the first coordinate by ${fmt(l1)} and the second by ${fmt(l2)}`);
    const D = diagonalised(m, e).map((x) => fmt(x));
    expect(body).toContain(`D = P^{-1} A P = \\begin{bmatrix} ${D[0]} & ${D[1]} \\\\ ${D[2]} & ${D[3]} \\end{bmatrix}`);
    expect(body).toContain(`$${fmt(l1)}^{10}$ and $${fmt(l2)}^{10}$`);
  });

  it('quotes quiz and probe answers that the arithmetic agrees with', () => {
    // Probe: b₁ = (1, 0), b₂ = (2, 1), v = (5, 3); P·v is the trap.
    const pb1: Vec = [1, 0];
    const pb2: Vec = [2, 1];
    expect(fmtVec(coordsIn(pb1, pb2, [5, 3]))).toBe('(−1, 3)');
    expect(fmtVec(apply(basisMatrix(pb1, pb2), [5, 3]))).toBe('(11, 3)');
    // Quiz Q1's trap: P⁻¹·c instead of P·c.
    expect(fmtVec(apply(inverse2(basisMatrix([1, 2], [0, 1]))!, [3, -1]))).toBe('(3, −7)');
    // Quiz.
    expect(fmtVec(fromCoords([1, 2], [0, 1], [3, -1]))).toBe('(3, 5)');
    expect(fmtVec(fromCoords([1, 2], [0, 1], [3, 1]))).toBe('(3, 7)');
    expect(fmtVec(coordsIn([0, 2], [3, 0], [6, 8]))).toBe('(4, 2)');
    expect(fmtVec(apply(basisMatrix([0, 2], [3, 0]), [6, 8]))).toBe('(24, 12)');
    const e = eigenbasisOf([3, 1, 1, 3])!;
    expect(e.lambdas).toEqual([4, 2]);
    expect([fmtVec(e.b1), fmtVec(e.b2)]).toEqual(['(1, 1)', '(1, −1)']);
    for (const s of ['(−1, 3)', '(11, 3)', '(3, −7)', '(3, 5)', '(3, 7)', '(4, 2)', '(24, 12)', '[[4, 0], [0, 2]]', '[[3, 1], [1, 3]]']) expect(body).toContain(s);
  });
});
