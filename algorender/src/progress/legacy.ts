// Progress saved before the event log (Phases 1–3a kept it in localStorage),
// turned into events once per device, so nobody loses what they'd done. The
// old keys stay where they were; a marker stops a second import.

import type { EventData, EventKind, ProgressEvent } from './events';
import { parseEvent } from './events';

const MARKER = 'algorender:progress-imported';

type Make = <K extends EventKind>(kind: K, data: EventData<K>, at?: string) => ProgressEvent;
type ReadableStorage = Pick<Storage, 'getItem' | 'setItem' | 'key' | 'length'>;

/** The old progress as events (valid ones only), and marks it imported. Empty when already done. */
export function importLegacy(storage: ReadableStorage, make: () => Make): ProgressEvent[] {
  try {
    if (storage.getItem(MARKER)) return [];
    const events = legacyEvents(storage, make());
    storage.setItem(MARKER, new Date().toISOString());
    return events;
  } catch {
    return []; // storage blocked or unreadable: nothing to bring over
  }
}

function legacyEvents(storage: ReadableStorage, make: Make): ProgressEvent[] {
  const out: (ProgressEvent | null)[] = [];
  const json = (key: string): unknown => {
    try {
      return JSON.parse(storage.getItem(key) ?? 'null');
    } catch {
      return null;
    }
  };
  const valid = (e: ProgressEvent) => out.push(parseEvent(e));

  // Lessons: { completed: [slug], quizzes: { 'lesson:quiz': score }, predictions: { 'lesson:slug': score } }.
  const lessons = json('algorender.progress.v1') as { completed?: string[]; quizzes?: Record<string, Score>; predictions?: Record<string, Score> } | null;
  for (const lesson of lessons?.completed ?? []) valid(make('lesson.completed', { lesson, done: true }));
  for (const [kind, scores] of [['quiz', lessons?.quizzes], ['prediction', lessons?.predictions]] as const) {
    for (const [key, s] of Object.entries(scores ?? {})) {
      const [lesson, item] = key.split(':');
      valid(make('lesson.scored', { lesson, key: item, kind, correct: s.correct, total: s.total }));
    }
  }

  // Exercises: 'algorender:exercise:<slug>' → { parsons?, fill?: level, write?, bug? }.
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    const exercise = key?.match(/^algorender:exercise:([a-z0-9-]+)$/)?.[1];
    if (!exercise) continue;
    const p = json(key!) as { parsons?: boolean; fill?: number; write?: boolean; bug?: boolean } | null;
    if (p?.parsons) valid(make('exercise.passed', { exercise, stage: 'parsons' }));
    if (typeof p?.fill === 'number' && p.fill >= 0) valid(make('exercise.passed', { exercise, stage: 'fill', level: p.fill }));
    if (p?.write) valid(make('exercise.passed', { exercise, stage: 'write' }));
    if (p?.bug) valid(make('exercise.passed', { exercise, stage: 'bug' }));
  }

  // Problems: 'algorender:problems' → { slug: { solved?: ISO date, languages?: [...] } }.
  const problems = json('algorender:problems') as Record<string, { solved?: string; languages?: string[] }> | null;
  for (const [problem, p] of Object.entries(problems ?? {})) {
    if (!p.solved) continue;
    const at = Number.isNaN(Date.parse(p.solved)) ? undefined : new Date(p.solved).toISOString();
    for (const language of p.languages ?? ['python']) {
      valid(make('problem.submitted', { problem, language: language as 'python', passed: true, tests: 0, failed: 0 }, at));
    }
  }
  return out.filter((e): e is ProgressEvent => e !== null);
}

type Score = { correct: number; total: number };
