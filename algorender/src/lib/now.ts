'use client';

import { useMemo, useSyncExternalStore } from 'react';

const MINUTE = 60_000;

function subscribe(onChange: () => void) {
  const timer = setInterval(onChange, 15_000);
  return () => clearInterval(timer);
}

/**
 * The time to the minute, for things due "today", re-read every 15 seconds.
 * Null during server rendering, which can't know the reader's clock.
 */
export function useMinute(): Date | null {
  const minute = useSyncExternalStore(subscribe, () => Math.floor(Date.now() / MINUTE), () => -1);
  return useMemo(() => (minute < 0 ? null : new Date(minute * MINUTE)), [minute]);
}
