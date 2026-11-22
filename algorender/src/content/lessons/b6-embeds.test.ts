// B6 of the math and ML path: each lesson embeds one exercise, and it
// practises the lesson's own visualiser; every exercise B6 adds has a lesson
// that embeds or links it; the lessons link only lessons that come before them
// on the path; and the lessons revised for B6 lean on what they now build on:
// the central limit theorem and entropy on B5's probability lessons, logistic
// regression on maximum likelihood.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadConcepts } from '@/content/concepts';
import { getExercise } from '@/content/exercises';
import { lessons } from '@/content/lessons';
import { quizzesIn } from './quizzes';

const { concepts, tracks } = loadConcepts();
const areaOf = (concept: string) => tracks.find((t) => t.id === concepts.find((c) => c.id === concept)?.track)?.area;
const lesson = (slug: string) => readFileSync(fileURLToPath(new URL(`./${slug}.mdx`, import.meta.url)), 'utf8');
const flat = (slug: string) => lesson(slug).replace(/\s+/g, ' ');

const questionsOf = (slug: string) => quizzesIn(slug, lesson(slug)).flatMap((q) => q.questions);

const LESSONS = {
  'covariance-correlation': ['correlation', 'correlation', []],
  'maximum-likelihood': ['maximum-likelihood', 'log-likelihood', ['fit-gaussian']],
  'estimation-confidence': ['confidence-intervals', 'bootstrap-ci', ['standard-error']],
  'hypothesis-testing': ['permutation-test', 'permutation-test', []],
  'stochastic-gradient-descent': ['sgd', 'sgd-step', ['minibatches']],
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
  it('embeds one exercise, which practises this lesson’s visualiser, and links the others', () => {
    const used = [...lesson(slug).matchAll(/exercise="([a-z-]+)"/g)].map((m) => m[1]);
    expect(used).toEqual([exercise]);
    expect(getExercise(exercise)?.visualiser).toBe(visualiser);
    for (const other of others) {
      expect(getExercise(other)?.visualiser, other).toBe(visualiser);
      expect(lesson(slug), other).toContain(`(/code/${other})`);
    }
  });

  it('links only lessons on what it builds on', () => {
    const concept = lessons.find((l) => l.slug === slug)!.concept;
    const before = ancestors(concept);
    for (const [, target] of lesson(slug).matchAll(/\]\(\/learn\/([a-z-]+)\)/g)) {
      const meta = lessons.find((l) => l.slug === target);
      expect(meta, target).toBeDefined();
      if (areaOf(meta!.concept) === 'math' || areaOf(meta!.concept) === 'ml') expect(before.has(meta!.concept), `${slug} links ${target}`).toBe(true);
    }
  });
});

describe('lessons revised for B6', () => {
  it('the central limit theorem builds on the law of large numbers and densities, and closes the band’s 19 in 20', () => {
    const body = flat('central-limit-theorem');
    expect(body).toContain('[law of large numbers](/learn/law-of-large-numbers)');
    expect(body).toContain('[densities and the normal distribution](/learn/continuous-distributions)');
    expect(body).toContain('[random variables](/learn/random-variables)');
    // Its new quiz question is appended: the four before it keep their places.
    const qs = questionsOf('central-limit-theorem');
    expect(qs).toHaveLength(5);
    expect(qs[3].q).toMatch(/10,000 incomes/);
    // 15/√100 = 1.5, and 97 to 103 is two of those either side of 100.
    expect(qs[4].choices[qs[4].answer]).toBe('About 95%');
    expect(15 / Math.sqrt(100)).toBe(1.5);
  });

  it('entropy reads surprise as a random variable, with one appended question on a fair die', () => {
    const body = flat('entropy');
    expect(body).toContain('[random variables](/learn/random-variables)');
    expect(body).toContain('[exponents and logs](/learn/exponents-logs)');
    const qs = questionsOf('entropy');
    expect(qs).toHaveLength(6);
    expect(qs[4].q).toMatch(/KL\(P‖Q\) is 0\.5 bits/);
    expect(qs[5].choices[qs[5].answer]).toBe('log₂ 6 ≈ 2.58 bits');
    expect(Math.log2(6).toFixed(2)).toBe('2.58');
  });

  it('logistic regression reads cross-entropy as maximum likelihood, which it now builds on', () => {
    expect(flat('logistic-regression')).toContain('[maximum likelihood](/learn/maximum-likelihood)');
    expect(concepts.find((c) => c.id === 'logistic-regression')!.prereqs).toContain('maximum-likelihood');
  });
});
