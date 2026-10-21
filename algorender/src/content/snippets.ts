// Short programs that lessons trace line by line on the memory view
// (<TraceCode snippet="…" />). Each runs as top-level code, so it calls its
// own functions. snippets.test.ts runs every one in every language it offers.

import type { Language } from '@/workspace/protocol';

export type Snippet = {
  id: string;
  /** Names the code for screen readers and the editor's label. */
  title: string;
  /** The program per language; a lesson offers the languages given here. */
  code: Partial<Record<Language, string>>;
};

export const snippets: Snippet[] = [
  {
    id: 'count-pairs',
    title: 'Counting the pairs two nested loops visit',
    code: {
      python: `def count_pairs(n):
    steps = 0
    for i in range(n):
        for j in range(i + 1, n):
            steps += 1
    return steps

print(count_pairs(4))
`,
      javascript: `function countPairs(n) {
  let steps = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      steps += 1;
    }
  }
  return steps;
}

console.log(countPairs(4));
`,
      typescript: `function countPairs(n: number): number {
  let steps = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      steps += 1;
    }
  }
  return steps;
}

console.log(countPairs(4));
`,
    },
  },
  {
    id: 'factorial',
    title: 'Factorial, recursively',
    code: {
      python: `def factorial(n):
    if n <= 1:
        return 1
    return n * factorial(n - 1)

result = factorial(4)
print(result)
`,
      javascript: `function factorial(n) {
  if (n <= 1) {
    return 1;
  }
  return n * factorial(n - 1);
}

const result = factorial(4);
console.log(result);
`,
      typescript: `function factorial(n: number): number {
  if (n <= 1) {
    return 1;
  }
  return n * factorial(n - 1);
}

const result = factorial(4);
console.log(result);
`,
    },
  },
  {
    id: 'recursive-sum',
    title: 'Summing a list, recursively',
    code: {
      python: `def total(nums, i):
    if i == len(nums):
        return 0
    return nums[i] + total(nums, i + 1)

values = [3, 1, 4]
print(total(values, 0))
`,
      javascript: `function total(nums, i) {
  if (i === nums.length) {
    return 0;
  }
  return nums[i] + total(nums, i + 1);
}

const values = [3, 1, 4];
console.log(total(values, 0));
`,
      typescript: `function total(nums: number[], i: number): number {
  if (i === nums.length) {
    return 0;
  }
  return nums[i] + total(nums, i + 1);
}

const values = [3, 1, 4];
console.log(total(values, 0));
`,
    },
  },
];

export function getSnippet(id: string): Snippet | undefined {
  return snippets.find((s) => s.id === id);
}
