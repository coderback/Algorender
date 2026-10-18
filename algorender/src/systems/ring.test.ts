import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  addServer,
  arcs,
  createRing,
  hash32,
  loads,
  modMoved,
  movedKeys,
  ownership,
  placement,
  preferenceList,
  removeServer,
  RING_SIZE,
  serverFor,
  spread,
  type Ring,
} from './ring';

const SERVERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const keysN = (n: number, prefix = 'key') => Array.from({ length: n }, (_, i) => `${prefix}-${i}`);

/** The definition, by brute force: the node with the smallest position at or after the key's, else the smallest overall. */
function reference(ring: Ring, key: string): string | null {
  if (ring.nodes.length === 0) return null;
  const h = hash32(key);
  const after = ring.nodes.filter((n) => n.position >= h);
  const pool = after.length ? after : ring.nodes;
  return pool.reduce((best, n) => (n.position < best.position || (n.position === best.position && n.id < best.id) ? n : best)).server;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

const arbRing = fc
  .record({ count: fc.integer({ min: 1, max: 6 }), replicas: fc.integer({ min: 1, max: 12 }) })
  .map(({ count, replicas }) => createRing(SERVERS.slice(0, count), replicas));
const arbKeys = fc.uniqueArray(fc.string({ minLength: 1, maxLength: 8 }), { minLength: 0, maxLength: 40 });

describe('hash32', () => {
  it('is deterministic, 32-bit and spreads similar strings apart', () => {
    expect(hash32('apple')).toBe(hash32('apple'));
    fc.assert(fc.property(fc.string(), (s) => Number.isInteger(hash32(s)) && hash32(s) >= 0 && hash32(s) < RING_SIZE));
    const positions = Array.from({ length: 10 }, (_, i) => hash32(`A#${i}`));
    expect(new Set(positions).size).toBe(10);
    // Neighbouring names land in different quarters of the ring, not bunched together.
    expect(new Set(positions.map((p) => Math.floor((4 * p) / RING_SIZE))).size).toBeGreaterThan(2);
  });
});

describe('the ring', () => {
  it('puts each key on the first node clockwise, wrapping round', () => {
    fc.assert(
      fc.property(arbRing, arbKeys, (ring, keys) => {
        for (const k of keys) expect(serverFor(ring, k)).toBe(reference(ring, k));
      }),
      { numRuns: 200 },
    );
    expect(serverFor(createRing([], 3), 'x')).toBeNull();
  });

  it('keeps its nodes sorted, with every server placed `replicas` times', () => {
    fc.assert(
      fc.property(arbRing, (ring) => {
        expect(ring.nodes).toHaveLength(ring.servers.length * ring.replicas);
        for (let i = 1; i < ring.nodes.length; i++) expect(ring.nodes[i].position).toBeGreaterThanOrEqual(ring.nodes[i - 1].position);
        const arcSum = arcs(ring).reduce((a, x) => a + x.length, 0);
        expect(arcSum).toBe(RING_SIZE);
        expect(Object.values(ownership(ring)).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
      }),
    );
  });

  it('moves keys only to a server that joins, and only from a server that leaves', () => {
    fc.assert(
      fc.property(arbRing.filter((r) => r.servers.length < SERVERS.length), arbKeys, (ring, keys) => {
        const newcomer = SERVERS.find((s) => !ring.servers.includes(s))!;
        const grown = addServer(ring, newcomer);
        const before = placement(ring, keys);
        for (const k of movedKeys(ring, grown, keys)) expect(serverFor(grown, k)).toBe(newcomer);
        // Leaving again puts every key back where it was.
        expect(placement(removeServer(grown, newcomer), keys)).toEqual(before);

        const leaving = ring.servers[0];
        const shrunk = removeServer(ring, leaving);
        for (const k of movedKeys(ring, shrunk, keys)) expect(before.get(k)).toBe(leaving);
        for (const k of keys) if (before.get(k) === leaving && shrunk.servers.length > 0) expect(serverFor(shrunk, k)).not.toBe(leaving);
      }),
      { numRuns: 150 },
    );
  });

  it('never changes the ring it is given', () => {
    const ring = deepFreeze(createRing(['A', 'B', 'C'], 3));
    const copy = structuredClone(ring);
    addServer(ring, 'D');
    removeServer(ring, 'B');
    expect(ring).toEqual(copy);
  });

  it('turns down a server that is already there, or missing, or with no nodes', () => {
    const ring = createRing(['A'], 2);
    expect(() => addServer(ring, 'A')).toThrow();
    expect(() => removeServer(ring, 'B')).toThrow();
    expect(() => createRing(['A'], 0)).toThrow();
    expect(() => createRing(['A', 'A'], 1)).toThrow();
  });

  it('lists distinct servers clockwise for replicas, starting with the owner', () => {
    fc.assert(
      fc.property(arbRing, fc.string({ minLength: 1 }), fc.integer({ min: 1, max: 8 }), (ring, key, n) => {
        const list = preferenceList(ring, key, n);
        expect(list).toHaveLength(Math.min(n, ring.servers.length));
        expect(new Set(list).size).toBe(list.length);
        expect(list[0]).toBe(serverFor(ring, key));
      }),
    );
  });
});

describe('what it buys', () => {
  const keys = keysN(4000);

  it('moves about 1/N of the keys when a server joins, where mod N moves most of them', () => {
    const ring = createRing(['A', 'B', 'C'], 100);
    const moved = movedKeys(ring, addServer(ring, 'D'), keys).length / keys.length;
    expect(moved).toBeGreaterThan(0.15);
    expect(moved).toBeLessThan(0.35);
    const mod = modMoved(['A', 'B', 'C'], ['A', 'B', 'C', 'D'], keys).length / keys.length;
    expect(mod).toBeGreaterThan(0.65); // a key stays only when hash mod 3 = hash mod 4: about 1 in 4
  });

  it('balances load with virtual nodes', () => {
    const servers = ['A', 'B', 'C', 'D'];
    const lone = spread(loads(createRing(servers, 1), keys));
    const many = spread(loads(createRing(servers, 200), keys));
    expect(many).toBeLessThan(1.15);
    expect(many).toBeLessThan(lone);
    expect(spread({})).toBe(1);
    expect(spread({ A: 2, B: 2 })).toBe(1);
    expect(spread({ A: 3, B: 1 })).toBe(1.5);
  });
});
