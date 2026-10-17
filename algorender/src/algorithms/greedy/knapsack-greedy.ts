import { itemName, knapsackCustom, randomItems, type KnapsackInput } from '@/algorithms/dp/knapsack-input';
import { defineAlgorithm } from '@/engine/module';
import type { Frame } from '@/engine/types';
import { formatAmount } from '@/viz/grid/describe';
import { GridTracer } from '@/viz/grid/tracer';
import type { GridState } from '@/viz/grid/types';

const pseudocode = [
  'ratio[i] ← v[i] / w[i] for every item',
  'sort items by ratio, highest first',
  'for each item while room > 0:',
  '  if w ≤ room:',
  '    take all of it;  room ← room − w',
  '  else:',
  '    take room / w of it;  room ← 0',
];

const BAG = 'bag';
const W_COL = 0;
const V_COL = 1;
const RATIO_COL = 2;
const TAKE_COL = 3;
const CHOICES = ['All of it', 'Only part of it'];

function* run({ items, capacity }: KnapsackInput): Generator<Frame<GridState>> {
  const n = items.length;
  const ids = items.map((_, i) => `item${i}`);
  const ratio = items.map((it) => it.v / it.w);
  const t = new GridTracer(['considered', 'taken']);
  t.addMeter({ id: BAG, label: 'Knapsack', total: capacity, unit: 'kg' });
  t.addTable({
    label: 'Items: weight, value, value per kg, amount taken',
    corner: 'item',
    rows: items.map((_, i) => ({ id: ids[i], label: itemName(i) })),
    cols: [{ label: 'w' }, { label: 'v' }, { label: 'v/w' }, { label: 'take' }],
  });
  items.forEach((it, i) => {
    t.set([i, W_COL], it.w);
    t.set([i, V_COL], it.v);
  });

  yield t.frame({
    note: `Pack a knapsack that holds ${capacity} kg with as much value as possible. These items can be cut, so you may take part of one.`,
    vars: { capacity },
  });

  items.forEach((_, i) => t.set([i, RATIO_COL], formatAmount(ratio[i])));
  yield t.frame({
    line: 0,
    note: 'Work out each item’s value per kg: that is what every kilo of it is worth, whatever its size.',
    marks: { write: items.map((_, i) => [i, RATIO_COL] as const) },
  });

  const order = items.map((_, i) => i).sort((x, y) => ratio[y] - ratio[x] || x - y);
  t.reorderRows(order.map((i) => ids[i]));
  yield t.frame({
    line: 1,
    note: 'Sort by value per kg, best first. Each kilo of room is best spent on the highest-ratio item still available.',
    marks: { compare: order.map((_, k) => [k, RATIO_COL] as const) },
  });

  let room = capacity;
  let value = 0;
  for (let k = 0; k < n; k++) {
    const i = order[k];
    const { w, v } = items[i];
    if (room <= 0) {
      for (let rest = k; rest < n; rest++) {
        t.set([rest, TAKE_COL], 'none');
        t.mark([rest, TAKE_COL], 'reject');
        t.mark({ row: rest }, 'reject');
      }
      yield t.frame({
        line: 2,
        note: `The knapsack is full, so ${n - k === 1 ? `${itemName(i)} stays` : 'the remaining items stay'} out. Each is worth less per kg than everything already packed.`,
        vars: { room, value: formatAmount(value) },
      });
      break;
    }

    t.count('considered');
    const vars = { item: itemName(i), w, v, 'v/w': formatAmount(ratio[i]), room };
    yield t.frame({
      line: 3,
      note: `Next best value per kg: ${itemName(i)}, ${w} kg worth ${v} (${formatAmount(ratio[i])} per kg). ${formatAmount(room)} kg of room is left.`,
      marks: { key: [{ row: k }, [k, RATIO_COL]] },
      vars,
      checkpoint: { question: `How much of ${itemName(i)} goes in?`, choices: CHOICES, answer: w <= room ? 0 : 1 },
    });

    t.count('taken');
    t.mark({ row: k }, 'path');
    t.mark([k, TAKE_COL], 'path');
    if (w <= room) {
      room -= w;
      value += v;
      t.set([k, TAKE_COL], 'all');
      t.addSegment(BAG, { id: ids[i], label: itemName(i), amount: w, mark: 'path' });
      yield t.frame({
        line: 4,
        note: `${w} kg fits, so take all of ${itemName(i)} for ${v}. ${formatAmount(room)} kg of room is left.`,
        vars: { ...vars, room, value: formatAmount(value) },
      });
    } else {
      const fraction = room / w;
      const gained = v * fraction;
      const pct = `${Math.round(fraction * 100)}%`;
      value += gained;
      t.set([k, TAKE_COL], pct);
      t.addSegment(BAG, { id: ids[i], label: `${itemName(i)} ${pct}`, amount: room, mark: 'path' });
      yield t.frame({
        line: 6,
        note: `${itemName(i)} weighs ${w} kg but only ${formatAmount(room)} kg is left: take ${formatAmount(room)}/${w} of it (${pct}), worth ${formatAmount(gained)}. The knapsack is now full.`,
        vars: { ...vars, room: 0, value: formatAmount(value) },
      });
      room = 0;
    }
  }

  yield t.frame({
    note:
      room > 0
        ? `Everything fits with ${formatAmount(room)} kg to spare, so the best value is simply the total, ${formatAmount(value)}.`
        : `Total value ${formatAmount(value)}. Every packed kilo is worth at least as much as any kilo left out, so no other packing does better.`,
    vars: { value: formatAmount(value) },
  });
}

export const knapsackGreedy = defineAlgorithm<KnapsackInput, GridState>({
  kind: 'algorithm',
  slug: 'knapsack-greedy',
  view: 'grid',
  input: {
    examples: [
      { id: 'textbook', label: 'Textbook (50 kg)', make: () => ({ items: [{ w: 10, v: 60 }, { w: 20, v: 100 }, { w: 30, v: 120 }], capacity: 50 }) },
      {
        id: 'value-trap',
        label: 'Most valuable item is a trap',
        make: () => ({ items: [{ w: 50, v: 100 }, ...Array.from({ length: 5 }, () => ({ w: 10, v: 40 }))], capacity: 50 }),
      },
      { id: 'all-fit', label: 'Everything fits', make: () => ({ items: [{ w: 5, v: 30 }, { w: 10, v: 20 }, { w: 3, v: 15 }], capacity: 30 }) },
      { id: 'random', label: 'Random items', make: ({ seed }) => ({ items: randomItems(seed, 5, 20, 60), capacity: 30 }) },
    ],
    custom: knapsackCustom({ maxItems: 8, maxWeight: 100, maxValue: 999, maxCapacity: 100 }),
  },
  pseudocode,
  stats: [
    { key: 'considered', label: 'Items considered' },
    { key: 'taken', label: 'Items packed' },
  ],
  legend: [
    { neutral: 'Waiting' },
    { mark: 'write', label: 'Just worked out' },
    { mark: 'compare', label: 'Sort key (value per kg)' },
    { mark: 'key', label: 'Item being considered' },
    { mark: 'path', label: 'Packed (all or part)' },
    { mark: 'reject', label: 'Left out (knapsack full)' },
  ],
  run,
  content: {
    idea: 'When items can be cut (grain, fabric, time), sort them by value per kg and pour the best in first. Only the last item ever needs cutting, to fill the leftover space exactly.',
    invariant: 'Items are packed in falling value-per-kg order, so every kilo in the knapsack is worth at least as much as any kilo left out; swapping one for the other can never raise the total.',
    whenToUse: 'Dividing a capacity among divisible goods: loading bulk cargo, splitting a budget across divisible investments, preemptive scheduling. For whole items (0/1 knapsack) this greedy can be badly wrong; use dynamic programming instead.',
    traits: [
      { label: 'Greedy choice is optimal when items can be split', good: true },
      { label: 'O(n log n), dominated by the sort', good: true },
      { label: 'Wrong for whole items (0/1 knapsack)', good: false },
    ],
    experiments: [
      { example: 'value-trap', prompt: 'A is the most valuable item but worth only 2 per kg. Ratio order leaves it out and doubles the value.' },
      { example: 'textbook', prompt: 'The last item does not fit whole, so two thirds of it go in. Cutting is what makes the greedy answer optimal here.' },
      { example: 'all-fit', prompt: 'When everything fits, the order makes no difference and nothing is cut.' },
    ],
  },
});
