import { describe, expect, it } from 'vitest';
import type { ProgressEvent } from './events';
import { minutesLeft, readingByLesson } from './reading';

const read = (lesson: string, index: number, at: string, of = 8): ProgressEvent => ({
  id: `0190a000-0000-7000-8000-${String(index).padStart(12, '0')}`,
  kind: 'lesson.section',
  at,
  data: { lesson, section: `s${index}`, index, of },
});

describe('lesson reading', () => {
  it('keeps the furthest section reached, and the latest time the lesson was read', () => {
    const r = readingByLesson([read('heap', 0, '2026-10-01T10:00:00Z'), read('heap', 3, '2026-10-01T10:05:00Z'), read('heap', 1, '2026-10-02T09:00:00Z')]);
    expect(r.get('heap')).toEqual({ lesson: 'heap', furthest: 3, section: 's3', of: 8, at: '2026-10-02T09:00:00Z' });
  });

  it('ignores other events and keeps lessons apart', () => {
    const quiz: ProgressEvent = { id: '0190a000-0000-7000-8000-000000000099', kind: 'quiz.answered', at: '2026-10-01T10:00:00Z', data: { lesson: 'heap', quiz: 'q', question: 0, correct: true } };
    const r = readingByLesson([quiz, read('heap', 2, '2026-10-01T10:01:00Z'), read('trie', 5, '2026-10-01T10:02:00Z')]);
    expect([...r.keys()].sort()).toEqual(['heap', 'trie']);
    expect(r.get('trie')?.furthest).toBe(5);
  });

  it('estimates the minutes left as the lesson header does', () => {
    expect(minutesLeft(16, 0, 8)).toBe(15);
    expect(minutesLeft(16, 7, 8)).toBe(1);
    expect(minutesLeft(20, 3, 8)).toBe(11);
  });
});
