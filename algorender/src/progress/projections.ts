// What the progress events add up to, for each part of the app. Pure
// functions of the event list (in time order), so the same events give the
// same progress on every device, online or not.

import type { ProblemLanguage } from '@/problems/languages';
import { byTime, type ProgressEvent } from './events';

export type Score = { correct: number; total: number };

/** Lessons: which are done, and the best score in each quiz and prediction challenge (by `lesson:key`). */
export type LessonProgress = { completed: string[]; quizzes: Record<string, Score>; predictions: Record<string, Score> };

export function lessonProgress(events: readonly ProgressEvent[]): LessonProgress {
  const done = new Map<string, boolean>();
  const quizzes: Record<string, Score> = {};
  const predictions: Record<string, Score> = {};
  for (const e of events) {
    if (e.kind === 'lesson.completed') done.set(e.data.lesson, e.data.done);
    else if (e.kind === 'lesson.scored') {
      const best = e.data.kind === 'quiz' ? quizzes : predictions;
      const key = `${e.data.lesson}:${e.data.key}`;
      const score = { correct: e.data.correct, total: e.data.total };
      if (better(score, best[key])) best[key] = score;
    }
  }
  return { completed: [...done].filter(([, d]) => d).map(([l]) => l), quizzes, predictions };
}

/** More right answers wins; with as many right, fewer questions (a better rate). */
export function better(score: Score, than: Score | undefined): boolean {
  return !than || score.correct > than.correct || (score.correct === than.correct && score.total < than.total);
}

/** A code exercise: which stages are passed, and the highest fill-in level passed. */
export type ExerciseProgress = { parsons?: boolean; fill?: number; write?: boolean; bug?: boolean };

export function exerciseProgress(events: readonly ProgressEvent[], exercise: string): ExerciseProgress {
  const out: ExerciseProgress = {};
  for (const e of events) {
    if (e.kind !== 'exercise.passed' || e.data.exercise !== exercise) continue;
    if (e.data.stage === 'fill') out.fill = Math.max(out.fill ?? -1, e.data.level ?? 0);
    else out[e.data.stage] = true;
  }
  return out;
}

export type ProblemProgress = {
  /** When every test first passed. */
  solved?: string;
  /** Languages it has been solved in. */
  languages?: ProblemLanguage[];
  /** Submissions, passing or not. */
  submissions: number;
  /** Failed submissions before the first pass. */
  failedFirst: number;
};

/** Every practice problem submitted at least once, by slug. */
export function problemProgress(events: readonly ProgressEvent[]): Record<string, ProblemProgress> {
  const out: Record<string, ProblemProgress> = {};
  for (const e of events) {
    if (e.kind !== 'problem.submitted') continue;
    const p = (out[e.data.problem] ??= { submissions: 0, failedFirst: 0 });
    p.submissions += 1;
    if (!e.data.passed) {
      if (!p.solved) p.failedFirst += 1;
      continue;
    }
    p.solved ??= e.at;
    if (!p.languages?.includes(e.data.language)) p.languages = [...(p.languages ?? []), e.data.language];
  }
  return out;
}

/** Events sorted into the order they happened. */
export const inOrder = (events: Iterable<ProgressEvent>) => [...events].sort(byTime);
