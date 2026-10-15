import { defineStructure, type Args, type ArgSpec, type OperationSpec } from '@/engine/module';
import { createRng } from '@/engine/random';
import type { HashState } from '@/viz/hash/types';
import {
  MAX_KEYS,
  build,
  emptyChained,
  insert,
  lookup,
  noRoom,
  removeKey,
  snapshotChained,
  type ChainedModel,
  type Flavor,
} from './chained';
import { polyHash, polyTerms } from './shared';

export const KEY_MAX_LENGTH = 6;

const flavor: Flavor = {
  kind: 'map',
  hash: (key) => polyHash(key),
  hashLines: (key) => [`h("${key}") = ${polyTerms(key)}${key.length > 1 ? ` = ${polyHash(key)}` : ''}`],
  modExpr: (key, m) => `${polyHash(key)} mod ${m}`,
  show: (key) => `"${key}"`,
  hashWhy: (key) =>
    key.length > 1
      ? `Hash "${key}": read its character codes as the digits of a base-31 number, so every character (and its position) changes h.`
      : `Hash "${key}": a one-character key hashes to its character code.`,
  noun: 'table',
};

const KEY_ARG: ArgSpec = { name: 'key', label: 'Key', type: 'text', maxLength: KEY_MAX_LENGTH, placeholder: 'key, e.g. cat' };
const VALUE_ARG: ArgSpec = { name: 'value', label: 'Value', type: 'int', min: 0, max: 99, default: 5 };

/**
 * Text keys are trimmed and must be 1–6 characters. The key argument's own
 * limits enforce that before an operation runs, so a bad key here can only
 * come from a direct call, which then changes nothing.
 */
const keyOf = (args: Args) => String(args.key ?? '').trim();
const badKey = (key: string) => key.length === 0 || key.length > KEY_MAX_LENGTH;

const putCode = [
  'put(k, v):',
  '  b ← hash(k) mod m',
  '  for each entry e in bucket[b]:',
  '    if e.key = k: e.value ← v; return',
  '  append (k, v) to bucket[b]',
  '  size ← size + 1',
  '  if size / m > 0.75: resize()',
  '',
  'resize():',
  '  M ← next prime above 2m',
  '  new ← M empty buckets',
  '  for each entry e (old buckets):',
  '    add e to new[hash(e.key) mod M]',
  '  buckets ← new; m ← M',
];
const getCode = ['get(k):', '  b ← hash(k) mod m', '  for each entry e in bucket[b]:', '    if e.key = k: return e.value', '  return "not found"'];
const deleteCode = [
  'delete(k):',
  '  b ← hash(k) mod m',
  '  for each entry e in bucket[b]:',
  '    if e.key = k:',
  '      unlink e from bucket[b]',
  '      size ← size − 1; return',
  '  return "not found"',
];

const put: OperationSpec<ChainedModel, HashState> = {
  id: 'put',
  label: 'Put',
  args: [KEY_ARG, VALUE_ARG],
  pseudocode: putCode,
  disabledReason: (m, args) => noRoom(m, args ? keyOf(args) : null, `The demo table holds at most ${MAX_KEYS} keys: put a key it already has to update its value`),
  *run(m, args) {
    const key = keyOf(args);
    if (badKey(key)) return m;
    return yield* insert(flavor, m, key, Number(args.value));
  },
};

const isEmpty = (m: ChainedModel) => (m.size === 0 ? 'The table is empty' : null);

const WORDS = ['cat', 'dog', 'owl', 'emu', 'fox', 'bee', 'ant', 'yak', 'cow', 'pig', 'hen', 'elk', 'bat', 'ram', 'eel', 'gnu'];
const entries = (pairs: [string, number][]) => pairs.map(([key, value]) => ({ key, value }));

export const hashTableStructure = defineStructure<ChainedModel, HashState>({
  kind: 'structure',
  slug: 'hash-table',
  view: 'hash',
  initial: [
    { id: 'example', label: 'Small example', make: () => build(put, entries([['cat', 3], ['dog', 7], ['owl', 5]])) },
    { id: 'collisions', label: 'With collisions', make: () => build(put, entries([['cat', 3], ['ant', 1], ['dog', 7], ['yak', 8]])) },
    {
      id: 'nearly-full',
      label: 'One put from resizing',
      make: () => build(put, entries([['cat', 3], ['dog', 7], ['bat', 5], ['gnu', 2], ['hen', 9]])),
    },
    { id: 'empty', label: 'Empty', make: emptyChained },
    {
      id: 'random',
      label: 'Random',
      make: (seed) => {
        const rng = createRng(seed);
        const pool = [...WORDS];
        const n = 3 + Math.floor(rng() * 3);
        const pairs: [string, number][] = [];
        for (let i = 0; i < n; i++) pairs.push([pool.splice(Math.floor(rng() * pool.length), 1)[0], Math.floor(rng() * 100)]);
        return build(put, entries(pairs));
      },
    },
  ],
  snapshot: snapshotChained,
  operations: [
    put,
    {
      id: 'get',
      label: 'Get',
      args: [KEY_ARG],
      pseudocode: getCode,
      disabledReason: isEmpty,
      *run(m, args) {
        const key = keyOf(args);
        if (badKey(key)) return m;
        return yield* lookup(flavor, m, key);
      },
    },
    {
      id: 'delete',
      label: 'Delete',
      args: [KEY_ARG],
      pseudocode: deleteCode,
      disabledReason: isEmpty,
      *run(m, args) {
        const key = keyOf(args);
        if (badKey(key)) return m;
        return yield* removeKey(flavor, m, key);
      },
    },
  ],
  stats: [
    { key: 'compared', label: 'Keys compared' },
    { key: 'collisions', label: 'Collisions' },
    { key: 'rehashed', label: 'Keys rehashed' },
    { key: 'resizes', label: 'Resizes' },
  ],
  legend: [
    { neutral: 'Stored key: value' },
    { mark: 'key', label: 'Key being put' },
    { mark: 'compare', label: 'Bucket or key being checked' },
    { mark: 'visited', label: 'Already compared' },
    { mark: 'write', label: 'Just stored, updated or moved' },
    { mark: 'found', label: 'Found' },
    { mark: 'reject', label: 'Removed' },
  ],
  content: {
    idea: 'Turn each key into a number (its hash), and use hash mod m to pick one of m buckets. A lookup only searches that one bucket, so finding a key takes about the same time however many keys are stored.',
    invariant: "Bucket b's chain holds exactly the keys whose hash mod m is b, each key at most once, and the load factor size / m stays at or below 0.75.",
    whenToUse: 'Whenever you look things up by key: dictionaries, caches, counting, de-duplicating, symbol tables. Python dict, Java HashMap and JavaScript Map all work like this. Use a sorted tree instead if you need keys in order.',
    traits: [
      { label: 'O(1) average put, get, delete', good: true },
      { label: 'O(n) worst case if everything collides', good: false },
      { label: 'Occasional O(n) resize', good: null },
      { label: 'No ordering of keys', good: false },
    ],
    experiments: [
      { example: 'collisions', prompt: 'Get "yak": it shares bucket 3 with "cat" and "ant", so the chain is searched key by key.' },
      { example: 'nearly-full', prompt: 'Put one more key: the load factor passes 0.75 and every key moves to one of 17 new buckets.' },
    ],
  },
});
