'use client';

import { useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { useProgressSnapshot } from '@/progress/hooks';
import { hasStarted, isReturning, readHint, writeHint } from './returning';

const noop = () => () => {};

/**
 * Shows Today or the landing page at / (decision D1). The server renders both;
 * until the device's progress is read, CSS keyed on HOME_SCRIPT's hint hides
 * one (so neither flashes), then only the right one stays mounted. Today keeps
 * its place in the tree, so it never remounts when the guess was right.
 */
export function HomeGate({ landing, today }: { landing: ReactNode; today: ReactNode }) {
  const snapshot = useProgressSnapshot();
  // The hint is known on the client only: hydration starts from "both".
  const hint = useSyncExternalStore(noop, readHint, () => null);
  const decided = snapshot.ready ? (isReturning(snapshot, hasStarted()) ? 'today' : 'landing') : null;
  const view = decided ?? hint ?? 'both';

  useEffect(() => {
    if (decided) writeHint(decided);
  }, [decided]);

  return (
    <>
      <div data-home-view={view === 'both' ? 'landing' : undefined}>{view !== 'today' && landing}</div>
      <div data-home-view={view === 'both' ? 'today' : undefined}>{view !== 'landing' && today}</div>
    </>
  );
}
