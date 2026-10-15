'use client';

import { useMemo, useSyncExternalStore } from 'react';

// Lesson progress kept in this browser only (a per-viewer convenience until
// accounts arrive in Phase 3). Every read and write tolerates storage being
// unavailable (private windows, blocked site data): the UI then simply
// forgets between visits.

const KEY = 'algorender.progress.v1';
const EVENT = 'algorender-progress';

export type Score = { correct: number; total: number };
export type Progress = {
  completed: string[];
  quizzes: Record<string, Score>;
  predictions: Record<string, Score>;
};

const EMPTY: Progress = { completed: [], quizzes: {}, predictions: {} };

function read(): string {
  try {
    return localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

function parse(raw: string): Progress {
  if (!raw) return EMPTY;
  try {
    const p = JSON.parse(raw) as Partial<Progress>;
    return { completed: p.completed ?? [], quizzes: p.quizzes ?? {}, predictions: p.predictions ?? {} };
  } catch {
    return EMPTY;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener('storage', onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

/** Current progress; empty during server render and until hydrated. */
export function useProgress(): Progress {
  const raw = useSyncExternalStore(subscribe, read, () => '');
  return useMemo(() => parse(raw), [raw]);
}

export function updateProgress(change: (p: Progress) => Progress) {
  try {
    localStorage.setItem(KEY, JSON.stringify(change(parse(read()))));
    window.dispatchEvent(new Event(EVENT));
  } catch {
    // Storage unavailable: progress just isn't remembered.
  }
}

export const markComplete = (lesson: string, done: boolean) =>
  updateProgress((p) => ({
    ...p,
    completed: done ? [...new Set([...p.completed, lesson])] : p.completed.filter((s) => s !== lesson),
  }));

/** Keeps the best score seen for a quiz or prediction challenge. */
export const recordBest = (kind: 'quizzes' | 'predictions', key: string, score: Score) =>
  updateProgress((p) => {
    const prev = p[kind][key];
    const better = !prev || score.correct > prev.correct || (score.correct === prev.correct && score.total < prev.total);
    return better ? { ...p, [kind]: { ...p[kind], [key]: score } } : p;
  });
