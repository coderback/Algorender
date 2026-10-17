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
type End = 'front' | 'back';

const LABEL = ringLabel('Deque');
const HOLDERS = [
  { id: 'front', label: 'front' },
  { id: 'back', label: 'back' },
];

const tracerFor = (m: RingModel) => ringTracer('deque', LABEL, m, HOLDERS);

const pushFrontCode = [
  'pushFront(x):',
  '  if count = cap: error "full"',
  '  head ← (head + cap − 1) mod cap',
  '  D[head] ← x',
  '  count ← count + 1',
];
const pushBackCode = ['pushBack(x):', '  if count = cap: error "full"', '  D[tail] ← x', '  tail ← (tail + 1) mod cap', '  count ← count + 1'];
const popFrontCode = [
  'popFront():',
  '  if count = 0: error "empty"',
  '  x ← D[head]',
  '  head ← (head + 1) mod cap',
  '  count ← count − 1',
  '  return x',
];
const popBackCode = [
  'popBack():',
  '  if count = 0: error "empty"',
  '  tail ← (tail + cap − 1) mod cap',
  '  x ← D[tail]',
  '  count ← count − 1',
  '  return x',
];

function* push(end: End, m: RingModel, args: Args): Gen {
  const x = intArg(args, 'value');
  const { head, count } = m;
  const tail = tailOf(m);
  const t = tracerFor(m);
  const name = end === 'front' ? 'pushFront' : 'pushBack';
  if (count >= RING_CAPACITY) {
    yield t.frame({
      line: 1,
      note: `The deque is full: all ${RING_CAPACITY} slots are in use, so ${x} has nowhere to go.`,
      pointers: { head, tail },
      vars: { head, tail, count, result: 'error' },
    });
    return m;
  }
  const item = { id: `n${m.nextId}`, value: x };
  const holder = { holder: end };
  t.setHolderLabel(end, `${name}(${x})`);
  t.place(item, holder);

  if (end === 'front') {
    yield t.frame({
      line: 0,
      note: `Push ${x} onto the front. The front value sits at head, so ${x} goes in the slot just before it.`,
      marks: { key: [holder] },
      pointers: { head, tail },
      vars: { x, head, tail, count },
      checkpoint: { question: 'Where does head move to?', ...indexChoices(head, -1) },
    });
    const head2 = wrap(head - 1);
    if (head2 > head) t.count('wraps');
    yield t.frame({
      line: 2,
      note: stepNote('head', head, -1),
      marks: { key: [holder] },
      pointers: { head: head2, tail },
      vars: { x, head: head2, tail, count },
    });
    t.move(holder, head2);
    t.count('touched');
    yield t.frame({ line: 3, note: `D[${head2}] ← ${x}.`, marks: { write: [head2] }, pointers: { head: head2, tail }, vars: { x, head: head2, tail, count } });
    t.setSummary(ringSummary(count + 1, head2));
    yield t.frame({
      line: 4,
      note: `count is now ${count + 1}. Neither end makes the other values move, so pushing at either end is O(1).`,
      pointers: { head: head2, tail },
      vars: { head: head2, tail, count: count + 1 },
    });
    return { ...m, slots: withSlot(m.slots, head2, item), head: head2, count: count + 1, nextId: m.nextId + 1 };
  }

  yield t.frame({
    line: 0,
    note: `Push ${x} onto the back, into the free slot that tail points to.`,
    marks: { key: [holder] },
    pointers: { head, tail },
    vars: { x, head, tail, count },
  });
  t.move(holder, tail);
  t.count('touched');
  yield t.frame({
    line: 2,
    note: `D[${tail}] ← ${x}.`,
    marks: { write: [tail] },
    pointers: { head, tail },
    vars: { x, head, tail, count },
    checkpoint: { question: 'Where does tail move to?', ...indexChoices(tail, 1) },
  });
  const tail2 = wrap(tail + 1);
  if (tail2 < tail) t.count('wraps');
  yield t.frame({ line: 3, note: stepNote('tail', tail, 1), marks: { write: [tail] }, pointers: { head, tail: tail2 }, vars: { x, head, tail: tail2, count } });
  t.setSummary(ringSummary(count + 1, head));
  yield t.frame({
    line: 4,
    note: `count is now ${count + 1}. Neither end makes the other values move, so pushing at either end is O(1).`,
    pointers: { head, tail: tail2 },
    vars: { head, tail: tail2, count: count + 1 },
  });
  return { ...m, slots: withSlot(m.slots, tail, item), count: count + 1, nextId: m.nextId + 1 };
}

function* pop(end: End, m: RingModel): Gen {
  const { head, count } = m;
  const tail = tailOf(m);
  const t = tracerFor(m);
  const name = end === 'front' ? 'popFront' : 'popBack';
  if (count === 0) {
    yield t.frame({ line: 1, note: 'The deque is empty (count = 0), so there is nothing to pop.', vars: { count: 0, result: 'error' } });
    return m;
  }
  const values = ringValues(m);
  const x = end === 'front' ? values[0] : values[count - 1];
  const other = end === 'front' ? values[count - 1] : values[0];
  const choices = valueChoices(x, [other, values[Math.floor(count / 2)]]);
  const holder = { holder: end };
  t.setHolderLabel(end, `${name}()`);
  yield t.frame({
    line: 0,
    note: `${name} removes the value at the ${end} end. Values can leave from either end, but never from the middle.`,
    pointers: { head, tail },
    vars: { head, tail, count },
    ...(choices && { checkpoint: { question: `Which value does ${name} return?`, ...choices } }),
  });

  let head2 = head;
  let tail2 = tail;
  if (end === 'front') {
    t.move(head, holder);
    t.count('touched');
    yield t.frame({
      line: 2,
      note: `x ← D[${head}] = ${x}, the front value.`,
      marks: { found: [holder] },
      pointers: { head, tail },
      vars: { head, tail, count, x },
    });
    head2 = wrap(head + 1);
    if (head2 < head) t.count('wraps');
    yield t.frame({ line: 3, note: stepNote('head', head, 1), marks: { found: [holder] }, pointers: { head: head2, tail }, vars: { head: head2, tail, count, x } });
  } else {
    tail2 = wrap(tail - 1);
    if (tail2 > tail) t.count('wraps');
    yield t.frame({
      line: 2,
      note: `${stepNote('tail', tail, -1)} tail always points one past the last value, so stepping back lands on it.`,
      pointers: { head, tail: tail2 },
      vars: { head, tail: tail2, count },
    });
    t.move(tail2, holder);
    t.count('touched');
    yield t.frame({
      line: 3,
      note: `x ← D[${tail2}] = ${x}, the back value.`,
      marks: { found: [holder] },
      pointers: { head, tail: tail2 },
      vars: { head, tail: tail2, count, x },
    });
  }
  t.setSummary(ringSummary(count - 1, head2));
  yield t.frame({
    line: 4,
    note: `count is now ${count - 1}.${count === 1 ? ' The deque is empty again: head and tail meet.' : ''}`,
    marks: { found: [holder] },
    pointers: { head: head2, tail: tail2 },
    vars: { head: head2, tail: tail2, count: count - 1, x },
  });
  yield t.frame({
    line: 5,
    note: `Return ${x}. Only one index moved and nothing shifted: O(1) at either end.`,
    marks: { found: [holder] },
    pointers: { head: head2, tail: tail2 },
    vars: { result: x },
  });
  const freed = end === 'front' ? head : tail2;
  return { ...m, slots: withSlot(m.slots, freed, null), head: head2, count: count - 1 };
}

const full = isFullRing('deque');
const empty = isEmptyRing('deque');

export const dequeStructure = defineStructure<RingModel, LinearState>({
  kind: 'structure',
  slug: 'deque',
  view: 'linear',
  initial: [
    { id: 'example', label: 'Small example', make: () => makeRing([7, 23, 42], 2) },
    { id: 'head-at-zero', label: 'Head at slot 0', make: () => makeRing([12, 9, 30], 0) },
    { id: 'empty', label: 'Empty', make: () => makeRing([], 0) },
    { id: 'random', label: 'Random', make: randomRing },
  ],
  snapshot: (m) => ringSnapshot('deque', LABEL, m, HOLDERS),
  operations: [
    { id: 'push-front', label: 'Push front', args: [VALUE_ARG], pseudocode: pushFrontCode, disabledReason: full, run: (m, a) => push('front', m, a) },
    { id: 'push-back', label: 'Push back', args: [VALUE_ARG], pseudocode: pushBackCode, disabledReason: full, run: (m, a) => push('back', m, a) },
    { id: 'pop-front', label: 'Pop front', args: [], pseudocode: popFrontCode, disabledReason: empty, run: (m) => pop('front', m) },
    { id: 'pop-back', label: 'Pop back', args: [], pseudocode: popBackCode, disabledReason: empty, run: (m) => pop('back', m) },
  ],
  stats: [TOUCHED, { key: 'wraps', label: 'Index wrap-arounds' }],
  legend: [
    { neutral: 'Value in the deque' },
    { mark: 'key', label: 'Value being pushed' },
    { mark: 'write', label: 'Just written' },
    { mark: 'found', label: 'Returned by a pop' },
  ],
  content: {
    idea: 'A double-ended queue: push and pop at both the front and the back. In a circular buffer, head steps backwards for a front push and tail steps forwards for a back push, wrapping around the ring as needed.',
    invariant: 'The count values live in slots head, head + 1, … (mod capacity), front to back, and tail = (head + count) mod capacity is the next free slot at the back.',
    whenToUse: "When you need a stack and a queue at once: sliding-window maximum, undo with a size limit, work stealing, 0-1 BFS. Python's collections.deque and Java's ArrayDeque are exactly this.",
    traits: [
      { label: 'O(1) push and pop at both ends', good: true },
      { label: 'No shifting: indices wrap', good: true },
      { label: 'No access to the middle', good: false },
      { label: 'Fixed capacity here', good: null },
    ],
    experiments: [{ example: 'head-at-zero', prompt: 'Push front: head steps back from 0 and wraps to the last slot.' }],
  },
});
