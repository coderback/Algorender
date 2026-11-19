// B3 of the math and ML path, span, basis and rank: every number the lesson
// quotes is measured here from the code that draws it, and must appear in the
// lesson exactly as written. The embedded visualisers are checked too: each
// preset exists, each starting step is a real frame, and the prediction
// challenge asks at least its goal.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { add, scale } from '@/algorithms/linear-algebra/shared';
import { cross, dependencies, dependencyText, echelon, firstCombo, rankOf, recipe, span, type Matrix } from '@/algorithms/linear-algebra/span';
import { fmt, fmtVec } from '@/viz/plot/geometry';
import { readout, traceOf } from '@/viz/plot/testing';
import type { ImagePart, PlotState, Vec } from '@/viz/plot/types';

const body = readFileSync(fileURLToPath(new URL('./span-basis-rank.mdx', import.meta.url)), 'utf8').replace(/\s+/g, ' ');
/** LaTeX writes a minus as -, captions as −. */
const tex = (s: string) => s.replace(/−/g, '-');

const inputOf = (preset: string) => span.input.examples.find((e) => e.id === preset)!.make({ seed: 0, size: 0 });
const framesOf = (preset: string) => traceOf(span, inputOf(preset)).frames as { state: PlotState; checkpoint?: { choices: string[]; answer: number }; note: string }[];
const spanInput = (preset: string) => inputOf(preset) as { story: 'span'; u: Vec; v: Vec; w: Vec };
const rankInput = (preset: string) => (inputOf(preset) as { story: 'rank'; A: Matrix }).A;

function embeds() {
  return [...body.matchAll(/<(Explore|PredictChallenge) slug="([a-z-]+)" settings=\{\{ preset: '([a-z-]+)'(?:, step: '(\d+)')? \}\}[^>]*?(?:goal=\{(\d+)\})?[^>]*\/>/g)].map((m) => ({
    tag: m[1],
    slug: m[2],
    preset: m[3],
    step: m[4] === undefined ? null : Number(m[4]),
    goal: m[5] === undefined ? null : Number(m[5]),
  }));
}

describe('span-basis-rank', () => {
  it('embeds real presets, at frames that exist, with enough questions for its goal', () => {
    const found = embeds();
    expect(found.length).toBeGreaterThanOrEqual(4);
    expect(found.filter((e) => e.tag === 'PredictChallenge')).toHaveLength(1);
    for (const e of found) {
      expect(e.slug).toBe('span');
      const frames = framesOf(e.preset);
      if (e.step !== null) expect(e.step).toBeLessThan(frames.length);
      if (e.goal !== null) expect(frames.filter((f) => f.checkpoint).length, `${e.preset} asks fewer than ${e.goal}`).toBeGreaterThanOrEqual(e.goal);
    }
  });

  it('opens the drag-it embed on the last frame, where u, v and w can all be dragged', () => {
    const drag = embeds().find((e) => e.tag === 'Explore' && e.step !== null)!;
    expect(drag.preset).toBe('span');
    const frames = framesOf('span');
    expect(drag.step).toBe(frames.length - 1);
    const plane = frames[drag.step!].state.parts.find((p) => p.kind === 'plane');
    expect(plane?.kind === 'plane' && plane.handles.map((h) => h.id)).toEqual(['u', 'v', 'w']);
    expect(readout(frames[drag.step!].state, 'rank')).toBe('2');
  });

  it('embeds the rank exercise', () => {
    expect([...body.matchAll(/exercise="([a-z-]+)"/g)].map((m) => m[1])).toEqual(['matrix-rank']);
  });

  it('quotes two directions reaching the plane: 2u + v, the recipe for w and det [u v]', () => {
    const { u, v, w } = spanInput('span');
    expect(body).toContain(`u = ${fmtVec(u)}`);
    expect(body).toContain(`v = ${fmtVec(v)}`);
    expect(firstCombo(u, v)).toEqual([2, 1]);
    const combo = add(scale(2, u), v);
    expect(readout(framesOf('span')[1].state, 'combo')).toBe(fmtVec(combo));
    expect(body).toContain(`$$ 2u + v = ${fmtVec(scale(2, u))} + ${fmtVec(v)} = ${fmtVec(combo)} $$`);
    expect(body).toContain(`w = ${fmtVec(w)}`);
    // The two equations, one per part.
    expect(body).toContain(`${fmt(u[0])}a + b &= ${fmt(w[0])}`);
    expect(body).toContain(`a + ${fmt(v[1])}b &= ${fmt(w[1])}`);
    expect([u[1], v[0]]).toEqual([1, 1]);
    const [a, b] = recipe(u, v, w);
    expect(body).toContain(tex(`$a = ${fmt(a)}$, $b = ${fmt(b)}$`));
    expect(body).toContain(tex(`$-u + 2v = ${fmtVec(scale(a, u))} + ${fmtVec(scale(b, v))} = ${fmtVec(w)}$`));
    expect([a, b]).toEqual([-1, 2]);
    // The bridge: [u v]·(a, b) = a·u + b·v, with u and v as the columns.
    expect(body).toContain(
      `\\begin{bmatrix} ${u[0]} & ${v[0]} \\\\ ${u[1]} & ${v[1]} \\end{bmatrix} \\begin{bmatrix} a \\\\ b \\end{bmatrix} \\\\ &= a \\begin{bmatrix} ${u[0]} \\\\ ${u[1]} \\end{bmatrix} + b \\begin{bmatrix} ${v[0]} \\\\ ${v[1]} \\end{bmatrix}`,
    );
    expect(readout(framesOf('span')[3].state, 'recipe')).toBe('−u + 2v');
    expect(body).toContain(`$\\det\\,[u\\ v] = ${fmt(cross(u, v))}$, not 0`);
    expect(readout(framesOf('span')[2].state, 'det')).toBe(fmt(cross(u, v)));
  });

  it('quotes two vectors on one line: v = −u, w out of reach, its closest point and the gap', () => {
    const { u, v, w } = spanInput('parallel');
    expect(v).toEqual(scale(-1, u));
    expect(body).toContain(tex(`$v = ${fmtVec(v)}$, which is $-u$`));
    expect(cross(u, v)).toBe(0);
    expect(body).toContain(`$w = ${fmtVec(w)}$ is off that line`);
    const frames = framesOf('parallel');
    expect(readout(frames[3].state, 'recipe')).toBe('out of reach');
    const closest = scale((w[0] * u[0] + w[1] * u[1]) / (u[0] * u[0] + u[1] * u[1]), u);
    expect(body).toContain(`The closest point on the line is $${fmtVec(closest)}$, still $${fmt(Math.hypot(w[0] - closest[0], w[1] - closest[1]))}$ away`);
    expect(frames[3].checkpoint!.choices[frames[3].checkpoint!.answer]).toBe('1');
    // The narration says v = −u in words, and the caption only sets the scene.
    expect(frames[2].note).toContain("v = −u lies on u's line");
    expect(body).toContain(`caption="u = ${fmtVec(u)} and v = ${fmtVec(v)}, with a target w = ${fmtVec(w)}.`);
  });

  it('quotes elimination on the 3×3 matrix: the rows it leaves, the missing pivot and the rank', () => {
    const A = rankInput('rank');
    expect(body).toContain(`$$ A = \\begin{bmatrix} ${A.map((r) => r.join(' & ')).join(' \\\\ ')} \\end{bmatrix} $$`);
    const images = framesOf('rank').map((f) => f.state.parts.find((p): p is ImagePart => p.kind === 'image')!);
    const rowOf = (img: ImagePart, i: number) => `(${img.values!.slice(i * 3, i * 3 + 3).join(', ')})`;
    expect(body).toContain(`Subtracting $2$ times row 1 from row 2 leaves $${rowOf(images[2], 1)}$`);
    expect(body).toContain(`subtracting $3$ times row 1 from row 3 leaves $${rowOf(images[3], 2)}$`);
    expect(body).toContain(`turns row 3 into $${rowOf(images[images.length - 1], 2)}$`);
    expect(rankOf(A)).toBe(2);
    expect(body).toContain('Two pivots, so the rank is 2');
    expect(echelon(A).pivots.map(([, c]) => c + 1)).toEqual([1, 3]);
    const deps = dependencies(A);
    expect(deps.map(dependencyText)).toEqual(['column 2 = 2·column 1']);
    expect(body).toContain('column 2 $= 2 \\cdot$ column 1');
    expect(body).toContain('caption="Elimination on a 3×3 matrix, column by column. Watch which columns get a pivot."');
  });

  it('quotes the prediction round: a swap first, then pivots 1, 2 and 3.5, and rank 3', () => {
    const A = rankInput('rank-full');
    expect(A[0][0]).toBe(0);
    const { M, pivots } = echelon(A);
    expect(pivots.map(([r, c]) => fmt(M[r][c]))).toEqual(['1', '2', '3.5']);
    expect(body).toContain('$1$, $2$ and $3.5$');
    expect(rankOf(A)).toBe(3);
    expect(body).toContain('so the rank is 3');
    const frames = framesOf('rank-full');
    expect(frames[1].state.parts.some((p) => p.kind === 'image' && p.boxes?.some((b) => b.id === 'swap1'))).toBe(true);
    expect(readout(frames[frames.length - 1].state, 'pivots')).toBe('3');
    // A 3×3 matrix can't have rank 4, so the last question never offers it.
    const q = frames[frames.length - 2].checkpoint!;
    expect(q.choices.every((c) => Number(c) <= 3)).toBe(true);
  });
});
