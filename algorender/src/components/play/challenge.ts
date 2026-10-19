import { GAMES } from '@/play/games';
import type { ProgressEvent } from '@/progress/events';
import { nextSteps, type ConceptMastery, type MasteryGraph } from '@/progress/mastery';
import { didToday } from '@/progress/play';
import { dueToday, type ReviewCard } from '@/progress/review';
import { conceptHref } from '../learn/Mastery';

export type ChallengeItem = {
  id: 'review' | 'new' | 'game';
  done: boolean;
  text: string;
  /** A muted second line. */
  detail: string;
  href: string;
  cta: string;
};

/**
 * Today's challenge (shown on Today and the Play hub): clear the due reviews,
 * learn something new from the next steps, and play a round of a game.
 */
export function dailyChallenge({
  events,
  cards,
  mastery,
  graph,
  now,
}: {
  events: readonly ProgressEvent[];
  cards: Map<string, ReviewCard>;
  mastery: Map<string, ConceptMastery>;
  graph: MasteryGraph;
  now: Date;
}): ChallengeItem[] {
  const due = dueToday(cards, now).length;
  const did = didToday(events, now);
  const next = nextSteps(mastery, graph, { limit: 1 })[0];
  const learnedNew = !!next?.concept.lesson && did.learned.has(next.concept.lesson);
  return [
    {
      id: 'review',
      done: due === 0,
      text: due === 0 ? (did.reviewed ? 'Reviews done for today' : 'No reviews due today') : `Clear your ${due} due ${due === 1 ? 'review' : 'reviews'}`,
      detail: due === 0 ? 'They come back when they’re due' : 'A few minutes, card by card',
      href: '/review',
      cta: 'Review',
    },
    ...(next
      ? [
          {
            id: 'new' as const,
            done: learnedNew,
            text: `Something new: ${next.concept.title}`,
            detail: next.reason === 'continue' ? 'You’ve started it' : 'You know what it builds on',
            href: conceptHref(next.concept),
            cta: 'Start',
          },
        ]
      : []),
    { id: 'game', done: did.played, text: 'A round of a game', detail: GAMES.map((g) => g.title).join(' · '), href: '/play/be-the-algorithm', cta: 'Play' },
  ];
}
