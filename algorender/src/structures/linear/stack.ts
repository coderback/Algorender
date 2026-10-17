import { defineStructure, type Args } from '@/engine/module';
import { createRng } from '@/engine/random';
import type { Frame } from '@/engine/types';
import { LinearTracer, MAIN, slotsSnapshot, type Item } from '@/viz/linear/tracer';
import type { LinearState } from '@/viz/linear/types';
import { TOUCHED, VALUE_ARG, intArg, numberChoices, valueChoices } from './shared';

/** An array-backed stack: items[0] is the bottom, items[length − 1] the top. */
export type StackModel = { items: readonly Item[]; nextId: number };

export const STACK_CAPACITY = 8;
const IN = { holder: 'in' } as const;
const OUT = { holder: 'out' } as const;

type Gen = Generator<Frame<LinearState>, StackModel>;

const summaryOf = (n: number) => `size ${n} · top = ${n - 1}${n === 0 ? ' (empty)' : ''}`;
const ROW_LABEL = `Stack · array of ${STACK_CAPACITY} slots`;
const HOLDERS = [
  { id: 'in', label: 'pushing' },
  { id: 'out', label: 'popped' },
];
const slotsOf = (m: StackModel) => Array.from({ length: STACK_CAPACITY }, (_, i) => m.items[i] ?? null);
/** The top pointer, or nothing when the stack is empty (top = −1 sits below slot 0). */
const topPtr = (n: number): Record<string, number> => (n > 0 ? { top: n - 1 } : {});

function tracerFor(m: StackModel) {
  const t = new LinearTracer('stack', { rows: [{ id: MAIN, label: ROW_LABEL, slots: slotsOf(m) }], holders: HOLDERS, stats: ['touched', 'index'] });
  t.setSummary(summaryOf(m.items.length));
  return t;
}

const emptyError = (t: LinearTracer, what: string) =>
  t.frame({ line: 1, note: `The stack is empty (top = −1), so there is nothing to ${what}.`, vars: { top: -1, result: 'error' } });

const pushCode = ['push(x):', '  if top = capacity − 1: error "overflow"', '  top ← top + 1', '  S[top] ← x'];

function* push(m: StackModel, args: Args): Gen {
  const x = intArg(args, 'value');
  const n = m.items.length;
  const t = tracerFor(m);
  if (n >= STACK_CAPACITY) {
    yield t.frame({
      line: 1,
      note: `Stack overflow: all ${STACK_CAPACITY} slots are in use, so there is nowhere to put ${x}. (A growable stack would move to a bigger array here.)`,
      pointers: topPtr(n),
      vars: { top: n - 1, result: 'error' },
    });
    return m;
  }
  const item = { id: `n${m.nextId}`, value: x };
  t.place(item, IN);
  yield t.frame({
    line: 0,
    note: `Push ${x}. A stack only ever changes at its top, so ${x} will sit above ${n > 0 ? `the current top, ${t.value(n - 1)}` : 'nothing: the stack is empty'}.`,
    marks: { key: [IN] },
    pointers: topPtr(n),
    vars: { x, top: n - 1 },
    checkpoint: { question: `Which slot index will ${x} go into?`, ...numberChoices(n, [n - 1, n + 1, 0, STACK_CAPACITY - 1]) },
  });
  t.count('index');
  yield t.frame({
    line: 2,
    note: `top moves up from ${n - 1} to ${n}, the first free slot.`,
    marks: { key: [IN] },
    pointers: { top: n },
    vars: { x, top: n },
  });
  t.move(IN, n);
  t.count('touched');
  t.setSummary(summaryOf(n + 1));
  yield t.frame({
    line: 3,
    note: `S[${n}] ← ${x}. Nothing below the top moved, so push is O(1) however tall the stack is.`,
    marks: { write: [n] },
    pointers: { top: n },
    vars: { x, top: n },
  });
  return { items: [...m.items, item], nextId: m.nextId + 1 };
}

const popCode = ['pop():', '  if top = −1: error "empty"', '  x ← S[top]', '  top ← top − 1', '  return x'];

function* pop(m: StackModel): Gen {
  const n = m.items.length;
  const t = tracerFor(m);
  if (n === 0) {
    yield emptyError(t, 'pop');
    return m;
  }
  const values = m.items.map((i) => i.value);
  const top = values[n - 1];
  const choices = valueChoices(top, [values[0], values[n - 2] ?? top, values[Math.floor((n - 1) / 2)]]);
  yield t.frame({
    line: 0,
    note: 'Pop removes one value and returns it. A stack is last in, first out.',
    pointers: topPtr(n),
    vars: { top: n - 1 },
    ...(choices && { checkpoint: { question: 'Which value does pop return?', ...choices } }),
  });
  t.move(n - 1, OUT);
  t.count('touched');
  yield t.frame({
    line: 2,
    note: `x ← S[${n - 1}] = ${top}: the value pushed most recently comes out first.`,
    marks: { found: [OUT] },
    pointers: topPtr(n),
    vars: { top: n - 1, x: top },
  });
  t.setSummary(summaryOf(n - 1));
  t.count('index');
  yield t.frame({
    line: 3,
    note:
      n > 1
        ? `top moves down to ${n - 2}, so ${values[n - 2]} is the new top. The old slot needn't be cleared: anything above top counts as free.`
        : 'top moves down to −1: the stack is empty again.',
    marks: { found: [OUT] },
    pointers: topPtr(n - 1),
    vars: { top: n - 2, x: top },
  });
  yield t.frame({
    line: 4,
    note: `Return ${top}. One slot read and one index change: pop is O(1).`,
    marks: { found: [OUT] },
    pointers: topPtr(n - 1),
    vars: { result: top },
  });
  return { ...m, items: m.items.slice(0, -1) };
}

const peekCode = ['peek():', '  if top = −1: error "empty"', '  return S[top]'];

function* peek(m: StackModel): Gen {
  const n = m.items.length;
  const t = tracerFor(m);
  if (n === 0) {
    yield emptyError(t, 'peek at');
    return m;
  }
  const values = m.items.map((i) => i.value);
  const top = values[n - 1];
  const choices = valueChoices(top, [values[0], values[n - 2] ?? top]);
  yield t.frame({
    line: 0,
    note: 'Peek looks at the value pop would return, without removing it.',
    pointers: topPtr(n),
    vars: { top: n - 1 },
    ...(choices && { checkpoint: { question: 'Which value does peek return?', ...choices } }),
  });
  t.count('touched');
  yield t.frame({
    line: 2,
    note: `S[${n - 1}] = ${top}. The stack is unchanged: peek is a single O(1) read.`,
    marks: { found: [n - 1] },
    pointers: topPtr(n),
    vars: { result: top },
  });
  return m;
}

const makeStack = (values: readonly number[]): StackModel => ({
  items: values.map((value, i) => ({ id: `n${i}`, value })),
  nextId: values.length,
});

const isEmpty = (m: StackModel) => (m.items.length === 0 ? 'The stack is empty' : null);

export const stackStructure = defineStructure<StackModel, LinearState>({
  kind: 'structure',
  slug: 'stack',
  view: 'linear',
  initial: [
    { id: 'example', label: 'Small example', make: () => makeStack([7, 23, 42]) },
    { id: 'empty', label: 'Empty', make: () => makeStack([]) },
    { id: 'nearly-full', label: 'One slot left', make: () => makeStack([5, 18, 3, 64, 27, 9, 51]) },
    {
      id: 'random',
      label: 'Random',
      make: (seed) => {
        const rng = createRng(seed);
        return makeStack(Array.from({ length: 2 + Math.floor(rng() * 4) }, () => Math.floor(rng() * 100)));
      },
    },
  ],
  snapshot: (m) =>
    slotsSnapshot('stack', [{ id: MAIN, label: ROW_LABEL, slots: slotsOf(m) }], {
      holders: HOLDERS,
      summary: summaryOf(m.items.length),
      pointers: topPtr(m.items.length),
    }),
  operations: [
    {
      id: 'push',
      label: 'Push',
      args: [VALUE_ARG],
      pseudocode: pushCode,
      disabledReason: (m) => (m.items.length >= STACK_CAPACITY ? `The stack is full: all ${STACK_CAPACITY} slots are in use` : null),
      run: push,
    },
    { id: 'pop', label: 'Pop', args: [], pseudocode: popCode, disabledReason: isEmpty, run: pop },
    { id: 'peek', label: 'Peek', args: [], pseudocode: peekCode, disabledReason: isEmpty, run: peek },
  ],
  stats: [TOUCHED, { key: 'index', label: 'top updates' }],
  legend: [
    { neutral: 'Element' },
    { mark: 'key', label: 'Value being pushed' },
    { mark: 'write', label: 'Just pushed' },
    { mark: 'found', label: 'Returned by pop or peek' },
  ],
  content: {
    idea: 'A pile you only touch at the top: push puts a value on top, pop takes the top one off. Backed by an array, the top is just an index, so both are a single step.',
    invariant: 'Last in, first out: pop always returns the most recently pushed value still present. Slots 0 to top hold the stack, bottom to top; everything above top is free.',
    whenToUse: 'Whenever the most recent thing must be handled first: function calls, undo history, matching brackets, depth-first search and evaluating expressions.',
    traits: [
      { label: 'O(1) push, pop and peek', good: true },
      { label: 'LIFO order', good: null },
      { label: 'Only the top is reachable', good: false },
      { label: 'Fixed capacity here: overflow when full', good: null },
    ],
    experiments: [{ example: 'nearly-full', prompt: 'Push once to fill the last slot: then push is blocked, because another would overflow. A growable stack would copy into a bigger array instead.' }],
  },
});
