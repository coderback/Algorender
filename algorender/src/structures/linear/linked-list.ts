import { defineStructure, type Args } from '@/engine/module';
import { createRng } from '@/engine/random';
import type { Frame } from '@/engine/types';
import { ListTracer, listSnapshot, type Item } from '@/viz/linear/tracer';
import type { LinearState } from '@/viz/linear/types';
import { VALUE_ARG, YES_NO, arrange, indexArg, indexPastEnd, intArg, numberChoices, plural } from './shared';

/** A singly linked list with head and tail pointers; `items` is the order you'd meet walking from head. */
export type ListModel = { items: readonly Item[]; nextId: number };

export const LIST_MAX = 10;

type Gen = Generator<Frame<LinearState>, ListModel>;

const summaryOf = (n: number) => `length ${n}${n === 0 ? ' · head = tail = null' : ''}`;

function tracerFor(m: ListModel) {
  const t = new ListTracer(m.items, ['hops', 'links']);
  t.setSummary(summaryOf(m.items.length));
  return t;
}

const hopsText = (n: number) => plural(n, 'hop');
const fullError = (t: ListTracer) =>
  t.frame({ line: 0, note: `The list already has ${LIST_MAX} nodes, the most this demo shows.`, vars: { result: 'error' } });

// ───────────────────────────── insert ─────────────────────────────

const insertHeadCode = ['insertHead(x):', '  new ← Node(x)', '  new.next ← head', '  head ← new', '  if tail = null: tail ← new'];

function* insertHead(m: ListModel, args: Args): Gen {
  const x = intArg(args, 'value');
  const t = tracerFor(m);
  if (m.items.length >= LIST_MAX) {
    yield fullError(t);
    return m;
  }
  const item = { id: `n${m.nextId}`, value: x };
  const head = t.pointer('head');
  t.create(item, 0);
  t.setPointer('new', item.id);
  yield t.frame({
    line: 1,
    note: `new ← Node(${x}). The node exists, but nothing points to it yet, so it isn't part of the list.`,
    marks: { key: [item.id] },
    vars: { x },
    checkpoint: { question: 'Which pointer changes first?', ...arrange('new.next ← head', ['head ← new'], x) },
  });
  t.setNext(item.id, head);
  t.count('links');
  yield t.frame({
    line: 2,
    note: head
      ? `new.next ← head: ${x} now points at ${t.value(head)}, the old first node. This must come first: if head moved first, nothing would point at the old list any more.`
      : `new.next ← head, which is null: the list was empty, so ${x} will also be the last node.`,
    marks: { key: [item.id] },
    links: { write: [item.id] },
    vars: { x },
  });
  t.setPointer('head', item.id);
  t.count('links');
  yield t.frame({ line: 3, note: `head ← new: the list now starts at ${x}.`, marks: { key: [item.id] }, vars: { x } });
  if (!head) {
    t.setPointer('tail', item.id);
    t.count('links');
    yield t.frame({ line: 4, note: 'tail was null because the list was empty, so tail ← new as well.', marks: { key: [item.id] }, vars: { x } });
  }
  t.attach(item.id, 0);
  t.clearPointer('new');
  t.setSummary(summaryOf(m.items.length + 1));
  yield t.frame({
    note: `Done: ${plural(t.stats.links, 'pointer')} written and no walking, however long the list is. Insert at head is O(1).`,
    marks: { found: [item.id] },
    vars: { x },
  });
  return { items: [item, ...m.items], nextId: m.nextId + 1 };
}

const insertTailCode = ['insertTail(x):', '  new ← Node(x)', '  if head = null: head ← new', '  else: tail.next ← new', '  tail ← new'];

function* insertTail(m: ListModel, args: Args): Gen {
  const x = intArg(args, 'value');
  const n = m.items.length;
  const t = tracerFor(m);
  if (n >= LIST_MAX) {
    yield fullError(t);
    return m;
  }
  const item = { id: `n${m.nextId}`, value: x };
  const tail = t.pointer('tail');
  t.create(item, n);
  t.setPointer('new', item.id);
  yield t.frame({
    line: 1,
    note: tail ? `new ← Node(${x}). It must go after the last node, ${t.value(tail)}.` : `new ← Node(${x}). The list is empty, so it will be the only node.`,
    marks: { key: [item.id] },
    vars: { x },
    ...(tail && {
      checkpoint: { question: 'How many nodes must be walked past to reach the last one?', ...numberChoices(0, [n, n - 1, 1]) },
    }),
  });
  if (!tail) {
    t.setPointer('head', item.id);
    t.count('links');
    yield t.frame({ line: 2, note: 'head is null, so head ← new.', marks: { key: [item.id] }, vars: { x } });
  } else {
    t.setNext(tail, item.id);
    t.count('links');
    yield t.frame({
      line: 3,
      note: `tail.next ← new. No walking: the tail pointer leads straight to ${t.value(tail)}, which now points at ${x}.`,
      marks: { key: [item.id] },
      links: { write: [tail] },
      vars: { x },
    });
  }
  t.setPointer('tail', item.id);
  t.count('links');
  yield t.frame({ line: 4, note: `tail ← new: ${x} is now the last node.`, marks: { key: [item.id] }, vars: { x } });
  t.attach(item.id, n);
  t.clearPointer('new');
  t.setSummary(summaryOf(n + 1));
  yield t.frame({
    note: `Done in O(1). Without a tail pointer, insert at tail would first walk past all ${plural(n, 'node')}: O(n).`,
    marks: { found: [item.id] },
    vars: { x },
  });
  return { items: [...m.items, item], nextId: m.nextId + 1 };
}

const insertAtCode = [
  'insertAt(i, x):',
  '  if i > length: error "out of range"',
  '  new ← Node(x)',
  '  if i = 0:',
  '    new.next ← head; head ← new',
  '  else:',
  '    cur ← head',
  '    repeat i − 1 times: cur ← cur.next',
  '    new.next ← cur.next',
  '    cur.next ← new',
  '  if new.next = null: tail ← new',
];

const FIRST = 'Which pointer changes first?';

function* insertAt(m: ListModel, args: Args): Gen {
  const i = intArg(args, 'index');
  const x = intArg(args, 'value');
  const n = m.items.length;
  const t = tracerFor(m);
  if (n >= LIST_MAX) {
    yield fullError(t);
    return m;
  }
  // disabledReason blocks an index past the end; this only keeps a direct call from walking off the list.
  if (!(i >= 0 && i <= n)) return m;
  const item = { id: `n${m.nextId}`, value: x };
  t.create(item, i === 0 || i === n ? i : i - 0.5);
  t.setPointer('new', item.id);
  yield t.frame({
    line: 2,
    note: `new ← Node(${x}). It has to end up at index ${i}, but a list can't jump there: only pointers lead from one node to the next.`,
    marks: { key: [item.id] },
    vars: { i, x },
  });

  let succ: string | null;
  if (i === 0) {
    const head = t.pointer('head');
    yield t.frame({
      line: 3,
      note: `i = 0, so ${x} becomes the first node.`,
      marks: { key: [item.id] },
      vars: { i, x },
      checkpoint: { question: FIRST, ...arrange('new.next ← head', ['head ← new'], x) },
    });
    succ = head;
    t.setNext(item.id, head);
    t.count('links');
    yield t.frame({
      line: 4,
      note: head
        ? `new.next ← head: ${x} points at ${t.value(head)}. First, so the old list stays reachable.`
        : 'new.next ← head, which is null: the list was empty.',
      marks: { key: [item.id] },
      links: { write: [item.id] },
      vars: { i, x },
    });
    t.setPointer('head', item.id);
    t.count('links');
    yield t.frame({ line: 4, note: `head ← new: the list now starts at ${x}.`, marks: { key: [item.id] }, vars: { i, x } });
  } else {
    let cur = t.pointer('head')!;
    const passed: string[] = [];
    t.setPointer('cur', cur);
    t.count('hops');
    const question = { question: FIRST, ...arrange('new.next ← cur.next', ['cur.next ← new'], x + i) };
    yield t.frame({
      line: 6,
      note: `cur ← head (${t.value(cur)}). cur has to stop at index ${i - 1}, the node just before the new one's spot.`,
      marks: { key: [item.id], compare: [cur] },
      vars: { i, x, cur: t.value(cur) },
      ...(i === 1 && { checkpoint: question }),
    });
    for (let k = 1; k < i; k++) {
      passed.push(cur);
      cur = t.next(cur)!;
      t.setPointer('cur', cur);
      t.count('hops');
      yield t.frame({
        line: 7,
        note: k === 1 ? `cur ← cur.next (${t.value(cur)}). Reaching index ${i - 1} means following pointers one at a time.` : `cur ← cur.next (${t.value(cur)}).`,
        marks: { key: [item.id], compare: [cur], visited: passed },
        vars: { i, x, cur: t.value(cur), hops: k },
        ...(k === i - 1 && { checkpoint: question }),
      });
    }
    succ = t.next(cur);
    t.setNext(item.id, succ);
    t.count('links');
    yield t.frame({
      line: 8,
      note: succ
        ? `new.next ← cur.next: ${x} now points at ${t.value(succ)}. This comes first: once cur.next changes, nothing else would point at ${t.value(succ)} and the rest of the list would be lost.`
        : `new.next ← cur.next, which is null: ${x} will be the last node.`,
      marks: { key: [item.id], compare: [cur] },
      links: { write: [item.id] },
      vars: { i, x, cur: t.value(cur) },
    });
    t.setNext(cur, item.id);
    t.count('links');
    yield t.frame({
      line: 9,
      note: `cur.next ← new: ${t.value(cur)} now points at ${x}, so walking from head reaches it.`,
      marks: { key: [item.id], compare: [cur] },
      links: { write: [cur] },
      vars: { i, x, cur: t.value(cur) },
    });
  }
  if (succ == null) {
    t.setPointer('tail', item.id);
    t.count('links');
    yield t.frame({ line: 10, note: `new.next is null, so ${x} is the last node: tail ← new.`, marks: { key: [item.id] }, vars: { i, x } });
  }
  t.attach(item.id, i);
  t.clearPointer('cur');
  t.clearPointer('new');
  t.setSummary(summaryOf(n + 1));
  const hops = t.stats.hops;
  yield t.frame({
    note:
      i === 0
        ? 'Done: no walking at index 0, so this was O(1).'
        : `Done: ${hopsText(hops)} to find the spot (O(n) in general), then just 2 pointer writes to link the node in.`,
    marks: { found: [item.id] },
    vars: { i, x },
  });
  return { items: [...m.items.slice(0, i), item, ...m.items.slice(i)], nextId: m.nextId + 1 };
}

// ───────────────────────────── delete ─────────────────────────────

const deleteValueCode = [
  'deleteValue(x):',
  '  prev ← null; cur ← head',
  '  while cur ≠ null and cur.value ≠ x:',
  '    prev ← cur; cur ← cur.next',
  '  if cur = null: return "not found"',
  '  if prev = null: head ← cur.next',
  '  else: prev.next ← cur.next',
  '  if cur = tail: tail ← prev',
];

/** Final frame of a delete: the gap closes and the unlinked node is left on its own, marked removed. */
function* finishDelete(t: ListTracer, removed: string, n: number, why: string) {
  t.closeGaps();
  t.clearPointer('prev');
  t.clearPointer('cur');
  t.setNext(removed, null);
  t.setSummary(summaryOf(n - 1));
  yield t.frame({ note: why, marks: { reject: [removed] }, vars: { result: t.value(removed) } });
}

function* deleteValue(m: ListModel, args: Args): Gen {
  const x = intArg(args, 'value');
  const n = m.items.length;
  const t = tracerFor(m);
  let prev: string | null = null;
  let cur = t.pointer('head');
  const tail = t.pointer('tail');
  t.setPointer('prev', null);
  t.setPointer('cur', cur);
  if (cur) t.count('hops');
  yield t.frame({
    line: 1,
    note: `Search from head for ${x}, with prev one step behind cur: unlinking a node means changing its predecessor's pointer, and nodes only point forwards.`,
    marks: { compare: [cur] },
    vars: { x },
  });
  const passed: string[] = [];
  while (cur) {
    const v = t.value(cur);
    yield t.frame({
      line: 2,
      note: `Compare cur's value, ${v}, with ${x}.`,
      marks: { compare: [cur], visited: passed },
      vars: { x, cur: v },
      checkpoint: { question: `Is this the node to delete?`, choices: YES_NO, answer: v === x ? 0 : 1 },
    });
    if (v === x) break;
    passed.push(cur);
    prev = cur;
    cur = t.next(cur);
    t.setPointer('prev', prev);
    t.setPointer('cur', cur);
    if (cur) t.count('hops');
    yield t.frame({
      line: 3,
      note: `${v} ≠ ${x}, so step forward: prev ← ${v}, cur ← ${cur ? t.value(cur) : 'null'}.`,
      marks: { compare: [cur], visited: passed },
      vars: { x, prev: v, cur: cur ? t.value(cur) : null },
    });
  }
  if (!cur) {
    yield t.frame({
      line: 4,
      note: `cur is null: the end of the list, and no node holds ${x}. Nothing to delete, but ${n === 0 ? 'the list was empty' : `all ${plural(n, 'node')} had to be checked: O(n)`}.`,
      marks: { visited: passed },
      vars: { x, result: 'not found' },
    });
    return m;
  }
  const target = cur;
  const succ = t.next(target);
  t.lift(target);
  if (!prev) {
    t.setPointer('head', succ);
    t.count('links');
    yield t.frame({
      line: 5,
      note: `Found ${x} at the front (prev is null), so head ← cur.next${succ ? ` (${t.value(succ)})` : ' (null)'}. Nothing points at ${x} any more.`,
      marks: { reject: [target] },
      vars: { x },
    });
  } else {
    t.setNext(prev, succ);
    t.count('links');
    yield t.frame({
      line: 6,
      note: `Found ${x}. prev.next ← cur.next: ${t.value(prev)} now points ${succ ? `past ${x}, to ${t.value(succ)}` : 'to null'}, so walking the list skips ${x}.`,
      marks: { reject: [target], visited: passed },
      links: { write: [prev] },
      vars: { x, prev: t.value(prev) },
    });
  }
  if (target === tail) {
    t.setPointer('tail', prev);
    t.count('links');
    yield t.frame({
      line: 7,
      note: prev
        ? `${x} was the last node, so tail ← prev (${t.value(prev)}). This is why deleting the last node is O(n) even with a tail pointer: only a walk finds its predecessor.`
        : `${x} was also the last node, so tail ← prev, which is null: the list is now empty.`,
      marks: { reject: [target] },
      vars: { x },
    });
  }
  const hops = t.stats.hops;
  yield* finishDelete(
    t,
    target,
    n,
    `Removed ${x}: one pointer write to unlink it (O(1)), but ${hopsText(hops)} to find it (O(n)). Nothing points at the node, so its memory can be reclaimed.`,
  );
  return { ...m, items: m.items.filter((it) => it.id !== target) };
}

const deleteAtCode = [
  'deleteAt(i):',
  '  if i ≥ length: error "out of range"',
  '  if i = 0: head ← head.next',
  '  else:',
  '    prev ← head',
  '    repeat i − 1 times: prev ← prev.next',
  '    prev.next ← prev.next.next',
  '  if it was the tail: tail ← prev',
];

function* deleteAt(m: ListModel, args: Args): Gen {
  const i = intArg(args, 'index');
  const n = m.items.length;
  const t = tracerFor(m);
  // disabledReason blocks an index past the end; this only keeps a direct call from walking off the list.
  if (!(i >= 0 && i < n)) return m;
  const question = {
    question: 'Which pointer has to change to unlink the node?',
    ...arrange(i === 0 ? 'The head pointer' : "The previous node's next", [i === 0 ? "The previous node's next" : 'The head pointer', "The removed node's next"], i + n),
  };
  const tail = t.pointer('tail');
  yield t.frame({
    line: 0,
    note: `Delete the node at index ${i}. A linked list can't jump to an index: it follows pointers from the start.`,
    vars: { i, length: n },
    ...(i === 0 && { checkpoint: question }),
  });

  let prev: string | null = null;
  let target: string;
  if (i === 0) {
    target = t.pointer('head')!;
    const succ = t.next(target);
    t.lift(target);
    t.setPointer('head', succ);
    t.count('links');
    yield t.frame({
      line: 2,
      note: `i = 0: head ← head.next, so the list now starts at ${succ ? t.value(succ) : 'null (it is empty)'}. Nothing points at ${t.value(target)} any more.`,
      marks: { reject: [target] },
      vars: { i },
    });
  } else {
    prev = t.pointer('head')!;
    const passed: string[] = [];
    t.setPointer('prev', prev);
    t.count('hops');
    yield t.frame({
      line: 4,
      note: `prev ← head (${t.value(prev)}). prev must stop at index ${i - 1}, just before the node to delete.`,
      marks: { compare: [prev] },
      vars: { i, prev: t.value(prev) },
      ...(i === 1 && { checkpoint: question }),
    });
    for (let k = 1; k < i; k++) {
      passed.push(prev);
      prev = t.next(prev)!;
      t.setPointer('prev', prev);
      t.count('hops');
      yield t.frame({
        line: 5,
        note: `prev ← prev.next (${t.value(prev)}).`,
        marks: { compare: [prev], visited: passed },
        vars: { i, prev: t.value(prev), hops: k },
        ...(k === i - 1 && { checkpoint: question }),
      });
    }
    target = t.next(prev)!;
    const succ = t.next(target);
    t.lift(target);
    t.setNext(prev, succ);
    t.count('links');
    yield t.frame({
      line: 6,
      note: `prev.next ← prev.next.next: ${t.value(prev)} now skips ${t.value(target)} and points at ${succ ? t.value(succ) : 'null'}.`,
      marks: { reject: [target], compare: [prev] },
      links: { write: [prev] },
      vars: { i, prev: t.value(prev) },
    });
  }
  if (target === tail) {
    t.setPointer('tail', prev);
    t.count('links');
    yield t.frame({
      line: 7,
      note: prev ? `The removed node was the tail, so tail ← prev (${t.value(prev)}).` : 'The removed node was the only one, so tail ← null: the list is empty.',
      marks: { reject: [target] },
      vars: { i },
    });
  }
  const hops = t.stats.hops;
  yield* finishDelete(
    t,
    target,
    n,
    i === 0
      ? `Removed ${t.value(target)} with a single pointer write: deleting the head is O(1).`
      : `Removed ${t.value(target)}: ${hopsText(hops)} to reach its predecessor (O(n)), then one pointer write to unlink it.`,
  );
  return { ...m, items: m.items.filter((it) => it.id !== target) };
}

// ───────────────────────────── search ─────────────────────────────

const searchCode = [
  'search(x):',
  '  cur ← head; i ← 0',
  '  while cur ≠ null:',
  '    if cur.value = x: return i',
  '    cur ← cur.next; i ← i + 1',
  '  return −1',
];

function* search(m: ListModel, args: Args): Gen {
  const x = intArg(args, 'value');
  const n = m.items.length;
  const t = tracerFor(m);
  let cur = t.pointer('head');
  t.setPointer('cur', cur);
  if (cur) t.count('hops');
  yield t.frame({ line: 1, note: `Look for ${x}, starting at head. Without indices, the only way through a list is node by node.`, marks: { compare: [cur] }, vars: { x, i: 0 } });
  const passed: string[] = [];
  let i = 0;
  while (cur) {
    const v = t.value(cur);
    yield t.frame({
      line: 3,
      note: `Compare cur's value, ${v}, with ${x}.`,
      marks: { compare: [cur], visited: passed },
      vars: { x, i, cur: v },
      checkpoint: { question: `Does this node hold ${x}?`, choices: YES_NO, answer: v === x ? 0 : 1 },
    });
    if (v === x) {
      yield t.frame({
        line: 3,
        note: `Found ${x} at index ${i}, after looking at ${plural(i + 1, 'node')}. Searching a list is O(n): there is no shortcut to the middle.`,
        marks: { found: [cur], visited: passed },
        vars: { x, i, result: i },
      });
      return m;
    }
    passed.push(cur);
    cur = t.next(cur);
    t.setPointer('cur', cur);
    if (cur) t.count('hops');
    i++;
    yield t.frame({
      line: 4,
      note: `${v} ≠ ${x}: move on to ${cur ? t.value(cur) : 'null'}.`,
      marks: { compare: [cur], visited: passed },
      vars: { x, i, cur: cur ? t.value(cur) : null },
    });
  }
  yield t.frame({
    line: 5,
    note: n === 0 ? `The list is empty, so ${x} isn't in it.` : `cur is null: all ${plural(n, 'node')} checked and ${x} isn't among them. Return −1.`,
    marks: { visited: passed },
    vars: { x, result: -1 },
  });
  return m;
}

// ───────────────────────────── module ─────────────────────────────

const makeList = (values: readonly number[]): ListModel => ({
  items: values.map((value, i) => ({ id: `n${i}`, value })),
  nextId: values.length,
});

const isEmpty = (m: ListModel) => (m.items.length === 0 ? 'The list is empty' : null);
const isFull = (m: ListModel) => (m.items.length >= LIST_MAX ? `The list is full: this demo shows at most ${LIST_MAX} nodes` : null);
/** insertAt may go anywhere from 0 to length (just after the last node). */
const insertable = (m: ListModel, args?: Args) => isFull(m) ?? indexPastEnd(args, m.items.length, 'list', 'node', true);
/** deleteAt needs a node at the index: 0 to length − 1. */
const existing = (m: ListModel, args?: Args) => isEmpty(m) ?? indexPastEnd(args, m.items.length, 'list', 'node');

export const linkedListStructure = defineStructure<ListModel, LinearState>({
  kind: 'structure',
  slug: 'linked-list',
  view: 'linear',
  initial: [
    { id: 'example', label: 'Small example', make: () => makeList([7, 23, 42, 15]) },
    { id: 'empty', label: 'Empty', make: () => makeList([]) },
    { id: 'single', label: 'One node', make: () => makeList([31]) },
    {
      id: 'random',
      label: 'Random',
      make: (seed) => {
        const rng = createRng(seed);
        return makeList(Array.from({ length: 3 + Math.floor(rng() * 4) }, () => Math.floor(rng() * 100)));
      },
    },
  ],
  snapshot: (m) => listSnapshot(m.items, summaryOf(m.items.length)),
  operations: [
    { id: 'insert-head', label: 'Insert at head', args: [VALUE_ARG], pseudocode: insertHeadCode, disabledReason: isFull, run: insertHead },
    { id: 'insert-tail', label: 'Insert at tail', args: [VALUE_ARG], pseudocode: insertTailCode, disabledReason: isFull, run: insertTail },
    { id: 'insert-at', label: 'Insert at', args: [indexArg(LIST_MAX), VALUE_ARG], pseudocode: insertAtCode, disabledReason: insertable, run: insertAt },
    // Deleting a value that isn't there still runs: walking every node to find that out is the O(n) lesson.
    { id: 'delete-value', label: 'Delete value', args: [VALUE_ARG], pseudocode: deleteValueCode, disabledReason: isEmpty, run: deleteValue },
    { id: 'delete-at', label: 'Delete at', args: [indexArg(LIST_MAX - 1)], pseudocode: deleteAtCode, disabledReason: existing, run: deleteAt },
    { id: 'search', label: 'Search', args: [VALUE_ARG], pseudocode: searchCode, disabledReason: isEmpty, run: search },
  ],
  stats: [
    { key: 'hops', label: 'Nodes visited' },
    { key: 'links', label: 'Pointers written' },
  ],
  legend: [
    { neutral: 'Node' },
    { mark: 'key', label: 'New node' },
    { mark: 'compare', label: 'cur / prev: being looked at' },
    { mark: 'visited', label: 'Already walked past' },
    { mark: 'write', label: 'Pointer just written' },
    { mark: 'found', label: 'Found or just linked in' },
    { mark: 'reject', label: 'Unlinked (removed)' },
  ],
  content: {
    idea: 'Each node holds a value and a pointer to the next node, so the list can grow anywhere without moving anything: inserting or removing is a matter of rewiring one or two pointers. The catch is that reaching position i means following i pointers.',
    invariant: 'Following next pointers from head visits every node exactly once and ends at null; tail points at the last node (and head = tail = null when the list is empty).',
    whenToUse: 'When you insert and delete at known positions far more than you index: LRU caches, free lists, adjacency lists, and the chains inside a hash table. For plain sequences an array is usually faster, because its elements sit together in memory.',
    traits: [
      { label: 'O(1) insert at head or tail', good: true },
      { label: 'O(1) unlink once you have the predecessor', good: true },
      { label: 'O(n) to reach index i or search', good: false },
      { label: 'Delete at tail is still O(n) (singly linked)', good: false },
      { label: 'Extra memory per node for the pointer', good: null },
    ],
    experiments: [
      { example: 'example', prompt: 'Insert at index 2 and watch the order of the two pointer writes.' },
      { example: 'single', prompt: 'Delete the only node: head and tail both become null.' },
    ],
  },
});
