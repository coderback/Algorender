import type { Args, OperationSpec } from '@/engine/module';
import { recordOperation } from '@/engine/trace';
import type { Frame } from '@/engine/types';
import { HashTracer, LIVE, type EntryItem } from '@/viz/hash/tracer';
import type { HashState, TableState } from '@/viz/hash/types';
import { YES_NO, bucketChoices, nextPrime, plural, ratio } from './shared';

/**
 * A separate-chaining hash table, shared by the map (hash-table) and the set
 * (hash-set). Bucket b holds, in insertion order, exactly the keys whose hash
 * mod m is b.
 */
export type ChainedModel = { buckets: readonly (readonly EntryItem[])[]; size: number; nextId: number };

export const INITIAL_BUCKETS = 7;
export const MAX_LOAD = 0.75;
/** Enough to trigger a resize (7 → 17 buckets) while every bucket still fits on screen. */
export const MAX_KEYS = 12;
export const CHAINED_STATS = ['compared', 'collisions', 'rehashed', 'resizes'];

const NEW = 'new';
const IN = { holder: 'in' } as const;
const OUT = { holder: 'out' } as const;

/** What differs between the map and the set: how keys hash, read and are named. */
export type Flavor = {
  kind: 'map' | 'set';
  /** The full hash, before mod m. */
  hash: (key: string) => number;
  /** The working that leads to h, e.g. ['h("cat") = 99·31² + 97·31 + 116 = 98262']; empty for whole numbers. */
  hashLines: (key: string) => string[];
  /** How the mod step reads: '98262 mod 7' or 'h(42) = 42 mod 7'. */
  modExpr: (key: string, m: number) => string;
  /** The key as narration shows it: '"cat"' or '42'. */
  show: (key: string) => string;
  /** Why h is what it is, one sentence. */
  hashWhy: (key: string) => string;
  noun: string;
};

type Gen = Generator<Frame<HashState>, ChainedModel>;

export const tableLabel = (m: number) => `Buckets · m = ${m}`;

export function tracerFor(m: ChainedModel, holders = { in: 'adding', out: 'removed' }) {
  return new HashTracer({
    buckets: m.buckets,
    label: tableLabel(m.buckets.length),
    holders: [
      { id: 'in', label: holders.in },
      { id: 'out', label: holders.out },
    ],
    stats: CHAINED_STATS,
    maxLoad: MAX_LOAD,
  });
}

export const emptyChained = (): ChainedModel => ({ buckets: Array.from({ length: INITIAL_BUCKETS }, () => []), size: 0, nextId: 0 });

export const snapshotChained = (m: ChainedModel): TableState => tracerFor(m).frame({ note: '' }).state as TableState;

export const entryLabel = (f: Flavor, e: { key: string; value: number | null }) => (f.kind === 'map' ? `${e.key}: ${e.value}` : e.key);

/**
 * Hashes a key to its bucket in two frames: the hash (with a "which bucket?"
 * question), then the mod that picks the bucket. Returns the bucket.
 */
function* hashToBucket(t: HashTracer, f: Flavor, key: string, opts: { holder?: boolean; bucketQuestion?: Frame<HashState>['checkpoint'] }) {
  const m = t.bucketCount;
  const h = f.hash(key);
  const b = h % m;
  const marks = opts.holder ? { key: [t.holderItem('in')] } : {};
  t.setCalc([...f.hashLines(key), `${f.modExpr(key, m)} = ?`]);
  yield t.frame({
    line: 1,
    note: f.hashWhy(key),
    marks,
    vars: { k: key, h, m },
    checkpoint: { question: `Which bucket does ${f.show(key)} belong in?`, ...bucketChoices(b, m, h) },
  });
  t.setCalc([...f.hashLines(key), `${f.modExpr(key, m)} = ${b}`]);
  yield t.frame({
    line: 1,
    note: `${f.modExpr(key, m)} = ${b}, so ${f.show(key)} belongs in bucket ${b}. The same key always lands in the same bucket, which is how a lookup finds it again.`,
    marks,
    buckets: { compare: [b] },
    vars: { k: key, h, b, m },
    ...(opts.bucketQuestion && { checkpoint: opts.bucketQuestion }),
  });
  return b;
}

/**
 * Walks bucket b's chain comparing keys. Returns the matching entry's id, or
 * null. One frame per comparison.
 */
function* scan(t: HashTracer, f: Flavor, key: string, b: number, line: number, extra: { holder?: boolean; collision?: boolean }) {
  const chain = t.chain(b);
  const passed: string[] = [];
  for (const id of chain) {
    const other = t.entry(id).key;
    t.count('compared');
    const same = other === key;
    const intro = passed.length === 0 && extra.collision ? `Collision: bucket ${b} already holds other keys, so check its chain for ${f.show(key)}. ` : '';
    yield t.frame({
      line,
      note: `${intro}Compare ${f.show(other)} with ${f.show(key)}: ${same ? 'the same key.' : 'different, keep going.'}`,
      marks: { compare: [id], visited: passed, ...(extra.holder && { key: [t.holderItem('in')] }) },
      buckets: { compare: [b] },
      vars: { k: key, b, e: f.show(other) },
    });
    if (same) return id;
    passed.push(id);
  }
  return null;
}

/** Adds or updates a key: hash, scan the chain, append, then resize if the load factor is exceeded. */
export function* insert(f: Flavor, model: ChainedModel, key: string, value: number | null): Gen {
  const t = tracerFor(model, { in: f.kind === 'map' ? `put(${key}, ${value})` : `add(${key})`, out: 'removed' });
  const m = model.buckets.length;
  if (model.size >= MAX_KEYS && !model.buckets.flat().some((e) => e.key === key)) {
    yield t.frame({ line: 0, note: `The demo table already holds ${MAX_KEYS} keys, the most it shows.`, vars: { result: 'error' } });
    return model;
  }
  const item: EntryItem = { id: `e${model.nextId}`, key, value };
  t.place(item, IN);
  const h = f.hash(key);
  const b = h % m;
  const existing = model.buckets[b].find((e) => e.key === key) ?? null;
  const collision = !existing && model.buckets[b].length > 0;

  yield* hashToBucket(t, f, key, {
    holder: true,
    bucketQuestion: existing ? undefined : { question: 'Is this a collision?', choices: YES_NO, answer: collision ? 0 : 1 },
  });
  const found = yield* scan(t, f, key, b, 3, { holder: true, collision });

  if (found) {
    // Updating (map) or already present (set): the stored entry stays where it is,
    // and the key in hand is never stored.
    const old = t.entry(found);
    if (f.kind === 'map') t.setValue(found, value);
    yield t.frame({
      line: 3,
      note:
        f.kind === 'map'
          ? `${f.show(key)} is already stored, so update its value from ${old.value} to ${value}. A map holds each key once.`
          : `${key} is already in the set, so there is nothing to add. A set holds each value once.`,
      marks: f.kind === 'map' ? { write: [found] } : { found: [found] },
      buckets: { compare: [b] },
      vars: { k: key, b, result: f.kind === 'map' ? 'updated' : 'already present' },
    });
    // The new entry was never stored: it was only the key in hand.
    const buckets = model.buckets.map((chain, i) => (i === b && f.kind === 'map' ? chain.map((e) => (e.id === found ? { ...e, value } : e)) : chain));
    return { ...model, buckets };
  }

  const before = model.buckets[b].length;
  t.move(item.id, b);
  if (before > 0) t.count('collisions');
  yield t.frame({
    line: 4,
    note:
      before === 0
        ? `Bucket ${b} is empty: ${f.show(key)} starts its chain. No collision.`
        : `Append ${f.show(key)} to bucket ${b}'s chain, which now holds ${before + 1} keys. Collisions are why each bucket is a chain, not a single slot.`,
    marks: { write: [item.id] },
    buckets: { compare: [b] },
    vars: { k: key, b },
  });

  const size = model.size + 1;
  t.setSize(size);
  const grow = size / m > MAX_LOAD;
  yield t.frame({
    line: 5,
    note: `size goes up to ${size}, with ${m} buckets.`,
    vars: { size, m },
    checkpoint: { question: 'Will the table resize after this insert?', choices: YES_NO, answer: grow ? 0 : 1 },
  });
  yield t.frame({
    line: 6,
    note: grow
      ? `Load factor ${size}/${m} = ${ratio(size, m)} > ${MAX_LOAD}: chains would grow long and lookups slow, so the table grows.`
      : `Load factor ${size}/${m} = ${ratio(size, m)} ≤ ${MAX_LOAD}: chains stay short on average, so no resize is needed.`,
    vars: { size, m, load: Number(ratio(size, m)) },
  });

  let buckets: EntryItem[][] = model.buckets.map((chain, i) => (i === b ? [...chain, item] : [...chain]));
  if (grow) buckets = yield* resize(t, f, buckets, size);
  return { buckets, size, nextId: model.nextId + 1 };
}

/** Moves every key into a table of the next prime above 2m buckets, one frame per key. */
function* resize(t: HashTracer, f: Flavor, buckets: readonly (readonly EntryItem[])[], size: number) {
  const m = buckets.length;
  const M = nextPrime(2 * m);
  t.setCalc([]);
  yield t.frame({
    line: 9,
    note: `M = ${M}, the first prime above 2 × ${m}. Doubling keeps resizes rare; a prime bucket count spreads keys more evenly under mod.`,
    vars: { m, M },
  });
  t.addTable(NEW, `New buckets · m = ${M}`, M);
  t.count('resizes');
  yield t.frame({ line: 10, note: `Allocate ${M} empty buckets.`, vars: { m, M } });

  const next: EntryItem[][] = Array.from({ length: M }, () => []);
  let first = true;
  for (let ob = 0; ob < m; ob++) {
    for (const e of buckets[ob]) {
      const h = f.hash(e.key);
      const nb = h % M;
      next[nb].push(e);
      t.move(e.id, [NEW, nb]);
      t.count('rehashed');
      t.setCalc([`${f.modExpr(e.key, M)} = ${nb}`]);
      yield t.frame({
        line: 12,
        note: `Rehash ${f.show(e.key)}: ${f.modExpr(e.key, M)} = ${nb} (it was in bucket ${ob}).${first ? " Every key has to be placed again, because a key's bucket depends on m." : ''}`,
        marks: { write: [e.id] },
        buckets: { compare: [[NEW, nb]] },
        vars: { k: e.key, old: ob, new: nb, M },
      });
      first = false;
    }
  }
  t.promote(NEW);
  t.setTableLabel(LIVE, tableLabel(M));
  t.setCalc([]);
  yield t.frame({
    line: 13,
    note: `Switch to the new buckets: the load factor drops to ${size}/${M} = ${ratio(size, M)}. Resizing moved all ${plural(size, 'key')} (O(n)), but it happens so rarely that inserting stays O(1) on average.`,
    vars: { size, m: M, load: Number(ratio(size, M)) },
  });
  return next;
}

/** Looks a key up: hash, then scan one chain. */
export function* lookup(f: Flavor, model: ChainedModel, key: string): Gen {
  const t = tracerFor(model);
  const h = f.hash(key);
  const b = h % model.buckets.length;
  const present = model.buckets[b].some((e) => e.key === key);
  yield* hashToBucket(t, f, key, {
    bucketQuestion: { question: `Is ${f.show(key)} in the ${f.noun}?`, choices: YES_NO, answer: present ? 0 : 1 },
  });
  const found = yield* scan(t, f, key, b, 3, {});
  if (found) {
    const e = t.entry(found);
    const compared = t.stats.compared;
    yield t.frame({
      line: 3,
      note: `Found ${f.show(key)}${f.kind === 'map' ? ` with value ${e.value}` : ''} after ${plural(compared, 'comparison')}, all inside bucket ${b}. Hashing skips the other ${model.buckets.length - 1} buckets entirely.`,
      marks: { found: [found] },
      buckets: { compare: [b] },
      vars: { k: key, b, result: f.kind === 'map' ? e.value : true },
    });
  } else {
    yield t.frame({
      line: 4,
      note: `Reached the end of bucket ${b}'s chain: ${f.show(key)} isn't stored. Only this one bucket had to be checked, never the whole ${f.noun}.`,
      buckets: { compare: [b] },
      vars: { k: key, b, result: f.kind === 'map' ? 'not found' : false },
    });
  }
  return model;
}

/** Removes a key: hash, scan, unlink. */
export function* removeKey(f: Flavor, model: ChainedModel, key: string): Gen {
  const t = tracerFor(model);
  const h = f.hash(key);
  const b = h % model.buckets.length;
  yield* hashToBucket(t, f, key, {});
  const found = yield* scan(t, f, key, b, 3, {});
  if (!found) {
    yield t.frame({
      line: 6,
      note: `${f.show(key)} isn't in bucket ${b}'s chain, so it isn't stored and there is nothing to remove.`,
      buckets: { compare: [b] },
      vars: { k: key, b, result: f.kind === 'map' ? 'not found' : false },
    });
    return model;
  }
  t.move(found, OUT);
  yield t.frame({
    line: 4,
    note: `Unlink ${f.show(key)} from bucket ${b}'s chain; the keys after it close up. No other bucket is touched.`,
    marks: { reject: [found] },
    buckets: { compare: [b] },
    vars: { k: key, b },
  });
  const size = model.size - 1;
  t.setSize(size);
  yield t.frame({
    line: 5,
    note: `size is now ${size}. (This table never shrinks; some libraries halve it when it gets sparse.)`,
    marks: { reject: [found] },
    vars: { size, result: f.kind === 'map' ? t.entry(found).value : true },
  });
  return { ...model, buckets: model.buckets.map((chain, i) => (i === b ? chain.filter((e) => e.id !== found) : chain)), size };
}

/** Builds a model by running real inserts, so examples have the same chains (and resizes) the operations would make. */
export function build(spec: OperationSpec<ChainedModel, HashState>, entries: readonly Args[]): ChainedModel {
  return entries.reduce((m, args) => recordOperation(spec.run(m, args)).result, emptyChained());
}

export const keysOf = (m: ChainedModel) => m.buckets.flat();
