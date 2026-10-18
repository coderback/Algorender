// The common mistakes a learner has shown, from the events alone, like review
// and mastery. A mistake opens when the learner picks an answer that comes
// from it (`misconception.picked`): a trapped quiz choice, or an explanation
// that states it. Its review card (`misconception:<lesson>:<id>`) then asks
// the mistake's probe questions on later days; it clears after CLEAR_AFTER
// right answers in a row, and a wrong one opens it again.

import type { ProgressEvent } from './events';

export const CLEAR_AFTER = 2;

export type MistakeStatus = 'open' | 'clearing' | 'cleared';

export type Mistake = {
  lesson: string;
  id: string;
  status: MistakeStatus;
  /** When it was first shown. */
  since: string;
  /** How many times it has been shown (picked, or a probe answered wrong). */
  shown: number;
  /** Probe answers right since it was last shown. */
  right: number;
};

export const misconceptionCard = (lesson: string, id: string) => `misconception:${lesson}:${id}`;

const statusOf = (right: number): MistakeStatus => (right >= CLEAR_AFTER ? 'cleared' : right > 0 ? 'clearing' : 'open');

/** Every mistake the learner has shown, by card id. Events must be in time order. */
export function mistakes(events: readonly ProgressEvent[]): Map<string, Mistake> {
  const out = new Map<string, Mistake>();
  for (const e of events) {
    if (e.kind === 'misconception.picked') {
      const key = misconceptionCard(e.data.lesson, e.data.misconception);
      const m = out.get(key);
      out.set(key, { lesson: e.data.lesson, id: e.data.misconception, since: m?.since ?? e.at, shown: (m?.shown ?? 0) + 1, right: 0, status: 'open' });
    } else if (e.kind === 'review.rated' && e.data.card.startsWith('misconception:')) {
      const m = out.get(e.data.card);
      if (!m) continue;
      const right = e.data.rating >= 2 ? m.right + 1 : 0;
      out.set(e.data.card, { ...m, right, shown: m.shown + (right ? 0 : 1), status: statusOf(right) });
    }
  }
  return out;
}
