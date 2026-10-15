import { defineAlgorithm } from '@/engine/module';
import { createRng } from '@/engine/random';
import type { Frame } from '@/engine/types';
import { GridTracer, type CellRef } from '@/viz/grid/tracer';
import type { GridState } from '@/viz/grid/types';
import { itemName, knapsackCustom, randomItems, type KnapsackInput } from './knapsack-input';
import { CELLS, numberChoices } from './shared';

const pseudocode = [
  'K[0,c] ← 0;  K[i,0] ← 0',
  'for i from 1 to n:',
  '  for c from 1 to W:',
  '    skip ← K[i−1,c]',
  '    if w[i] > c: K[i,c] ← skip',
  '    else: take ← v[i] + K[i−1,c−w[i]]',
  '          K[i,c] ← max(skip, take)',
  '',
  'trace back from K[n,W]:',
  '  if K[i,c] = K[i−1,c]: i was skipped',
  '  else: i was taken;  c ← c − w[i]',
];

const LIST = 'taken';

function* run({ items, capacity: W }: KnapsackInput): Generator<Frame<GridState>> {
  const n = items.length;
  const t = new GridTracer(['cells', 'decisions']);
  t.addTable({
    label: 'K[i,c]: best value from the first i items with capacity c',
    corner: 'item╲c',
    rows: [{ label: '–', sub: 'none' }, ...items.map((it, i) => ({ label: itemName(i), sub: `w${it.w} v${it.v}` }))],
    cols: Array.from({ length: W + 1 }, (_, c) => ({ label: String(c) })),
  });
  t.addList({ id: LIST, label: 'Items in the knapsack', empty: 'Found during the traceback' });
  const K = (i: number, c: number) => t.num([i, c]);

  yield t.frame({
    note: `K[i,c] will hold the best total value using only the first i items with capacity c. Every item is either skipped or taken whole, never split.`,
    vars: { n, W },
  });

  for (let c = 0; c <= W; c++) t.set([0, c], 0);
  for (let i = 1; i <= n; i++) t.set([i, 0], 0);
  yield t.frame({ line: 0, note: 'With no items, or no capacity, nothing can be packed: row 0 and column 0 are 0.', vars: { n, W } });

  for (let i = 1; i <= n; i++) {
    const { w, v } = items[i - 1];
    const name = itemName(i - 1);

    // Capacities below w[i] can't hold the item: one event, copying that run from the row above.
    const tooSmall = Math.min(w - 1, W);
    if (tooSmall >= 1) {
      const run = Array.from({ length: tooSmall }, (_, k) => k + 1);
      for (const c of run) t.set([i, c], K(i - 1, c));
      t.count('cells', tooSmall);
      yield t.frame({
        line: 4,
        note:
          tooSmall === 1
            ? `${name} weighs ${w}, more than capacity 1, so it cannot fit there: copy K[${i - 1},1] from above.`
            : `${name} weighs ${w}, more than capacities 1–${tooSmall}, so it cannot fit in any of them: copy those cells from the row above.`,
        marks: { key: run.map((c) => [i, c] as const), compare: [...run.map((c) => [i - 1, c] as const), { row: i }] },
        arrows: run.map((c) => ({ from: [i - 1, c] as const, to: [i, c] as const, mark: 'compare' as const })),
        vars: { i, item: name, 'w[i]': w, 'v[i]': v },
      });
    }

    for (let c = w; c <= W; c++) {
      const here: CellRef = [i, c];
      const skip = K(i - 1, c);
      const vars = { i, c, item: name, 'w[i]': w, 'v[i]': v, skip };
      const rest = K(i - 1, c - w);
      const take = v + rest;
      const best = Math.max(skip, take);
      const deps: CellRef[] = [[i - 1, c], [i - 1, c - w]];
      yield t.frame({
        line: 5,
        note: `${name} (weight ${w}, value ${v}) fits in capacity ${c}. Skip it: K[${i - 1},${c}] = ${skip}. Take it: ${v} + K[${i - 1},${c - w}] = ${v} + ${rest}.`,
        marks: { key: [here], compare: [...deps, { row: i }, { col: c }] },
        arrows: deps.map((d) => ({ from: d, to: here, mark: 'compare' as const })),
        vars: { ...vars, take },
        checkpoint: { question: `What goes in K[${i},${c}]?`, ...numberChoices(best, [Math.min(skip, take), rest, best + 1]) },
      });

      t.set(here, best);
      t.count('cells');
      t.count('decisions');
      const from: CellRef = take > skip ? [i - 1, c - w] : [i - 1, c];
      yield t.frame({
        line: 6,
        note:
          take > skip
            ? `Taking ${name} wins: ${v} + ${rest} = ${take} beats ${skip}, so K[${i},${c}] = ${take}.`
            : `Skipping ${name} is at least as good: ${skip} ≥ ${v} + ${rest} = ${take}, so K[${i},${c}] = ${skip}.`,
        marks: { key: [here], compare: [from, { row: i }, { col: c }] },
        arrows: [{ from, to: here, mark: 'compare' }],
        vars: { ...vars, take, [`K[${i},${c}]`]: best },
      });
    }
  }

  // Traceback: an item was taken exactly when its row improved on the row above.
  let c = W;
  const chosen: number[] = [];
  const ask = (i: number) =>
    i > 0 ? { question: `Was ${itemName(i - 1)} taken?`, choices: ['Yes', 'No'], answer: K(i, c) !== K(i - 1, c) ? 0 : 1 } : undefined;
  t.mark([n, W], 'path');
  yield t.frame({
    line: 8,
    note: `K[${n},${W}] = ${K(n, W)} is the best value for capacity ${W}. Walk back up the table to see which items achieve it.`,
    vars: { i: n, c },
    checkpoint: ask(n),
  });

  for (let i = n; i >= 1; i--) {
    const { w, v } = items[i - 1];
    const name = itemName(i - 1);
    const here = K(i, c);
    const above = K(i - 1, c);
    let note: string;
    if (here === above) {
      t.addArrow({ from: [i, c], to: [i - 1, c], mark: 'path' });
      t.mark([i - 1, c], 'path');
      note = `K[${i},${c}] = K[${i - 1},${c}] = ${here}: the best value here does not need ${name}, so step straight up.`;
    } else {
      t.addArrow({ from: [i, c], to: [i - 1, c - w], mark: 'path' });
      t.mark([i - 1, c - w], 'path');
      t.mark({ row: i }, 'path');
      t.addItem(LIST, { id: name, text: `${name} (w${w}, v${v})`, mark: 'path' }, 'start');
      chosen.push(i - 1);
      note = `K[${i},${c}] = ${here} beats ${above} above, so ${name} was taken: its value ${v} plus the best for the remaining capacity ${c - w}.`;
      c -= w;
    }
    yield t.frame({ line: here === above ? 9 : 10, note, vars: { i: i - 1, c }, checkpoint: ask(i - 1) });
  }

  const weight = chosen.reduce((s, k) => s + items[k].w, 0);
  yield t.frame({
    note:
      chosen.length === 0
        ? 'No item fits, so the best value is 0.'
        : `Take ${chosen
            .reverse()
            .map(itemName)
            .join(', ')}: weight ${weight} of ${W}, value ${K(n, W)}. No other subset that fits is worth more.`,
    vars: { value: K(n, W), weight },
  });
}

export const knapsack01 = defineAlgorithm<KnapsackInput, GridState>({
  kind: 'algorithm',
  slug: 'knapsack-01',
  view: 'grid',
  input: {
    examples: [
      {
        id: 'shop',
        label: 'Small shop',
        make: () => ({ items: [{ w: 1, v: 1 }, { w: 3, v: 4 }, { w: 4, v: 5 }, { w: 5, v: 7 }], capacity: 7 }),
      },
      {
        id: 'greedy-fails',
        label: 'Greedy-by-value fails',
        make: () => ({ items: [{ w: 6, v: 10 }, { w: 5, v: 7 }, { w: 5, v: 7 }], capacity: 10 }),
      },
      {
        id: 'all-fit',
        label: 'Everything fits',
        make: () => ({ items: [{ w: 2, v: 3 }, { w: 3, v: 4 }, { w: 1, v: 2 }], capacity: 6 }),
      },
      {
        id: 'random',
        label: 'Random items',
        make: ({ seed }) => ({ items: randomItems(seed, 4, 6, 15), capacity: 6 + Math.floor(createRng(seed + 99)() * 5) }),
      },
    ],
    custom: knapsackCustom({ maxItems: 6, maxWeight: 15, maxValue: 99, maxCapacity: 15 }),
  },
  pseudocode,
  stats: [CELLS, { key: 'decisions', label: 'Take-or-skip choices' }],
  legend: [
    { neutral: 'Computed' },
    { mark: 'key', label: 'Cell being filled' },
    { mark: 'compare', label: 'Cells and item it uses' },
    { mark: 'path', label: 'Traceback (items taken)' },
  ],
  run,
  content: {
    idea: 'Build a table of best values: K[i,c] uses only the first i items and capacity c. Each new item is either skipped (keep the value above) or taken (its value plus the best for the capacity left over). The answer sits in the bottom-right corner, and a walk back up the table names the items.',
    invariant: 'K[i,c] = K[i−1,c] if w[i] > c, else max(K[i−1,c], v[i] + K[i−1,c−w[i]]). Row i−1 is complete before row i starts, so both options are already known when K[i,c] is filled.',
    whenToUse: 'Choosing a subset under a budget when items cannot be split: cargo loading, budget allocation, picking projects. O(nW) is pseudo-polynomial: fine for small whole-number capacities, impractical when W is huge.',
    traits: [
      { label: 'Optimal substructure', good: true },
      { label: 'Greedy shortcuts can fail', good: null },
      { label: 'Pseudo-polynomial O(nW)', good: false },
    ],
    experiments: [
      { example: 'greedy-fails', prompt: 'Grabbing the most valuable item first (A) leaves no room for anything else. The table finds that B + C is worth more.' },
      { example: 'all-fit', prompt: 'The capacity covers every item, so the bottom-right corner is simply the total value and the traceback takes everything.' },
      { example: 'shop', prompt: 'Watch row C: from capacity 4 on, taking C starts to pay off, and the best answer for 7 combines B and C.' },
    ],
  },
});
