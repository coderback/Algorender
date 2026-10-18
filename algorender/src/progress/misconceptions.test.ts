import { describe, expect, it } from 'vitest';
import type { EventData, EventKind, ProgressEvent } from './events';
import { parseEvent } from './events';
import { mastery, observations, type MasteryGraph } from './mastery';
import { CLEAR_AFTER, misconceptionCard, mistakes } from './misconceptions';
import { dueToday, reviewCards } from './review';

let n = 0;
const at = (day: number, hour = 10) => new Date(Date.UTC(2026, 9, 1 + day, hour, n % 60)).toISOString();
function ev<K extends EventKind>(kind: K, data: EventData<K>, when: string): ProgressEvent {
  n++;
  return { id: `0190a000-0000-7000-8000-${String(n).padStart(12, '0')}`, kind, at: when, data } as ProgressEvent;
}

const graph: MasteryGraph = {
  concepts: [{ id: 'a', title: 'A', track: 'foundations', prereqs: [], lesson: 'la', visualisers: [], planned: false, depth: 0 }],
  lessons: { la: 'a' },
  exercises: {},
  problems: {},
};

const CARD = misconceptionCard('la', 'keep-mid');
const pick = (when: string, from: 'quiz' | 'placement' | 'explanation' = 'quiz') => ev('misconception.picked', { lesson: 'la', misconception: 'keep-mid', from }, when);
const rate = (rating: number, when: string) => ev('review.rated', { card: CARD, rating }, when);
const quiz = (question: number, correct: boolean, when: string) => ev('quiz.answered', { lesson: 'la', quiz: 'quiz', question, correct }, when);

describe('common mistakes', () => {
  it('opens a mistake when it is picked, and clears it after enough right answers in a row', () => {
    expect(CLEAR_AFTER).toBe(2);
    const events = [pick(at(0))];
    const since = events[0].at;
    expect(mistakes(events).get(CARD)).toMatchObject({ status: 'open', shown: 1, right: 0, since });
    events.push(rate(3, at(1)));
    expect(mistakes(events).get(CARD)).toMatchObject({ status: 'clearing', right: 1 });
    // A wrong answer opens it again, and the count starts over.
    events.push(rate(1, at(2)));
    expect(mistakes(events).get(CARD)).toMatchObject({ status: 'open', shown: 2, right: 0 });
    events.push(rate(3, at(3)), rate(4, at(6)));
    expect(mistakes(events).get(CARD)).toMatchObject({ status: 'cleared', right: 2 });
    // Making it again later reopens it.
    events.push(pick(at(20), 'explanation'));
    expect(mistakes(events).get(CARD)).toMatchObject({ status: 'open', shown: 3, since });
  });

  it('ignores ratings of a mistake card that was never opened', () => {
    expect(mistakes([rate(3, at(1))]).size).toBe(0);
  });

  it('makes a review card due the next day, and sends it back to tomorrow when the mistake is made again', () => {
    const events = [pick(at(0))];
    const card = reviewCards(events).get(CARD)!;
    expect(card.kind).toBe('misconception');
    expect(dueToday(reviewCards(events), new Date(at(0)))).toHaveLength(0);
    expect(dueToday(reviewCards(events), new Date(at(1)))).toHaveLength(1);
    events.push(rate(3, at(1)), rate(3, at(5)));
    const later = reviewCards(events).get(CARD)!;
    expect(later.card.due.getTime()).toBeGreaterThan(new Date(at(9)).getTime());
    events.push(pick(at(10)));
    expect(dueToday(reviewCards(events), new Date(at(11)))).toHaveLength(1);
    expect(reviewCards(events).get(CARD)!.reviews).toBe(2);
  });

  it('keeps a concept from mastered while one of its lesson’s mistakes is open', () => {
    const solid = [0, 1, 2, 3, 0, 1, 2, 3].map((q, i) => quiz(q, true, at(0, 9 + i / 10)));
    solid.push(quiz(0, true, at(2)));
    expect(mastery(solid, graph).get('a')).toMatchObject({ status: 'mastered', mistakes: 0 });
    const slipped = [...solid, pick(at(2, 11))];
    expect(mastery(slipped, graph).get('a')).toMatchObject({ status: 'practised', mistakes: 1 });
    const cleared = [...slipped, rate(3, at(3)), rate(3, at(6))];
    expect(mastery(cleared, graph).get('a')).toMatchObject({ status: 'mastered', mistakes: 0 });
  });

  it('counts mistake reviews and explanations as evidence about the lesson’s concept', () => {
    const events = [
      rate(3, at(1)),
      ev('explanation.scored', { lesson: 'la', prompt: 'why', covered: 2, partly: 1, total: 3, by: 'model' }, at(1)),
      ev('explanation.scored', { lesson: 'la', prompt: 'why', covered: 1, partly: 1, total: 3, by: 'self' }, at(1)),
      ev('explanation.scored', { lesson: 'la', prompt: 'why', covered: 0, partly: 0, total: 0, by: 'self' }, at(1)),
    ];
    expect(observations(events, graph).map((o) => `${o.concept} ${o.source} ${o.item} ${o.correct}`)).toEqual([
      `a review ${CARD} true`,
      // 2 + ½ of 3 is above two thirds; 1 + ½ is not. An empty rubric says nothing.
      'a explanation explain:la:why true',
      'a explanation explain:la:why false',
    ]);
  });

  it('accepts the new events from a device, and rejects malformed ones', () => {
    const good = pick(at(0));
    expect(parseEvent(good)).toEqual(good);
    expect(parseEvent({ ...good, data: { ...good.data, from: 'guess' } })).toBeNull();
    const scored = ev('explanation.scored', { lesson: 'la', prompt: 'why', covered: 1, partly: 0, total: 4, by: 'model' }, at(0));
    expect(parseEvent(scored)).toEqual(scored);
    expect(parseEvent({ ...scored, data: { ...scored.data, by: 'teacher' } })).toBeNull();
  });
});
