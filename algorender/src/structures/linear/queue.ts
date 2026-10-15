import { defineStructure, type Args } from '@/engine/module';
import type { Frame } from '@/engine/types';
import type { LinearState } from '@/viz/linear/types';
import {
  RING_CAPACITY,
  indexChoices,
  isEmptyRing,
  isFullRing,
  makeRing,
  randomRing,
  ringLabel,
  ringSnapshot,
  ringSummary,
  ringTracer,
  ringValues,
  stepNote,
  tailOf,
  withSlot,
  wrap,
  type RingModel,
} from './ring';
import { TOUCHED, VALUE_ARG, intArg, valueChoices } from './shared';

type Gen = Generator<Frame<LinearState>, RingModel>;

const LABEL = ringLabel('Queue');
const HOLDERS = [
  { id: 'out', label: 'dequeued' },
  { id: 'in', label: 'enqueuing' },
];
const IN = { holder: 'in' } as const;
const OUT = { holder: 'out' } as const;

const tracerFor = (m: RingModel) => ringTracer('queue', LABEL, m, HOLDERS);
const emptyError = (t: ReturnType<typeof tracerFor>, what: string) =>
  t.frame({ line: 1, note: `The queue is empty (count = 0), so there is nothing to ${what}.`, vars: { count: 0, result: 'error' } });

const enqueueCode = ['enqueue(x):', '  if count = capacity: error "full"', '  Q[tail] ← x', '  tail ← (tail + 1) mod capacity', '  count ← count + 1'];

function* enqueue(m: RingModel, args: Args): Gen {
  const x = intArg(args, 'value');
  const { head, count } = m;
  const tail = tailOf(m);
  const t = tracerFor(m);
  if (count >= RING_CAPACITY) {
    yield t.frame({
      line: 1,
      note: `The queue is full: all ${RING_CAPACITY} slots hold values still waiting, so ${x} has nowhere to go.`,
      pointers: { head, tail },
      vars: { head, tail, count, result: 'error' },
    });
    return m;
  }
  const item = { id: `n${m.nextId}`, value: x };
  t.place(item, IN);
  yield t.frame({
    line: 0,
    note: `Enqueue ${x}. New arrivals join at the back, in the free slot that tail points to.`,
    marks: { key: [IN] },
    pointers: { head, tail },
    vars: { x, head, tail, count },
  });
  t.move(IN, tail);
  t.count('touched');
  yield t.frame({
    line: 2,
    note: `Q[${tail}] ← ${x}.`,
    marks: { write: [tail] },
    pointers: { head, tail },
    vars: { x, head, tail, count },
    checkpoint: { question: 'Where does tail point next?', ...indexChoices(tail, 1) },
  });
  const tail2 = wrap(tail + 1);
  if (tail2 < tail) t.count('wraps');
  const full = count + 1 === RING_CAPACITY;
  yield t.frame({
    line: 3,
    note: `${stepNote('tail', tail, 1)}${full ? ' The queue is now full: tail has caught up with head.' : ''}`,
    marks: { write: [tail] },
    pointers: { head, tail: tail2 },
    vars: { x, head, tail: tail2, count },
  });
  t.setSummary(ringSummary(count + 1, head));
  yield t.frame({
    line: 4,
    note: `count is now ${count + 1}. No other element moved, so enqueue is O(1).`,
    pointers: { head, tail: tail2 },
    vars: { head, tail: tail2, count: count + 1 },
  });
  return { ...m, slots: withSlot(m.slots, tail, item), count: count + 1, nextId: m.nextId + 1 };
}

const dequeueCode = [
  'dequeue():',
  '  if count = 0: error "empty"',
  '  x ← Q[head]',
  '  head ← (head + 1) mod capacity',
  '  count ← count − 1',
  '  return x',
];

function* dequeue(m: RingModel): Gen {
  const { head, count } = m;
  const tail = tailOf(m);
  const t = tracerFor(m);
  if (count === 0) {
    yield emptyError(t, 'dequeue');
    return m;
  }
  const values = ringValues(m);
  const front = values[0];
  const choices = valueChoices(front, [values[count - 1], values[1] ?? front, values[Math.floor(count / 2)]]);
  yield t.frame({
    line: 0,
    note: 'Dequeue serves the queue: first in, first out.',
    pointers: { head, tail },
    vars: { head, tail, count },
    ...(choices && { checkpoint: { question: 'Which value does dequeue return?', ...choices } }),
  });
  t.move(head, OUT);
  t.count('touched');
  yield t.frame({
    line: 2,
    note: `x ← Q[${head}] = ${front}, the value that has waited longest.`,
    marks: { found: [OUT] },
    pointers: { head, tail },
    vars: { head, tail, count, x: front },
    checkpoint: { question: 'Where does head point next?', ...indexChoices(head, 1) },
  });
  const head2 = wrap(head + 1);
  if (head2 < head) t.count('wraps');
  yield t.frame({
    line: 3,
    note: `${stepNote('head', head, 1)}${count === 1 ? ' The queue is now empty: head has caught up with tail.' : ` ${values[1]} is now at the front.`}`,
    marks: { found: [OUT] },
    pointers: { head: head2, tail },
    vars: { head: head2, tail, count, x: front },
  });
  t.setSummary(ringSummary(count - 1, head2));
  yield t.frame({
    line: 4,
    note: `count is now ${count - 1}.`,
    marks: { found: [OUT] },
    pointers: { head: head2, tail },
    vars: { head: head2, tail, count: count - 1, x: front },
  });
  yield t.frame({
    line: 5,
    note: `Return ${front}. Nothing shifted forward: in a plain array, removing the front would move every remaining element (O(n)); the ring buffer only moves head, O(1).`,
    marks: { found: [OUT] },
    pointers: { head: head2, tail },
    vars: { result: front },
  });
  return { ...m, slots: withSlot(m.slots, head, null), head: head2, count: count - 1 };
}

const peekCode = ['peek():', '  if count = 0: error "empty"', '  return Q[head]'];

function* peek(m: RingModel): Gen {
  const { head, count } = m;
  const tail = tailOf(m);
  const t = tracerFor(m);
  if (count === 0) {
    yield emptyError(t, 'peek at');
    return m;
  }
  const values = ringValues(m);
  const choices = valueChoices(values[0], [values[count - 1], values[1] ?? values[0]]);
  yield t.frame({
    line: 0,
    note: 'Peek looks at the value dequeue would return, without removing it.',
    pointers: { head, tail },
    vars: { head, tail, count },
    ...(choices && { checkpoint: { question: 'Which value does peek return?', ...choices } }),
  });
  t.count('touched');
  yield t.frame({
    line: 2,
    note: `Q[${head}] = ${values[0]}, the front of the queue. Nothing changes: one O(1) read.`,
    marks: { found: [head] },
    pointers: { head, tail },
    vars: { result: values[0] },
  });
  return m;
}

export const queueStructure = defineStructure<RingModel, LinearState>({
  kind: 'structure',
  slug: 'queue',
  view: 'linear',
  initial: [
    { id: 'example', label: 'Small example', make: () => makeRing([7, 23, 42], 0) },
    { id: 'about-to-wrap', label: 'Tail about to wrap', make: () => makeRing([15, 8, 61], 4) },
    { id: 'empty', label: 'Empty', make: () => makeRing([], 0) },
    { id: 'random', label: 'Random', make: randomRing },
  ],
  snapshot: (m) => ringSnapshot('queue', LABEL, m, HOLDERS),
  operations: [
    { id: 'enqueue', label: 'Enqueue', args: [VALUE_ARG], pseudocode: enqueueCode, disabledReason: isFullRing('queue'), run: enqueue },
    { id: 'dequeue', label: 'Dequeue', args: [], pseudocode: dequeueCode, disabledReason: isEmptyRing('queue'), run: dequeue },
    { id: 'peek', label: 'Peek', args: [], pseudocode: peekCode, disabledReason: isEmptyRing('queue'), run: peek },
  ],
  stats: [TOUCHED, { key: 'wraps', label: 'Index wrap-arounds' }],
  legend: [
    { neutral: 'Waiting in the queue' },
    { mark: 'key', label: 'Value being enqueued' },
    { mark: 'write', label: 'Just written' },
    { mark: 'found', label: 'Returned by dequeue or peek' },
  ],
  content: {
    idea: 'A line: values join at the back and leave from the front. Stored in a circular buffer, the front and back are two indices chasing each other around a ring, so neither end ever shifts the elements.',
    invariant: 'First in, first out. The count values live in slots head, head + 1, … (mod capacity), front to back; tail = (head + count) mod capacity is the next free slot.',
    whenToUse: 'Whenever work must be handled in arrival order: task and message queues, buffering a stream, printer jobs, and breadth-first search.',
    traits: [
      { label: 'O(1) enqueue, dequeue and peek', good: true },
      { label: 'FIFO order', good: null },
      { label: 'No shifting: indices wrap instead', good: true },
      { label: 'Fixed capacity here', good: null },
    ],
    experiments: [{ example: 'about-to-wrap', prompt: 'Enqueue once: the value lands in the last slot and tail wraps around to slot 0. Then dequeue until head wraps too.' }],
  },
});
