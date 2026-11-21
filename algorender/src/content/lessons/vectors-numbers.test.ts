// B2 of the math and ML path (vectors, the dot product, norms and matrix
// multiplication): every number its lessons quote is measured here from the
// code that draws it, and must appear in the lesson exactly as written. The
// embedded visualisers are checked too: each preset exists, each starting step
// is a real frame, and each prediction challenge asks at least its goal.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { cosine, dotN, dotProduct, project, WORDS } from '@/algorithms/linear-algebra/dot-product';
import { matmul, matrixMultiplication, mul2 } from '@/algorithms/linear-algebra/matrix-multiplication';
import { normOf, norms } from '@/algorithms/linear-algebra/norms';
import { dot, norm } from '@/algorithms/linear-algebra/shared';
import { mean, vectors } from '@/algorithms/linear-algebra/vectors';
import { getExercise } from '@/content/exercises';
import type { AnyAlgorithm } from '@/engine/module';
import { fmt, fmtVec } from '@/viz/plot/geometry';
import { readout, traceOf } from '@/viz/plot/testing';
import type { ImagePart, PlotState, Vec } from '@/viz/plot/types';

const lesson = (slug: string) => readFileSync(fileURLToPath(new URL(`./${slug}.mdx`, import.meta.url)), 'utf8').replace(/\s+/g, ' ');
/** LaTeX writes a minus as -, captions as −. */
const tex = (s: string) => s.replace(/−/g, '-');

const traceFor = (module: AnyAlgorithm, preset: string) => {
  const ex = module.input.examples.find((e) => e.id === preset);
  if (!ex) throw new Error(`${module.slug} has no example ${preset}`);
  return traceOf(module, ex.make({ seed: 0, size: 0 })).frames as { state: PlotState; checkpoint?: unknown; stats: Record<string, number> }[];
};
const inputOf = (module: AnyAlgorithm, preset: string) => module.input.examples.find((e) => e.id === preset)!.make({ seed: 0, size: 0 }) as never;
const last = (module: AnyAlgorithm, preset: string) => {
  const frames = traceFor(module, preset);
  return frames[frames.length - 1].state;
};

function embeds(body: string) {
  return [...body.matchAll(/<(Explore|PredictChallenge) slug="([a-z-]+)" settings=\{\{ preset: '([a-z-]+)'(?:, step: '(\d+)')? \}\}(?:[^>]*?goal=\{(\d+)\})?[^>]*\/>/g)].map((m) => ({
    tag: m[1],
    slug: m[2],
    preset: m[3],
    step: m[4] === undefined ? null : Number(m[4]),
    goal: m[5] === undefined ? null : Number(m[5]),
  }));
}

const MODULES: Record<string, AnyAlgorithm> = { vectors, 'dot-product': dotProduct, norms, 'matrix-multiplication': matrixMultiplication };
const LESSONS = { vectors: 'vectors', 'dot-product': 'dot-product', 'norms-distances': 'norms', 'matrix-multiplication': 'matrix-multiplication' } as const;

describe.each(Object.entries(LESSONS))('%s', (slug, visualiser) => {
  it('embeds real presets, at frames that exist, with enough questions for each goal', () => {
    const found = embeds(lesson(slug));
    expect(found.length).toBeGreaterThanOrEqual(2);
    expect(found.filter((e) => e.tag === 'PredictChallenge')).toHaveLength(1);
    for (const e of found) {
      expect(e.slug).toBe(visualiser);
      const frames = traceFor(MODULES[e.slug], e.preset);
      if (e.step !== null) expect(e.step).toBeLessThan(frames.length);
      if (e.goal !== null) expect(frames.filter((f) => f.checkpoint).length, `${e.preset} asks fewer than ${e.goal}`).toBeGreaterThanOrEqual(e.goal);
    }
  });

  it('embeds one exercise, which practises this lesson’s visualiser', () => {
    const used = [...lesson(slug).matchAll(/exercise="([a-z-]+)"/g)].map((m) => getExercise(m[1])!);
    expect(used).toHaveLength(1);
    expect(used[0].visualiser).toBe(visualiser);
  });
});

describe('vectors quotes', () => {
  const body = lesson('vectors');

  it('draws the same move from P, and the way back', () => {
    const { v, at } = inputOf(vectors, 'arrow') as { v: Vec; at: Vec };
    const frames = traceFor(vectors, 'arrow');
    const q = readout(frames[1].state, 'Q')!;
    expect(body).toContain(`$Q = ${tex(q)}$`);
    expect(body).toContain(`$$ Q - P = ${tex(q)} - ${tex(fmtVec(at))} = ${tex(fmtVec(v))} $$`);
    expect(body).toContain(`$P - Q = ${tex(readout(frames[3].state, 'PQ')!)}$`);
  });

  it('adds, subtracts, scales and measures what the visualiser does', () => {
    const add = traceFor(vectors, 'add');
    expect(readout(add[1].state, 'sum')).toBe('(4, 3)');
    expect(body).toContain('u + v &= (3, 1) + (1, 2) \\\\ &= (3 + 1,\\ 1 + 2) = (4, 3)');
    expect(body).toContain(`$u - v = ${tex(readout(add[3].state, 'diff')!)}$`);
    expect(readout(last(vectors, 'scale'), 'kv')).toBe('(−3, −1.5)');
    expect(body).toContain('−1.5v = (−3, −1.5)');
    const length = traceFor(vectors, 'length');
    expect(readout(length[1].state, 'len')).toBe('5');
    expect(readout(length[4].state, 'unit')).toBe('(0.6, 0.8)');
    expect(body).toContain('\\sqrt{3^2 + 4^2} = \\sqrt{25} = 5');
    expect(body).toContain('$(3, 4) / 5 = (0.6, 0.8)$');
  });

  it('measures the lengths that don’t add up, and the students’ mean', () => {
    const [u, v]: Vec[] = [
      [3, 1],
      [1, 2],
    ];
    expect(body).toContain(`$|u| + |v| = ${fmt(norm(u), 3)} + ${fmt(norm(v), 3)} = ${fmt(norm(u) + norm(v), 3)}$`);
    expect(norm([4, 3])).toBe(5);
    const { points } = inputOf(vectors, 'data') as { points: Vec[] };
    const end = last(vectors, 'data');
    expect(readout(end, 'sum')).toBe('(9, 9)');
    expect(readout(end, 'mean')).toBe(fmtVec(mean(points)));
    expect(body).toContain('add, tip to tail, to (9, 9); a third of that is the mean, (3, 3)');
  });
});

describe('dot-product quotes', () => {
  const body = lesson('dot-product');

  it('adds up the parts and the bill', () => {
    const { u, v } = inputOf(dotProduct, 'parts') as { u: number[]; v: number[] };
    expect(dotN(u, v)).toBe(-5);
    expect(readout(last(dotProduct, 'parts'), 'total')).toBe('−5');
    expect(body).toContain('= 2 - 4 - 3 = -5');
    const bill = inputOf(dotProduct, 'bill') as { u: number[]; v: number[] };
    expect(dotN(bill.u, bill.v)).toBe(14);
    expect(body).toContain('$3 \\times 2 + 1 \\times 5 + 2 \\times 1.5 = 14$');
  });

  it('quotes the sweep’s largest value, and turning u keeps every value', () => {
    const { u, len } = inputOf(dotProduct, 'angle') as { u: Vec; len: number };
    const top = fmt(norm(u) * len, 3);
    expect(readout(last(dotProduct, 'angle'), 'max')).toBe(top);
    expect(body).toContain(`$u \\cdot v = ${top}$, its largest value`);
    expect(body).toContain(`$-${top}$ when $v$ points straight back`);
    expect(body).toContain(`$|u| = \\sqrt{10} \\approx ${fmt(Math.sqrt(10), 3)}$`);
    expect(body).toContain(`$3.162 \\times 2 \\approx ${top}$`);
    // Turning both arrows a quarter turn keeps their dot product.
    expect(dot([3, 1], [1, 2])).toBe(5);
    expect(dot([-1, 3], [-2, 1])).toBe(5);
    expect(body).toContain('the turned pair is $(-1, 3)$ and $(-2, 1)$, and $2 + 3 = 5$ again');
  });

  it('casts the shadows the lesson describes', () => {
    expect(readout(traceFor(dotProduct, 'shadow')[1].state, 's')).toBe('2');
    expect(body).toContain('$\\frac{8}{4} = 2$');
    const tilted = traceFor(dotProduct, 'tilted');
    expect(readout(tilted[1].state, 'dot')).toBe('5');
    expect(readout(tilted[1].state, 's')).toBe('1.581');
    expect(readout(tilted[2].state, 'perp')).toBe('(−0.5, 1.5)');
    expect(body).toContain('so the shadow is $5 / 3.162 = 1.581$ long');
    expect(body).toContain('$(1, 2) - (1.5, 0.5) = (-0.5, 1.5)$, has a dot product of 0');
    expect(readout(tilted[2].state, 'p')).toBe('(1.5, 0.5)');
    expect(body).toContain('\\frac{5}{10}(3, 1) = (1.5, 0.5)$');
    const p = project([2, 3], [4, 0]);
    expect([2 - p[0], 3 - p[1]]).toEqual([0, 3]);
  });

  it('ranks the toy words as quoted', () => {
    const q: Vec = [2, 1];
    const by = (w: string) => WORDS.find((x) => x.word === w)!.at;
    expect(dot(q, by('elephant'))).toBe(18);
    expect(fmt(cosine(q, by('dog')), 3)).toBe('1');
    expect(fmt(cosine(q, by('elephant')), 3)).toBe('0.949');
    expect(cosine(q, by('car'))).toBeLessThan(0);
    expect(body).toContain('The dot product picks *elephant*, with 18');
    expect(body).toContain('*dog* points exactly along *puppy*, so its cosine is 1, while *elephant* drops to 0.949');
    expect(fmt(cosine([1, 0], [10, 10]), 3)).toBe('0.707');
    // The probe and the quiz's shadow.
    expect([dot([0, 1], [8, 6]), cosine([0, 1], [8, 6]), cosine([0, 1], [0, 3])]).toEqual([6, 0.6, 1]);
    expect(dot([3, 4], [2, 1]) / norm([3, 4])).toBe(2);
    expect(fmt(Math.sqrt(14), 3)).toBe('3.742');
  });
});

describe('norms-distances quotes', () => {
  const body = lesson('norms-distances');

  it('measures the gap three ways', () => {
    const end = last(norms, 'distance');
    expect([readout(end, 'l2'), readout(end, 'l1'), readout(end, 'li')]).toEqual(['5', '7', '4']);
    expect(body).toContain('$\\sqrt{3^2 + 4^2} = 5$');
    expect(body).toContain('$3 + 4 = 7$');
    expect(body).toContain('$\\max(3, 4) = 4$ steps');
  });

  it('names the nearest point under each ruler', () => {
    const end = last(norms, 'nearest');
    expect([readout(end, 'L2'), readout(end, 'L1'), readout(end, 'L∞')]).toEqual(['B', 'A', 'B']);
    expect(fmt(normOf([2, 2], 2), 3)).toBe('2.828');
    expect(body).toContain('$\\sqrt{8} = 2.828$ against 3');
    expect([normOf([3, 0], 1), normOf([2, 2], 1), normOf([3, 0], 'inf'), normOf([2, 2], 'inf')]).toEqual([3, 4, 3, 2]);
    // The misconception's probe: A = (4, 0), B = (3, 3).
    expect([normOf([4, 0], 1), normOf([3, 3], 1), normOf([4, 0], 'inf'), normOf([3, 3], 'inf')]).toEqual([4, 6, 4, 3]);
  });

  it('measures t against the three unit balls', () => {
    const frames = traceFor(norms, 'balls');
    const s = frames[3].state;
    expect([readout(s, 'L1'), readout(s, 'L2'), readout(s, 'L∞')]).toEqual(['1.2', '0.849', '0.6']);
    expect(body).toContain('$t = (0.6, 0.6)$ has L1 length 1.2, L2 0.849 and L∞ 0.6');
    // The quiz's A = (5, 0) and B = (3, 3), and the probe's gap (5, −3).
    expect([normOf([5, 0], 1), normOf([3, 3], 1), fmt(normOf([3, 3], 2), 3), normOf([5, -3], 1), fmt(normOf([5, -3], 2), 3)]).toEqual([5, 6, '4.243', 8, '5.831']);
    expect(body).toContain('$\\sqrt{0.72} \\approx 0.849$');
  });
});

describe('matrix-multiplication quotes', () => {
  const body = lesson('matrix-multiplication');
  const values = (state: PlotState) => (state.parts.find((p) => p.kind === 'image' && p.id === 'C') as ImagePart).values!;

  it('fills the 2×3 by 3×2 example as written', () => {
    const { A, B } = inputOf(matrixMultiplication, 'cells') as { A: number[][]; B: number[][] };
    expect(matmul(A, B)).toEqual([
      [2, 7],
      [8, -2],
    ]);
    expect(values(last(matrixMultiplication, 'cells'))).toEqual(['2', '7', '8', '−2']);
    expect(body).toContain('C_{11} = 1 \\times 2 + 2 \\times 0 + 0 \\times 1 = 2');
    expect(body).toContain('$C_{12} = 7$, $C_{21} = 8$ and $C_{22} = -2$');
    expect(last(matrixMultiplication, 'cells').parts.length).toBeGreaterThan(0);
    expect(traceFor(matrixMultiplication, 'cells').at(-1)!.stats.multiplications).toBe(12);
    expect(body).toContain('$2 \\cdot 3 \\cdot 2 = 12$');
  });

  it('quotes the 2×2 product and its cost', () => {
    const { A, B } = inputOf(matrixMultiplication, 'square') as { A: number[][]; B: number[][] };
    expect(matmul(A, B)).toEqual([
      [2, 1],
      [4, 3],
    ]);
    expect(body).toContain('$AB = \\begin{bmatrix} 2 & 1 \\\\ 4 & 3 \\end{bmatrix}$');
    expect(traceFor(matrixMultiplication, 'square').at(-1)!.stats.multiplications).toBe(8);
    expect(body).toContain('so 8 in all');
    expect(1000 ** 3).toBe(1e9);
  });

  it('composes the turn and the stretch both ways', () => {
    const { A, B } = inputOf(matrixMultiplication, 'compose') as { A: [number, number, number, number]; B: [number, number, number, number] };
    const AB = mul2(A, B);
    const BA = mul2(B, A);
    expect(fmtVec([AB[0], AB[2]])).toBe('(0, 2)');
    expect(fmtVec([BA[0], BA[2]])).toBe('(0, 1)');
    expect(body).toContain('î ends at (0, 2). Doing A first and then B sends î to (0, 1)');
    expect(matmul([[0, -1], [1, 0]], [[2, 0], [0, 1]])).toEqual([[0, -1], [2, 0]]);
    expect(body).toContain('= \\begin{bmatrix} 0 & -1 \\\\ 2 & 0 \\end{bmatrix}');
    // The probe: A swaps the axes, B stretches up by 3.
    const [swap, up]: [number, number, number, number][] = [[0, 1, 1, 0], [1, 0, 0, 3]];
    expect([mul2(swap, up)[0], mul2(swap, up)[2]]).toEqual([0, 1]);
    expect([mul2(up, swap)[0], mul2(up, swap)[2]]).toEqual([0, 3]);
  });

  it('checks the quiz and probe products', () => {
    expect(matmul([[1, 2], [3, 4]], [[5, 6], [7, 8]])[0][1]).toBe(22);
    expect(matmul([[1, 1], [0, 1]], [[1, 0], [1, 1]])).toEqual([[2, 1], [1, 1]]);
    expect(matmul([[1, 0], [1, 1]], [[1, 1], [0, 1]])).toEqual([[1, 1], [1, 2]]);
    expect(matmul([[0, 1], [1, 0]], [[2, 0], [0, 1]])).toEqual([[0, 1], [2, 0]]);
    expect(matmul([[2, 0], [0, 1]], [[0, 1], [1, 0]])).toEqual([[0, 2], [1, 0]]);
    expect(body).toContain('and AB = [[0, 1], [2, 0]]. What is BA?');
  });
});
