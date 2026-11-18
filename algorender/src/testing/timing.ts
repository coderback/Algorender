/**
 * Runs `f` and returns how much CPU time this process spent on it, in ms.
 * Tests that check something is fast use this, not wall-clock: Vitest runs
 * test files side by side, each in its own process, and on a busy machine the
 * time spent waiting for a core (two to four times the work) says nothing
 * about the code. Only for synchronous work on this thread.
 */
export function cpuTime<T>(f: () => T): { result: T; ms: number } {
  const start = process.cpuUsage();
  const result = f();
  const { user, system } = process.cpuUsage(start);
  return { result, ms: (user + system) / 1000 };
}

/**
 * Time limit for a test whose work is large but fixed (every problem's
 * tests, a property checked against brute force). It passes in a few seconds
 * alone; the default 20 s is for catching a test that hangs, and a busy
 * machine can stretch fixed work past it.
 */
export const LONG_MS = 60_000;
