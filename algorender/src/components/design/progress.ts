'use client';

import { record } from '@/progress/hooks';
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
