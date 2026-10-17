import { defineAlgorithm, type InputSpec } from '@/engine/module';
import type { Checkpoint, Frame } from '@/engine/types';
import { SearchTracer, type SearchCall } from '@/viz/tree/search';
import type { TableRow, TreeState } from '@/viz/tree/types';
import { parseItems, type ItemsInput } from './subsets';

/**
 * Five items would mean 120 leaves and 326 calls: far too many to read on a
 * phone, even sideways. Four (24 leaves) is the most this view draws legibly.
 */
export const MAX_PERMUTATION_ITEMS = 4;

export const pseudocode = [
  'permutations(items):',
  '  cur ← empty;  nothing used;  permute()',
  '',
  'permute():',
  '  if cur has all n items:',
  '    record a copy of cur;  return',
  '  for each item x, in order:',
  '    if x is used: skip it',
  '    mark x used;  cur.push(x)  (choose)',
  '    permute()',
  '    cur.pop();  unmark x   (un-choose)',
];

const L = { start: 1, record: 5, choose: 8, unchoose: 10 } as const;

/** A call of permute(), worked out before the search is replayed. */
type Call = { id: string; parent: Call | null; cur: readonly number[]; children: Call[] };

/** The whole choose-unchoose tree: each call's children are the unused items, in order. */
function permutationTree(n: number): Call[] {
  const calls: Call[] = [];
  const make = (cur: readonly number[], parent: Call | null): Call => {
    const call: Call = { id: `p${calls.length}`, parent, cur, children: [] };
    calls.push(call);
    for (let k = 0; k < n; k++) if (!cur.includes(k)) call.children.push(make([...cur, k], call));
    return call;
  };
  make([], null);
  return calls;
}

/** Every order the search records, in its order: the reference for tests. */
export function permutationsInOrder(items: readonly string[]): string[][] {
  return permutationTree(items.length)
    .filter((c) => c.cur.length === items.length)
    .map((c) => c.cur.map((k) => items[k]));
}

const factorial = (k: number): number => (k <= 1 ? 1 : k * factorial(k - 1));
const NONE = 'None: go back up';

/** "a and c", "a, b and d". */
const listed = (words: readonly string[]) => (words.length <= 1 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`);

function* run({ items }: ItemsInput): Generator<Frame<TreeState>> {
  const n = items.length;
  const calls = permutationTree(n);
  const total = factorial(n);
  const show = (cur: readonly number[]) => (cur.length ? cur.map((k) => items[k]).join(', ') : 'empty');
  const nodes: SearchCall[] = calls.map((c) => ({
    id: c.id,
    parent: c.parent?.id ?? null,
    ...(c.parent && { label: items[c.cur[c.cur.length - 1]] }),
    name: c.parent ? `${c.cur.length === n ? 'order' : 'cur'} ${show(c.cur)}` : 'start, cur empty',
  }));
  const t = new SearchTracer(nodes, `Permutation tree for ${items.join(', ')}`, ['calls', 'recorded', 'skips']);
  const recorded: string[] = [];
  const output = () => ({ label: 'Orders recorded', items: [...recorded] });

  const table = (call: Call): TableRow[] => [
    { id: 'items', label: 'items', cells: items.map((item, k) => ({ id: `it${k}`, label: item })) },
    { id: 'cur', label: 'cur', cells: items.map((_, k) => ({ id: `pos${k}`, label: k < call.cur.length ? items[call.cur[k]] : '' })) },
  ];
  const itemMarks = (call: Call, picked?: number) => ({ write: call.cur.map((k) => `it${k}`), key: picked == null ? [] : [`it${picked}`] });
  const vars = (call: Call) => ({ position: Math.min(call.cur.length + 1, n), cur: show(call.cur), used: call.cur.length, recorded: recorded.length });

  /**
   * "Which item is tried next?": the answer, tempting wrong items (the one just
   * freed, a used one), other free items, in item order, and optionally "none".
   */
  const nextTry = (question: string, answer: number | null, tempting: readonly number[], free: readonly number[], none: boolean): Checkpoint => {
    const picks = [...new Set([...(answer == null ? [] : [answer]), ...tempting, ...free])].slice(0, none ? 3 : 4).sort((a, b) => a - b);
    const choices = [...picks.map((k) => items[k]), ...(none ? [NONE] : [])];
    return { question, choices, answer: answer == null ? choices.length - 1 : choices.indexOf(items[answer]) };
  };

  /** "How many orders will this subtree record?" */
  const howMany = (left: number): Checkpoint => {
    const answer = factorial(left);
    const others = [...new Set([left, left + 1, 2 ** left, factorial(left + 1), 1])].filter((v) => v !== answer).slice(0, 3);
    const choices = [answer, ...others].sort((a, b) => a - b).map(String);
    return { question: 'How many orders will this subtree record?', choices, answer: choices.indexOf(String(answer)) };
  };

  function* permute(call: Call): Generator<Frame<TreeState>, void> {
    if (call.cur.length === n) return;
    const position = call.cur.length + 1;
    // Children are the free items in item order, so the items between two picks are all used.
    let from = 0;
    for (let c = 0; c < call.children.length; c++) {
      const child = call.children[c];
      const x = child.cur[child.cur.length - 1];
      const skipped = Array.from({ length: x - from }, (_, k) => from + k);
      t.count('skips', skipped.length);
      t.reveal(child.id);
      t.count('calls');
      t.setTable(table(child));
      const skipText = skipped.length ? `${listed(skipped.map((k) => items[k]))} ${skipped.length === 1 ? 'is' : 'are'} used, so the loop skips ${skipped.length === 1 ? 'it' : 'them'}. ` : '';
      if (child.cur.length === n) {
        recorded.push(child.cur.map((k) => items[k]).join(''));
        t.count('recorded');
        t.settle(child.id, 'found');
        yield t.frame({
          line: L.record,
          note: `${skipText}Place ${items[x]}, the only item left, in position ${position}. cur = ${show(child.cur)} holds all ${n} items, so record a copy: order ${recorded.length} of ${total}.`,
          at: child.id,
          marks: itemMarks(child, x),
          output: output(),
          vars: vars(child),
        });
      } else {
        const left = n - child.cur.length;
        const firstFree = [...Array(n).keys()].find((k) => !child.cur.includes(k))!;
        const used = child.cur.filter((k) => k !== x);
        const checkpoint =
          left < 2
            ? undefined
            : call.parent == null && c === 0
              ? howMany(left)
              : nextTry(
                  `Which item goes in position ${position + 1} first?`,
                  firstFree,
                  [Math.min(...child.cur), x],
                  [...Array(n).keys()].filter((k) => !child.cur.includes(k)),
                  false,
                );
        yield t.frame({
          line: L.choose,
          note: `${skipText}Choose ${items[x]} for position ${position}: mark it used and push it, so cur = ${show(child.cur)}. ${used.length ? '' : 'Every other item is still free. '}Recurse to fill position ${position + 1}.`,
          at: child.id,
          marks: itemMarks(child, x),
          output: output(),
          vars: vars(child),
          ...(checkpoint && { checkpoint }),
        });
      }
      yield* permute(child);

      t.setTable(table(call));
      const next = call.children[c + 1];
      const nextItem = next ? next.cur[next.cur.length - 1] : null;
      const free = [...Array(n).keys()].filter((k) => !call.cur.includes(k));
      const below = factorial(n - child.cur.length);
      yield t.frame({
        line: L.unchoose,
        note: `Back from the ${items[x]} branch${below > 1 ? `, which recorded ${below} orders` : ''}: pop ${items[x]} and unmark it, so it is free again for a later position.`,
        at: call.id,
        marks: itemMarks(call),
        output: output(),
        vars: vars(call),
        checkpoint: nextTry(`Which item does the loop for position ${position} try next?`, nextItem, [x], free, true),
      });
      from = x + 1;
    }
    // The loop runs on past the last free item, skipping the used ones.
    t.count('skips', n - from);
    t.settle(call.id, 'visited');
  }

  const root = calls[0];
  t.count('calls');
  t.setTable(table(root));
  yield t.frame({
    line: L.start,
    note: `List every order of ${items.join(', ')}: fill one position at a time with an unused item, trying items in the order given. When a branch is finished, undo the choice so the next item can take that position.`,
    at: root.id,
    marks: itemMarks(root),
    output: output(),
    vars: vars(root),
  });
  yield* permute(root);
  t.setTable(table(root));
  const product = Array.from({ length: n }, (_, k) => n - k).join(' × ');
  yield t.frame({
    line: L.start,
    note: `Done: ${n}! = ${n > 1 ? `${product} = ` : ''}${total} orders, each recorded once. Position 1 had ${n} choices, and each later position one fewer.`,
    at: root.id,
    output: output(),
    vars: { n, recorded: recorded.length },
  });
}

const custom: NonNullable<InputSpec<ItemsInput>['custom']> = {
  label: `Items (up to ${MAX_PERMUTATION_ITEMS} different letters or digits)`,
  placeholder: 'e.g. a b c',
  parse: (text) => parseItems(text, MAX_PERMUTATION_ITEMS, true),
  format: ({ items }) => items.join(' '),
};

const of = (...items: string[]): ItemsInput => ({ items });

export const permutations = defineAlgorithm<ItemsInput, TreeState>({
  kind: 'algorithm',
  slug: 'permutations',
  view: 'tree',
  input: {
    examples: [
      { id: 'three', label: 'a, b, c', make: () => of('a', 'b', 'c') },
      { id: 'four', label: 'a, b, c, d (24 orders)', make: () => of('a', 'b', 'c', 'd') },
      { id: 'digits', label: '1, 2, 3', make: () => of('1', '2', '3') },
    ],
    custom,
  },
  pseudocode,
  stats: [
    { key: 'calls', label: 'Calls' },
    { key: 'recorded', label: 'Orders recorded' },
    { key: 'skips', label: 'Used items skipped' },
  ],
  legend: [
    { neutral: 'Waiting on the call stack; item free' },
    { mark: 'key', label: 'Current call: the item just placed' },
    { mark: 'write', label: 'Used: already in cur' },
    { mark: 'visited', label: 'Every order below is done' },
    { mark: 'found', label: 'Order recorded' },
  ],
  run,
  content: {
    idea: 'List every ordering by filling positions one at a time: pick an item that is not used yet, recurse to fill the rest, then un-choose it (pop it and mark it free) and try the next unused item. Position 1 has n choices, position 2 has n − 1, and so on, so the tree has n × (n − 1) × … × 1 = n! leaves, one per order.',
    invariant: 'cur never repeats an item, and the used marks always match exactly the items in cur. Un-choosing restores both, so every branch starts from the same state, and trying items in the given order records the orders in dictionary order.',
    whenToUse:
      'Trying every ordering: brute-force travelling salesman for a handful of cities, seating and scheduling puzzles, anagrams, testing code on every input order. n! explodes (10! is 3.6 million), so real uses prune hard or switch to dynamic programming or heuristics. This view stops at 4 items: 5 would mean 120 leaves, too many to read on a phone.',
    traits: [
      { label: 'Every order exactly once', good: true },
      { label: 'n! leaves: worse than exponential', good: false },
      { label: 'Orders come out in dictionary order', good: null },
    ],
    experiments: [
      { example: 'three', prompt: 'After each un-choose, predict which item the loop tries next: it carries on after the item it just undid.' },
      { example: 'four', prompt: 'Before the a subtree is explored, predict how many orders it holds. Every first choice leaves 3 items.' },
      { example: 'digits', prompt: 'Read the recorded orders as numbers: 123, 132, 213… They come out in increasing order.' },
    ],
  },
});
