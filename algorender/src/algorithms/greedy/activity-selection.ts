import type { InputSpec } from '@/engine/module';
import { defineAlgorithm } from '@/engine/module';
import { createRng } from '@/engine/random';
import type { Frame } from '@/engine/types';
import { GridTracer } from '@/viz/grid/tracer';
import type { GridState } from '@/viz/grid/types';

export type Activity = { start: number; finish: number };

const MAX_ACTIVITIES = 12;
const MAX_TIME = 24;

const pseudocode = [
  'sort activities by finish time',
  'last ← −∞   (end of the last choice)',
  'for each activity a in that order:',
  '  if a.start ≥ last:',
  '    choose a;  last ← a.finish',
  '  else: skip a (it overlaps)',
];

const LIST = 'chosen';
const CHOICES = ['Yes: it starts once the last choice has ended', 'No: it overlaps the last choice'];
const name = (i: number) => String.fromCharCode(65 + i);

function* run(acts: readonly Activity[]): Generator<Frame<GridState>> {
  const n = acts.length;
  const T = Math.max(1, ...acts.map((a) => a.finish));
  const ids = acts.map((_, i) => `a${i}`);
  const t = new GridTracer(['checked', 'chosen']);
  t.addTable({
    label: 'Activities over time',
    look: 'timeline',
    rows: acts.map((a, i) => ({ id: ids[i], label: name(i), sub: `${a.start}–${a.finish}` })),
    cols: Array.from({ length: T }, () => ({ label: '' })),
  });
  acts.forEach((a, i) => t.setBar(ids[i], ids[i], a.start, a.finish));
  t.addList({ id: LIST, label: 'Chosen activities', empty: 'None yet' });

  yield t.frame({
    note: `Fit as many of these ${n} activities as possible into one room, with no two overlapping. An activity that ends at time t leaves the room free for one that starts at t.`,
  });

  const order = acts.map((_, i) => i).sort((x, y) => acts[x].finish - acts[y].finish || x - y);
  t.reorderRows(order.map((i) => ids[i]));
  yield t.frame({
    line: 0,
    note: 'Sort by finish time. Whatever else you pick, the activity that ends first leaves the most room for everything after it.',
  });

  let last = -Infinity;
  const chosen: string[] = [];
  for (let k = 0; k < order.length; k++) {
    const i = order[k];
    const { start, finish } = acts[i];
    const bar = { bar: ids[i] };
    const fits = start >= last;
    const guides = last > -Infinity ? [{ at: last, label: `free from ${last}`, mark: 'compare' as const }] : [];
    const vars = { activity: name(i), start, finish, last: last > -Infinity ? last : '−∞' };
    t.count('checked');
    yield t.frame({
      line: 3,
      note:
        k === 0
          ? `${name(i)} (${start}–${finish}) finishes first. Nothing is chosen yet, so it cannot clash with anything.`
          : `Next to finish: ${name(i)}, from ${start} to ${finish}. The last chosen activity ends at ${last}.`,
      marks: { key: [bar, { row: k }] },
      guides,
      vars,
      ...(k > 0 && { checkpoint: { question: `Choose ${name(i)}?`, choices: CHOICES, answer: fits ? 0 : 1 } }),
    });

    if (fits) {
      const before = last;
      last = finish;
      chosen.push(name(i));
      t.count('chosen');
      t.mark(bar, 'path');
      t.mark({ row: k }, 'path');
      t.addItem(LIST, { id: ids[i], text: `${name(i)} ${start}–${finish}`, mark: 'path' });
      yield t.frame({
        line: 4,
        note:
          before === -Infinity
            ? `Choose ${name(i)}. The room is now busy until ${finish}.`
            : `${start} ≥ ${before}: ${name(i)} starts no earlier than the last choice ends. Choose it; the room is now busy until ${finish}.`,
        guides: [{ at: last, label: `free from ${last}`, mark: 'compare' }],
        vars: { ...vars, last },
      });
    } else {
      t.mark(bar, 'reject');
      t.mark({ row: k }, 'reject');
      yield t.frame({
        line: 5,
        note: `${start} < ${last}: ${name(i)} would start before the last choice ends, so skip it.`,
        guides,
        vars,
      });
    }
  }

  yield t.frame({
    note: `Chose ${chosen.length} of ${n}: ${chosen.join(', ')}. Taking the earliest finisher never hurts, because any best schedule can swap its first activity for it without causing an overlap.`,
    guides: last > -Infinity ? [{ at: last, label: `free from ${last}`, mark: 'compare' }] : [],
    vars: { chosen: chosen.length },
  });
}

const custom: NonNullable<InputSpec<Activity[]>['custom']> = {
  label: `Activities as start-finish (up to ${MAX_ACTIVITIES}, times 0–${MAX_TIME})`,
  placeholder: 'e.g. 1-4, 3-5, 0-6, 5-7',
  parse: (text) => {
    const parts = text.split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length === 0) return { error: 'Enter at least one activity, e.g. 1-4.' };
    if (parts.length > MAX_ACTIVITIES) return { error: `Use at most ${MAX_ACTIVITIES} activities.` };
    const acts: Activity[] = [];
    for (const part of parts) {
      const m = /^(\d+)\s*[-–]\s*(\d+)$/.exec(part);
      if (!m) return { error: `"${part}" is not start-finish, e.g. 3-5.` };
      const start = Number(m[1]);
      const finish = Number(m[2]);
      if (finish > MAX_TIME) return { error: `Times must be from 0 to ${MAX_TIME}.` };
      if (start >= finish) return { error: `"${part}" must start before it finishes.` };
      acts.push({ start, finish });
    }
    return { value: acts };
  },
  format: (acts) => acts.map((a) => `${a.start}-${a.finish}`).join(', '),
};

function randomActivities(seed: number): Activity[] {
  const rng = createRng(seed);
  return Array.from({ length: 8 }, () => {
    const start = Math.floor(rng() * 13);
    return { start, finish: start + 1 + Math.floor(rng() * 5) };
  });
}

const acts = (pairs: [number, number][]) => pairs.map(([start, finish]) => ({ start, finish }));

export const activitySelection = defineAlgorithm<Activity[], GridState>({
  kind: 'algorithm',
  slug: 'activity-selection',
  view: 'grid',
  input: {
    examples: [
      {
        id: 'textbook',
        label: 'Textbook (11 activities)',
        make: () => acts([[1, 4], [3, 5], [0, 6], [5, 7], [3, 9], [5, 9], [6, 10], [8, 11], [8, 12], [2, 14], [12, 16]]),
      },
      { id: 'longest-trap', label: 'Longest activity is a trap', make: () => acts([[0, 10], [1, 3], [3, 5], [5, 7], [7, 9]]) },
      { id: 'shortest-trap', label: 'Shortest activity is a trap', make: () => acts([[0, 5], [4, 7], [6, 11]]) },
      { id: 'random', label: 'Random', make: ({ seed }) => randomActivities(seed) },
    ],
    custom,
  },
  pseudocode,
  stats: [
    { key: 'checked', label: 'Activities checked' },
    { key: 'chosen', label: 'Chosen' },
  ],
  legend: [
    { neutral: 'Not checked yet' },
    { mark: 'key', label: 'Being checked' },
    { mark: 'path', label: 'Chosen' },
    { mark: 'reject', label: 'Skipped (overlaps)' },
    { mark: 'compare', label: 'End of the last choice' },
  ],
  run,
  content: {
    idea: 'To fit the most activities into one room, sort them by finish time and walk down the list, taking each activity that starts no earlier than the last one you took ends. One sort and one pass.',
    invariant: 'The choices so far can always be extended to a best schedule: a best schedule’s earliest-finishing activity can be swapped for the greedy choice without creating an overlap (the exchange argument), so taking it never loses.',
    whenToUse: 'Interval scheduling where every activity is worth the same: booking one room, one machine, one CPU. If activities have different values (weighted interval scheduling), the greedy choice can fail and you need dynamic programming.',
    traits: [
      { label: 'Greedy choice is provably optimal', good: true },
      { label: 'O(n log n), dominated by the sort', good: true },
      { label: 'Fails if activities have different values', good: false },
    ],
    experiments: [
      { example: 'longest-trap', prompt: 'A starts first and runs longest. Sorting by finish time sends it to the bottom, and four short activities fit instead.' },
      { example: 'shortest-trap', prompt: 'B is the shortest, but it overlaps both others. What matters is finishing early, not being short.' },
      { example: 'textbook', prompt: 'Four of eleven are chosen. Check that every skipped activity overlaps the choice just before it.' },
    ],
  },
});
