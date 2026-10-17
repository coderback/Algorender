import { uuidv7 } from 'uuidv7';
import { describe, expect, it } from 'vitest';
import { lessonQuizzes, quizzesIn } from '@/content/lessons/quizzes';
import { lessons } from '@/content/lessons';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Rating } from 'ts-fsrs';
import { parseEvent, type EventData, type EventKind, type ProgressEvent } from './events';
import { exerciseProgress, inOrder, lessonProgress, problemProgress } from './projections';
import { dueToday, intervals, nextDue, problemCard, quizCard, reviewCards } from './review';

let clock = Date.parse('2026-10-16T09:00:00Z');
function ev<K extends EventKind>(kind: K, data: EventData<K>, at?: string): ProgressEvent {
  const when = at ?? new Date((clock += 60_000)).toISOString();
  return { id: uuidv7(), kind, at: when, data } as ProgressEvent;
}
const day = (n: number, hour = 9) => new Date(Date.UTC(2026, 9, 16 + n, hour)).toISOString();

describe('events', () => {
  it('accepts every kind with its data, and refuses anything else', () => {
    expect(parseEvent(ev('lesson.completed', { lesson: 'recursion', done: true }))).not.toBeNull();
    expect(parseEvent(ev('review.rated', { card: 'quiz:recursion:check:0', rating: 3 }))).not.toBeNull();
    expect(parseEvent({ ...ev('review.rated', { card: 'quiz:recursion:check:0', rating: 3 }), id: 'not-a-uuid' })).toBeNull();
    expect(parseEvent(ev('review.rated', { card: 'quiz:recursion:check:0', rating: 5 }))).toBeNull();
    expect(parseEvent(ev('review.rated', { card: 'DROP TABLE', rating: 1 }))).toBeNull();
    expect(parseEvent({ ...ev('lesson.completed', { lesson: 'recursion', done: true }), kind: 'lesson.deleted' })).toBeNull();
  });
});

describe('projections', () => {
  it('lessons: the latest done/undone wins, and the best score is kept', () => {
    const p = lessonProgress([
      ev('lesson.completed', { lesson: 'recursion', done: true }),
      ev('lesson.completed', { lesson: 'two-pointers', done: true }),
      ev('lesson.completed', { lesson: 'recursion', done: false }),
      ev('lesson.scored', { lesson: 'recursion', key: 'check', kind: 'quiz', correct: 2, total: 3 }),
      ev('lesson.scored', { lesson: 'recursion', key: 'check', kind: 'quiz', correct: 1, total: 3 }),
      ev('lesson.scored', { lesson: 'recursion', key: 'fib', kind: 'prediction', correct: 4, total: 5 }),
    ]);
    expect(p).toEqual({ completed: ['two-pointers'], quizzes: { 'recursion:check': { correct: 2, total: 3 } }, predictions: { 'recursion:fib': { correct: 4, total: 5 } } });
  });

  it('exercises: stages passed and the highest fill level', () => {
    const events = [
      ev('exercise.passed', { exercise: 'bubble-sort', stage: 'parsons' }),
      ev('exercise.passed', { exercise: 'bubble-sort', stage: 'fill', level: 2 }),
      ev('exercise.passed', { exercise: 'bubble-sort', stage: 'fill', level: 0 }),
      ev('exercise.passed', { exercise: 'insertion-sort', stage: 'write' }),
    ];
    expect(exerciseProgress(events, 'bubble-sort')).toEqual({ parsons: true, fill: 2 });
    expect(exerciseProgress(events, 'insertion-sort')).toEqual({ write: true });
  });

  it('problems: first solve, languages and failures before it', () => {
    const fail = ev('problem.submitted', { problem: 'two-sum', language: 'python', passed: false, tests: 10, failed: 3 });
    const pass = ev('problem.submitted', { problem: 'two-sum', language: 'python', passed: true, tests: 10, failed: 0 });
    const js = ev('problem.submitted', { problem: 'two-sum', language: 'javascript', passed: true, tests: 10, failed: 0 });
    expect(problemProgress([fail, pass, js, ev('problem.submitted', { problem: 'two-sum', language: 'python', passed: false, tests: 10, failed: 1 })])['two-sum']).toEqual({
      solved: pass.at,
      languages: ['python', 'javascript'],
      submissions: 4,
      failedFirst: 1,
    });
  });

  it('puts events from two devices in the order they happened', () => {
    const later = ev('lesson.completed', { lesson: 'recursion', done: false }, day(1));
    const earlier = ev('lesson.completed', { lesson: 'recursion', done: true }, day(0));
    expect(lessonProgress(inOrder([later, earlier])).completed).toEqual([]);
  });
});

describe('review cards', () => {
  it('a solved problem makes a card, rated Good, due in a few days; failures first make it Hard', () => {
    const cards = reviewCards([
      ev('problem.submitted', { problem: 'two-sum', language: 'python', passed: true, tests: 5, failed: 0 }, day(0)),
      ev('problem.submitted', { problem: 'three-sum', language: 'python', passed: false, tests: 5, failed: 2 }, day(0)),
      ev('problem.submitted', { problem: 'three-sum', language: 'python', passed: true, tests: 5, failed: 0 }, day(0, 10)),
    ]);
    const good = cards.get(problemCard('two-sum'))!;
    const hard = cards.get(problemCard('three-sum'))!;
    expect(good.kind).toBe('problem');
    expect(good.card.due.toISOString()).toBe(day(3));
    expect(hard.card.due.getTime()).toBeLessThan(good.card.due.getTime() + 3_600_000);
    expect(hard.card.scheduled_days).toBeLessThan(good.card.scheduled_days);
  });

  it('a quiz answer makes a card: wrong answers come back the next day', () => {
    const cards = reviewCards([
      ev('quiz.answered', { lesson: 'recursion', quiz: 'check', question: 0, correct: false }, day(0)),
      ev('quiz.answered', { lesson: 'recursion', quiz: 'check', question: 0, correct: true }, day(0, 10)), // only the first answer counts
      ev('quiz.answered', { lesson: 'recursion', quiz: 'check', question: 1, correct: true }, day(0)),
    ]);
    expect(cards.get(quizCard('recursion', 'check', 0))!.card.due.toISOString()).toBe(day(1));
    expect(dueToday(cards, new Date(day(1, 12))).map((c) => c.id)).toEqual(['quiz:recursion:check:0']);
    expect(nextDue(cards, new Date(day(1, 12)))!.toISOString()).toBe(day(3));
  });

  it('reviews move a card on, further each time it is remembered', () => {
    const born = ev('problem.submitted', { problem: 'two-sum', language: 'python', passed: true, tests: 5, failed: 0 }, day(0));
    const first = reviewCards([born, ev('review.rated', { card: 'problem:two-sum', rating: Rating.Good }, day(3))]).get('problem:two-sum')!;
    const second = reviewCards([born, ev('review.rated', { card: 'problem:two-sum', rating: Rating.Good }, day(3)), ev('review.rated', { card: 'problem:two-sum', rating: Rating.Good }, first.card.due.toISOString())]).get('problem:two-sum')!;
    expect(first.reviews).toBe(1);
    expect(second.card.scheduled_days).toBeGreaterThan(first.card.scheduled_days);
    const forgot = reviewCards([born, ev('review.rated', { card: 'problem:two-sum', rating: Rating.Again }, day(3))]).get('problem:two-sum')!;
    expect(forgot.card.scheduled_days).toBeLessThan(first.card.scheduled_days);
    expect(forgot.card.lapses).toBe(1);
  });

  it('ignores ratings of cards it has no source for, and previews each rating', () => {
    const cards = reviewCards([ev('review.rated', { card: 'problem:gone', rating: 3 })]);
    expect(cards.size).toBe(0);
    const c = reviewCards([ev('problem.submitted', { problem: 'two-sum', language: 'python', passed: true, tests: 5, failed: 0 }, day(0))]).get('problem:two-sum')!;
    const next = intervals(c.card, c.card.due);
    expect(next[Rating.Again]).toBeLessThan(next[Rating.Hard]);
    expect(next[Rating.Hard]).toBeLessThan(next[Rating.Good]);
    expect(next[Rating.Good]).toBeLessThan(next[Rating.Easy]);
  });

  it('is the same schedule however the events arrive, once in order', () => {
    const events = [
      ev('problem.submitted', { problem: 'two-sum', language: 'python', passed: true, tests: 5, failed: 0 }, day(0)),
      ev('review.rated', { card: 'problem:two-sum', rating: 3 }, day(3)),
      ev('review.rated', { card: 'problem:two-sum', rating: 2 }, day(9)),
    ];
    const a = reviewCards(inOrder(events)).get('problem:two-sum')!;
    const b = reviewCards(inOrder([...events].reverse())).get('problem:two-sum')!;
    expect(b.card).toEqual(a.card);
  });
});

describe('lesson quizzes', () => {
  it('finds every <Quiz> in every lesson, with well-formed questions', () => {
    const quizzes = lessonQuizzes();
    for (const l of lessons) {
      const source = readFileSync(path.join(process.cwd(), 'src/content/lessons', `${l.slug}.mdx`), 'utf8');
      expect(quizzes.filter((q) => q.lesson === l.slug)).toHaveLength((source.match(/<Quiz\b/g) ?? []).length);
    }
    expect(quizzes.length).toBeGreaterThan(0);
    for (const { lesson, quiz, questions } of quizzes) {
      expect(questions.length, `${lesson}:${quiz}`).toBeGreaterThan(0);
      for (const q of questions) {
        expect(typeof q.q).toBe('string');
        expect(q.choices.length).toBeGreaterThanOrEqual(2);
        expect(q.answer).toBeGreaterThanOrEqual(0);
        expect(q.answer).toBeLessThan(q.choices.length);
        expect(q.why.length).toBeGreaterThan(0);
      }
    }
  });

  it('reads ids and refuses quizzes that aren’t plain data', () => {
    const src = `<Quiz id="x" questions={[{ q: 'Why?', choices: ['a', "b"], answer: 1, why: \`because\` }]} />`;
    expect(quizzesIn('l', src)).toEqual([{ lesson: 'l', quiz: 'x', questions: [{ q: 'Why?', choices: ['a', 'b'], answer: 1, why: 'because' }] }]);
    expect(() => quizzesIn('l', '<Quiz questions={[{ q: f() }]} />')).toThrow(/literal/);
  });
});
