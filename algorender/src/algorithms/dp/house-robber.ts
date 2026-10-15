import { defineAlgorithm } from '@/engine/module';
import { parseArrayInput } from '@/engine/random';
import type { Frame } from '@/engine/types';
import { GridTracer, type CellRef } from '@/viz/grid/tracer';
import type { GridState } from '@/viz/grid/types';
import { arcBend, CELLS, clampSize, joinWords, numberChoices, randomInts } from './shared';

export const MAX_HOUSES = 10;

const pseudocode = [
  'dp[0] ← 0;  dp[1] ← v[1]',
  'for i from 2 to n:',
  '  skip ← dp[i−1]',
  '  rob ← v[i] + dp[i−2]',
  '  dp[i] ← max(skip, rob)',
  '',
  'trace back from i = n:',
  '  if dp[i] = dp[i−1]: skip i; i ← i − 1',
  '  else: rob i;  i ← i − 2',
];

const V = 0;
const DP = 1;
const LIST = 'robbed';

/** Biggest house first, skipping any house next to one already taken. Houses are numbered from 1. */
export function biggestFirst(values: readonly number[]): { houses: number[]; total: number } {
  const order = values.map((_, k) => k).sort((x, y) => values[y] - values[x] || x - y);
  const taken = new Set<number>();
  for (const k of order) if (!taken.has(k - 1) && !taken.has(k + 1)) taken.add(k);
  const houses = [...taken].sort((x, y) => x - y).map((k) => k + 1);
  return { houses, total: houses.reduce((s, h) => s + values[h - 1], 0) };
}

function* run(values: readonly number[]): Generator<Frame<GridState>> {
  const n = values.length;
  const v = (i: number) => values[i - 1];
  const t = new GridTracer(['cells', 'decisions']);
  t.addTable({
    label: 'dp[i]: the most money from houses 1 to i',
    corner: 'i',
    rows: [
      { id: 'v', label: 'v', scale: Math.max(1, ...values) },
      { id: 'dp', label: 'dp' },
    ],
    cols: [{ label: '0', sub: 'none' }, ...values.map((_, k) => ({ label: String(k + 1) }))],
  });
  values.forEach((x, k) => t.set([V, k + 1], x));
  t.addList({ id: LIST, label: 'Houses robbed', empty: 'Found during the traceback' });
  const dp = Array<number>(n + 1).fill(0);

  yield t.frame({
    note: 'Rob houses along a street for the largest total without ever robbing two next door; dp[i] will hold the most money from houses 1 to i alone.',
    vars: { n },
  });

  dp[1] = v(1);
  t.set([DP, 0], 0);
  t.set([DP, 1], dp[1]);
  t.count('cells', 2);
  yield t.frame({
    line: 0,
    note: `With no houses there is nothing to take, so dp[0] = 0; with only house 1, robbing it is best, so dp[1] = ${dp[1]}.`,
    marks: { key: [[DP, 0], [DP, 1]] },
    vars: { 'dp[0]': 0, 'dp[1]': dp[1] },
  });

  for (let i = 2; i <= n; i++) {
    const x = v(i);
    const skip = dp[i - 1];
    const before = dp[i - 2];
    const rob = x + before;
    const best = Math.max(skip, rob);
    const robs = rob > skip;
    const here: CellRef = [DP, i];
    const vars = { i, 'v[i]': x, skip, 'dp[i−2]': before };
    const fromSkip = { from: [DP, i - 1] as const, to: here, mark: 'compare' as const };
    const fromRob = [
      { from: [DP, i - 2] as const, to: here, mark: 'compare' as const, bend: arcBend(2) },
      { from: [V, i] as const, to: here, mark: 'compare' as const },
    ];
    yield t.frame({
      line: 3,
      note: `House ${i} holds ${x}: skip it and keep dp[${i - 1}] = ${skip}, or rob it for ${x} + dp[${i - 2}] = ${x} + ${before}, since robbing it rules out house ${i - 1} next door.`,
      marks: { key: [[V, i], here], compare: [[DP, i - 1], [DP, i - 2]] },
      arrows: [fromSkip, ...fromRob],
      vars,
      checkpoint:
        rob === skip
          ? { question: `What is dp[${i}]?`, ...numberChoices(best, [x, skip + x, before]) }
          : { question: `Rob house ${i} or skip it?`, choices: [`Rob house ${i}`, `Skip house ${i}`], answer: robs ? 0 : 1 },
    });

    dp[i] = best;
    t.set(here, best);
    t.count('cells');
    t.count('decisions');
    yield t.frame({
      line: 4,
      note: robs
        ? `Robbing wins: ${x} + ${before} = ${rob} beats ${skip}, so dp[${i}] = ${rob}.`
        : rob === skip
          ? `Both options give ${skip}, so dp[${i}] = ${skip}; on a tie the traceback treats house ${i} as skipped.`
          : `Skipping wins: ${skip} beats ${x} + ${before} = ${rob}, so dp[${i}] = ${skip}.`,
      marks: { key: [[V, i], here], compare: robs ? [[DP, i - 2]] : [[DP, i - 1]] },
      arrows: robs ? fromRob : [fromSkip],
      vars: { ...vars, rob, 'dp[i]': best },
    });
  }

  // Traceback: house i was robbed exactly when dp[i] beats dp[i−1].
  const ask = (i: number) => (i >= 1 ? { question: `Was house ${i} robbed?`, choices: ['Yes', 'No'], answer: dp[i] !== dp[i - 1] ? 0 : 1 } : undefined);
  t.mark([DP, n], 'path');
  yield t.frame({
    line: 6,
    note: `dp[${n}] = ${dp[n]} is the most the whole street can give; walk back from house ${n} to find which houses give it.`,
    vars: { i: n },
    checkpoint: ask(n),
  });

  const robbed: number[] = [];
  for (let i = n; i >= 1; ) {
    if (dp[i] === dp[i - 1]) {
      t.addArrow({ from: [DP, i], to: [DP, i - 1], mark: 'path' });
      t.mark([DP, i - 1], 'path');
      const note = `dp[${i}] = dp[${i - 1}] = ${dp[i]}: the best total up to house ${i} does not need it, so step back to ${i > 1 ? `house ${i - 1}` : 'the start'}.`;
      i -= 1;
      yield t.frame({ line: 7, note, vars: { i }, checkpoint: ask(i) });
      continue;
    }
    t.mark([V, i], 'path');
    t.addItem(LIST, { id: `h${i}`, text: `#${i}: ${v(i)}`, mark: 'path' }, 'start');
    robbed.unshift(i);
    const to = i - 2;
    if (to >= 0) {
      t.addArrow({ from: [DP, i], to: [DP, to], mark: 'path', bend: -arcBend(2) });
      t.mark([DP, to], 'path');
    }
    const note =
      i === 1
        ? `dp[1] = ${dp[1]} beats dp[0] = 0, so house 1 was robbed, and no houses are left before it.`
        : `dp[${i}] = ${dp[i]} beats dp[${i - 1}] = ${dp[i - 1]}, so house ${i} was robbed (${v(i)} + dp[${to}]) and house ${i - 1} next door was not${
            to >= 1 ? `: jump to house ${to}` : ', which leaves no houses'
          }.`;
    i = to;
    yield t.frame({ line: 8, note, vars: { i: Math.max(i, 0) }, checkpoint: ask(i) });
  }

  const greedy = biggestFirst(values);
  const plan = robbed.length > 0 ? `Rob houses ${joinWords(robbed.map(String))} for ${dp[n]} in total, no two of them next door` : 'Every house is empty, so the best total is 0';
  yield t.frame({
    note: `${plan}; ${
      greedy.total < dp[n]
        ? `biggest-house-first would take ${joinWords(greedy.houses.map(String))} for only ${greedy.total}`
        : 'here biggest-house-first happens to reach the same total, but it is not guaranteed to'
    }.`,
    vars: { total: dp[n], robbed: robbed.length },
  });
}

const houses = (s: number) => clampSize(s, 2, MAX_HOUSES);

export const houseRobber = defineAlgorithm<number[], GridState>({
  kind: 'algorithm',
  slug: 'house-robber',
  view: 'grid',
  input: {
    examples: [
      { id: 'greedy-fails', label: 'Biggest-first fails', make: () => [5, 9, 6, 1, 8, 7], sized: false },
      { id: 'random', label: 'Random', make: ({ seed, size }) => randomInts(seed, houses(size), 1, 20) },
      { id: 'equal', label: 'All equal', make: ({ size }) => Array<number>(houses(size)).fill(4) },
      { id: 'huge', label: 'One huge house', make: () => [3, 2, 4, 40, 3, 1, 5], sized: false },
    ],
    size: { label: 'Houses', min: 2, max: MAX_HOUSES, default: 7 },
    custom: {
      label: `House values (0–99, 2 to ${MAX_HOUSES} houses)`,
      placeholder: 'e.g. 5, 9, 6, 1, 8, 7',
      parse: (text) => {
        const parsed = parseArrayInput(text, { min: 0, max: 99, maxSize: MAX_HOUSES });
        if ('error' in parsed) return parsed;
        if (parsed.values.length < 2) return { error: 'Enter at least two houses.' };
        return { value: parsed.values };
      },
      format: (values) => values.join(', '),
    },
  },
  pseudocode,
  stats: [CELLS, { key: 'decisions', label: 'Rob-or-skip choices' }],
  legend: [
    { neutral: 'House value (bar) or best total' },
    { mark: 'key', label: 'House being decided' },
    { mark: 'compare', label: 'Totals it compares' },
    { mark: 'path', label: 'Traceback (houses robbed)' },
  ],
  run,
  content: {
    idea: 'Walk down the street keeping the best total so far. At each house there are only two options: skip it and keep the best total up to the house before, or rob it and add its value to the best total two houses back, because its neighbour must be skipped. Take the larger.',
    invariant: 'dp[0] = 0, dp[1] = v[1] and dp[i] = max(dp[i−1], v[i] + dp[i−2]): each dp[i] is the best total from houses 1 to i, so dp[n] is the answer. Only the last two values are ever read.',
    whenToUse: 'Choosing non-adjacent items in a line for the largest total: shifts with rest days, non-conflicting neighbours, spaced-out picks. The same "take it and jump two, or skip it" shape is the core of weighted interval scheduling. O(n) time, and O(1) memory if you keep two numbers.',
    traits: [
      { label: 'O(n) time', good: true },
      { label: 'O(1) memory is possible', good: true },
      { label: 'Biggest-first greedy can fail', good: null },
    ],
    experiments: [
      { example: 'greedy-fails', prompt: 'Biggest-first grabs 9 and 8 for 17, but houses 1, 3 and 5 give 19. Watch dp[3]: 6 + 5 = 11 beats keeping the 9.' },
      { example: 'equal', prompt: 'With equal values, robbing every other house is best. Every second house is a tie, and the traceback skips it.' },
      { example: 'huge', prompt: 'House 4 is worth more than all the others together: once it is robbed, its neighbours are out, and the rest is built around it.' },
    ],
  },
});
