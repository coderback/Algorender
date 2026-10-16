'use client';

// Which problems the learner has solved, and in which languages, kept in this
// browser until accounts arrive (Phase 3b). Storage can be unavailable
// (private mode, blocked site data), so every access falls back quietly.

import { useSyncExternalStore } from 'react';
import type { Language } from '@/workspace/protocol';

export type ProblemProgress = {
  /** When every test first passed (ISO date). */
  solved?: string;
  /** Languages it has been solved in. */
  languages?: Language[];
  /** Submissions, passing or not. */
  submissions?: number;
};

const KEY = 'algorender:problems';
const listeners = new Set<() => void>();
let cache: { raw: string | null; value: Record<string, ProblemProgress> } = { raw: null, value: {} };

function read(): Record<string, ProblemProgress> {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return cache.value;
  }
  if (raw !== cache.raw) {
    let value: Record<string, ProblemProgress> = {};
    try {
      value = raw ? (JSON.parse(raw) as Record<string, ProblemProgress>) : {};
    } catch {
      // Unreadable: start again.
    }
    cache = { raw, value };
  }
  return cache.value;
}

function write(all: Record<string, ProblemProgress>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // Not saved.
  }
  listeners.forEach((l) => l());
}

/** Counts a submission, and marks the problem solved in this language when every test passed. */
export function recordSubmission(slug: string, language: Language, passed: boolean) {
  const all = { ...read() };
  const p = { ...all[slug] };
  p.submissions = (p.submissions ?? 0) + 1;
  if (passed) {
    p.solved ??= new Date().toISOString();
    p.languages = [...new Set([...(p.languages ?? []), language])];
  }
  all[slug] = p;
  write(all);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => e.key === KEY && listener();
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

const EMPTY: Record<string, ProblemProgress> = {};

/** Every problem's progress, updating as it changes (in this tab or another). Empty on the server. */
export function useProblemProgress(): Record<string, ProblemProgress> {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}
