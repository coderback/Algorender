import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { blockedReason, parseOps, replay } from '@/components/explorer/operations';
import type { AnyStructure, Args } from '@/engine/module';
import { recordOperation } from '@/engine/trace';
import type { Frame } from '@/engine/types';
import type { BloomState, HashState, TableState } from '@/viz/hash/types';
import { hashStructures } from '.';
import { BLOOM_BITS, BLOOM_K, DEFINITELY_NOT, PROBABLY, positionsOf, type BloomModel } from './bloom-filter';
import { INITIAL_BUCKETS, MAX_KEYS, MAX_LOAD, type ChainedModel } from './chained';
import { nextPrime, polyHash } from './shared';

/* eslint-disable @typescript-eslint/no-explicit-any -- models are opaque to the generic checks */
type Model = any;

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

const bySlug = (slug: string) => hashStructures.find((d) => d.slug === slug)!;
const op = (ds: AnyStructure, id: string) => ds.operations.find((o) => o.id === id)!;
const run = (ds: AnyStructure, id: string, model: Model, args: Args) => recordOperation(op(ds, id).run(model, args));

const WORDS = ['cat', 'dog', 'owl', 'emu', 'fox', 'bee', 'ant', 'yak', 'cow', 'pig', 'hen', 'elk', 'bat', 'ram', 'eel', 'gnu', 'a', 'zz', 'kiwi', 'lemon'];

// ───────────────────────────── generic frame checks ─────────────────────────────

function idsIn(state: HashState): string[] {
  if (state.type === 'bloom') return [];
  const ids = [...state.tables.flatMap((t) => t.buckets.flat()), ...state.holders.flatMap((h) => (h.item ? [h.item] : []))];
  expect(new Set(ids).size).toBe(ids.length);
  for (const id of ids) expect(state.entries[id]).toBeDefined();
  return ids;
}

function checkFrames(ds: AnyStructure, opId: string, frames: Frame<HashState>[]) {
  const spec = op(ds, opId);
  const statKeys = ds.stats.map((s) => s.key).sort();
  expect(frames.length).toBeGreaterThan(0);
  let prevStats: Record<string, number> = {};
  let prevIds: Set<string> | null = null;
  frames.forEach((frame, i) => {
    expect(frame.note.trim().length).toBeGreaterThan(0);
    if (frame.line != null) {
      expect(frame.line).toBeGreaterThanOrEqual(0);
      expect(frame.line).toBeLessThan(spec.pseudocode.length);
      expect(spec.pseudocode[frame.line].trim()).not.toBe('');
    }
    expect(Object.keys(frame.stats).sort()).toEqual(statKeys);
    for (const [k, v] of Object.entries(frame.stats)) expect(v).toBeGreaterThanOrEqual(prevStats[k] ?? 0);
    prevStats = frame.stats;

    // Keys never vanish or duplicate mid-operation (a removed key waits in a holder).
    const ids = new Set(idsIn(frame.state));
    if (prevIds) for (const id of prevIds) expect(ids.has(id)).toBe(true);
    prevIds = ids;

    const c = frame.checkpoint;
    if (c) {
      expect(c.choices.length).toBeGreaterThanOrEqual(2);
      expect(new Set(c.choices).size).toBe(c.choices.length);
      expect(c.answer).toBeGreaterThanOrEqual(0);
      expect(c.answer).toBeLessThan(c.choices.length);
      expect(i).toBeLessThan(frames.length - 1);
      if (c.choices[c.answer].length > 3) expect(frame.note).not.toContain(c.choices[c.answer]);
    }
  });
}

// ───────────────────────────── chained tables ─────────────────────────────

/** The model's own invariants: chains hold exactly the keys that hash there, once each, under the load limit. */
function checkChained(m: ChainedModel, hash: (key: string) => number) {
  const size = m.buckets.length;
  expect([INITIAL_BUCKETS, nextPrime(2 * INITIAL_BUCKETS)]).toContain(size);
  const keys = m.buckets.flat().map((e) => e.key);
  expect(new Set(keys).size).toBe(keys.length);
  expect(m.size).toBe(keys.length);
  expect(m.size / size).toBeLessThanOrEqual(MAX_LOAD);
  m.buckets.forEach((chain, b) => chain.forEach((e) => expect(hash(e.key) % size).toBe(b)));
  const ids = m.buckets.flat().map((e) => e.id);
  expect(new Set(ids).size).toBe(ids.length);
}

/** The trace ends showing exactly the returned model. */
function checkFinal(state: HashState, m: ChainedModel) {
  const s = state as TableState;
  expect(s.tables).toHaveLength(1);
  expect(s.tables[0].buckets).toEqual(m.buckets.map((c) => c.map((e) => e.id)));
  for (const e of m.buckets.flat()) expect(s.entries[e.id]).toEqual({ key: e.key, value: e.value });
  expect(s.size).toBe(m.size);
  expect(s.buckets).toBe(m.buckets.length);
}

/**
 * What the reference says about one call. `disabled`: the model alone rules
 * it out (disabledReason with no arguments). `blocked`: the explorer won't run
 * it with these arguments. They differ on a full table, where only a key that
 * is already stored may be put.
 */
type Step = { result?: unknown; disabled?: boolean; blocked?: boolean };

type MapCase = {
  slug: string;
  hash: (key: string) => number;
  keyArb: fc.Arbitrary<Args>;
  toRef: (m: ChainedModel) => Map<string, number | null>;
  /** Applies one op to the reference (unless blocked); returns the expected `result` var and whether it's disabled or blocked. */
  step: (id: string, args: Args, ref: Map<string, number | null>) => Step;
};

/** On a full table only a stored key may be put or added; the model-only check reports the limit either way. */
const full = (ref: Map<string, unknown>, key: string): Step | null =>
  ref.size < MAX_KEYS ? null : ref.has(key) ? { disabled: true } : { disabled: true, blocked: true };

const mapCase: MapCase = {
  slug: 'hash-table',
  hash: (k) => polyHash(k),
  keyArb: fc.record({ key: fc.constantFrom(...WORDS), value: fc.nat({ max: 99 }) }),
  toRef: (m) => new Map(m.buckets.flat().map((e) => [e.key, e.value])),
  step(id, args, ref) {
    const key = String(args.key);
    switch (id) {
      case 'put': {
        const limit = full(ref, key);
        if (limit?.blocked) return limit;
        ref.set(key, Number(args.value));
        return { ...limit, result: limit ? 'updated' : undefined };
      }
      case 'get':
        if (ref.size === 0) return { disabled: true, blocked: true };
        return { result: ref.has(key) ? ref.get(key) : 'not found' };
      case 'delete': {
        if (ref.size === 0) return { disabled: true, blocked: true };
        const result = ref.has(key) ? ref.get(key) : 'not found';
        ref.delete(key);
        return { result };
      }
    }
    throw new Error(id);
  },
};

const setCase: MapCase = {
  slug: 'hash-set',
  hash: (k) => Number(k),
  keyArb: fc.record({ value: fc.oneof(fc.nat({ max: 24 }), fc.nat({ max: 99 })) }),
  toRef: (m) => new Map(m.buckets.flat().map((e) => [e.key, null])),
  step(id, args, ref) {
    const key = String(args.value);
    switch (id) {
      case 'add': {
        const limit = full(ref, key);
        if (limit?.blocked) return limit;
        ref.set(key, null);
        return { ...limit, result: limit ? 'already present' : undefined };
      }
      case 'contains':
        if (ref.size === 0) return { disabled: true, blocked: true };
        return { result: ref.has(key) };
      case 'remove': {
        if (ref.size === 0) return { disabled: true, blocked: true };
        const result = ref.has(key);
        ref.delete(key);
        return { result };
      }
    }
    throw new Error(id);
  },
};

describe.each([mapCase, setCase])('$slug', (c) => {
  const ds = bySlug(c.slug);

  it('builds every initial example with valid chains', () => {
    for (const start of ds.initial) {
      for (const seed of [0, 1, 7, 42, 999]) {
        const model = start.make(seed) as ChainedModel;
        checkChained(model, c.hash);
        checkFinal(ds.snapshot(model) as HashState, model);
      }
    }
  });

  it('matches a reference Map/Set on random operations, never mutating its input', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: ds.initial.length - 1 }),
        fc.nat({ max: 10_000 }),
        fc.array(fc.record({ op: fc.nat({ max: ds.operations.length - 1 }), args: c.keyArb }), { maxLength: 30 }),
        (startIndex, seed, ops) => {
          let model = deepFreeze(ds.initial[startIndex].make(seed) as ChainedModel);
          const ref = c.toRef(model);
          for (const { op: k, args } of ops) {
            const spec = ds.operations[k];
            const expected = c.step(spec.id, args, ref);
            expect(spec.disabledReason?.(model) != null).toBe(expected.disabled === true);
            const reason = blockedReason(ds, model, { op: spec.id, args });
            expect(reason != null).toBe(expected.blocked === true);
            if (reason) continue;

            const before = JSON.stringify(model);
            const { frames, result } = recordOperation(spec.run(model, args));
            expect(JSON.stringify(model)).toBe(before);
            checkFrames(ds, spec.id, frames as Frame<HashState>[]);
            for (const f of frames) expect(f.vars.result).not.toBe('error'); // allowed calls never reach an error path
            if (expected.result !== undefined) expect(frames.at(-1)!.vars.result).toBe(expected.result);

            const next = result as ChainedModel;
            checkChained(next, c.hash);
            expect(c.toRef(next)).toEqual(ref);
            checkFinal(frames.at(-1)!.state as HashState, next);
            model = deepFreeze(next);
          }
        },
      ),
      { numRuns: 120 },
    );
  });

  it('resizes from 7 to 17 buckets when the load factor passes 0.75, moving every key', () => {
    const start = ds.initial.find((s) => s.id === 'nearly-full')!.make(0) as ChainedModel;
    expect(start.buckets).toHaveLength(7);
    expect(start.size).toBe(5);
    const args: Args = c.slug === 'hash-table' ? { key: 'zz', value: 1 } : { value: 99 };
    const { frames, result } = run(ds, ds.operations[0].id, start, args);
    expect((result as ChainedModel).buckets).toHaveLength(17);
    expect(frames.at(-1)!.stats.resizes).toBe(1);
    expect(frames.at(-1)!.stats.rehashed).toBe(6);
    expect(frames.some((f) => (f.state as TableState).tables.length === 2)).toBe(true);
    const question = frames.find((f) => f.checkpoint?.question.startsWith('Will the table resize'))!;
    expect(question.checkpoint!.choices[question.checkpoint!.answer]).toBe('Yes');
  });

  it('asks which bucket a key goes to, and the next frame reveals it', () => {
    const start = ds.initial[0].make(0) as ChainedModel;
    const args: Args = c.slug === 'hash-table' ? { key: 'cat', value: 4 } : { value: 30 };
    const { frames } = run(ds, ds.operations[1].id, start, args);
    const i = frames.findIndex((f) => f.checkpoint?.question.startsWith('Which bucket'));
    expect(i).toBeGreaterThanOrEqual(0);
    const key = String(args.key ?? args.value);
    const bucket = c.hash(key) % start.buckets.length;
    expect(frames[i].checkpoint!.choices[frames[i].checkpoint!.answer]).toBe(String(bucket));
    expect((frames[i + 1].state as TableState).bucketMarks[`live:${bucket}`]).toBe('compare');
  });
});

describe('hash-table specifics', () => {
  const ds = bySlug('hash-table');
  it('h("cat") is the real polynomial hash', () => {
    expect(polyHash('cat')).toBe(99 * 31 ** 2 + 97 * 31 + 116);
  });
  it('the collisions example chains three keys in one bucket', () => {
    const m = ds.initial.find((s) => s.id === 'collisions')!.make(0) as ChainedModel;
    expect(Math.max(...m.buckets.map((c) => c.length))).toBe(3);
  });
  it('blocks keys that are blank or too long before anything runs', () => {
    const m = ds.initial[0].make(0);
    for (const op of ['put', 'get', 'delete']) {
      expect(blockedReason(ds, m, { op, args: { key: '   ', value: 1 } })).toMatch(/1–6 characters/);
      expect(blockedReason(ds, m, { op, args: { key: 'giraffe', value: 1 } })).toMatch(/1–6 characters/);
      expect(blockedReason(ds, m, { op, args: { key: ' cat ', value: 1 } })).toBeNull(); // trimmed
    }
  });

  it('on a full table blocks only new keys: an existing key can still be updated', () => {
    const fill = WORDS.slice(0, MAX_KEYS);
    const m = fill.reduce((model, key, i) => run(ds, 'put', model, { key, value: i }).result as ChainedModel, ds.initial.find((s) => s.id === 'empty')!.make(0));
    expect(m.size).toBe(MAX_KEYS);
    expect(op(ds, 'put').disabledReason!(m)).toMatch(/at most 12 keys/); // nothing typed yet
    expect(blockedReason(ds, m, { op: 'put', args: { key: 'kiwi', value: 1 } })).toMatch(/at most 12 keys: put a key it already has/);
    expect(blockedReason(ds, m, { op: 'put', args: { key: 'cat', value: 77 } })).toBeNull();
    const { frames, result } = run(ds, 'put', m, { key: 'cat', value: 77 });
    expect(frames.at(-1)!.vars.result).toBe('updated');
    expect((result as ChainedModel).buckets.flat().find((e) => e.key === 'cat')!.value).toBe(77);
  });

  it('URL replay stops at the first new key a full table can’t take', () => {
    const puts = WORDS.slice(0, MAX_KEYS).map((key, i) => `put:${key}:${i}`);
    const calls = parseOps([...puts, 'put:kiwi:1', 'put:cat:2'].join(';'), ds);
    const { model, applied } = replay(ds, ds.initial.find((s) => s.id === 'empty')!.make(0), calls);
    expect(applied).toHaveLength(MAX_KEYS);
    expect((model as ChainedModel).size).toBe(MAX_KEYS);
  });

  it('get and delete of a missing key still run: one chain is walked to show it is absent', () => {
    const m = ds.initial.find((s) => s.id === 'collisions')!.make(0);
    for (const id of ['get', 'delete']) {
      expect(blockedReason(ds, m, { op: id, args: { key: 'zebra' } })).toBeNull();
      const { frames, result } = run(ds, id, m, { key: 'zebra' });
      expect(result).toBe(m);
      expect(frames.at(-1)!.vars.result).toBe('not found');
    }
  });
});

describe('hash-set specifics', () => {
  const ds = bySlug('hash-set');
  it('on a full set blocks only new values: adding a stored one still runs and finds it', () => {
    const m = Array.from({ length: MAX_KEYS }, (_, i) => i * 3).reduce(
      (model, value) => run(ds, 'add', model, { value }).result as ChainedModel,
      ds.initial.find((s) => s.id === 'empty')!.make(0),
    );
    expect(m.size).toBe(MAX_KEYS);
    expect(blockedReason(ds, m, { op: 'add', args: { value: 1 } })).toMatch(/at most 12 values/);
    expect(blockedReason(ds, m, { op: 'add', args: { value: 3 } })).toBeNull();
    const { frames, result } = run(ds, 'add', m, { value: 3 });
    expect(result).toEqual(m);
    expect(frames.at(-1)!.vars.result).toBe('already present');
  });
});

// ───────────────────────────── Bloom filter ─────────────────────────────

describe('bloom-filter', () => {
  const ds = bySlug('bloom-filter');
  const itemArb = fc.oneof(fc.constantFrom(...WORDS), fc.string({ minLength: 1, maxLength: 6 }).filter((s) => s.trim() === s && s.length > 0));

  const bitsFor = (items: readonly string[]) => {
    const bits = Array<number>(BLOOM_BITS).fill(0);
    for (const item of items) for (const p of positionsOf(item)) bits[p] = 1;
    return bits;
  };

  it('builds every initial example consistently', () => {
    for (const start of ds.initial) {
      for (const seed of [0, 3, 99]) {
        const m = start.make(seed) as BloomModel;
        expect(m.bits).toEqual(bitsFor(m.added));
        expect((ds.snapshot(m) as BloomState).bits).toEqual(m.bits);
      }
    }
  });

  it('never gives a false negative, and only labels never-added items as false positives', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: ds.initial.length - 1 }),
        fc.array(fc.record({ add: fc.boolean(), item: itemArb }), { maxLength: 30 }),
        (startIndex, ops) => {
          let model = deepFreeze(ds.initial[startIndex].make(1) as BloomModel);
          const truth = new Set(model.added);
          for (const { add, item } of ops) {
            const spec = op(ds, add ? 'add' : 'test');
            expect(spec.disabledReason?.(model) ?? null).toBeNull();
            expect(blockedReason(ds, model, { op: spec.id, args: { item } })).toBeNull(); // a Bloom filter never fills up
            const before = JSON.stringify(model);
            const { frames, result } = recordOperation(spec.run(model, { item }));
            expect(JSON.stringify(model)).toBe(before);
            checkFrames(ds, spec.id, frames as Frame<HashState>[]);
            const next = result as BloomModel;
            const last = frames.at(-1)!;
            if (add) {
              truth.add(item);
            } else {
              const allSet = positionsOf(item).every((p) => model.bits[p] === 1);
              if (truth.has(item)) {
                expect(last.vars.result).toBe('probably present'); // no false negatives
                expect(last.vars.falsePositive).toBeUndefined();
                expect(next.negatives).toBe(model.negatives);
              } else {
                expect(last.vars.result).toBe(allSet ? 'probably present' : 'definitely not');
                expect(last.vars.falsePositive === true).toBe(allSet);
                expect(next.negatives).toBe(model.negatives + 1);
                expect(next.falsePositives).toBe(model.falsePositives + (allSet ? 1 : 0));
              }
              // The prediction question has the right answer.
              const q = frames.find((f) => f.checkpoint)!.checkpoint!;
              expect(q.choices[q.answer]).toBe(allSet ? PROBABLY : DEFINITELY_NOT);
            }
            expect([...next.added].sort()).toEqual([...truth].sort());
            expect(next.bits).toEqual(bitsFor(next.added));
            expect((last.state as BloomState).bits).toEqual(next.bits);
            expect(last.stats.hashes).toBe(BLOOM_K);
            model = deepFreeze(next);
          }
        },
      ),
      { numRuns: 150 },
    );
  });

  it('blocks blank or over-long items before anything runs', () => {
    const m = ds.initial[0].make(0);
    for (const id of ['add', 'test']) {
      expect(blockedReason(ds, m, { op: id, args: { item: '  ' } })).toMatch(/1–6 characters/);
      expect(blockedReason(ds, m, { op: id, args: { item: 'giraffe' } })).toMatch(/1–6 characters/);
    }
  });

  it('the crowded example produces at least one false positive among common words', () => {
    const m = ds.initial.find((s) => s.id === 'crowded')!.make(0) as BloomModel;
    const fps = WORDS.filter((w) => !m.added.includes(w)).filter((w) => recordOperation(op(ds, 'test').run(m, { item: w })).frames.at(-1)!.vars.falsePositive);
    expect(fps.length).toBeGreaterThan(0);
  });
});

describe.each(hashStructures)('$slug module', (ds) => {
  it('is on the hash view, with short pseudo-code lines and experiments pointing at real examples', () => {
    expect(ds.view).toBe('hash');
    for (const spec of ds.operations) for (const line of spec.pseudocode) expect(line.length).toBeLessThanOrEqual(42);
    for (const x of ds.content.experiments) expect(ds.initial.map((s) => s.id)).toContain(x.example);
  });

  it('has a legend that starts with a neutral row and lists exactly the marks its frames use', () => {
    expect(ds.legend[0]).toHaveProperty('neutral');
    const legendMarks = ds.legend.flatMap((e) => (typeof e === 'string' ? [e] : 'mark' in e ? [e.mark] : []));
    const used = new Set<string>();
    for (const start of ds.initial) {
      const model = start.make(2);
      for (const spec of ds.operations) {
        if (spec.disabledReason?.(model)) continue;
        for (const key of ['cat', 'cow', 'pig', 'zz']) {
          for (const value of [3, 10, 24]) {
            for (const frame of recordOperation(spec.run(model, { key, item: key, value })).frames) {
              const s = frame.state as HashState;
              if (s.type === 'bloom') {
                for (const m of Object.values(s.bitMarks)) used.add(m);
                if (s.verdict) used.add(s.verdict.mark);
              } else {
                for (const m of [...Object.values(s.marks), ...Object.values(s.bucketMarks)]) used.add(m);
              }
            }
          }
        }
      }
    }
    expect([...used].sort()).toEqual([...new Set(legendMarks)].sort());
  });
});

it('registers the three hash structures', () => {
  expect(hashStructures.map((d) => d.slug)).toEqual(['hash-table', 'hash-set', 'bloom-filter']);
});
