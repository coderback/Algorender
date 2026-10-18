'use client';

// Lesson progress: completed lessons and quiz and prediction scores, as
// events in the learner's progress log (src/progress/), so it syncs with
// their account and feeds the review queue.

import { record, useLessonProgress } from '@/progress/hooks';
import type { LessonProgress, Score } from '@/progress/projections';

export type { Score };
export type Progress = LessonProgress;

/** Completed lessons and best scores; empty during server render and until the device's progress is read. */
export const useProgress = (): Progress => useLessonProgress();

export const markComplete = (lesson: string, done: boolean) => record('lesson.completed', { lesson, done });

/** A finished quiz or prediction challenge; the best score is the one shown. */
export const recordScore = (lesson: string, kind: 'quiz' | 'prediction', key: string, score: Score) =>
  record('lesson.scored', { lesson, key, kind, correct: score.correct, total: score.total });

/** One quiz question answered: its first answer starts it in the review queue. */
export const recordAnswer = (lesson: string, quiz: string, question: number, correct: boolean) =>
  record('quiz.answered', { lesson, quiz, question, correct });

/** An answer that comes from one of the lesson's common mistakes: it starts the mistake in the review queue. */
export const recordMistake = (lesson: string, misconception: string, from: 'quiz' | 'placement' | 'explanation') =>
  record('misconception.picked', { lesson, misconception, from });

/** An explain-it-back answer, scored against its rubric. */
export const recordExplanation = (lesson: string, prompt: string, score: { covered: number; partly: number; total: number }, by: 'self' | 'model') =>
  record('explanation.scored', { lesson, prompt, ...score, by });
