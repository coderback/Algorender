import { defineAlgorithm } from '@/engine/module';
import type { Frame } from '@/engine/types';
import { GridTracer } from '@/viz/grid/tracer';
import type { GridState } from '@/viz/grid/types';
import { bracket, byStart, intervalsCustom, intervalsOf, letter, randomIntervals, span, type Interval } from './shared';

const pseudocode = [
  'sort the intervals by start',
  'merged ← [the first interval]',
  'for each next interval x:',
  '  last ← the last merged interval',
  '  if x.start ≤ last.end:   (overlap)',
  '    last.end ← max(last.end, x.end)',
  '  else: add x to merged as a new one',
];

const MERGED = 'merged';
const LIST = 'result';
const OUTCOMES = ['It extends the last merged interval', 'It lies inside the last merged one', 'It starts a new merged interval'];
const EXTEND = 0;
const INSIDE = 1;
const NEW = 2;

type Group = { id: string; start: number; end: number };

function* run(xs: readonly Interval[]): Generator<Frame<GridState>> {
  const n = xs.length;
  const T = Math.max(1, ...xs.map((x) => x.end));
  const ids = xs.map((_, i) => `x${i}`);
  const t = new GridTracer(['checked', 'merged']);
  t.addTable({
    label: 'Intervals over time, and the merged result',
    look: 'timeline',
    rows: [...xs.map((x, i) => ({ id: ids[i], label: letter(i), sub: span(x) })), { id: MERGED, label: '∪', sub: 'merged' }],
    cols: Array.from({ length: T }, () => ({ label: '' })),
  });
  xs.forEach((x, i) => t.setBar(ids[i], ids[i], x.start, x.end));
  t.addList({ id: LIST, label: 'Merged intervals', empty: 'None yet' });

  yield t.frame({
    note: 'Merge every group of overlapping intervals into one; intervals that only touch, like [1, 4] and [4, 5], count as overlapping here and merge too.',
    vars: { n },
  });

  const order = byStart(xs);
  t.reorderRows([...order.map((i) => ids[i]), MERGED]);
  yield t.frame({
    line: 0,
    note: 'Sort by start: then an interval can only overlap the merged interval just before it, so one look back per interval is enough.',
    vars: { n },
  });

  const groups: Group[] = [];
  const open = (i: number) => {
    const g = { id: `g${groups.length}`, start: xs[i].start, end: xs[i].end };
    groups.push(g);
    t.setBar(g.id, MERGED, g.start, g.end);
    t.mark({ bar: g.id }, 'path');
    t.addItem(LIST, { id: g.id, text: bracket(g), mark: 'path' });
  };

  const first = order[0];
  open(first);
  yield t.frame({
    line: 1,
    note: `${letter(first)} ${bracket(xs[first])} starts first, so it opens the first merged interval.`,
    marks: { key: [{ bar: ids[first] }, { row: 0 }] },
    vars: { x: letter(first), last: bracket(xs[first]) },
  });

  for (let k = 1; k < n; k++) {
    const i = order[k];
    const { start: s, end: e } = xs[i];
    const name = letter(i);
    const last = groups[groups.length - 1];
    const { start: ls, end: le } = last;
    const outcome = s > le ? NEW : e > le ? EXTEND : INSIDE;
    const current = [{ bar: ids[i] }, { row: k }];
    const lastMarks = [{ bar: last.id }, { item: last.id, list: LIST }];
    t.count('checked');
    yield t.frame({
      line: 4,
      note: `Next by start is ${name} ${bracket(xs[i])}; compare it with the last merged interval, [${ls}, ${le}]${
        groups.length > 1 ? `, since the earlier merged ones all end before that one begins` : ''
      }.`,
      marks: { key: current, compare: lastMarks },
      guides: [{ at: le, label: `ends ${le}`, mark: 'compare' }],
      vars: { x: name, 'x.start': s, 'x.end': e, 'last.end': le },
      checkpoint: { question: `What happens to ${name}?`, choices: OUTCOMES, answer: outcome },
    });

    if (outcome === NEW) {
      open(i);
      yield t.frame({
        line: 6,
        note: `${s} > ${le}: ${name} starts after [${ls}, ${le}] ends, and every later interval starts later still, so [${ls}, ${le}] is final and ${name} begins a new merged interval.`,
        marks: { key: current },
        vars: { x: name, last: bracket(xs[i]) },
      });
      continue;
    }

    t.count('merged');
    if (outcome === EXTEND) {
      last.end = e;
      t.setBar(last.id, MERGED, ls, e);
      t.setItemText(LIST, last.id, bracket(last));
    }
    yield t.frame({
      line: 5,
      note:
        outcome === EXTEND
          ? `${s} ≤ ${le}, so ${name} overlaps${s === le ? ` (they touch at ${s}, which counts)` : ''}: the merged interval grows to [${ls}, max(${le}, ${e})] = [${ls}, ${e}].`
          : `${s} ≤ ${le}, so ${name} overlaps, but it also ends by ${le}: it lies inside [${ls}, ${le}], and max(${le}, ${e}) leaves the end where it was.`,
      marks: { key: current, compare: lastMarks },
      guides: [{ at: last.end, label: `ends ${last.end}`, mark: 'compare' }],
      vars: { x: name, last: bracket(last) },
    });
  }

  yield t.frame({
    note: `${n} interval${n === 1 ? '' : 's'} became ${groups.length}: ${groups.map(bracket).join(', ')}; no two of them overlap or touch, and together they cover exactly the times the input covers.`,
    vars: { merged: groups.length },
  });
}

export const mergeIntervals = defineAlgorithm<Interval[], GridState>({
  kind: 'algorithm',
  slug: 'merge-intervals',
  view: 'grid',
  input: {
    examples: [
      { id: 'textbook', label: 'Textbook', make: () => intervalsOf([[1, 3], [2, 6], [8, 10], [15, 18]]) },
      { id: 'touching', label: 'Touching endpoints', make: () => intervalsOf([[4, 5], [1, 4], [9, 12], [6, 7], [7, 9]]) },
      { id: 'nested', label: 'All nested', make: () => intervalsOf([[3, 6], [1, 12], [9, 11], [2, 4], [5, 8]]) },
      { id: 'random', label: 'Random', make: ({ seed }) => randomIntervals(seed, 7, 17, 5) },
    ],
    custom: intervalsCustom('Intervals', 'e.g. 1-3, 2-6, 8-10, 15-18'),
  },
  pseudocode,
  stats: [
    { key: 'checked', label: 'Overlap checks' },
    { key: 'merged', label: 'Intervals merged in' },
  ],
  legend: [
    { neutral: 'Input interval' },
    { mark: 'key', label: 'Interval being checked' },
    { mark: 'compare', label: 'Last merged interval and its end' },
    { mark: 'path', label: 'Merged intervals' },
  ],
  run,
  content: {
    idea: 'Sort the intervals by start, then sweep once: each interval either overlaps the last merged interval (stretch its end) or starts after it ends (begin a new one). Sorting is what makes one look back enough.',
    invariant: 'After each step the merged list is sorted, its intervals neither overlap nor touch, and together they cover exactly the intervals seen so far. The next interval starts no earlier than any of them, so only the last merged one can overlap it.',
    whenToUse: 'Combining overlapping ranges: busy times in calendars, genome regions, IP ranges, time windows in logs. O(n log n) for the sort, then one linear sweep; it is also the first step of "insert an interval" and "find the free time" problems.',
    traits: [
      { label: 'O(n log n), dominated by the sort', good: true },
      { label: 'One pass after sorting', good: true },
      { label: 'Touching counts as overlapping (a choice)', good: null },
    ],
    experiments: [
      { example: 'textbook', prompt: '[1, 3] and [2, 6] overlap and merge into [1, 6]; [8, 10] and [15, 18] overlap nothing and stay as they are.' },
      { example: 'touching', prompt: '[1, 4] and [4, 5] share only the point 4 and still merge. [6, 7] starts at 6, after [1, 5] has ended, so it starts a new interval.' },
      { example: 'nested', prompt: 'Every interval lies inside [1, 12], so the end never moves: that is why the update takes max(last.end, x.end) rather than x.end.' },
    ],
  },
});
