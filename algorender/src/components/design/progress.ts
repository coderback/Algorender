'use client';

import { useMemo } from 'react';
import { record, useProgressSnapshot } from '@/progress/hooks';
import type { SimResult } from '@/systems/design/types';

/** One check of a case study's design (see `design.checked` in src/progress/events.ts). */
export const recordDesign = (study: string, passed: boolean, result: SimResult) =>
  record('design.checked', {
    study,
    passed,
    throughput: Math.round(result.throughput),
    p99: Number.isFinite(result.latency.p99) ? Math.round(result.latency.p99) : 0,
    errorRate: Math.min(1, Math.max(0, result.errorRate)),
    cost: Math.round(result.costPerMonth),
  });

/** The case studies the learner has passed at least once. */
export function usePassedDesigns(): ReadonlySet<string> {
  const { events } = useProgressSnapshot();
  return useMemo(() => new Set(events.flatMap((e) => (e.kind === 'design.checked' && e.data.passed ? [e.data.study] : []))), [events]);
}
