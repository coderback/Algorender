import { defineAlgorithm, type InputSpec } from '@/engine/module';
import type { Checkpoint, Frame } from '@/engine/types';
import { SearchTracer, type SearchCall } from '@/viz/tree/search';
import type { TableRow, TreeState } from '@/viz/tree/types';

export type ItemsInput = { items: readonly string[] };

export const MAX_SUBSET_ITEMS = 5;

export const pseudocode = [
  'subsets(items):',
  '  sort items   (copies side by side)',
  '  explore(0)   (cur starts empty)',
  '',
  'explore(i):',
  '  if i = n:',
  '    record a copy of cur;  return',
  '  cur.push(items[i])   (choose)',
  '  explore(i + 1)',
  '  cur.pop()   (un-choose)',
  '  j ← i + 1',
  '  while j < n and items[j] = items[i]:',
  '    j ← j + 1   (skip its copies)',
  '  explore(j)   (leave items[i] out)',
];

const L = { sort: 1, start: 2, record: 6, choose: 7, unchoose: 9, copies: 12, skip: 13 } as const;

/** "{a, b}", or "∅" for the empty set. */
export const setText = (items: readonly string[]) => (items.length ? `{${items.join(', ')}}` : '∅');

/**
 * Reads items typed as "a b c", "a, b, c" or "abc": every letter or digit is
 * one item. Returns them in the order typed.
 */
export function parseItems(text: string, max: number, distinct: boolean): { value: ItemsInput } | { error: string } {
  const chars = [...text.toLowerCase().replace(/[\s,;]+/g, '')];
  if (chars.length === 0) return { error: 'Enter at least one item, e.g. a b c.' };
  const bad = chars.find((c) => !/^[a-z0-9]$/.test(c));
  if (bad) return { error: `"${bad}" is not a letter or digit. Use single letters or digits, e.g. a b c.` };
  if (chars.length > max) return { error: `Use at most ${max} items: the tree doubles with every item.` };
  if (distinct && new Set(chars).size !== chars.length) return { error: 'Use different items: a repeated item would list the same order twice.' };
  return { value: { items: chars } };
}

/** A call of explore(i), worked out before the search is replayed. */
type Call = {
  id: string;
  parent: Call | null;
  /** The item this call decides (n at a leaf). */
  i: number;
  /** Indexes taken so far, in order. */
  cur: readonly number[];
  /** How it was reached: taking items[parent.i], or leaving it (and `copies` − 1 copies) out. */
  via: 'root' | 'take' | 'skip';
  copies: number;
  take: Call | null;
  skip: Call | null;
};

/** The whole decision tree, take branch first, exactly as explore() walks it. */
function decisionTree(items: readonly string[]): Call[] {
  const n = items.length;
  const calls: Call[] = [];
  const make = (i: number, cur: readonly number[], parent: Call | null, via: Call['via'], copies: number): Call => {
    const call: Call = { id: `s${calls.length}`, parent, i, cur, via, copies, take: null, skip: null };
    calls.push(call);
    if (i < n) {
      call.take = make(i + 1, [...cur, i], call, 'take', 1);
      let j = i + 1;
      while (j < n && items[j] === items[i]) j++;
      call.skip = make(j, cur, call, 'skip', j - i);
    }
    return call;
  };
  make(0, [], null, 'root', 0);
  return calls;
}

const sortItems = (items: readonly string[]) => [...items].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

/** Every subset the search records, in its order: the reference for tests and the final note. */
export function subsetsInOrder(input: readonly string[]): string[][] {
  const items = sortItems(input);
  return decisionTree(items)
    .filter((c) => c.i === items.length)
    .map((c) => c.cur.map((k) => items[k]));
}

/** "Which subset is recorded next?": the right one plus near misses, in reading order. */
function subsetQuestion(answer: readonly string[], near: readonly (readonly string[])[]): Checkpoint {
  const seen = new Map<string, readonly string[]>();
  for (const s of [answer, ...near]) if (!seen.has(setText(s))) seen.set(setText(s), s);
  const sets = [...seen.values()].slice(0, 4).sort((a, b) => {
    for (let k = 0; k < Math.min(a.length, b.length); k++) if (a[k] !== b[k]) return a[k] < b[k] ? -1 : 1;
    return a.length - b.length;
  });
  const choices = sets.map(setText);
  return { question: 'Which subset is recorded next?', choices, answer: choices.indexOf(setText(answer)) };
}

const NOTHING = 'Nothing: the search is over';

function* run({ items: input }: ItemsInput): Generator<Frame<TreeState>> {
  const items = sortItems(input);
  const n = items.length;
  const calls = decisionTree(items);
  const leaves = calls.filter((c) => c.i === n).length;
  const show = (cur: readonly number[]) => setText(cur.map((k) => items[k]));
  const nodes: SearchCall[] = calls.map((c) => {
    const item = c.parent ? items[c.parent.i] : '';
    const edge =
      c.via === 'take' ? { edgeLabel: `+${item}`, edgeGlyph: '+' } : c.via === 'skip' ? { edgeLabel: c.copies > 1 ? `−${item}×${c.copies}` : `−${item}`, edgeGlyph: '−' } : {};
    return {
      id: c.id,
      parent: c.parent?.id ?? null,
      name: c.i === n ? `leaf ${show(c.cur)}` : `cur ${show(c.cur)} deciding ${items[c.i]}`,
      ...edge,
    };
  });
  const t = new SearchTracer(nodes, `Decision tree for ${items.join(', ')}`, ['calls', 'recorded', 'copies']);
  const recorded: string[] = [];
  const output = () => ({ label: 'Subsets recorded', items: [...recorded] });

  /** The items row (taken, deciding, skipped copies) and cur as a stack. */
  const table = (call: Call): TableRow[] => [
    { id: 'items', label: 'items', cells: items.map((item, k) => ({ id: `it${k}`, label: item })) },
    { id: 'cur', label: 'cur', cells: items.map((_, k) => ({ id: `cur${k}`, label: k < call.cur.length ? items[call.cur[k]] : '' })) },
  ];
  const itemMarks = (call: Call, extra: { reject?: number[] } = {}) => ({
    write: call.cur.map((k) => `it${k}`),
    key: call.i < n ? [`it${call.i}`] : [],
    reject: (extra.reject ?? []).map((k) => `it${k}`),
  });
  const vars = (call: Call) => ({ i: call.i, 'items[i]': call.i < n ? items[call.i] : '—', cur: show(call.cur), recorded: recorded.length });

  /** Asked on the frame before a leaf: which subset will it record? */
  const nextRecord = (call: Call, branch: 'take' | 'skip'): Checkpoint | undefined => {
    const child = call[branch]!;
    if (child.i !== n) return undefined;
    const cur = call.cur.map((k) => items[k]);
    const x = items[call.i];
    const withX = [...cur, x];
    const near = branch === 'take' ? [cur, [...cur.slice(0, -1), x], cur.slice(0, -1)] : [withX, cur.slice(0, -1), [...cur.slice(0, -1), x]];
    return subsetQuestion(branch === 'take' ? withX : cur, near);
  };

  /** Asked as a subset is recorded: which choice does the search undo next? */
  const nextUndo = (leaf: Call): Checkpoint => {
    let deepestTake: Call | null = null;
    const decided: string[] = [];
    for (let c: Call = leaf; c.parent; c = c.parent) {
      decided.push(items[c.parent.i]);
      if (c.via === 'take' && !deepestTake) deepestTake = c.parent;
    }
    const answer = deepestTake ? items[deepestTake.i] : null;
    const letters = [...new Set(decided)];
    const picked = letters.slice(0, 3);
    if (answer && !picked.includes(answer)) picked[picked.length - 1] = answer;
    const choices = [...picked.sort().map((l) => `Un-choose ${l}`), NOTHING];
    return { question: 'Which choice does the search undo next?', choices, answer: answer ? choices.indexOf(`Un-choose ${answer}`) : choices.length - 1 };
  };

  /** Arriving at a call: a leaf records cur, any other call starts deciding its item. */
  function* arrive(call: Call): Generator<Frame<TreeState>, void> {
    t.reveal(call.id);
    t.count('calls');
    t.setTable(table(call));
    const parent = call.parent!;
    const x = items[parent.i];
    const how =
      call.via === 'take'
        ? `Take ${x}: push it onto cur`
        : call.copies > 1
          ? `Leave out every ${x} (all ${call.copies} copies)`
          : `Leave ${x} out: cur stays as it is`;
    if (call.i === n) {
      recorded.push(show(call.cur));
      t.count('recorded');
      t.settle(call.id, 'found');
      yield t.frame({
        line: L.record,
        note: `${how}. No items are left to decide, so record a copy of cur, ${show(call.cur)}: subset ${recorded.length} of ${leaves}.`,
        at: call.id,
        marks: itemMarks(call),
        output: output(),
        vars: vars(call),
        checkpoint: nextUndo(call),
      });
      return;
    }
    yield t.frame({
      line: call.via === 'take' ? L.choose : L.skip,
      note: `${how}${call.via === 'take' ? `, so cur = ${show(call.cur)}` : ''}. Recurse to decide items[${call.i}] = ${items[call.i]}.`,
      at: call.id,
      marks: itemMarks(call),
      output: output(),
      vars: vars(call),
      checkpoint: nextRecord(call, 'take'),
    });
  }

  function* explore(call: Call): Generator<Frame<TreeState>, void> {
    if (call.i === n) return;
    const x = items[call.i];
    yield* arrive(call.take!);
    yield* explore(call.take!);

    t.setTable(table(call));
    const copies = call.skip!.copies;
    yield t.frame({
      line: L.unchoose,
      note: `The branch that takes items[${call.i}] = ${x} is finished: un-choose it by popping it off cur, which is now exactly as it was before. Next, the branch that leaves it out.`,
      at: call.id,
      marks: itemMarks(call),
      output: output(),
      vars: vars(call),
      ...(copies === 1 && { checkpoint: nextRecord(call, 'skip') }),
    });
    if (copies > 1) {
      const skipped = Array.from({ length: copies - 1 }, (_, k) => call.i + 1 + k);
      t.count('copies', skipped.length);
      yield t.frame({
        line: L.copies,
        note: `items[${call.i + 1}] is another ${x}. Leaving ${x} out must leave out its copies too: a subset with just a later copy is one the take-${x} branch has already recorded.`,
        at: call.id,
        marks: itemMarks(call, { reject: skipped }),
        output: output(),
        vars: { ...vars(call), j: call.skip!.i },
        checkpoint: nextRecord(call, 'skip'),
      });
    }
    yield* arrive(call.skip!);
    yield* explore(call.skip!);
    t.settle(call.id, 'visited');
  }

  const root = calls[0];
  const dupes = new Set(items).size < n;
  t.count('calls');
  t.setTable(table(root));
  yield t.frame({
    line: L.sort,
    note: dupes
      ? `Sort the items: ${items.join(', ')}. Copies of an item now sit side by side, so the search can skip all of them at once when it leaves that item out.`
      : `Sort the items: ${items.join(', ')}. Each item gets one decision, take it or leave it out, and the search always tries taking first.`,
    at: root.id,
    vars: { n },
  });
  yield t.frame({
    line: L.start,
    note: `Start at the root, the call explore(0), with cur empty. Its decision is about ${items[0]}.`,
    at: root.id,
    marks: itemMarks(root),
    output: output(),
    vars: vars(root),
    checkpoint: nextRecord(root, 'take'),
  });
  yield* explore(root);
  t.setTable(table(root));
  const all = 2 ** n;
  yield t.frame({
    line: L.start,
    note: dupes
      ? `Done: ${recorded.length} distinct subsets. Without skipping copies the tree would have 2^${n} = ${all} leaves, and ${all - recorded.length} of them would repeat a subset.`
      : `Done: all 2^${n} = ${all} subsets, each recorded once. Every item doubled the count, because each one is either in a subset or not.`,
    at: root.id,
    output: output(),
    vars: { n, recorded: recorded.length },
  });
}

const custom: NonNullable<InputSpec<ItemsInput>['custom']> = {
  label: `Items (up to ${MAX_SUBSET_ITEMS} letters or digits; repeats allowed)`,
  placeholder: 'e.g. a b c',
  parse: (text) => parseItems(text, MAX_SUBSET_ITEMS, false),
  format: ({ items }) => items.join(' '),
};

const of = (...items: string[]): ItemsInput => ({ items });

export const subsets = defineAlgorithm<ItemsInput, TreeState>({
  kind: 'algorithm',
  slug: 'subsets',
  view: 'tree',
  input: {
    examples: [
      { id: 'three', label: 'a, b, c', make: () => of('a', 'b', 'c') },
      { id: 'four', label: 'a, b, c, d', make: () => of('a', 'b', 'c', 'd') },
      { id: 'duplicates', label: 'a, a, b (a repeat)', make: () => of('a', 'a', 'b') },
      { id: 'five', label: 'a to e (32 subsets)', make: () => of('a', 'b', 'c', 'd', 'e') },
    ],
    custom,
  },
  pseudocode,
  stats: [
    { key: 'calls', label: 'Calls' },
    { key: 'recorded', label: 'Subsets recorded' },
    { key: 'copies', label: 'Copies skipped' },
  ],
  legend: [
    { neutral: 'Waiting on the call stack; item not taken' },
    { mark: 'key', label: 'Current call and the item it decides' },
    { mark: 'write', label: 'Taken: in cur' },
    { mark: 'reject', label: 'Copy skipped' },
    { mark: 'visited', label: 'Every subset below is done' },
    { mark: 'found', label: 'Subset recorded' },
  ],
  run,
  content: {
    idea: 'Build every subset by making one decision per item: take it or leave it out. Each decision splits the search in two, so n items give a decision tree with 2ⁿ leaves, one per subset. The code chooses (push), explores, then un-chooses (pop) before trying the other branch, so a single list, cur, serves the whole search. Taking is always tried first, so the full set is recorded first and the empty set last.',
    invariant: 'A call deciding item i holds in cur exactly the items taken among the first i, and every leaf below it adds some choice of the remaining items. Un-choosing restores cur, so both branches start from the same state and no subset is recorded twice.',
    whenToUse:
      'Any "try every combination" problem: the power set, combination sums, picking a team, brute-force feature selection. The output alone is exponential (n·2ⁿ to copy every subset), so it suits small n, usually with pruning that abandons a branch as soon as it cannot work. If items repeat, sort them and leave out every copy at once, so each distinct subset appears exactly once.',
    traits: [
      { label: 'Every subset exactly once', good: true },
      { label: 'n·2ⁿ time: exponential', good: false },
      { label: 'O(n) extra space: one list plus the call stack', good: true },
    ],
    experiments: [
      { example: 'three', prompt: 'Read the leaves left to right, + as 1 and − as 0: they count down in binary from 111 to 000.' },
      { example: 'duplicates', prompt: 'Leaving out the first a also leaves out the second. Count the leaves: 6, not 8, and no subset twice.' },
      { example: 'four', prompt: 'Before each subset is recorded, predict which one it is. Then predict which choice the search undoes next.' },
    ],
  },
});
