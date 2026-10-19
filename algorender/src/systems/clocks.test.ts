import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createRng } from '@/engine/random';
import {
  allEvents,
  causalPath,
  compareVectors,
  concurrent,
  eventName,
  happensBefore,
  lamportReceive,
  lamportTimes,
  linearize,
  messages,
  randomScenario,
  relation,
  totalOrder,
  validateScenario,
  vectorReceive,
  vectorTimes,
  type Scenario,
} from './clocks';

const scenario: fc.Arbitrary<Scenario> = fc
  .record({ seed: fc.integer({ min: 0, max: 1_000_000 }), processes: fc.integer({ min: 2, max: 4 }), events: fc.integer({ min: 2, max: 14 }) })
  .map(({ seed, processes, events }) => randomScenario(createRng(seed), processes, events));

/** A → B → C: A sends to B, B to C. */
const chain: Scenario = {
  processes: [
    { id: 'A', events: [{ kind: 'local' }, { kind: 'send', msg: 'm1' }] },
    { id: 'B', events: [{ kind: 'recv', msg: 'm1' }, { kind: 'send', msg: 'm2' }] },
    { id: 'C', events: [{ kind: 'local' }, { kind: 'recv', msg: 'm2' }] },
  ],
};

describe('logical clocks', () => {
  it('stamps a message chain by the rules', () => {
    expect(lamportTimes(chain)).toEqual([
      [1, 2],
      [3, 4],
      [1, 5],
    ]);
    expect(vectorTimes(chain)).toEqual([
      [
        [1, 0, 0],
        [2, 0, 0],
      ],
      [
        [2, 1, 0],
        [2, 2, 0],
      ],
      [
        [0, 0, 1],
        [2, 2, 2],
      ],
    ]);
    expect(lamportReceive(1, 2)).toBe(3);
    expect(lamportReceive(7, 2)).toBe(8);
    expect(vectorReceive([0, 3, 0], [2, 1, 0], 2)).toEqual([2, 3, 1]);
    expect(messages(chain).map((m) => [m.name, eventName(chain, m.send), m.recv && eventName(chain, m.recv)])).toEqual([
      ['m1', 'a2', 'b1'],
      ['m2', 'b2', 'c2'],
    ]);
    expect(causalPath(chain, { p: 0, i: 0 }, { p: 2, i: 1 })!.map((e) => eventName(chain, e))).toEqual(['a1', 'a2', 'b1', 'b2', 'c2']);
    expect(relation(chain, { p: 2, i: 0 }, { p: 0, i: 0 })).toBe('concurrent');
    expect(totalOrder(chain).map((e) => eventName(chain, e))).toEqual(['a1', 'c1', 'a2', 'b1', 'b2', 'c2']);
  });

  it('rejects impossible scenarios', () => {
    const bad = (processes: Scenario['processes']) => validateScenario({ processes });
    expect(validateScenario(chain)).toBeNull();
    expect(bad([{ id: 'A', events: [{ kind: 'recv', msg: 'x' }] }, { id: 'B', events: [] }])).toMatch(/never sent/);
    expect(bad([{ id: 'A', events: [{ kind: 'send', msg: 'x' }, { kind: 'recv', msg: 'x' }] }])).toMatch(/own/);
    expect(
      bad([
        { id: 'A', events: [{ kind: 'send', msg: 'x' }] },
        { id: 'B', events: [{ kind: 'recv', msg: 'x' }, { kind: 'recv', msg: 'x' }] },
      ]),
    ).toMatch(/twice/);
    expect(
      bad([
        { id: 'A', events: [{ kind: 'send', msg: 'x' }] },
        { id: 'B', events: [{ kind: 'send', msg: 'x' }] },
      ]),
    ).toMatch(/twice/);
    // Each waits for the other's message before sending its own.
    expect(
      bad([
        { id: 'A', events: [{ kind: 'recv', msg: 'y' }, { kind: 'send', msg: 'x' }] },
        { id: 'B', events: [{ kind: 'recv', msg: 'x' }, { kind: 'send', msg: 'y' }] },
      ]),
    ).toMatch(/before it could have been sent/);
    expect(bad([{ id: 'A', events: [] }, { id: 'A', events: [] }])).toMatch(/same name/);
  });

  it('makes valid random scenarios, reproducibly, with every message delivered', () => {
    fc.assert(
      fc.property(scenario, (s) => {
        expect(validateScenario(s)).toBeNull();
        expect(linearize(s)).toHaveLength(allEvents(s).length);
        expect(messages(s).every((m) => m.recv !== null)).toBe(true);
        expect(s.processes.every((p) => p.events.length > 0)).toBe(true);
      }),
    );
    expect(randomScenario(createRng(5), 3)).toEqual(randomScenario(createRng(5), 3));
  });

  it('keeps Lamport’s clock condition: a → b implies L(a) < L(b), and the total order respects →', () => {
    fc.assert(
      fc.property(scenario, (s) => {
        const L = lamportTimes(s);
        const events = allEvents(s);
        for (const a of events) for (const b of events) if (happensBefore(s, a, b)) expect(L[a.p][a.i]).toBeLessThan(L[b.p][b.i]);
        const order = totalOrder(s);
        const pos = (e: { p: number; i: number }) => order.findIndex((x) => x.p === e.p && x.i === e.i);
        for (const a of events) for (const b of events) if (happensBefore(s, a, b)) expect(pos(a)).toBeLessThan(pos(b));
      }),
    );
  });

  it('shows the converse fails: a smaller Lamport time can belong to a concurrent event', () => {
    // b1 is stamped 1, a3 is stamped 3, yet nothing links them.
    const s: Scenario = {
      processes: [
        { id: 'A', events: [{ kind: 'local' }, { kind: 'local' }, { kind: 'local' }] },
        { id: 'B', events: [{ kind: 'local' }] },
      ],
    };
    const L = lamportTimes(s);
    expect(L[1][0]).toBeLessThan(L[0][2]);
    expect(concurrent(s, { p: 1, i: 0 }, { p: 0, i: 2 })).toBe(true);
    // And it fails on most random scenarios too.
    let found = 0;
    for (let seed = 0; seed < 50; seed++) {
      const r = randomScenario(createRng(seed), 3);
      const T = lamportTimes(r);
      const events = allEvents(r);
      if (events.some((a) => events.some((b) => T[a.p][a.i] < T[b.p][b.i] && concurrent(r, a, b)))) found++;
    }
    expect(found).toBeGreaterThan(40);
  });

  it('characterises causality exactly with vector clocks: a → b iff V(a) < V(b)', () => {
    fc.assert(
      fc.property(scenario, (s) => {
        const V = vectorTimes(s);
        const events = allEvents(s);
        for (const a of events) {
          for (const b of events) {
            const r = relation(s, a, b);
            const c = compareVectors(V[a.p][a.i], V[b.p][b.i]);
            expect(c).toBe(r === 'same' ? 'equal' : r);
          }
        }
      }),
    );
  });
});
