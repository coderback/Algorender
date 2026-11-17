// expect() for 'program' mode's unit tests (runtime.ts's runTests): a small,
// Jest-shaped subset, enough to teach the syntax learners will meet. A
// failed expectation throws an Expectation, whose message says what was
// expected and what came instead, in the words Python's rewritten asserts
// use ("Expected 5, but got 6").

import { StopSignal } from './signals';

/** A failed expectation: the test fails with this message, at no learner line. */
export class Expectation extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'Expectation';
  }
}

/** Structural equality, as toEqual means it: same type, same entries, NaN equal to NaN. */
export function deepEqual(a: unknown, b: unknown, seen: [unknown, unknown][] = []): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;
  if (seen.some(([x, y]) => x === a && y === b)) return true;
  const inner: [unknown, unknown][] = [...seen, [a, b]];
  if (a instanceof Map && b instanceof Map) {
    if (a.size !== b.size) return false;
    for (const [k, v] of a) if (!b.has(k) || !deepEqual(v, b.get(k), inner)) return false;
    return true;
  }
  if (a instanceof Set && b instanceof Set) {
    if (a.size !== b.size) return false;
    for (const v of a) if (!b.has(v)) return false;
    return true;
  }
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  const keysA = Object.keys(a).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
  const keysB = Object.keys(b).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
  if (Array.isArray(a) && (a as unknown[]).length !== (b as unknown[]).length) return false;
  if (keysA.length !== keysB.length) return false;
  return keysA.every((k) => Object.hasOwn(b, k) && deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], inner));
}

/** A matcher: whether it passes, and the message for a failure either way round. */
type Outcome = { pass: boolean; message: string; notMessage: string };

export function makeExpect(show: (v: unknown) => string) {
  const matchers = (received: unknown) => ({
    toBe: (expected: unknown): Outcome => ({
      pass: Object.is(received, expected),
      message: `Expected ${show(expected)}, but got ${show(received)}`,
      notMessage: `Expected anything but ${show(expected)}`,
    }),
    toEqual: (expected: unknown): Outcome => ({
      pass: deepEqual(received, expected),
      message: `Expected ${show(expected)}, but got ${show(received)}`,
      notMessage: `Expected anything but ${show(expected)}`,
    }),
    toBeCloseTo: (expected: unknown, digits: unknown = 2): Outcome => ({
      pass: typeof received === 'number' && typeof expected === 'number' && Math.abs(received - expected) < 10 ** -Number(digits) / 2,
      message: `Expected a number close to ${show(expected)}, but got ${show(received)}`,
      notMessage: `Expected a number not close to ${show(expected)}, but got ${show(received)}`,
    }),
    toContain: (item: unknown): Outcome => ({
      pass: typeof received === 'string' ? received.includes(String(item)) : Array.isArray(received) ? received.includes(item) : received instanceof Set ? received.has(item) : false,
      message: `Expected ${show(received)} to contain ${show(item)}`,
      notMessage: `Expected ${show(received)} not to contain ${show(item)}`,
    }),
    toHaveLength: (n: unknown): Outcome => {
      const length = (received as { length?: unknown } | null)?.length;
      return { pass: length === n, message: `Expected length ${show(n)}, but got ${show(length)}`, notMessage: `Expected a length other than ${show(n)}` };
    },
    toBeTruthy: (): Outcome => ({ pass: Boolean(received), message: `Expected ${show(received)} to be truthy`, notMessage: `Expected ${show(received)} to be falsy` }),
    toBeFalsy: (): Outcome => ({ pass: !received, message: `Expected ${show(received)} to be falsy`, notMessage: `Expected ${show(received)} to be truthy` }),
    toBeNull: (): Outcome => ({ pass: received === null, message: `Expected null, but got ${show(received)}`, notMessage: 'Expected anything but null' }),
    toBeUndefined: (): Outcome => ({ pass: received === undefined, message: `Expected undefined, but got ${show(received)}`, notMessage: 'Expected anything but undefined' }),
    toBeDefined: (): Outcome => ({ pass: received !== undefined, message: 'Expected a value, but got undefined', notMessage: `Expected undefined, but got ${show(received)}` }),
    toBeGreaterThan: (n: unknown): Outcome => compare(received, n, (a, b) => a > b, 'greater than'),
    toBeGreaterThanOrEqual: (n: unknown): Outcome => compare(received, n, (a, b) => a >= b, 'at least'),
    toBeLessThan: (n: unknown): Outcome => compare(received, n, (a, b) => a < b, 'less than'),
    toBeLessThanOrEqual: (n: unknown): Outcome => compare(received, n, (a, b) => a <= b, 'at most'),
    toThrow: (expected?: unknown): Outcome => {
      if (typeof received !== 'function') return { pass: false, message: 'expect(…).toThrow() needs a function to call', notMessage: 'expect(…).toThrow() needs a function to call' };
      try {
        (received as () => unknown)();
      } catch (e) {
        if (e instanceof StopSignal) throw e;
        const name = e instanceof Error ? `${e.name}: ${e.message}` : show(e);
        const fits =
          expected === undefined ||
          (typeof expected === 'function' && e instanceof (expected as new () => unknown)) ||
          (typeof expected === 'string' && e instanceof Error && e.message.includes(expected)) ||
          (expected instanceof RegExp && e instanceof Error && expected.test(e.message));
        const wanted = typeof expected === 'function' ? (expected as { name: string }).name : show(expected);
        return { pass: fits, message: `Expected it to throw ${wanted}, but it threw ${name}`, notMessage: `Expected it not to throw, but it threw ${name}` };
      }
      const wanted = expected === undefined ? 'an error' : typeof expected === 'function' ? (expected as { name: string }).name : show(expected);
      return { pass: false, message: `Expected it to throw ${wanted}, but it didn't`, notMessage: '' };
    },
  });

  const compare = (received: unknown, n: unknown, ok: (a: number, b: number) => boolean, words: string): Outcome => ({
    pass: typeof received === 'number' && typeof n === 'number' && ok(received, n),
    message: `Expected ${show(received)} to be ${words} ${show(n)}`,
    notMessage: `Expected ${show(received)} not to be ${words} ${show(n)}`,
  });

  type Matchers = ReturnType<typeof matchers>;
  type Checks = { [K in keyof Matchers]: (...args: Parameters<Matchers[K]>) => void };

  const checks = (received: unknown, negated: boolean): Checks => {
    const all = matchers(received);
    return Object.fromEntries(
      Object.entries(all).map(([name, matcher]) => [
        name,
        (...args: unknown[]) => {
          const outcome = (matcher as (...a: unknown[]) => Outcome)(...args);
          if (outcome.pass === negated) throw new Expectation(negated ? outcome.notMessage : outcome.message);
        },
      ]),
    ) as Checks;
  };

  return (received: unknown) => ({ ...checks(received, false), not: checks(received, true) });
}
