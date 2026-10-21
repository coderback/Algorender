import { uuidv7 } from 'uuidv7';
import { describe, expect, it } from 'vitest';
import type { EventData, EventKind, ProgressEvent } from '@/progress/events';
import type { ConceptMastery, MasteryGraph } from '@/progress/mastery';
import { firstUnsolved, greeting, lessonInProgress, trackMastery, weekActivity } from './select';

const ev = <K extends EventKind>(kind: K, data: EventData<K>, at: string): ProgressEvent => ({ id: uuidv7(), kind, at, data }) as ProgressEvent;

describe('Today', () => {
  it('resumes the latest lesson that is not finished', () => {
    const events = [
      ev('quiz.answered', { lesson: 'recursion', quiz: 'q', question: 0, correct: true }, '2026-10-01T10:00:00Z'),
      ev('lesson.scored', { lesson: 'binary-search', key: 'k', kind: 'prediction', correct: 2, total: 3 }, '2026-10-02T10:00:00Z'),
    ];
    expect(lessonInProgress(events, new Set())).toBe('binary-search');
    expect(lessonInProgress(events, new Set(['binary-search']))).toBe('recursion');
    expect(lessonInProgress(events, new Set(['binary-search', 'recursion']))).toBeNull();
    expect(lessonInProgress([], new Set())).toBeNull();
  });

  it('counts a lesson only read so far as in progress', () => {
    const events = [
      ev('quiz.answered', { lesson: 'recursion', quiz: 'q', question: 0, correct: true }, '2026-10-01T10:00:00Z'),
      ev('lesson.section', { lesson: 'heap', section: 'why-a-heap', index: 2, of: 8 }, '2026-10-03T10:00:00Z'),
    ];
    expect(lessonInProgress(events, new Set())).toBe('heap');
  });

  it('shows this week from Monday, marking days with activity', () => {
    const sunday = new Date(2026, 9, 18, 20, 0);
    const events = [ev('review.rated', { card: 'quiz:a:b:0', rating: 3 }, new Date(2026, 9, 13, 9).toISOString())];
    const week = weekActivity(events, sunday);
    expect(week.map((d) => d.date.getDate())).toEqual([12, 13, 14, 15, 16, 17, 18]);
    expect(week.map((d) => d.active)).toEqual([false, true, false, false, false, false, false]);
    expect(week.findIndex((d) => d.today)).toBe(6);
    // A Monday is the first day of its own week.
    expect(weekActivity([], new Date(2026, 9, 19, 8))[0].date.getDate()).toBe(19);
  });

  it('counts known concepts per track, leaving out planned ones', () => {
    const graph: MasteryGraph = {
      concepts: [
        { id: 'a', title: 'A', track: 't', prereqs: [], visualisers: [], planned: false, depth: 0 },
        { id: 'b', title: 'B', track: 't', prereqs: [], visualisers: [], planned: false, depth: 0 },
        { id: 'c', title: 'C', track: 't', prereqs: [], visualisers: [], planned: true, depth: 0 },
        { id: 'd', title: 'D', track: 'u', prereqs: [], visualisers: [], planned: false, depth: 0 },
      ],
      lessons: {},
      exercises: {},
      problems: {},
    };
    const m = new Map<string, ConceptMastery>([['a', { status: 'practised' } as ConceptMastery], ['d', { status: 'learning' } as ConceptMastery]]);
    expect(trackMastery(graph, m, ['t', 'u', 'empty'])).toEqual([
      { track: 't', known: 1, total: 2, started: true },
      { track: 'u', known: 0, total: 1, started: true },
    ]);
  });

  it('picks the first unsolved problem and greets by the hour', () => {
    expect(firstUnsolved([{ slug: 'x' }, { slug: 'y' }], (s) => s === 'x')).toEqual({ slug: 'y' });
    expect(firstUnsolved([{ slug: 'x' }], () => true)).toBeNull();
    expect(greeting(new Date(2026, 0, 1, 9))).toBe('Good morning');
    expect(greeting(new Date(2026, 0, 1, 14))).toBe('Good afternoon');
    expect(greeting(new Date(2026, 0, 1, 21))).toBe('Good evening');
  });
});
