import { defineAlgorithm } from '@/engine/module';
import type { ArrayState } from '@/viz/array/types';
import { PROBES, SearchTracer, probesText, searchInput, type SearchInput } from './shared';

const pseudocode = [
  'linearSearch(A, x):',
  '  for i from 0 to n − 1:',
  '    if A[i] = x: return i',
  '  return −1   (not found)',
];

const IS_IT = ['Yes, this is the target', 'No, keep looking'] as const;

function* run(input: SearchInput) {
  const s = new SearchTracer(input, ['probes'], 'Array');
  const { n, x } = s;
  if (n === 0) {
    yield s.frame({ line: 3, note: `The array is empty, so ${x} can't be in it.` });
    return;
  }
  yield s.frame({
    note: `Linear search looks for ${x} by checking every position from left to right. It needs no order at all, so it works on any array.`,
    window: [0, n - 1],
  });

  for (let i = 0; i < n; i++) {
    const v = s.probe(i);
    const before = i === 0 ? 'Start at the front.' : `A[${i - 1}] is not ${x}, so move on.`;
    yield s.frame({
      line: 2,
      note: `${before} Compare A[${i}] = ${v} with ${x}.`,
      window: [i, n - 1],
      probe: i,
      pointers: { i },
      vars: { x, i, 'A[i]': v },
      checkpoint: { question: `Is A[${i}] the target?`, choices: IS_IT, answer: v === x ? 0 : 1 },
    });
    if (v === x) {
      const later = input.values.indexOf(x, i + 1);
      yield s.frame({
        line: 2,
        note: `A[${i}] = ${x}: found it at position ${i} after ${probesText(s.probes)}.${later === -1 ? '' : ` A[${later}] holds ${x} too, but the search stops at the first match and never looks there.`}`,
        found: i,
        pointers: { i },
        vars: { x, i, 'A[i]': v },
      });
      return;
    }
  }

  yield s.frame({
    line: 3,
    note: `A[${n - 1}] is not ${x} either, and nothing is left to check, so ${x} is not in the array. With no order to exploit there was no shortcut: all ${probesText(s.probes)} were needed.`,
    vars: { x },
  });
}

export const linearSearch = defineAlgorithm<SearchInput, ArrayState>({
  kind: 'algorithm',
  slug: 'linear-search',
  view: 'array',
  input: searchInput({ sorted: false, examples: ['present', 'absent', 'duplicates', 'first', 'last'], defaultSize: 10 }),
  pseudocode,
  stats: [PROBES],
  legend: [
    { neutral: 'Checked: not the target' },
    { mark: 'frontier', label: 'Not checked yet' },
    { mark: 'compare', label: 'Being checked' },
    { mark: 'key', label: 'Target' },
    'found',
  ],
  run,
  content: {
    idea: 'Check each element in turn until you find the target or run out of elements. It is the only option when the data has no order to exploit.',
    invariant: 'Before checking position i, none of positions 0 to i − 1 holds the target.',
    whenToUse: 'Unsorted or tiny arrays, linked lists, or a one-off search where sorting first would cost more than it saves. For repeated lookups, sort once and use binary search, or build a hash table.',
    traits: [
      { label: 'Works on unsorted data', good: true },
      { label: 'Works on linked lists', good: true },
      { label: 'Checks all n when the target is missing', good: false },
    ],
    experiments: [
      { example: 'absent', prompt: 'Every single element has to be checked before the search can give up. Compare that with binary search on the same size.' },
      { example: 'duplicates', prompt: 'The target appears more than once. Which copy does linear search report?' },
      { example: 'first', prompt: 'The best case: one probe. How likely is that on random data?' },
    ],
  },
});
