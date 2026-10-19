import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createRng } from '@/engine/random';
import {
  completeSchedule,
  deadlocked,
  finished,
  isRace,
  outcomeKey,
  outcomes,
  randomSchedule,
  runnable,
  runSchedule,
  scheduleProblem,
  serialOutcomes,
  start,
  status,
  step,
  type Instr,
  type Machine,
  type Program,
} from './interleaving';

const increment: Instr[] = [
  { op: 'load', reg: 'r', from: 'count' },
  { op: 'add', reg: 'r', k: 1 },
  { op: 'store', to: 'count', reg: 'r' },
];
const locked: Instr[] = [{ op: 'lock', lock: 'm' }, ...increment, { op: 'unlock', lock: 'm' }];
const threads = (code: readonly Instr[], n: number) => Array.from({ length: n }, (_, i) => ({ id: 'ABC'[i], code }));
const counter = (code: readonly Instr[], n = 2): Program => ({ memory: { count: 0 }, threads: threads(code, n) });

/** Every interleaving, one by one (no memo), as complete schedules. */
function allSchedules(program: Program): string[][] {
  const out: string[][] = [];
  const walk = (m: Machine, prefix: string[]) => {
    const ready = runnable(program, m);
    if (ready.length === 0) out.push(prefix);
    for (const id of ready) walk(step(program, m, id).machine, [...prefix, id]);
  };
  walk(start(program), []);
  return out;
}

function bruteForce(program: Program): Map<string, number> {
  const counts = new Map<string, number>();
  for (const s of allSchedules(program)) {
    const { final } = runSchedule(program, s);
    const key = outcomeKey(final.memory, deadlocked(program, final));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

const asMap = (program: Program) => new Map(outcomes(program).outcomes.map((o) => [outcomeKey(o.memory, o.deadlocked), o.count]));

// Random small programs: plain loads, adds, stores and atomic adds over x and
// y, optional forward jumps, and optionally the whole body inside one lock.
const plain: fc.Arbitrary<Instr> = fc.oneof(
  fc.record({ op: fc.constant('load' as const), reg: fc.constantFrom('r', 's'), from: fc.constantFrom('x', 'y') }),
  fc.record({ op: fc.constant('add' as const), reg: fc.constantFrom('r', 's'), k: fc.integer({ min: -2, max: 3 }) }),
  fc.record({ op: fc.constant('store' as const), to: fc.constantFrom('x', 'y'), reg: fc.constantFrom('r', 's') }),
  fc.record({ op: fc.constant('fetch-add' as const), target: fc.constantFrom('x', 'y'), k: fc.integer({ min: -2, max: 3 }) }),
);
const body = fc.array(plain, { minLength: 1, maxLength: 4 }).chain((code) =>
  fc.array(fc.integer({ min: 0, max: 5 }), { maxLength: 1 }).map((jumpAt) => {
    if (jumpAt.length === 0 || code.length < 2) return code;
    const at = jumpAt[0] % (code.length - 1);
    const jump: Instr = { op: 'jump-if-less', reg: 'r', k: 1, to: code.length + 1 };
    return [...code.slice(0, at), jump, ...code.slice(at)];
  }),
);
const thread = fc.tuple(body, fc.boolean()).map(([code, lock]): Instr[] =>
  lock ? [{ op: 'lock', lock: 'm' }, ...code.map((i) => (i.op === 'jump-if-less' ? { ...i, to: i.to + 1 } : i)), { op: 'unlock', lock: 'm' }] : code,
);
const program: fc.Arbitrary<Program> = fc
  .tuple(fc.array(thread, { minLength: 1, maxLength: 3 }), fc.integer({ min: 0, max: 2 }), fc.integer({ min: 0, max: 2 }))
  .map(([codes, x, y]) => ({ memory: { x, y }, threads: codes.map((code, i) => ({ id: 'ABC'[i], code })) }));

describe('interleaving', () => {
  it('loses an update in 18 of the 20 interleavings of two count++', () => {
    const { outcomes: os, total } = outcomes(counter(increment));
    expect(total).toBe(20);
    expect(os.map((o) => [o.memory.count, o.count])).toEqual([
      [1, 18],
      [2, 2],
    ]);
    expect(isRace(counter(increment))).toBe(true);
    expect(serialOutcomes(counter(increment))).toEqual(new Set(['count=2']));
  });

  it('gives the one right answer with a lock or an atomic add, however many threads', () => {
    for (const n of [1, 2, 3]) {
      for (const code of [locked, [{ op: 'fetch-add', target: 'count', k: 1 }] as Instr[]]) {
        const { outcomes: os } = outcomes(counter(code, n));
        expect(os.map((o) => o.memory.count)).toEqual([n]);
        expect(isRace(counter(code, n))).toBe(false);
      }
    }
    // Three unlocked threads can end anywhere from 1 to 3.
    const three = outcomes(counter(increment, 3));
    expect(three.outcomes.map((o) => o.memory.count)).toEqual([1, 2, 3]);
    expect(three.total).toBe(1680); // 9! / (3! 3! 3!)
  });

  it('lets a check and an act interleave: two withdrawals can overdraw', () => {
    const withdraw: Instr[] = [
      { op: 'load', reg: 'r', from: 'balance' },
      { op: 'jump-if-less', reg: 'r', k: 80, to: 3 },
      { op: 'fetch-add', target: 'balance', k: -80 },
    ];
    const p: Program = { memory: { balance: 100 }, threads: threads(withdraw, 2) };
    expect(outcomes(p).outcomes.map((o) => o.memory.balance)).toEqual([-60, 20]);
    expect(runSchedule(p, ['A', 'B', 'A', 'B', 'A', 'B']).final.memory.balance).toBe(-60);
    const guarded: Instr[] = [{ op: 'lock', lock: 'm' }, withdraw[0], { ...withdraw[1], to: 4 } as Instr, withdraw[2], { op: 'unlock', lock: 'm' }];
    expect(outcomes({ ...p, threads: threads(guarded, 2) }).outcomes.map((o) => o.memory.balance)).toEqual([20]);
  });

  it('counts outcomes exactly as enumerating every schedule does', () => {
    fc.assert(
      fc.property(program, (p) => {
        expect(asMap(p)).toEqual(bruteForce(p));
      }),
      { numRuns: 150 },
    );
  });

  it('ends every random schedule in one of the outcomes, respecting locks', () => {
    fc.assert(
      fc.property(program, fc.integer({ min: 0, max: 10_000 }), (p, seed) => {
        const schedule = randomSchedule(p, createRng(seed));
        expect(scheduleProblem(p, schedule)).toBeNull();
        const { steps, machines, final } = runSchedule(p, schedule);
        expect(finished(p, final) || deadlocked(p, final)).toBe(true);
        expect(asMap(p).has(outcomeKey(final.memory, deadlocked(p, final)))).toBe(true);
        // A thread inside the lock never shares it, and a wait changes nothing.
        steps.forEach((s, k) => {
          if (s.kind === 'waited') expect(machines[k + 1]).toBe(machines[k]);
          if (s.instr.op === 'lock' && s.kind === 'ran') expect(machines[k].locks.m).toBeUndefined();
        });
      }),
      { numRuns: 150 },
    );
  });

  it('blocks a thread on a held lock, rejects bad schedules, and never changes its inputs', () => {
    const p = counter(locked);
    const frozen = Object.freeze(start(p));
    const a = step(p, frozen, 'A').machine;
    expect(frozen.locks).toEqual({});
    expect(status(p, a, 'B')).toBe('blocked');
    expect(runnable(p, a)).toEqual(['A']);
    expect(step(p, a, 'B').step.kind).toBe('waited');
    expect(scheduleProblem(p, ['C'])).toMatch(/threads are A, B/);
    expect(scheduleProblem(counter(increment), ['A', 'A', 'A', 'A'])).toMatch(/already finished/);
    expect(completeSchedule(p, ['A', 'B'])).toEqual(['A', 'B', 'A', 'A', 'A', 'A', 'B', 'B', 'B', 'B', 'B']);
  });

  it('finds deadlocks when two threads take two locks in opposite orders', () => {
    const ab: Instr[] = [
      { op: 'lock', lock: 'a' },
      { op: 'lock', lock: 'b' },
      { op: 'unlock', lock: 'b' },
      { op: 'unlock', lock: 'a' },
    ];
    const ba: Instr[] = [ab[1], ab[0], ab[3], ab[2]];
    const p: Program = { memory: {}, threads: [{ id: 'A', code: ab }, { id: 'B', code: ba }] };
    const os = outcomes(p).outcomes;
    expect(os.map((o) => o.deadlocked)).toEqual([false, true]);
    expect(deadlocked(p, runSchedule(p, ['A', 'B']).final)).toBe(true);
  });
});
