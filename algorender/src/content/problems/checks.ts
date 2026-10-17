// Custom checks for problems with more than one right answer, named by a
// problem's `check`. Each gets the test's input, the learner's answer and the
// reference answer, and returns null when the answer is right, or one sentence
// saying what is wrong. `show` writes a value in the learner's language.
//
// These run in the browser (and later on the server), never inside the
// learner's code.

import type { Json } from '@/workspace/protocol';

export type Check = (input: Record<string, Json>, got: Json, expected: Json, show: (v: Json) => string) => string | null;

const isInts = (v: Json): v is number[] => Array.isArray(v) && v.every((x) => typeof x === 'number' && Number.isInteger(x));

export const CHECKS: Record<string, Check> = {
  /** Two different indices whose values add up to the target, in either order. */
  'pair-sum': (input, got, _expected, show) => {
    const nums = input.nums as number[];
    const target = input.target as number;
    if (!isInts(got) || got.length !== 2) return `Expected two indices, got ${show(got)}.`;
    const [i, j] = got;
    if (i === j) return `The two indices must be different: ${show(got)}.`;
    if (i < 0 || j < 0 || i >= nums.length || j >= nums.length) return `${show(got)} isn't a pair of indices into the list (0 to ${nums.length - 1}).`;
    if (nums[i] + nums[j] !== target) return `nums[${i}] + nums[${j}] is ${nums[i] + nums[j]}, not ${target}.`;
    return null;
  },
  /** As pair-sum, with the smaller index first. */
  'ordered-pair-sum': (input, got, expected, show) => {
    const wrong = CHECKS['pair-sum'](input, got, expected, show);
    if (wrong) return wrong;
    const [i, j] = got as number[];
    return i < j ? null : `Put the smaller index first: [${j}, ${i}], not ${show(got)}.`;
  },
  /**
   * Course order: any order that takes every course after its prerequisites,
   * or [] when the prerequisites loop (the reference answer is [] exactly then).
   */
  'course-order': (input, got, expected, show) => {
    const n = input.numCourses as number;
    const prereqs = input.prerequisites as number[][];
    if (!isInts(got)) return `Expected a list of courses, got ${show(got)}.`;
    if ((expected as number[]).length === 0) return got.length === 0 ? null : `The prerequisites loop, so no order works: expected [], got ${show(got)}.`;
    if (got.length !== n) return `Expected all ${n} courses, got ${got.length}: ${show(got)}.`;
    const position = new Map<number, number>();
    got.forEach((c, i) => position.set(c, i));
    if (position.size !== n || got.some((c) => c < 0 || c >= n)) return `Each course from 0 to ${n - 1} should appear once: ${show(got)}.`;
    for (const [course, before] of prereqs) {
      if (position.get(before)! > position.get(course)!) return `Course ${course} comes before its prerequisite ${before} in ${show(got)}.`;
    }
    return null;
  },
};
