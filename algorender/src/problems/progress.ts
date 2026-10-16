'use client';

// Practice problems in the learner's progress log (src/progress/): each
// submission is an event, so solved problems sync with their account, and a
// first solve starts the problem in the review queue.

import { record, useProblemProgress } from '@/progress/hooks';
import type { Language } from '@/workspace/protocol';

export type { ProblemProgress } from '@/progress/projections';
export { useProblemProgress };

/** Records a submission: how many tests ran, how many failed, and whether all passed. */
export function recordSubmission(problem: string, language: Language, { passed, tests, failed }: { passed: boolean; tests: number; failed: number }) {
  record('problem.submitted', { problem, language, passed, tests, failed });
}
