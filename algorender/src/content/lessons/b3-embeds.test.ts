// B3 of the math and ML path: each lesson embeds one exercise, and it practises
// the lesson's own visualiser; the least-squares lesson names the first
// milestone project's parts in order.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { getExercise } from '@/content/exercises';
import { getProject } from '@/content/projects';
import { linearTransformations } from '@/algorithms/linear-algebra/linear-transformations';
import type { MatrixInput } from '@/algorithms/linear-algebra/shared';
import { apply, fmt, fmtVec } from '@/viz/plot/geometry';
import { traceOf } from '@/viz/plot/testing';

const lesson = (slug: string) => readFileSync(fileURLToPath(new URL(`./${slug}.mdx`, import.meta.url)), 'utf8');

const LESSONS = {
  'determinants-inverses': ['inverse-matrix', 'solve-system'],
  'span-basis-rank': ['span', 'matrix-rank'],
  'change-of-basis': ['change-of-basis', 'basis-coords'],
  'supervised-learning': ['supervised-learning', 'mean-squared-error'],
  'projections-least-squares': ['least-squares', 'least-squares-fit'],
} as const;

describe.each(Object.entries(LESSONS))('%s', (slug, [visualiser, exercise]) => {
  it('embeds one exercise, which practises this lesson’s visualiser', () => {
    const used = [...lesson(slug).matchAll(/exercise="([a-z-]+)"/g)].map((m) => m[1]);
    expect(used).toEqual([exercise]);
    expect(getExercise(exercise)?.visualiser).toBe(visualiser);
  });
});

describe('the first milestone project', () => {
  it('is named in the least-squares lesson, part by part, in order', () => {
    const body = lesson('projections-least-squares');
    const project = getProject('least-squares')!;
    const at = project.parts.map((p) => body.indexOf(p));
    expect(at.every((i) => i >= 0), project.parts.join(', ')).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });
});

describe('“Matrices move space”, revised for B3: Av by rows, with the dot product', () => {
  const body = lesson('linear-transformations').replace(/\s+/g, ' ');
  const frames = (preset: string) => {
    const ex = linearTransformations.input.examples.find((e) => e.id === preset)!;
    return traceOf(linearTransformations, ex.make({ seed: 0, size: 0 })).frames;
  };

  it('works the stretch-shear example row by row, as the visualiser narrates it', () => {
    const { m, v } = linearTransformations.input.examples.find((e) => e.id === 'stretch-shear')!.make({ seed: 0, size: 0 }) as MatrixInput;
    const [a, b, c, d] = m;
    const av = apply(m, v);
    expect(body).toContain(String.raw`row 1} \cdot v &= ${a} \times ${v[0]} + ${b} \times ${v[1]} = ${av[0]}`);
    expect(body).toContain(String.raw`row 2} \cdot v &= ${c} \times ${v[0]} + ${d} \times ${v[1]} = ${av[1]}`);
    expect(body).toContain(`$Av = ${fmtVec(av)}$`);
    expect(body).toContain(String.raw`$${v[0]} \cdot (${a}, ${c}) + ${v[1]} \cdot (${b}, ${d}) = ${fmtVec(av)}$`);
    const rows = frames('stretch-shear').find((f) => f.note.startsWith('By hand'));
    expect(rows?.note).toContain(`= ${fmt(av[0])}, and row 2`);
    expect(rows?.note).toContain(`So Av = ${fmtVec(av)}`);
  });

  it('opens the drag explorer on the shear’s last frame', () => {
    expect(body).toContain(`settings={{ preset: 'shear', step: '${frames('shear').length - 1}' }}`);
  });
});
