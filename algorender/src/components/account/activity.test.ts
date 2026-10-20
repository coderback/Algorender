import { describe, expect, it } from 'vitest';
import type { ProgressEvent } from '@/progress/events';
import { dayKey, heatLevel, heatmap, predictionShare, recent } from './activity';

const now = new Date(2026, 9, 21, 15, 0); // a Wednesday
let n = 0;
const ev = (kind: string, data: Record<string, unknown>, daysAgo: number, hour = 10): ProgressEvent => {
  const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo, hour, n++ % 60);
  return { id: `e${n}`, kind, data, at: at.toISOString() } as ProgressEvent;
};
const titles = { lessons: { recursion: 'Recursion' }, problems: { 'two-sum': 'Two Sum' }, goals: { interviews: 'Coding interviews' }, languages: { python: 'Python' } };

describe('the heatmap', () => {
  it('ends with the week holding today, Monday first, and counts events per day', () => {
    const cols = heatmap([ev('review.rated', {}, 0), ev('review.rated', {}, 0), ev('review.rated', {}, 2)], now);
    expect(cols).toHaveLength(20);
    const last = cols.at(-1)!;
    expect(last).toHaveLength(7);
    expect(new Date(`${last[0].day}T12:00`).getDay()).toBe(1);
    const today = last.find((d) => d.day === dayKey(now))!;
    expect(today.count).toBe(2);
    expect(last.find((d) => d.count === 1)!.day).toBe(dayKey(new Date(2026, 9, 19)));
    expect(last.at(-1)!.future).toBe(true);
    expect(today.future).toBe(false);
  });

  it('steps shades up with how much was done', () => {
    expect([0, 1, 3, 7, 30].map(heatLevel)).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('recent activity', () => {
  it('lists the newest first, folding a day’s reviews into one line and counting only first solves', () => {
    const events = [
      ev('plan.set', { goal: 'interviews', hours: 5 }, 3),
      ev('lesson.completed', { lesson: 'recursion', done: true }, 2),
      ev('problem.submitted', { problem: 'two-sum', language: 'python', passed: true }, 1),
      ev('problem.submitted', { problem: 'two-sum', language: 'python', passed: true }, 1, 11),
      ev('review.rated', { card: 'x', rating: 3 }, 0, 9),
      ev('review.rated', { card: 'y', rating: 3 }, 0, 9),
      ev('lesson.scored', { lesson: 'recursion', key: 'p', kind: 'prediction', correct: 3, total: 4 }, 0, 12),
    ];
    const lines = recent(events, titles);
    expect(lines.map((l) => `${l.text}${l.strong ?? ''}${l.after ?? ''}`)).toEqual([
      '3 of 4 predictions right in Recursion',
      'Reviewed 2 cards',
      'Solved Two Sum in Python',
      'Finished Recursion',
      'Set a goal: Coding interviews, 5 h a week',
    ]);
  });
});

describe('prediction share', () => {
  it('is null before any prediction challenge, then the share right across attempts', () => {
    expect(predictionShare([])).toBeNull();
    const events = [
      ev('lesson.scored', { lesson: 'a', key: 'p', kind: 'prediction', correct: 3, total: 4 }, 1),
      ev('lesson.scored', { lesson: 'a', key: 'q', kind: 'quiz', correct: 0, total: 4 }, 1),
      ev('lesson.scored', { lesson: 'b', key: 'p', kind: 'prediction', correct: 1, total: 4 }, 0),
    ];
    expect(predictionShare(events)).toBe(0.5);
  });
});
