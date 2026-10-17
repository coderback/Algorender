import { defineStructure, type Args, type ArgSpec, type OperationSpec } from '@/engine/module';
import { createRng } from '@/engine/random';
import type { HashState } from '@/viz/hash/types';
import { MAX_KEYS, build, emptyChained, insert, lookup, noRoom, removeKey, snapshotChained, type ChainedModel, type Flavor } from './chained';

const flavor: Flavor = {
  kind: 'set',
  hash: (key) => Number(key),
  hashLines: () => [],
  modExpr: (key, m) => `h(${key}) = ${key} mod ${m}`,
  show: (key) => key,
  hashWhy: (key) => `Hash ${key}: for whole numbers the hash can simply be the number itself, so its bucket is ${key} mod m.`,
  noun: 'set',
};

const KEY_ARG: ArgSpec = { name: 'value', label: 'Value', type: 'int', min: 0, max: 99, default: 10 };
const keyOf = (args: Args) => String(Math.trunc(Number(args.value)));

const addCode = [
  'add(k):',
  '  b ← hash(k) mod m',
  '  for each key e in bucket[b]:',
  '    if e = k: return (already in)',
  '  append k to bucket[b]',
  '  size ← size + 1',
  '  if size / m > 0.75: resize()',
  '',
  'resize():',
  '  M ← next prime above 2m',
  '  new ← M empty buckets',
  '  for each key e (old buckets):',
  '    add e to new[hash(e) mod M]',
  '  buckets ← new; m ← M',
];
const containsCode = ['contains(k):', '  b ← hash(k) mod m', '  for each key e in bucket[b]:', '    if e = k: return true', '  return false'];
const removeCode = [
  'remove(k):',
  '  b ← hash(k) mod m',
  '  for each key e in bucket[b]:',
  '    if e = k:',
  '      unlink e from bucket[b]',
  '      size ← size − 1; return',
  '  return false',
];

const add: OperationSpec<ChainedModel, HashState> = {
  id: 'add',
  label: 'Add',
  args: [KEY_ARG],
  pseudocode: addCode,
  // Adding a value that is already in a full set still runs: the walk finds it and adds nothing.
  disabledReason: (m, args) => noRoom(m, args ? keyOf(args) : null, `The demo set holds at most ${MAX_KEYS} values`),
  run: (m, args) => insert(flavor, m, keyOf(args), null),
};

const isEmpty = (m: ChainedModel) => (m.size === 0 ? 'The set is empty' : null);
const values = (keys: number[]) => keys.map((value) => ({ value }));

export const hashSetStructure = defineStructure<ChainedModel, HashState>({
  kind: 'structure',
  slug: 'hash-set',
  view: 'hash',
  initial: [
    { id: 'example', label: 'Small example', make: () => build(add, values([12, 7, 23])) },
    { id: 'collisions', label: 'With collisions', make: () => build(add, values([3, 10, 9, 17])) },
    { id: 'nearly-full', label: 'One add from resizing', make: () => build(add, values([4, 9, 15, 20, 28])) },
    { id: 'empty', label: 'Empty', make: emptyChained },
    {
      id: 'random',
      label: 'Random',
      make: (seed) => {
        const rng = createRng(seed);
        return build(add, values(Array.from({ length: 3 + Math.floor(rng() * 3) }, () => Math.floor(rng() * 100))));
      },
    },
  ],
  snapshot: snapshotChained,
  operations: [
    add,
    { id: 'contains', label: 'Contains', args: [KEY_ARG], pseudocode: containsCode, disabledReason: isEmpty, run: (m, args) => lookup(flavor, m, keyOf(args)) },
    { id: 'remove', label: 'Remove', args: [KEY_ARG], pseudocode: removeCode, disabledReason: isEmpty, run: (m, args) => removeKey(flavor, m, keyOf(args)) },
  ],
  stats: [
    { key: 'compared', label: 'Keys compared' },
    { key: 'collisions', label: 'Collisions' },
    { key: 'rehashed', label: 'Keys rehashed' },
    { key: 'resizes', label: 'Resizes' },
  ],
  legend: [
    { neutral: 'Stored value' },
    { mark: 'key', label: 'Value being added' },
    { mark: 'compare', label: 'Bucket or value being checked' },
    { mark: 'visited', label: 'Already compared' },
    { mark: 'write', label: 'Just stored or moved' },
    { mark: 'found', label: 'Found' },
    { mark: 'reject', label: 'Removed' },
  ],
  content: {
    idea: 'A hash table that stores keys without values: k mod m picks a bucket, so asking "is k in the set?" means checking one short chain instead of every value.',
    invariant: "Bucket b's chain holds exactly the stored values with value mod m = b, each value at most once, and size / m stays at or below 0.75.",
    whenToUse: "Membership tests and de-duplication: seen-before checks, visited sets in graph search, unique visitors. Python's set and Java's HashSet are hash tables like this one.",
    traits: [
      { label: 'O(1) average add, contains, remove', good: true },
      { label: 'Each value stored once', good: null },
      { label: 'O(n) worst case if everything collides', good: false },
      { label: 'No ordering', good: false },
    ],
    experiments: [
      { example: 'collisions', prompt: 'Add 24: 3, 10 and 17 are already in bucket 3, and 24 mod 7 is 3 as well.' },
      { example: 'nearly-full', prompt: 'Add one more value: the set grows to 17 buckets and every value is rehashed.' },
    ],
  },
});
