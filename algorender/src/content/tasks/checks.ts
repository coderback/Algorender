import type { NamedCheck } from '@/tasks/checkers';
import { normaliseLines } from '@/tasks/checkers';

// Named checkers for tasks with more than one right output
// (src/tasks/checkers.ts): each gets the case's stdin, the learner's output
// and the reference's (prompts left out) and says what is wrong, or null.

export const TASK_CHECKS: Record<string, NamedCheck> = {
  /** The same lines as the reference, in any order (a set's members, a dict's keys). */
  'lines-any-order': (_stdin, got, expected) => {
    const [a, b] = [normaliseLines(got).sort(), normaliseLines(expected).sort()];
    if (a.length !== b.length) return `Expected ${b.length} lines, but the output has ${a.length}.`;
    const missing = b.find((line, k) => line !== a[k]);
    return missing === undefined ? null : `The output should include the line “${missing}”.`;
  },
};
