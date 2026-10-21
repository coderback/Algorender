import type { ProgressEvent } from './events';

/** How far a learner has read a lesson: the furthest section reached, its id, how many sections there are, and when. */
export type Reading = { lesson: string; furthest: number; section: string; of: number; at: string };

/** The furthest section reached in each lesson, from its `lesson.section` events. */
export function readingByLesson(events: readonly ProgressEvent[]): Map<string, Reading> {
  const out = new Map<string, Reading>();
  for (const e of events) {
    if (e.kind !== 'lesson.section') continue;
    const was = out.get(e.data.lesson);
    if (!was || e.data.index > was.furthest) out.set(e.data.lesson, { lesson: e.data.lesson, furthest: e.data.index, section: e.data.section, of: e.data.of, at: e.at });
    else if (e.at > was.at) out.set(e.data.lesson, { ...was, at: e.at });
  }
  return out;
}

/**
 * Minutes left in a lesson after reading up to section `furthest` (0-based) of
 * `of`, the same estimate the lesson's header shows: the remaining sections'
 * share of its length, counting the one reached as half done.
 */
export function minutesLeft(minutes: number, furthest: number, of: number): number {
  return Math.max(1, Math.round((minutes * (of - furthest - 0.5)) / Math.max(of, 1)));
}
