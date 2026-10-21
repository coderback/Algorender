import type { ProgressEvent } from '@/progress/events';

// The account page's activity: a heatmap of the last weeks and a short list
// of recent things done, both read from the event log. Pure, so it's tested
// without a browser.

export const HEATMAP_WEEKS = 20;

/** A local calendar day as YYYY-MM-DD. */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export type HeatDay = { day: string; count: number; level: 0 | 1 | 2 | 3 | 4; future: boolean };

/** Shade steps by things done in a day. */
export function heatLevel(count: number): HeatDay['level'] {
  return count === 0 ? 0 : count <= 2 ? 1 : count <= 5 ? 2 : count <= 10 ? 3 : 4;
}

/**
 * Week columns, Monday to Sunday, ending with the week that holds `now`.
 * Each day counts the events recorded on it. (TODO(redesign): the board
 * shows minutes a day, but the log doesn't record time spent, so this counts
 * things done instead. It's activity, not a streak.)
 */
export function heatmap(events: readonly ProgressEvent[], now: Date, weeks = HEATMAP_WEEKS): HeatDay[][] {
  const counts = new Map<string, number>();
  for (const e of events) {
    const k = dayKey(new Date(e.at));
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const columns: HeatDay[][] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const column: HeatDay[] = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(monday);
      date.setDate(monday.getDate() - w * 7 + d);
      const day = dayKey(date);
      const count = counts.get(day) ?? 0;
      column.push({ day, count, level: heatLevel(count), future: date > today });
    }
    columns.push(column);
  }
  return columns;
}

export type RecentKind = 'lesson' | 'problem' | 'prediction' | 'review' | 'placement' | 'plan';
export type Recent = { kind: RecentKind; day: string; at: string; text: string; strong?: string; after?: string };

type Titles = { lessons: Readonly<Record<string, string>>; problems: Readonly<Record<string, string>>; goals: Readonly<Record<string, string>>; languages: Readonly<Record<string, string>> };

/**
 * The latest things done, newest first: finished lessons, first solves,
 * prediction scores and plan changes one by one; reviews and placement
 * answers as one line a day.
 */
export function recent(events: readonly ProgressEvent[], titles: Titles, limit = 5): Recent[] {
  const out: Recent[] = [];
  const perDay = new Map<string, Recent & { n: number }>();
  const solved = new Set<string>();
  for (const e of events) {
    const day = dayKey(new Date(e.at));
    switch (e.kind) {
      case 'lesson.completed':
        if (e.data.done) out.push({ kind: 'lesson', day, at: e.at, text: 'Finished ', strong: titles.lessons[e.data.lesson] ?? e.data.lesson });
        break;
      case 'problem.submitted':
        if (e.data.passed && !solved.has(e.data.problem)) {
          solved.add(e.data.problem);
          out.push({ kind: 'problem', day, at: e.at, text: 'Solved ', strong: titles.problems[e.data.problem] ?? e.data.problem, after: ` in ${titles.languages[e.data.language] ?? e.data.language}` });
        }
        break;
      case 'lesson.scored':
        if (e.data.kind === 'prediction') {
          out.push({ kind: 'prediction', day, at: e.at, text: `${e.data.correct} of ${e.data.total} predictions right in `, strong: titles.lessons[e.data.lesson] ?? e.data.lesson });
        }
        break;
      case 'plan.set':
        out.push(
          e.data.goal
            ? { kind: 'plan', day, at: e.at, text: 'Set a goal: ', strong: titles.goals[e.data.goal] ?? e.data.goal, after: `, ${e.data.hours} h a week` }
            : { kind: 'plan', day, at: e.at, text: 'Cleared the study plan' },
        );
        break;
      case 'review.rated':
      case 'placement.answered': {
        const kind = e.kind === 'review.rated' ? 'review' : 'placement';
        const key = `${kind}:${day}`;
        const line = perDay.get(key);
        if (line) {
          line.n++;
          line.at = e.at;
        } else {
          const fresh = { kind, day, at: e.at, text: '', n: 1 } as Recent & { n: number };
          perDay.set(key, fresh);
          out.push(fresh);
        }
        break;
      }
      default:
        break;
    }
  }
  for (const line of perDay.values()) {
    line.text = line.kind === 'review' ? `Reviewed ${line.n} ${line.n === 1 ? 'card' : 'cards'}` : `Answered ${line.n} placement ${line.n === 1 ? 'question' : 'questions'}`;
  }
  return out
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    .slice(0, limit)
    .map(({ kind, day, at, text, strong, after }) => ({ kind, day, at, text, ...(strong && { strong }), ...(after && { after }) }));
}

/** Prediction challenges' share right, across every attempt; null before any. */
export function predictionShare(events: readonly ProgressEvent[]): number | null {
  let right = 0;
  let total = 0;
  for (const e of events) {
    if (e.kind === 'lesson.scored' && e.data.kind === 'prediction') {
      right += e.data.correct;
      total += e.data.total;
    }
  }
  return total ? right / total : null;
}
