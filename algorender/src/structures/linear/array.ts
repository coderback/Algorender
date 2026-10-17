import { defineStructure, type Args } from '@/engine/module';
import { createRng } from '@/engine/random';
import type { Frame } from '@/engine/types';
import { LinearTracer, MAIN, slotsSnapshot, type Item } from '@/viz/linear/tracer';
import type { LinearState } from '@/viz/linear/types';
import { TOUCHED, VALUE_ARG, YES_NO, indexArg, indexPastEnd, intArg, numberChoices, plural } from './shared';

/** A growable array: `items` fill slots 0…length − 1 of a block of `capacity` cells. */
export type DynamicArray = {
  items: readonly Item[];
  capacity: number;
  nextId: number;
  /** The amortised-cost ledger: elements ever added, and elements ever copied while growing. */
  added: number;
  copied: number;
};

/** The demo stops growing here so the array still fits on a phone. */
export const ARRAY_MAX = 16;
const GROWN = 'grown';
const IN = { holder: 'in' } as const;
const OUT = { holder: 'out' } as const;

type Gen = Generator<Frame<LinearState>, DynamicArray>;

const summaryOf = (length: number, capacity: number) => `length ${length} · capacity ${capacity}`;
const rowLabel = (capacity: number) => `Array · ${capacity} cells`;

function tracerFor(m: DynamicArray, labels: { in?: string; out?: string } = {}) {
  const slots = Array.from({ length: m.capacity }, (_, i) => m.items[i] ?? null);
  const t = new LinearTracer('array', {
    rows: [{ id: MAIN, label: rowLabel(m.capacity), slots }],
    holders: [
      { id: 'in', label: labels.in ?? 'new value' },
      { id: 'out', label: labels.out ?? 'removed' },
    ],
    stats: ['touched', 'shifts', 'copies', 'resizes'],
  });
  t.setSummary(summaryOf(m.items.length, m.capacity));
  return t;
}

// An index past the end is blocked by disabledReason (see indexPastEnd), so
// the explorer never runs one; the early returns below only keep a direct call
// from writing outside the elements in use.

/**
 * Moves every element into a block twice the size, one copy per frame.
 * Returns the new capacity.
 */
function* grow(t: LinearTracer, m: DynamicArray, lines: { full: number; alloc: number; copy: number; swap: number }) {
  const n = m.items.length;
  const capacity = m.capacity * 2;
  yield t.frame({
    line: lines.full,
    note: `The array is full (length ${n} = capacity ${m.capacity}): there is no spare cell, so it must grow first.`,
    vars: { length: n, capacity: m.capacity },
  });
  t.addRow(GROWN, `New block · ${capacity} cells`, capacity);
  t.count('resizes');
  yield t.frame({
    line: lines.alloc,
    note: `Allocate a new block of ${capacity} cells. The memory just after the old block may belong to something else, so an array grows by moving, not by stretching.`,
    vars: { length: n, capacity: m.capacity, newCapacity: capacity },
  });
  for (let k = 0; k < n; k++) {
    const v = t.value(k);
    t.move(k, [GROWN, k]);
    t.setStale(k, v);
    t.count('copies');
    t.count('touched');
    yield t.frame({
      line: lines.copy,
      note: `Copy ${v} from index ${k} into the new block.`,
      marks: { write: [[GROWN, k]] },
      vars: { k, length: n, newCapacity: capacity },
    });
  }
  t.replaceRow(MAIN, GROWN);
  t.setRowLabel(MAIN, rowLabel(capacity));
  t.setSummary(summaryOf(n, capacity));
  yield t.frame({
    line: lines.swap,
    note: `Switch to the new block and free the old one. Copying ${plural(n, 'element')} cost O(n), but it makes room for ${m.capacity} more before the next copy, so the cost averages out.`,
    vars: { length: n, capacity },
  });
  return capacity;
}

// ───────────────────────────── get / set ─────────────────────────────

const getCode = ['get(i):', '  if i ≥ length: error "out of range"', '  address ← base + i × cellSize', '  return A[i]'];

function* get(m: DynamicArray, args: Args): Gen {
  const i = intArg(args, 'index');
  const n = m.items.length;
  const t = tracerFor(m);
  if (!(i >= 0 && i < n)) return m;
  yield t.frame({
    line: 0,
    note: `Read the element at index ${i}.`,
    pointers: { i },
    vars: { i, length: n },
    checkpoint: { question: `How many cells must be read to get A[${i}]?`, ...numberChoices(1, [i + 1, n, n + 1]) },
  });
  t.count('touched');
  yield t.frame({
    line: 2,
    note: `The cell's address is computed directly, base + ${i} × cellSize, because the cells are contiguous and equally sized. No other cell is read, so get is O(1) at any index.`,
    marks: { compare: [i] },
    pointers: { i },
    vars: { i, length: n },
  });
  const v = t.value(i);
  yield t.frame({ line: 3, note: `A[${i}] is ${v}.`, marks: { found: [i] }, pointers: { i }, vars: { i, result: v } });
  return m;
}

const setCode = ['set(i, x):', '  if i ≥ length: error "out of range"', '  A[i] ← x'];

function* set(m: DynamicArray, args: Args): Gen {
  const i = intArg(args, 'index');
  const x = intArg(args, 'value');
  const n = m.items.length;
  const t = tracerFor(m, { in: 'new value', out: 'overwritten' });
  if (!(i >= 0 && i < n)) return m;
  const item = { id: `n${m.nextId}`, value: x };
  t.place(item, IN);
  yield t.frame({
    line: 0,
    note: `Overwrite A[${i}] with ${x}. Like get, set finds the cell from its address, base + ${i} × cellSize.`,
    marks: { key: [IN] },
    pointers: { i },
    vars: { i, x },
  });
  const old = t.value(i);
  t.move(i, OUT);
  t.move(IN, i);
  t.count('touched');
  yield t.frame({
    line: 2,
    note: `A[${i}] ← ${x}. The old value ${old} is gone and no other element moves, so set is O(1).`,
    marks: { write: [i], reject: [OUT] },
    pointers: { i },
    vars: { i, x },
  });
  return { ...m, items: m.items.map((it, k) => (k === i ? item : it)), nextId: m.nextId + 1 };
}

// ───────────────────────────── insert / append ─────────────────────────────

const insertCode = [
  'insert(i, x):',
  '  if i > length: error "out of range"',
  '  if length = capacity: grow()',
  '  for j from length − 1 down to i:',
  '    A[j + 1] ← A[j]',
  '  A[i] ← x',
  '  length ← length + 1',
  '',
  'grow():',
  '  B ← new array, capacity × 2',
  '  copy A[0 … length − 1] into B',
  '  A ← B',
];

function* insert(m: DynamicArray, args: Args): Gen {
  const i = intArg(args, 'index');
  const x = intArg(args, 'value');
  const n = m.items.length;
  const t = tracerFor(m, { in: 'inserting' });
  if (!(i >= 0 && i <= n)) return m;
  if (n >= ARRAY_MAX) {
    yield t.frame({ line: 2, note: `The array already holds ${ARRAY_MAX} elements, the most this demo allows.`, vars: { result: 'error' } });
    return m;
  }
  const item = { id: `n${m.nextId}`, value: x };
  t.place(item, IN);
  yield t.frame({
    line: 0,
    note: `Insert ${x} at index ${i}. The cells are contiguous, so every element from index ${i} onwards must move one cell right to open a gap.`,
    marks: { key: [IN] },
    pointers: { i },
    vars: { i, x, length: n, capacity: m.capacity },
    checkpoint: { question: 'How many elements must shift right?', ...numberChoices(n - i, [n - i + 1, n - i - 1, n, i]) },
  });

  let capacity = m.capacity;
  let copied = 0;
  if (n === capacity) {
    capacity = yield* grow(t, m, { full: 2, alloc: 9, copy: 10, swap: 11 });
    copied = n;
  }

  let shifts = 0;
  if (i === n) {
    yield t.frame({ line: 3, note: `Nothing to shift: index ${i} is just past the last element.`, marks: { key: [IN] }, pointers: { i }, vars: { i, x } });
  }
  for (let j = n - 1; j >= i; j--) {
    const v = t.value(j);
    t.move(j, j + 1);
    t.count('shifts');
    t.count('touched');
    shifts++;
    yield t.frame({
      line: 4,
      note: `Shift ${v} from index ${j} to ${j + 1}.`,
      marks: { write: [j + 1], key: [IN] },
      pointers: { i, j },
      vars: { i, j, x },
    });
  }

  t.move(IN, i);
  t.count('touched');
  yield t.frame({ line: 5, note: `Write ${x} into the gap at index ${i}.`, marks: { write: [i] }, pointers: { i }, vars: { i, x } });

  t.setSummary(summaryOf(n + 1, capacity));
  yield t.frame({
    line: 6,
    note:
      shifts > 0
        ? `length is now ${n + 1}. Shifting ${plural(shifts, 'element')} is the cost of keeping the array contiguous: inserting at index i is O(n − i), so index 0 is the worst case.`
        : `length is now ${n + 1}. Inserting at the end moved nothing, which is why appending is the cheap case.`,
    marks: { found: [i] },
    vars: { length: n + 1, capacity },
  });
  return {
    items: [...m.items.slice(0, i), item, ...m.items.slice(i)],
    capacity,
    nextId: m.nextId + 1,
    added: m.added + 1,
    copied: m.copied + copied,
  };
}

const appendCode = [
  'append(x):',
  '  if length = capacity: grow()',
  '  A[length] ← x',
  '  length ← length + 1',
  '',
  'grow():',
  '  B ← new array, capacity × 2',
  '  copy A[0 … length − 1] into B',
  '  A ← B',
];

function* append(m: DynamicArray, args: Args): Gen {
  const x = intArg(args, 'value');
  const n = m.items.length;
  const t = tracerFor(m, { in: 'appending' });
  if (n >= ARRAY_MAX) {
    yield t.frame({ line: 1, note: `The array already holds ${ARRAY_MAX} elements, the most this demo allows.`, vars: { result: 'error' } });
    return m;
  }
  const item = { id: `n${m.nextId}`, value: x };
  t.place(item, IN);
  yield t.frame({
    line: 0,
    note: `Append ${x} after the last element. The array has length ${n} and capacity ${m.capacity}.`,
    marks: { key: [IN] },
    vars: { x, length: n, capacity: m.capacity },
    checkpoint: { question: 'Does this append have to grow the array first?', choices: YES_NO, answer: n === m.capacity ? 0 : 1 },
  });

  let capacity = m.capacity;
  let copied = 0;
  if (n === capacity) {
    capacity = yield* grow(t, m, { full: 1, alloc: 6, copy: 7, swap: 8 });
    copied = n;
  } else {
    yield t.frame({
      line: 1,
      note: `length ${n} < capacity ${capacity}: there is a spare cell, so no growing is needed.`,
      marks: { key: [IN] },
      pointers: { length: n },
      vars: { x, length: n, capacity },
    });
  }

  t.move(IN, n);
  t.count('touched');
  yield t.frame({ line: 2, note: `Write ${x} into A[${n}], the first spare cell.`, marks: { write: [n] }, vars: { x, length: n, capacity } });

  const added = m.added + 1;
  const totalCopies = m.copied + copied;
  t.setSummary(summaryOf(n + 1, capacity));
  yield t.frame({
    line: 3,
    note: `length is now ${n + 1}. Over ${plural(added, 'element')} added so far, growing copied ${plural(totalCopies, 'element')}: ${(totalCopies / added).toFixed(2)} copies each. Doubling keeps that average below 2, so append is O(1) amortised.`,
    marks: { found: [n] },
    vars: { length: n + 1, capacity, added, copied: totalCopies },
  });
  return { items: [...m.items, item], capacity, nextId: m.nextId + 1, added, copied: totalCopies };
}

// ───────────────────────────── delete ─────────────────────────────

const deleteCode = [
  'delete(i):',
  '  if i ≥ length: error "out of range"',
  '  x ← A[i]',
  '  for j from i + 1 to length − 1:',
  '    A[j − 1] ← A[j]',
  '  length ← length − 1',
  '  return x',
];

function* remove(m: DynamicArray, args: Args): Gen {
  const i = intArg(args, 'index');
  const n = m.items.length;
  const t = tracerFor(m);
  if (!(i >= 0 && i < n)) return m;
  yield t.frame({
    line: 0,
    note: `Delete the element at index ${i}. The elements after it must close the gap, so the array stays contiguous.`,
    marks: { compare: [i] },
    pointers: { i },
    vars: { i, length: n },
    checkpoint: { question: 'How many elements must shift left?', ...numberChoices(n - 1 - i, [n - i, n - 2 - i, i, n]) },
  });
  const x = t.value(i);
  t.move(i, OUT);
  t.count('touched');
  yield t.frame({ line: 2, note: `Take ${x} out, leaving a gap at index ${i}.`, marks: { reject: [OUT] }, pointers: { i }, vars: { i, x } });

  if (i === n - 1) {
    yield t.frame({ line: 3, note: 'Nothing to shift: it was the last element.', marks: { reject: [OUT] }, vars: { i, x } });
  }
  for (let j = i + 1; j < n; j++) {
    const v = t.value(j);
    t.move(j, j - 1);
    t.count('shifts');
    t.count('touched');
    yield t.frame({
      line: 4,
      note: `Shift ${v} left from index ${j} to ${j - 1}.`,
      marks: { write: [j - 1], reject: [OUT] },
      pointers: { i, j },
      vars: { i, j, x },
    });
  }
  t.setSummary(summaryOf(n - 1, m.capacity));
  yield t.frame({
    line: 5,
    note: `length is now ${n - 1}, so cell ${n - 1} is spare capacity again. (This array never shrinks; many libraries halve the block when it is only a quarter full.)`,
    marks: { reject: [OUT] },
    vars: { length: n - 1, capacity: m.capacity },
  });
  const shifts = n - 1 - i;
  yield t.frame({
    line: 6,
    note: `Return ${x}. ${shifts > 0 ? `${plural(shifts, 'element')} shifted left: deleting at index i is O(n − i).` : 'Deleting the last element moved nothing: O(1).'}`,
    marks: { found: [OUT] },
    vars: { result: x },
  });
  return { ...m, items: m.items.filter((_, k) => k !== i) };
}

// ───────────────────────────── module ─────────────────────────────

const nonEmpty = (m: DynamicArray) => (m.items.length === 0 ? 'The array is empty' : null);
const notFull = (m: DynamicArray) => (m.items.length >= ARRAY_MAX ? `The array is full: this demo stops at ${ARRAY_MAX} elements` : null);
/** get, set and delete need an element at the index: 0 to length − 1. */
const existing = (m: DynamicArray, args?: Args) => nonEmpty(m) ?? indexPastEnd(args, m.items.length, 'array', 'element');
/** insert may also go just past the end: 0 to length. */
const insertable = (m: DynamicArray, args?: Args) => notFull(m) ?? indexPastEnd(args, m.items.length, 'array', 'element', true);

/** Builds an array whose capacity is the smallest power of two (at least 4) that fits the values. */
export function makeArray(values: readonly number[], capacity?: number): DynamicArray {
  let cap = capacity ?? 4;
  while (cap < values.length) cap *= 2;
  return { items: values.map((value, i) => ({ id: `n${i}`, value })), capacity: cap, nextId: values.length, added: values.length, copied: 0 };
}

export const arrayStructure = defineStructure<DynamicArray, LinearState>({
  kind: 'structure',
  slug: 'array',
  view: 'linear',
  initial: [
    { id: 'example', label: 'Small example', make: () => makeArray([7, 23, 4, 42, 15], 8) },
    { id: 'full', label: 'Full (next append grows)', make: () => makeArray([12, 5, 31, 8], 4) },
    { id: 'empty', label: 'Empty', make: () => makeArray([], 4) },
    {
      id: 'random',
      label: 'Random',
      make: (seed) => {
        const rng = createRng(seed);
        const n = 2 + Math.floor(rng() * 7);
        return makeArray(Array.from({ length: n }, () => Math.floor(rng() * 100)));
      },
    },
  ],
  snapshot: (m) =>
    slotsSnapshot('array', [{ id: MAIN, label: rowLabel(m.capacity), slots: Array.from({ length: m.capacity }, (_, i) => m.items[i] ?? null) }], {
      holders: [
        { id: 'in', label: 'new value' },
        { id: 'out', label: 'removed' },
      ],
      summary: summaryOf(m.items.length, m.capacity),
    }),
  operations: [
    { id: 'get', label: 'Get', args: [indexArg(ARRAY_MAX - 1)], pseudocode: getCode, disabledReason: existing, run: get },
    { id: 'set', label: 'Set', args: [indexArg(ARRAY_MAX - 1), VALUE_ARG], pseudocode: setCode, disabledReason: existing, run: set },
    { id: 'append', label: 'Append', args: [VALUE_ARG], pseudocode: appendCode, disabledReason: notFull, run: append },
    { id: 'insert', label: 'Insert at', args: [indexArg(ARRAY_MAX - 1), VALUE_ARG], pseudocode: insertCode, disabledReason: insertable, run: insert },
    { id: 'delete', label: 'Delete at', args: [indexArg(ARRAY_MAX - 1)], pseudocode: deleteCode, disabledReason: existing, run: remove },
  ],
  stats: [TOUCHED, { key: 'shifts', label: 'Elements shifted' }, { key: 'copies', label: 'Copied while growing' }, { key: 'resizes', label: 'Resizes' }],
  legend: [
    { neutral: 'Element' },
    { mark: 'key', label: 'Value going in' },
    { mark: 'compare', label: 'Cell being read' },
    { mark: 'write', label: 'Just written or shifted' },
    { mark: 'found', label: 'Result' },
    { mark: 'reject', label: 'Removed or overwritten' },
  ],
  content: {
    idea: 'A row of equally sized cells side by side in memory. Because cell i sits at base + i × cellSize, any index is one calculation away; the price is that inserting or deleting in the middle must shift everything after it.',
    invariant: 'Elements occupy cells 0 to length − 1 with no gaps, and length ≤ capacity. Cells from length to capacity − 1 are spare.',
    whenToUse: 'The default list in most languages (Python list, Java ArrayList, C++ vector): fast indexing, fast appends and cache-friendly scans. Avoid it when you insert or delete near the front a lot; a deque or linked list suits that better.',
    traits: [
      { label: 'O(1) get / set by index', good: true },
      { label: 'O(1) amortised append', good: true },
      { label: 'O(n) insert / delete in the middle', good: false },
      { label: 'Contiguous: cache-friendly', good: true },
      { label: 'Growing copies every element', good: null },
    ],
    experiments: [
      { example: 'full', prompt: 'Append once: the array moves to a block twice the size, one copy per element.' },
      { example: 'example', prompt: 'Insert at index 0, then at index 5: count the shifts each time.' },
    ],
  },
});
