import type { ProgressEvent } from '@/progress/events';
import { KNOWN, type ConceptMastery, type MasteryGraph } from '@/progress/mastery';

// What Today shows, picked from the learner's events and projections. Pure, so
// it is tested without React.

/**
 * The lesson the learner was last working in and hasn't finished: the latest
 * lesson with a quiz answer, a score or an explanation, and not completed.
 */
export function lessonInProgress(events: readonly ProgressEvent[], completed: ReadonlySet<string>): string | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.kind === 'quiz.answered' || e.kind === 'lesson.scored' || e.kind === 'explanation.scored') {
      if (!completed.has(e.data.lesson)) return e.data.lesson;
    }
  }
  return null;
}

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

export type WeekDay = { date: Date; active: boolean; today: boolean };

/**
 * Monday to Sunday of the current week, in the learner's time zone, and
 * whether they did anything that day. It shows activity, not a streak.
 */
export function weekActivity(events: readonly ProgressEvent[], now: Date): WeekDay[] {
  const active = new Set(events.map((e) => dayKey(new Date(e.at))));
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    return { date, active: active.has(dayKey(date)), today: dayKey(date) === dayKey(now) };
  });
}

export type TrackMastery = { track: string; known: number; total: number; started: boolean };

/** Per track, how many of its concepts are known, in the map's track order; planned concepts don't count. */
export function trackMastery(graph: MasteryGraph, m: Map<string, ConceptMastery>, order: readonly string[]): TrackMastery[] {
  return order
    .map((track) => {
      const concepts = graph.concepts.filter((c) => c.track === track && !c.planned);
      const statuses = concepts.map((c) => m.get(c.id)?.status ?? 'new');
      return {
        track,
        known: statuses.filter((s) => KNOWN.has(s)).length,
        total: concepts.length,
        started: statuses.some((s) => s !== 'new'),
      };
    })
    .filter((t) => t.total > 0);
}

/** The first problem not yet solved, from a list ordered easiest first. */
export function firstUnsolved<P extends { slug: string }>(problems: readonly P[], solved: (slug: string) => boolean): P | null {
  return problems.find((p) => !solved(p.slug)) ?? null;
}

/** A greeting for the time of day. */
export function greeting(now: Date): string {
  const h = now.getHours();
  return h < 5 ? 'Good evening' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}
