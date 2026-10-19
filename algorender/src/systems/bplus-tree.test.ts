import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  bptDelete,
  bptFrom,
  bptInsert,
  bptRange,
  bptSearch,
  createBPlusTree,
  deleteSteps,
  entries,
  height,
  insertSteps,
  keysOf,
  leafChain,
  problems,
  rangeSteps,
  type BPlusTree,
} from './bplus-tree';

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

const sorted = (m: Map<number, string>) => [...m.entries()].sort((a, b) => a[0] - b[0]);

const op = fc.record({ insert: fc.boolean(), key: fc.integer({ min: 1, max: 60 }) });

describe('bplus-tree', () => {
  it('matches a sorted map under random inserts and deletes, staying a valid B+ tree, without changing its input', () => {
    fc.assert(
      fc.property(fc.integer({ min: 3, max: 6 }), fc.array(op, { maxLength: 120 }), (order, ops) => {
        let tree = createBPlusTree<string>(order);
        const ref = new Map<number, string>();
        for (const { insert, key } of ops) {
          deepFreeze(tree);
          const prev = tree;
          const before = JSON.stringify(prev);
          if (insert) {
            tree = bptInsert(tree, key, `v${key}:${ref.size}`);
            ref.set(key, `v${key}:${ref.size}`);
          } else {
            tree = bptDelete(tree, key);
            ref.delete(key);
          }
          expect(JSON.stringify(prev)).toBe(before);
          expect(problems(tree)).toEqual([]);
          expect(entries(tree)).toEqual(sorted(ref));
        }
        // Searches and range scans agree with the map.
        for (let key = 0; key <= 61; key++) {
          const r = bptSearch(tree, key);
          expect(r.value).toBe(ref.get(key) ?? null);
          expect(r.pages).toBe(height(tree));
        }
        for (const [from, to] of [[0, 61], [10, 20], [25, 25], [40, 5], [59, 70]]) {
          const r = bptRange(tree, from, to);
          expect(r.entries).toEqual(sorted(ref).filter(([k]) => k >= from && k <= to));
          if (tree.root) expect(r.pages).toBe(height(tree) - 1 + r.leaves);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('copies a leaf’s separator up but moves an internal node’s up, and grows only at the root', () => {
    let t = bptFrom(3, [[10, 'a'], [20, 'b']]);
    expect(height(t)).toBe(1);
    const steps = insertSteps(t, 30, 'c');
    const split = steps.find((s) => s.kind === 'split');
    expect(split).toMatchObject({ level: 'leaf', separator: 20, newRoot: true });
    t = steps[steps.length - 1].tree;
    // 20 is both a separator and still in its leaf.
    expect(t.pages[t.root!].keys).toEqual([20]);
    expect(keysOf(t)).toEqual([10, 20, 30]);
    t = bptInsert(bptInsert(t, 40, 'd'), 50, 'e');
    // Order 3: the root [20, 30] overflowed to [20, 30, 40] and split around 30, which moved up (no longer in an internal sibling).
    expect(height(t)).toBe(3);
    expect(t.pages[t.root!].keys).toEqual([30]);
    const internals = Object.values(t.pages).filter((p) => p.kind === 'internal').flatMap((p) => p.keys);
    expect(internals.filter((k) => k === 30)).toHaveLength(1);
    expect(problems(t)).toEqual([]);
  });

  it('keeps a stale separator when its key is deleted, borrows, merges and shrinks', () => {
    let t = bptFrom(4, [10, 20, 30, 40, 50, 60, 70].map((k) => [k, String(k)] as [number, string]));
    expect(problems(t)).toEqual([]);
    const sep = t.pages[t.root!].keys[0];
    const steps = deleteSteps(t, sep);
    const removed = steps.find((s) => s.kind === 'remove');
    expect(removed).toMatchObject({ stays: sep });
    let borrows = 0;
    let merges = 0;
    let shrinks = 0;
    for (let seed = 0; seed < 40; seed++) {
      const keys = Array.from({ length: 20 }, (_, i) => ((i * 37 + seed * 11) % 97) + 1);
      t = bptFrom(4, keys.map((k) => [k, String(k)] as [number, string]));
      for (const k of [...new Set(keys)]) {
        const s = deleteSteps(t, k);
        borrows += s.filter((x) => x.kind === 'borrow').length;
        merges += s.filter((x) => x.kind === 'merge').length;
        shrinks += s.filter((x) => x.kind === 'shrink').length;
        t = s[s.length - 1].tree;
        expect(problems(t)).toEqual([]);
      }
      expect(t.root).toBeNull();
    }
    expect(borrows).toBeGreaterThan(0);
    expect(merges).toBeGreaterThan(0);
    expect(shrinks).toBeGreaterThan(0);
  });

  it('scans a range along the leaf links, reading only the leaves it needs', () => {
    const t = bptFrom(4, Array.from({ length: 20 }, (_, i) => [(i + 1) * 5, i] as [number, number]));
    const chain = leafChain(t);
    expect(chain.length).toBeGreaterThan(4);
    const steps = rangeSteps(t, 22, 48);
    const scans = steps.filter((s) => s.kind === 'scan');
    expect(scans.flatMap((s) => (s.kind === 'scan' ? s.taken : []))).toEqual([25, 30, 35, 40, 45]);
    expect(scans[scans.length - 1]).toMatchObject({ stop: true });
    expect(scans.length).toBeLessThan(chain.length);
    // An empty range still reads its leaf, and the next one when it can't tell yet that nothing follows.
    expect(bptRange(t, 42, 43)).toMatchObject({ entries: [] });
    expect(bptRange(t, 42, 43).leaves).toBeLessThanOrEqual(2);
    expect(bptRange(t, 1, 3)).toMatchObject({ entries: [], leaves: 1 });
  });

  it('updates a stored key in place, and handles the empty tree', () => {
    const empty: BPlusTree<string> = createBPlusTree(5);
    expect(bptSearch(empty, 3)).toEqual({ value: null, pages: 0 });
    expect(bptRange(empty, 1, 9)).toEqual({ entries: [], pages: 0, leaves: 0 });
    expect(bptDelete(empty, 3)).toBe(empty);
    let t = bptInsert(empty, 3, 'a');
    t = bptInsert(t, 3, 'b');
    expect(entries(t)).toEqual([[3, 'b']]);
    expect(t.size).toBe(1);
    expect(bptDelete(t, 3)).toMatchObject({ root: null, size: 0 });
    expect(() => createBPlusTree(2)).toThrow();
  });
});
