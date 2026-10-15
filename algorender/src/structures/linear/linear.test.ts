import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { AnyStructure, Args } from '@/engine/module';
import { recordOperation } from '@/engine/trace';
import type { Frame } from '@/engine/types';
import type { LinearState, ListState, SlotsState } from '@/viz/linear/types';
import { linearStructures } from '.';
import { ARRAY_MAX, type DynamicArray } from './array';
import { LIST_MAX, type ListModel } from './linked-list';
import { RING_CAPACITY, ringValues, type RingModel } from './ring';
import { STACK_CAPACITY, type StackModel } from './stack';

/* eslint-disable @typescript-eslint/no-explicit-any -- models are opaque to the generic checks */
type Model = any;

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

/** What the reference implementation says an operation does. */
type Expect = { values: number[]; result?: number | string; disabled?: boolean; error?: boolean };

type Adapter = {
  values: (m: Model) => number[];
  step: (op: string, args: Args, values: number[]) => Expect;
  /** Structural invariants of the model itself. */
  check: (m: Model) => void;
};

const idx = (args: Args) => Number(args.index);
const val = (args: Args) => Number(args.value);

const adapters: Record<string, Adapter> = {
  array: {
    values: (m: DynamicArray) => m.items.map((i) => i.value),
    step(op, args, v) {
      const n = v.length;
      const i = idx(args);
      switch (op) {
        case 'get':
          if (n === 0) return { values: v, disabled: true };
          return i < n ? { values: v, result: v[i] } : { values: v, error: true };
        case 'set':
          if (n === 0) return { values: v, disabled: true };
          return i < n ? { values: v.map((x, k) => (k === i ? val(args) : x)) } : { values: v, error: true };
        case 'append':
          return n >= ARRAY_MAX ? { values: v, disabled: true } : { values: [...v, val(args)] };
        case 'insert':
          if (n >= ARRAY_MAX) return { values: v, disabled: true };
          return i <= n ? { values: [...v.slice(0, i), val(args), ...v.slice(i)] } : { values: v, error: true };
        case 'delete':
          if (n === 0) return { values: v, disabled: true };
          return i < n ? { values: v.filter((_, k) => k !== i), result: v[i] } : { values: v, error: true };
      }
      throw new Error(op);
    },
    check(m: DynamicArray) {
      expect(m.capacity).toBeGreaterThanOrEqual(Math.max(4, m.items.length));
      expect(Math.log2(m.capacity) % 1).toBe(0);
      expect(m.capacity).toBeLessThanOrEqual(ARRAY_MAX);
      expect(m.copied).toBeLessThan(2 * Math.max(1, m.added));
    },
  },
  stack: {
    values: (m: StackModel) => m.items.map((i) => i.value),
    step(op, args, v) {
      const n = v.length;
      switch (op) {
        case 'push':
          return n >= STACK_CAPACITY ? { values: v, disabled: true } : { values: [...v, val(args)] };
        case 'pop':
          return n === 0 ? { values: v, disabled: true } : { values: v.slice(0, -1), result: v[n - 1] };
        case 'peek':
          return n === 0 ? { values: v, disabled: true } : { values: v, result: v[n - 1] };
      }
      throw new Error(op);
    },
    check: (m: StackModel) => expect(m.items.length).toBeLessThanOrEqual(STACK_CAPACITY),
  },
  queue: {
    values: ringValues,
    step(op, args, v) {
      const n = v.length;
      switch (op) {
        case 'enqueue':
          return n >= RING_CAPACITY ? { values: v, disabled: true } : { values: [...v, val(args)] };
        case 'dequeue':
          return n === 0 ? { values: v, disabled: true } : { values: v.slice(1), result: v[0] };
        case 'peek':
          return n === 0 ? { values: v, disabled: true } : { values: v, result: v[0] };
      }
      throw new Error(op);
    },
    check: checkRing,
  },
  deque: {
    values: ringValues,
    step(op, args, v) {
      const n = v.length;
      switch (op) {
        case 'push-front':
          return n >= RING_CAPACITY ? { values: v, disabled: true } : { values: [val(args), ...v] };
        case 'push-back':
          return n >= RING_CAPACITY ? { values: v, disabled: true } : { values: [...v, val(args)] };
        case 'pop-front':
          return n === 0 ? { values: v, disabled: true } : { values: v.slice(1), result: v[0] };
        case 'pop-back':
          return n === 0 ? { values: v, disabled: true } : { values: v.slice(0, -1), result: v[n - 1] };
      }
      throw new Error(op);
    },
    check: checkRing,
  },
  'linked-list': {
    values: (m: ListModel) => m.items.map((i) => i.value),
    step(op, args, v) {
      const n = v.length;
      const i = idx(args);
      const x = val(args);
      switch (op) {
        case 'insert-head':
          return n >= LIST_MAX ? { values: v, disabled: true } : { values: [x, ...v] };
        case 'insert-tail':
          return n >= LIST_MAX ? { values: v, disabled: true } : { values: [...v, x] };
        case 'insert-at':
          if (n >= LIST_MAX) return { values: v, disabled: true };
          return i <= n ? { values: [...v.slice(0, i), x, ...v.slice(i)] } : { values: v, error: true };
        case 'delete-value': {
          if (n === 0) return { values: v, disabled: true };
          const k = v.indexOf(x);
          return k < 0 ? { values: v, result: 'not found' } : { values: v.filter((_, j) => j !== k), result: x };
        }
        case 'delete-at':
          if (n === 0) return { values: v, disabled: true };
          return i < n ? { values: v.filter((_, k) => k !== i), result: v[i] } : { values: v, error: true };
        case 'search':
          return n === 0 ? { values: v, disabled: true } : { values: v, result: v.indexOf(x) };
      }
      throw new Error(op);
    },
    check: (m: ListModel) => expect(m.items.length).toBeLessThanOrEqual(LIST_MAX),
  },
};

function checkRing(m: RingModel) {
  expect(m.slots).toHaveLength(RING_CAPACITY);
  expect(m.count).toBeLessThanOrEqual(RING_CAPACITY);
  // Exactly the slots head … head + count − 1 (mod capacity) are occupied.
  m.slots.forEach((slot, i) => {
    const offset = (i - m.head + RING_CAPACITY) % RING_CAPACITY;
    expect(slot != null).toBe(offset < m.count);
  });
}

// ───────────────────────────── frame checks ─────────────────────────────

/** Every element id present in a frame, failing on duplicates. */
function idsIn(state: LinearState): string[] {
  let ids: string[];
  if (state.layout === 'list') {
    ids = [...state.order.filter((x): x is string => x != null), ...state.detached.map((d) => d.id)];
    expect(Object.keys(state.nodes).sort()).toEqual([...ids].sort());
  } else {
    ids = [...state.rows.flatMap((r) => r.slots.filter((x): x is string => x != null)), ...state.holders.flatMap((h) => (h.item ? [h.item] : []))];
    for (const id of ids) expect(state.values[id]).toBeTypeOf('number');
  }
  expect(new Set(ids).size).toBe(ids.length);
  return ids;
}

function modelIds(slug: string, m: Model): string[] {
  if (slug === 'queue' || slug === 'deque') return (m as RingModel).slots.flatMap((s) => (s ? [s.id] : []));
  return (m.items as { id: string }[]).map((i) => i.id);
}

/** The structure a frame shows, as element ids in their logical places, to compare with the model. */
function shownLayout(state: LinearState): (string | null)[] {
  if (state.layout === 'list') {
    const s = state as ListState;
    const out: string[] = [];
    let cur = s.pointers.find((p) => p.label === 'head')?.target ?? null;
    while (cur && out.length <= Object.keys(s.nodes).length) {
      out.push(cur);
      cur = s.nodes[cur].next;
    }
    return out;
  }
  const s = state as SlotsState;
  expect(s.rows).toHaveLength(1);
  return [...s.rows[0].slots];
}

function expectedLayout(slug: string, m: Model): (string | null)[] {
  switch (slug) {
    case 'array':
      return Array.from({ length: (m as DynamicArray).capacity }, (_, i) => m.items[i]?.id ?? null);
    case 'stack':
      return Array.from({ length: STACK_CAPACITY }, (_, i) => m.items[i]?.id ?? null);
    case 'queue':
    case 'deque':
      return (m as RingModel).slots.map((s) => s?.id ?? null);
    default:
      return (m as ListModel).items.map((i) => i.id);
  }
}

function checkFrames(ds: AnyStructure, opId: string, frames: Frame<LinearState>[]) {
  const spec = ds.operations.find((o) => o.id === opId)!;
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

    // Elements never vanish or duplicate mid-operation: a removed one waits in a holder or below the list.
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

// ───────────────────────────── properties ─────────────────────────────

/** A random operation: which one, plus raw numbers mapped onto each argument's range. */
const opArb = fc.record({ op: fc.nat(), raw: fc.array(fc.nat({ max: 999 }), { minLength: 2, maxLength: 2 }) });

function argsFor(ds: AnyStructure, opIndex: number, raw: number[]) {
  const spec = ds.operations[opIndex % ds.operations.length];
  const args: Args = {};
  spec.args.forEach((a, k) => {
    if (a.type === 'int') args[a.name] = a.min + (raw[k] % (a.max - a.min + 1));
    else args[a.name] = 'x';
  });
  return { spec, args };
}

describe.each(linearStructures)('$slug', (ds) => {
  const adapter = adapters[ds.slug];

  it('has an adapter and a view kind of linear', () => {
    expect(adapter).toBeDefined();
    expect(ds.view).toBe('linear');
  });

  it('builds every initial example, and its snapshot shows exactly its elements', () => {
    for (const start of ds.initial) {
      for (const seed of [0, 1, 7, 42, 999]) {
        const model = start.make(seed);
        adapter.check(model);
        const state = ds.snapshot(model) as LinearState;
        expect(idsIn(state).sort()).toEqual(modelIds(ds.slug, model).sort());
        expect(shownLayout(state)).toEqual(expectedLayout(ds.slug, model));
      }
    }
  });

  it('matches the reference model on random operation sequences, without mutating its input', () => {
    fc.assert(
      fc.property(fc.nat({ max: ds.initial.length - 1 }), fc.nat({ max: 10_000 }), fc.array(opArb, { maxLength: 30 }), (startIndex, seed, ops) => {
        let model = deepFreeze(ds.initial[startIndex].make(seed));
        let values = adapter.values(model);
        for (const { op, raw } of ops) {
          const { spec, args } = argsFor(ds, op, raw);
          const expected = adapter.step(spec.id, args, values);
          const reason = spec.disabledReason?.(model) ?? null;
          expect(reason != null).toBe(expected.disabled === true);
          if (reason) continue;

          const before = JSON.stringify(model);
          const { frames, result } = recordOperation(spec.run(model, args));
          expect(JSON.stringify(model)).toBe(before);
          checkFrames(ds, spec.id, frames as Frame<LinearState>[]);

          const last = frames.at(-1)!;
          if (expected.error) {
            expect(result).toBe(model);
            expect(last.vars.result).toBe('error');
          }
          if (expected.result !== undefined) expect(last.vars.result).toBe(expected.result);
          expect(adapter.values(result)).toEqual(expected.values);
          adapter.check(result);

          // The trace ends showing the model it returns (plus any element it just removed).
          const ids = modelIds(ds.slug, result);
          expect(new Set(ids).size).toBe(ids.length);
          expect(shownLayout(last.state as LinearState)).toEqual(expectedLayout(ds.slug, result));

          model = deepFreeze(result);
          values = expected.values;
        }
      }),
      { numRuns: 120 },
    );
  });

  it('asks at least one prediction question somewhere', () => {
    const model = ds.initial[0].make(1);
    const asked = ds.operations.some((spec) => {
      if (spec.disabledReason?.(model)) return false;
      const args: Args = Object.fromEntries(spec.args.map((a) => [a.name, a.type === 'int' ? (a.name === 'index' ? 1 : 42) : 'x']));
      return recordOperation(spec.run(model, args)).frames.some((f) => f.checkpoint);
    });
    expect(asked).toBe(true);
  });

  it('keeps pseudo-code lines short and experiments pointing at real examples', () => {
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
        for (const index of [0, 1, 2]) {
          for (const value of [42, 23, 7]) {
            for (const frame of recordOperation(spec.run(model, { index, value })).frames) {
              const s = frame.state as LinearState;
              for (const m of Object.values(s.marks)) used.add(m);
              if (s.layout === 'list') for (const m of Object.values(s.linkMarks)) used.add(m);
            }
          }
        }
      }
    }
    expect([...used].sort()).toEqual([...new Set(legendMarks)].sort());
  });
});

describe('specific behaviour', () => {
  const array = linearStructures.find((d) => d.slug === 'array')!;
  const queue = linearStructures.find((d) => d.slug === 'queue')!;
  const list = linearStructures.find((d) => d.slug === 'linked-list')!;
  const op = (ds: AnyStructure, id: string) => ds.operations.find((o) => o.id === id)!;

  it('array: appending to a full array doubles its capacity and copies every element once', () => {
    const full = array.initial.find((s) => s.id === 'full')!.make(0) as DynamicArray;
    const { frames, result } = recordOperation(op(array, 'append').run(full, { value: 9 }));
    expect((result as DynamicArray).capacity).toBe(full.capacity * 2);
    expect(frames.at(-1)!.stats.copies).toBe(full.items.length);
    expect(frames.at(-1)!.stats.resizes).toBe(1);
    // Mid-growth, the old and new blocks are both on screen.
    expect(frames.some((f) => (f.state as SlotsState).rows.length === 2)).toBe(true);
  });

  it('array: inserting at index 0 shifts every element', () => {
    const m = array.initial[0].make(0) as DynamicArray;
    const { frames } = recordOperation(op(array, 'insert').run(m, { index: 0, value: 1 }));
    expect(frames.at(-1)!.stats.shifts).toBe(m.items.length);
  });

  it('queue: tail wraps from the last slot to 0', () => {
    const m = queue.initial.find((s) => s.id === 'about-to-wrap')!.make(0) as RingModel;
    expect((m.head + m.count) % RING_CAPACITY).toBe(RING_CAPACITY - 1);
    const { frames, result } = recordOperation(op(queue, 'enqueue').run(m, { value: 5 }));
    expect(frames.at(-1)!.stats.wraps).toBe(1);
    expect(((result as RingModel).head + (result as RingModel).count) % RING_CAPACITY).toBe(0);
  });

  it('linked list: insert writes new.next before cur.next', () => {
    const m = list.initial[0].make(0) as ListModel;
    const { frames } = recordOperation(op(list, 'insert-at').run(m, { index: 2, value: 99 }));
    const writes = frames.map((f) => f.line).filter((l) => l === 8 || l === 9);
    expect(writes).toEqual([8, 9]);
  });

  it('linked list: insert at tail is O(1) thanks to the tail pointer', () => {
    const m = list.initial[0].make(0) as ListModel;
    const { frames } = recordOperation(op(list, 'insert-tail').run(m, { value: 99 }));
    expect(frames.at(-1)!.stats.hops).toBe(0);
  });
});
