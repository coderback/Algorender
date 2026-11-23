// B7 of the math and ML path: each lesson embeds one exercise, and it
// practises the lesson's own visualiser; every exercise B7 adds has a lesson
// that embeds or links it, or is a part of the stage-3 project (M3); the
// lessons link only lessons that come before them on the path; and M3's parts
// come in order, each judged on the project budget.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadConcepts } from '@/content/concepts';
import { getExercise } from '@/content/exercises';
import { lessons } from '@/content/lessons';
import { getProject, projectForStage } from '@/content/projects';
import { stages } from '@/content/stages';

const { concepts, tracks } = loadConcepts();
const areaOf = (concept: string) => tracks.find((t) => t.id === concepts.find((c) => c.id === concept)?.track)?.area;
const lesson = (slug: string) => readFileSync(fileURLToPath(new URL(`./${slug}.mdx`, import.meta.url)), 'utf8');

const LESSONS = {
  'overfitting-bias-variance': ['overfitting', 'k-fold', ['poly-features']],
  regularisation: ['regularisation', 'ridge-regression', []],
  'softmax-regression': ['softmax', 'stable-softmax', ['cross-entropy']],
  'classification-metrics': ['roc-curve', 'confusion', ['auc']],
  'k-nearest-neighbours': ['k-nearest-neighbours', 'knn-predict', []],
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
  it('is the lesson of its concept, which is live and teaches its visualiser', () => {
    const concept = concepts.find((c) => c.id === lessons.find((l) => l.slug === slug)?.concept);
    expect(concept?.planned).toBeFalsy();
    expect(concept?.lesson).toBe(slug);
    expect(concept?.visualisers).toContain(visualiser);
  });

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

describe('the stage-3 project, a classifier judged honestly (M3)', () => {
  const m3 = getProject('softmax-classifier')!;

  it('closes stage 3, building concepts of that stage', () => {
    expect(projectForStage(3)).toBe(m3);
    const three = stages.find((s) => s.id === 3)!;
    for (const c of m3.concepts) expect(three.concepts, c).toContain(c);
  });

  it('has its parts in order: a step, training, the confusion matrix, then cross-validation', () => {
    expect(m3.parts).toEqual(['softmax-step', 'train-softmax', 'confusion-matrix', 'cross-validate']);
    m3.parts.forEach((part, i) => {
      const e = getExercise(part)!;
      expect(e.title, part).toMatch(new RegExp(`^A classifier, part ${i + 1}:`));
      expect(e.judge?.budget, part).toBe('project');
      expect(e.visualiser, part).toBe('softmax');
    });
  });

  it('carries the earlier parts into each later part’s starter, written out', () => {
    const starter = (slug: string) => getExercise(slug)!.starter.python;
    expect(starter('train-softmax')).toContain('def softmax_step(W, b, X, y, batch, lr):');
    expect(starter('cross-validate')).toContain('def train(X, y, classes, epochs, batch_size, lr, seed):');
    expect(starter('cross-validate')).toContain('def predict(W, b, x):');
    expect(starter('cross-validate')).toContain('def k_fold(n, k):');
  });

  it('keeps the softmax lesson’s own exercise as the visualiser’s “write it yourself”', async () => {
    const { exerciseForVisualiser } = await import('@/content/exercises');
    expect(m3.parts).not.toContain(exerciseForVisualiser('softmax')?.slug);
  });
});
