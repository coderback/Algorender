'use client';

import { useMemo } from 'react';
import { authClient } from '@/lib/auth-client';
import { useMinute } from '@/lib/now';
import { useProgressSnapshot, useReviewCards } from '@/progress/hooks';
import { xpLedger, xpTotals } from '@/progress/play';
import { dueToday } from '@/progress/review';

/** How many review cards are due today (0 on the server and until the store is read). */
export function useDueCount(): number {
  const cards = useReviewCards();
  const now = useMinute();
  return now ? dueToday(cards, now).length : 0;
}

/** Mastery XP in all and today, or null until the clock and the store are known. */
export function useXp(): { total: number; today: number } | null {
  const { ready, events } = useProgressSnapshot();
  const now = useMinute();
  return useMemo(() => (ready && now ? xpTotals(xpLedger(events), now) : null), [ready, events, now]);
}

/** The signed-in learner, or null (signed out or still checking). */
export function useLearner() {
  const session = authClient.useSession();
  return session.data?.user ?? null;
}

export const dueLabel = (due: number) => (due > 99 ? '99+' : String(due));
