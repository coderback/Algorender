import { defineStructure, type Args, type ArgSpec, type OperationSpec } from '@/engine/module';
import { createRng } from '@/engine/random';
import type { Frame, VarValue } from '@/engine/types';
import { cacheGet, cachePut, createCache, has, hitRate, isFull, nextVictim, type CacheEntry, type CacheState, type Policy } from '@/systems/cache';
import type { MarkKey } from '@/viz/marks';
import { GridTracer, type Ref } from '@/viz/grid/tracer';
import type { GridState } from '@/viz/grid/types';

// An LRU (or LFU) cache, driven by get and put. The view shows the two halves
// of the O(1) design: the hash map from key to entry, and the eviction order
// (the recency list for LRU, the use-count lists for LFU), with the capacity
// as a meter. The cache itself is src/systems/cache.ts.

type Model = CacheState<number>;

export const KEY_MAX_LENGTH = 3;

const ORDER = 'order';
const MAP = 'map';
const METER = 'capacity';
const GONE = 'evicted';
const itemId = (key: string) => `k-${key}`;

const getCode = [
  'get(k):',
  '  node ← map[k]',
  '  if node is missing: return miss',
  '  touch(node)',
  '  return node.value',
  '',
  'touch(node):',
  '  LRU: move node to the newest end',
  '  LFU: node.uses ← node.uses + 1;',
  '       move node to list[uses]’s end',
];

const putCode = [
  'put(k, v):',
  '  if k is in map:',
  '    map[k].value ← v; touch(map[k])',
  '    return',
  '  if size = capacity:',
  '    victim ← head of the list (LRU),',
  '      or of the lowest-uses list (LFU)',
  '    remove victim from list and map',
  '  add (k, v) at the newest end',
  '  map[k] ← its node',
];

const policyName = (m: Model) => (m.policy === 'lru' ? 'LRU' : 'LFU');
const pct = (m: Model) => (m.hits + m.misses === 0 ? '–' : `${Math.round(100 * hitRate(m))}%`);
const entryText = (m: Model, e: CacheEntry) => (m.policy === 'lfu' ? `${e.key}=${e.value} ·${e.uses}×` : `${e.key}=${e.value}`);

type Highlight = Partial<Record<MarkKey, readonly string[]>>;

/**
 * One frame of the cache: the eviction order, the hash map and the capacity,
 * with keys highlighted by mark. Built fresh each frame; parts and chips are
 * keyed by key, so entries slide when their place in the order changes.
 */
function render(
  m: Model,
  opts: { note: string; line?: number; marks?: Highlight; evicted?: CacheEntry; vars?: Record<string, VarValue>; checkpoint?: Frame<GridState>['checkpoint'] },
): Frame<GridState> {
  const t = new GridTracer(['hits', 'misses', 'evictions']);
  t.count('hits', m.hits);
  t.count('misses', m.misses);
  t.count('evictions', m.evictions);

  t.addList({
    id: ORDER,
    label: m.policy === 'lru' ? 'Recency list: least recently used first (next to go) → newest' : 'Use-count lists: fewest uses first, oldest first within a count (next to go) → most used',
    empty: 'Empty',
  });
  for (const e of m.entries) t.addItem(ORDER, { id: itemId(e.key), text: entryText(m, e) });

  const byKey = [...m.entries].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  t.addTable({
    id: MAP,
    label: 'Hash map: key → entry',
    corner: 'Key',
    rows: byKey.map((e) => ({ id: itemId(e.key), label: e.key })),
    cols: [{ label: 'Value' }, { label: m.policy === 'lfu' ? 'Uses' : 'Last used' }],
    empty: 'No keys yet',
  });
  byKey.forEach((e, row) => {
    t.set([MAP, row, 0], e.value);
    t.set([MAP, row, 1], m.policy === 'lfu' ? e.uses : `t${e.lastUsed}`);
  });

  t.addMeter({ id: METER, label: `Capacity: ${m.entries.length} of ${m.capacity}`, total: m.capacity, unit: 'entries' });
  for (const e of m.entries) t.addSegment(METER, { id: itemId(e.key), label: e.key, amount: 1 });

  if (opts.evicted) {
    t.addList({ id: GONE, label: 'Just evicted', empty: '' });
    t.addItem(GONE, { id: `gone-${opts.evicted.key}`, text: entryText(m, opts.evicted), mark: 'reject' });
  }

  const marks: Partial<Record<MarkKey, Ref[]>> = {};
  for (const [mark, keys] of Object.entries(opts.marks ?? {}) as [MarkKey, readonly string[]][]) {
    for (const key of keys) {
      if (!m.entries.some((e) => e.key === key)) continue;
      const row = byKey.findIndex((e) => e.key === key);
      (marks[mark] ??= []).push({ item: itemId(key), list: ORDER }, { row, table: MAP }, { segment: itemId(key), meter: METER });
    }
  }
  return t.frame({
    note: opts.note,
    line: opts.line ?? null,
    marks,
    vars: { capacity: m.capacity, size: m.entries.length, 'hit rate': pct(m), ...opts.vars },
    ...(opts.checkpoint && { checkpoint: opts.checkpoint }),
  });
}

/** Why the victim is the victim, in words. */
function victimWhy(m: Model, v: CacheEntry): string {
  if (m.policy === 'lru') return `${v.key} is at the head of the recency list: of everything cached, it was used longest ago`;
  const ties = m.entries.filter((e) => e.uses === v.uses).length;
  return ties > 1
    ? `${v.key} has the fewest uses (${v.uses}), and of the keys tied on ${v.uses}, it was used longest ago`
    : `${v.key} has the fewest uses (${v.uses})`;
}

const KEY_ARG: ArgSpec<Model> = { name: 'key', label: 'Key', type: 'text', maxLength: KEY_MAX_LENGTH, placeholder: 'e.g. D' };
const VALUE_ARG: ArgSpec<Model> = { name: 'value', label: 'Value', type: 'int', min: 0, max: 99, default: 4 };
const keyOf = (args: Args) => String(args.key ?? '').trim();
const badKey = (key: string) => key.length === 0 || key.length > KEY_MAX_LENGTH;

const get: OperationSpec<Model, GridState> = {
  id: 'get',
  label: 'Get',
  args: [KEY_ARG],
  pseudocode: getCode,
  *run(m, args) {
    const key = keyOf(args);
    if (badKey(key)) return m;
    yield render(m, {
      line: 1,
      note: `get(${key}): look ${key} up in the hash map. That is one O(1) step, however many keys are cached.`,
      vars: { key },
      checkpoint: { question: `get(${key}): hit or miss?`, choices: ['Hit', 'Miss'], answer: has(m, key) ? 0 : 1 },
    });
    const r = cacheGet(m, key);
    if (!r.hit) {
      yield render(r.state, {
        line: 2,
        note: `Miss: ${key} isn't cached. A read-through cache would now fetch it from the slower store (a database, a disk) and put it here, which is the cost a high hit rate avoids.`,
        vars: { key },
      });
      return r.state;
    }
    const before = m.entries.find((e) => e.key === key)!;
    yield render(r.state, {
      line: m.policy === 'lru' ? 7 : 8,
      marks: { found: [key] },
      note:
        m.policy === 'lru'
          ? `Hit: ${key} = ${r.value}. Touching it unlinks its node and relinks it at the newest end of the recency list: a few pointer changes, O(1).`
          : `Hit: ${key} = ${r.value}. Its uses go from ${before.uses} to ${before.uses + 1}, so its node moves to the end of the list for ${before.uses + 1} uses, O(1).`,
      vars: { key, value: r.value ?? '–' },
    });
    return r.state;
  },
};

const put: OperationSpec<Model, GridState> = {
  id: 'put',
  label: 'Put',
  args: [KEY_ARG, VALUE_ARG],
  pseudocode: putCode,
  *run(m, args) {
    const key = keyOf(args);
    if (badKey(key)) return m;
    const value = Number(args.value);
    const evicting = !has(m, key) && isFull(m);
    const victim = nextVictim(m);
    const keys = m.entries.map((e) => e.key).sort();
    yield render(m, {
      line: 1,
      note: `put(${key}, ${value}): first, look ${key} up in the hash map.`,
      vars: { key, value },
      ...(evicting && keys.length > 1 && victim && { checkpoint: { question: `put(${key}): which key is evicted to make room?`, choices: keys, answer: keys.indexOf(victim.key) } }),
    });

    if (has(m, key)) {
      const r = cachePut(m, key, value);
      yield render(r.state, {
        line: 2,
        marks: { write: [key] },
        note: `${key} is already cached: change its value to ${value} and count this as a use, ${m.policy === 'lru' ? 'so it moves to the newest end' : 'so its use count goes up'}. Nothing is evicted.`,
        vars: { key, value },
      });
      return r.state;
    }

    if (evicting && victim) {
      yield render(m, {
        line: 7,
        marks: { reject: [victim.key] },
        note: `The cache is full (${m.capacity} of ${m.capacity}), so one entry must go: ${victimWhy(m, victim)}. Remove it from the ${m.policy === 'lru' ? 'list' : 'lists'} and from the map, both O(1).`,
        vars: { key, value, victim: victim.key },
      });
    }

    const r = cachePut(m, key, value);
    yield render(r.state, {
      line: 8,
      marks: { write: [key] },
      evicted: r.evicted ?? undefined,
      note: `Add ${key} = ${value} at the newest end${m.policy === 'lfu' ? ' of the list for 1 use' : ''}, and point map[${key}] at its node. ${r.state.entries.length} of ${m.capacity} places are used.`,
      vars: { key, value },
    });
    return r.state;
  },
};

/** Builds a starting cache from a script of puts and gets. */
function build(policy: Policy, capacity: number, script: readonly (readonly [string, number?])[]): Model {
  let m = createCache<number>(policy, capacity);
  for (const [key, value] of script) m = value == null ? cacheGet(m, key).state : cachePut(m, key, value).state;
  return m;
}

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

function random(seed: number): Model {
  const rng = createRng(seed);
  const policy: Policy = rng() < 0.5 ? 'lru' : 'lfu';
  const capacity = 3 + Math.floor(rng() * 2);
  const script: [string, number?][] = [];
  for (let i = 0; i < 8; i++) {
    const key = LETTERS[Math.floor(rng() * LETTERS.length)];
    script.push(rng() < 0.6 ? [key, Math.floor(rng() * 100)] : [key]);
  }
  return build(policy, capacity, script);
}

export const lruCacheStructure = defineStructure<Model, GridState>({
  kind: 'structure',
  slug: 'lru-cache',
  view: 'grid',
  initial: [
    { id: 'lru-warm', label: 'LRU, 3 slots, full', make: () => build('lru', 3, [['A', 1], ['B', 2], ['C', 3], ['A']]) },
    { id: 'lfu-warm', label: 'LFU, 3 slots, full', make: () => build('lfu', 3, [['A', 1], ['B', 2], ['C', 3], ['A'], ['A'], ['B']]) },
    { id: 'lru-empty', label: 'LRU, 4 slots, empty', make: () => build('lru', 4, []) },
    { id: 'lfu-empty', label: 'LFU, 4 slots, empty', make: () => build('lfu', 4, []) },
    { id: 'random', label: 'Random', make: random },
  ],
  snapshot: (m) => render(m, { note: `An ${policyName(m)} cache with room for ${m.capacity} entries.` }).state,
  operations: [get, put],
  stats: [
    { key: 'hits', label: 'Hits' },
    { key: 'misses', label: 'Misses' },
    { key: 'evictions', label: 'Evictions' },
  ],
  legend: [
    { neutral: 'Cached entry' },
    { mark: 'found', label: 'Hit' },
    { mark: 'write', label: 'Just stored or updated' },
    { mark: 'reject', label: 'Evicted' },
  ],
  content: {
    idea: 'A cache keeps a few recently useful answers close, so most requests skip the slow trip to a database or disk. When it is full, the eviction policy decides what goes: LRU drops the entry used longest ago, LFU the one used least often.',
    invariant: 'The hash map and the eviction order always hold the same keys, at most capacity of them, and the head of the order is the next to go: the least recently used (LRU), or the least used and oldest among those (LFU).',
    whenToUse: 'In front of anything slow: database queries, web pages (CDNs, browsers), DNS lookups, memory pages and CPU caches. LRU is the default; LFU suits stable hot sets that a one-off scan shouldn’t flush. Both run in O(1) per request with a hash map and linked lists.',
    traits: [
      { label: 'O(1) get and put', good: true },
      { label: 'LRU is flushed by one-off scans', good: false },
      { label: 'LFU can cling to keys that were hot long ago', good: false },
      { label: 'Hit rate is what speeds things up', good: null },
    ],
    experiments: [
      { example: 'lru-warm', prompt: 'Put D: the cache is full and B was used longest ago, so B goes. Then get B: a miss.' },
      { example: 'lfu-warm', prompt: 'Put D: C has been used only once, so LFU evicts it, though A and B were put before it.' },
      { example: 'lru-empty', prompt: 'Put A to E, then get A: it was evicted when E arrived. Getting A before putting E would have saved it.' },
    ],
  },
});
