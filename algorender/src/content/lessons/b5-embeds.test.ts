// B5 of the math and ML path: each lesson embeds one exercise, and it
// practises the lesson's own visualiser; every exercise B5 adds has a lesson
// that embeds or links it; the lessons link only lessons that come before them
// on the path; and "Bayes' rule", revised for B5, opens from the chance lesson.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadConcepts } from '@/content/concepts';
import { getExercise } from '@/content/exercises';
import { lessons } from '@/content/lessons';

const { concepts, tracks } = loadConcepts();
const areaOf = (concept: string) => tracks.find((t) => t.id === concepts.find((c) => c.id === concept)?.track)?.area;
const lesson = (slug: string) => readFileSync(fileURLToPath(new URL(`./${slug}.mdx`, import.meta.url)), 'utf8');

const LESSONS = {
  'counting-combinatorics': ['counting', 'pascal-choose', []],
  'probability-basics': ['two-dice', 'dice-sum-chance', ['dice-at-least']],
  'random-variables': ['random-variables', 'expectation-variance', ['binomial-simulation']],
  'law-of-large-numbers': ['monte-carlo', 'estimate-pi', ['running-average']],
  integrals: ['integral', 'riemann-sum', ['trapezoid-rule']],
  'continuous-distributions': ['distributions', 'normal-cdf', []],
} as const;

/** Every concept a concept builds on, however far back. */
function ancestors(id: string, seen = new Set<string>()): Set<string> {
  for (const p of concepts.find((c) => c.id === id)?.prereqs ?? []) {
    if (!seen.has(p)) {
      seen.add(p);
      ancestors(p, seen);
    }
  }
  return seen;
}

describe.each(Object.entries(LESSONS))('%s', (slug, [visualiser, exercise, others]) => {
  it('embeds one exercise, which practises this lesson’s visualiser', () => {
    const used = [...lesson(slug).matchAll(/exercise="([a-z-]+)"/g)].map((m) => m[1]);
    expect(used).toEqual([exercise]);
    expect(getExercise(exercise)?.visualiser).toBe(visualiser);
    for (const other of others) expect(getExercise(other)?.visualiser, other).toBe(visualiser);
  });

  it('links only lessons on what it builds on', () => {
    const concept = lessons.find((l) => l.slug === slug)!.concept;
    const before = ancestors(concept);
    for (const [, target] of lesson(slug).matchAll(/\]\(\/learn\/([a-z-]+)\)/g)) {
      const meta = lessons.find((l) => l.slug === target);
      expect(meta, target).toBeDefined();
      // A DSA lesson is background; a math or ML lesson must come before this one.
      if (areaOf(meta!.concept) === 'math' || areaOf(meta!.concept) === 'ml') expect(before.has(meta!.concept), `${slug} links ${target}`).toBe(true);
    }
  });
});

describe('“Bayes’ rule”, revised for B5: conditional probability after chance', () => {
  it('opens from the chance lesson, and Bayes builds on it', () => {
    const body = lesson('bayes').replace(/\s+/g, ' ');
    expect(body).toContain('[chance, events and independence](/learn/probability-basics)');
    expect(concepts.find((c) => c.id === 'probability')!.prereqs).toContain('probability-basics');
  });
});
