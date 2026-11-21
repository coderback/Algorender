import { describe, expect, it } from 'vitest';
import { lessonQuizzes } from '@/content/lessons/quizzes';
import { lessonMisconceptions } from '@/content/lessons/assessment';
import { choiceOrder } from './choices';

describe('choice order', () => {
  it('is a permutation, the same every time for the same question', () => {
    for (let n = 1; n <= 6; n++) {
      const order = choiceOrder(`question ${n}`, n);
      expect([...order].sort()).toEqual(Array.from({ length: n }, (_, i) => i));
      expect(choiceOrder(`question ${n}`, n)).toEqual(order);
    }
  });

  it('spreads the right answers of every authored question across the places they are shown in', () => {
    // Authors often put the right answer first; shown in this order, no place gets much more than its share.
    const asked = [
      ...lessonQuizzes().flatMap((z) => z.questions),
      ...lessonMisconceptions().flatMap((m) => m.probes),
    ];
    const shownAt = new Map<number, number>();
    for (const q of asked) {
      const at = choiceOrder(q.q, q.choices.length).indexOf(q.answer);
      shownAt.set(at, (shownAt.get(at) ?? 0) + 1);
    }
    const share = (shownAt.get(0) ?? 0) / asked.length;
    expect(asked.length).toBeGreaterThan(500);
    // With three or four choices a question, a fair first place gets about 30%.
    expect(share).toBeGreaterThan(0.2);
    expect(share).toBeLessThan(0.4);
  });
});
