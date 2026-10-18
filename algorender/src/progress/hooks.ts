'use client';

// React's view of the progress store: the snapshot, and the projections the
// pages use, recomputed only when the events change. Every hook returns the
// empty state on the server and until the store has read the device's
// events; `ready` says when it has.

import { useMemo, useSyncExternalStore } from 'react';
import type { EventData, EventKind, ProgressEvent } from './events';
import { mastery, type MasteryGraph } from './mastery';
import { mistakes } from './misconceptions';
import { badges, conceptLevels, xpLedger } from './play';
import { exerciseProgress, lessonProgress, problemProgress } from './projections';
import { reviewCards } from './review';
import { progressStore, type Snapshot } from './store';

const SERVER: Snapshot = { ready: false, owner: null, events: [], sync: { state: 'local', pending: 0, lastSynced: null } };

export function useProgressSnapshot(): Snapshot {
  const store = progressStore();
  return useSyncExternalStore(store.subscribe, store.getSnapshot, () => SERVER);
}

const useEvents = (): readonly ProgressEvent[] => useProgressSnapshot().events;

/** Records something the learner did. */
export function record<K extends EventKind>(kind: K, data: EventData<K>) {
  return progressStore().record(kind, data);
}

export function useLessonProgress() {
  const events = useEvents();
  return useMemo(() => lessonProgress(events), [events]);
}

export function useExerciseProgress(exercise: string) {
  const events = useEvents();
  return useMemo(() => exerciseProgress(events, exercise), [events, exercise]);
}

export function useProblemProgress() {
  const events = useEvents();
  return useMemo(() => problemProgress(events), [events]);
}

export function useReviewCards() {
  const events = useEvents();
  return useMemo(() => reviewCards(events), [events]);
}

/** The common mistakes the learner has shown, by card id (src/progress/misconceptions.ts). */
export function useMistakes() {
  const events = useEvents();
  return useMemo(() => mistakes(events), [events]);
}

/** XP, levels per concept and badges (src/progress/play.ts). */
export function usePlay(graph: MasteryGraph) {
  const events = useEvents();
  const m = useMastery(graph);
  return useMemo(() => ({ ledger: xpLedger(events), levels: conceptLevels(events, graph, m), badges: badges(events) }), [events, graph, m]);
}

/** Every concept's mastery (src/progress/mastery.ts). */
export function useMastery(graph: MasteryGraph) {
  const events = useEvents();
  return useMemo(() => mastery(events, graph), [events, graph]);
}
