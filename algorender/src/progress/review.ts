// Spaced review (FSRS, via ts-fsrs): cards are made from what the learner
// does, and scheduled from the events alone, so every device agrees.
//
// Where cards come from (REVAMP_PLAN.md §6.7):
// - Solving a practice problem makes `problem:<slug>`: recall its pattern
//   and key idea. The solve is its first review, rated Good, or Hard if
//   earlier submissions failed.
// - Answering a lesson's quiz question makes `quiz:<lesson>:<quiz>:<n>`,
//   asked again later. That first answer is its first review: Good if right,
//   Again if wrong.
// - Picking an answer that comes from a common mistake a lesson names makes
//   `misconception:<lesson>:<id>`, which asks that mistake's probe questions.
//   It starts as a lapse (Again), so it comes back the next day, and picking
//   the mistake again later sends it back to tomorrow.
// - Checking a language task that asks what a snippet prints (an output
//   task, src/tasks/) makes `task:<slug>`: its first check is its first
//   review, Good if right, Again if wrong. The review shows another variant
//   of the snippet, so the learner predicts it afresh.
// - A mock interview that falls below the bar, or needed a level-2 hint or
//   more, makes `problem:<slug>` due the next day: Again, as a new card or a
//   lapse of the one solving it made.
// Every `review.rated` event after that moves the card on.
//
// Scheduling is day-based (no same-day learning steps) and without fuzz, so
// the schedule is a pure function of the events.

import { createEmptyCard, fsrs, Rating, type Card, type Grade } from 'ts-fsrs';
import { meetsBar } from '@/interview/rules';
import type { ProgressEvent } from './events';
import { misconceptionCard } from './misconceptions';

export const scheduler = fsrs({ enable_fuzz: false, enable_short_term: false });

export type CardKind = 'problem' | 'quiz' | 'misconception' | 'task';

export type ReviewCard = {
  id: string;
  kind: CardKind;
  /** When the card was made (its first review). */
  born: string;
  card: Card;
  /** Reviews in the queue so far (not counting the first). */
  reviews: number;
};

export const problemCard = (slug: string) => `problem:${slug}`;
export const quizCard = (lesson: string, quiz: string, question: number) => `quiz:${lesson}:${quiz}:${question}`;
export const taskCard = (slug: string) => `task:${slug}`;

export { misconceptionCard };

const kindOf = (id: string): CardKind => {
  const kind = id.slice(0, id.indexOf(':'));
  return kind === 'problem' || kind === 'misconception' || kind === 'task' ? kind : 'quiz';
};

/** Every card the events have made, with its current schedule. Events must be in time order. */
export function reviewCards(events: readonly ProgressEvent[]): Map<string, ReviewCard> {
  const cards = new Map<string, ReviewCard>();
  const failed = new Map<string, number>();
  const make = (id: string, at: string, grade: Grade) => {
    const when = new Date(at);
    cards.set(id, { id, kind: kindOf(id), born: at, card: scheduler.next(createEmptyCard(when), when, grade).card, reviews: 0 });
  };
  for (const e of events) {
    if (e.kind === 'problem.submitted') {
      const id = problemCard(e.data.problem);
      if (cards.has(id)) continue;
      if (!e.data.passed) failed.set(id, (failed.get(id) ?? 0) + 1);
      else make(id, e.at, failed.get(id) ? Rating.Hard : Rating.Good);
    } else if (e.kind === 'quiz.answered') {
      const id = quizCard(e.data.lesson, e.data.quiz, e.data.question);
      if (!cards.has(id)) make(id, e.at, e.data.correct ? Rating.Good : Rating.Again);
    } else if (e.kind === 'task.checked') {
      if (e.data.kind !== 'output') continue;
      const id = taskCard(e.data.task);
      if (!cards.has(id)) make(id, e.at, e.data.passed ? Rating.Good : Rating.Again);
    } else if (e.kind === 'misconception.picked') {
      const id = misconceptionCard(e.data.lesson, e.data.misconception);
      const c = cards.get(id);
      if (!c) make(id, e.at, Rating.Again);
      else cards.set(id, { ...c, card: scheduler.next(c.card, new Date(e.at), Rating.Again).card });
    } else if (e.kind === 'interview.finished') {
      if (!e.data.verified || e.data.format !== 'coding' || (meetsBar(e.data.scores, e.data.hints, e.data.passed) && e.data.hints < 2)) continue;
      const id = problemCard(e.data.item);
      const c = cards.get(id);
      if (!c) make(id, e.at, Rating.Again);
      else cards.set(id, { ...c, card: scheduler.next(c.card, new Date(e.at), Rating.Again).card });
    } else if (e.kind === 'review.rated') {
      const c = cards.get(e.data.card);
      if (!c) continue; // a card from content that no longer exists, or not yet pulled
      const when = new Date(e.at);
      cards.set(c.id, { ...c, card: scheduler.next(c.card, when, e.data.rating as Grade).card, reviews: c.reviews + 1 });
    }
  }
  return cards;
}

/** The end of the learner's day: cards due before it are due today. */
export function endOfDay(now: Date): Date {
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return end;
}

/** Cards due by the end of today, most overdue first; `known` limits them to cards whose content exists. */
export function dueToday(cards: Map<string, ReviewCard>, now: Date, known?: (id: string) => boolean): ReviewCard[] {
  const until = endOfDay(now).getTime();
  return [...cards.values()]
    .filter((c) => c.card.due.getTime() <= until && (!known || known(c.id)))
    .sort((a, b) => a.card.due.getTime() - b.card.due.getTime() || (a.id < b.id ? -1 : 1));
}

/**
 * Cards not due yet, soonest first: what "Practise ahead" offers once today's
 * are done. Reviewing one early is an ordinary rating; FSRS counts how little
 * time has passed, so an early Good moves the card on less than an on-time one.
 */
export function upcoming(cards: Map<string, ReviewCard>, now: Date, known?: (id: string) => boolean): ReviewCard[] {
  const until = endOfDay(now).getTime();
  return [...cards.values()]
    .filter((c) => c.card.due.getTime() > until && (!known || known(c.id)))
    .sort((a, b) => a.card.due.getTime() - b.card.due.getTime() || (a.id < b.id ? -1 : 1));
}

/** When the next card falls due after today, or null when there are none. */
export function nextDue(cards: Map<string, ReviewCard>, now: Date): Date | null {
  const until = endOfDay(now).getTime();
  let next: Date | null = null;
  for (const c of cards.values()) if (c.card.due.getTime() > until && (!next || c.card.due < next)) next = c.card.due;
  return next;
}

export const GRADES = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy] as const;
export const GRADE_LABEL: Record<Grade, string> = { [Rating.Again]: 'Again', [Rating.Hard]: 'Hard', [Rating.Good]: 'Good', [Rating.Easy]: 'Easy' };

/** How long each rating would put the card away for, in whole days. */
export function intervals(card: Card, now: Date): Record<Grade, number> {
  const preview = scheduler.repeat(card, now);
  const days = (g: Grade) => Math.max(1, Math.round((preview[g].card.due.getTime() - now.getTime()) / 86_400_000));
  return { [Rating.Again]: days(Rating.Again), [Rating.Hard]: days(Rating.Hard), [Rating.Good]: days(Rating.Good), [Rating.Easy]: days(Rating.Easy) } as Record<Grade, number>;
}
