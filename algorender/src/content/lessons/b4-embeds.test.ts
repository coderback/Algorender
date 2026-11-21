// B4 of the math and ML path: each lesson embeds one exercise, and it practises
// the lesson's own visualiser; the autograd lesson names the second milestone
// project's parts in order; and "Derivatives and gradients", revised for B4,
// reads partial derivatives as the slopes of the contour-maps lesson's slices.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { sliceSlopes, SURFACES } from '@/algorithms/calculus/contour-maps';
import { getExercise } from '@/content/exercises';
import { getProject } from '@/content/projects';

const lesson = (slug: string) => readFileSync(fileURLToPath(new URL(`./${slug}.mdx`, import.meta.url)), 'utf8');

const LESSONS = {
  'contour-maps': ['contour-maps', 'height-table'],
  'derivative-rules': ['derivative-rules', 'numeric-derivative'],
  'taylor-approximation': ['taylor', 'newton-sqrt'],
  jacobians: ['jacobian', 'jacobian-numeric'],
  autograd: ['autograd', 'gradient-check'],
} as const;

describe.each(Object.entries(LESSONS))('%s', (slug, [visualiser, exercise]) => {
  it('embeds one exercise, which practises this lesson’s visualiser', () => {
    const used = [...lesson(slug).matchAll(/exercise="([a-z-]+)"/g)].map((m) => m[1]);
    expect(used).toEqual([exercise]);
    expect(getExercise(exercise)?.visualiser).toBe(visualiser);
  });

  it('spreads its right answers over the choices (quizzes keep the written order)', () => {
    const answers = [...lesson(slug).matchAll(/\banswer: (\d+)/g)].map((m) => Number(m[1]));
    expect(answers.length).toBeGreaterThanOrEqual(8);
    expect(new Set(answers).size).toBeGreaterThanOrEqual(3);
    for (const k of new Set(answers)) expect(answers.filter((a) => a === k).length, `answer ${k}`).toBeLessThanOrEqual(answers.length * 0.6);
  });
});

describe('the second milestone project', () => {
  it('is named in the autograd lesson, part by part, in order', () => {
    const body = lesson('autograd');
    const project = getProject('micrograd')!;
    const at = project.parts.map((p) => body.indexOf(`/code/${p}`));
    expect(at.every((i) => i >= 0), project.parts.join(', ')).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });
});

describe('“Derivatives and gradients”, revised for B4: partial derivatives as slopes of slices', () => {
  const body = lesson('derivatives-gradients').replace(/\s+/g, ' ');

  it('links the contour-maps lesson and quotes the hill’s slice slopes at (1, 1)', () => {
    expect(body).toContain('[contour maps](/learn/contour-maps)');
    expect(SURFACES.hill.formula).toBe('8 − x²/2 − y²');
    expect(body).toContain('$f(x, y) = 8 - x^2/2 - y^2$');
    const [sx, sy] = sliceSlopes('hill', [1, 1]);
    expect([sx, sy]).toEqual([-1, -2]);
    expect(body).toContain(`at $P = (1, 1)$ the x-slice has slope −1 and the y-slice −2`);
  });
});
