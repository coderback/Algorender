// Expected answers to a learner's own test: the reference solution, run on
// the server, answers every problem's own tests as they are written; it stops
// at its time limit and never describes its own errors; and the service checks
// the input, counts its own limit apart from the server judge's, and records
// each answer (on a real, in-memory Postgres).

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { customCase } from '@/problems/custom';
import { ownMismatch } from '@/problems/judge';
import { getProblem, loadProblems, specFor } from '@/problems/load';
import { createAuth } from '../auth';
import { createTestDatabase, type Database } from '../db';
import { judgeRun } from '../db/schema';
import { judge, JudgeError } from '.';
import { expectedAnswer, parseExpectedRequest, reference } from './expected';
import type { Sandbox } from './sandbox';

describe('the reference solution’s answer', () => {
  it('matches every problem’s own tests, typed as a learner’s own test', () => {
    for (const problem of loadProblems()) {
      const spec = specFor(problem);
      for (const test of spec.cases.filter((c) => c.group !== 'random')) {
        const own = customCase({ ...(test.input && { input: test.input }), ...(test.calls && { calls: test.calls }) });
        const answer = reference(problem, spec, own);
        if (!('expected' in answer)) throw new Error(`${problem.slug} ${test.id}: ${answer.none}`);
        // The learner's answer here is the test's own: it must match ours.
        expect(ownMismatch(spec, own, test.expected, answer.expected, 'python'), `${problem.slug} ${test.id}`).toBeNull();
      }
    }
  }, 120_000);

  it('stops at its time limit, and keeps its own errors to itself', () => {
    const problem = getProblem('two-sum')!;
    const spec = specFor(problem);
    const test = customCase({ input: { nums: [1, 2], target: 3 } });
    const slow = { ...problem, solutions: { ...problem.solutions, typescript: 'function twoSum(nums: number[], target: number): number[] { while (true) {} }' } };
    const started = Date.now();
    expect(reference(slow, spec, test, 200)).toEqual({ none: 'Our solution took longer than 0.2 s on this input, so there’s no expected answer. Is it bigger than the problem allows?' });
    expect(Date.now() - started).toBeLessThan(5_000);
    const broken = { ...problem, solutions: { ...problem.solutions, typescript: 'function twoSum(): number[] { throw new Error("secret detail"); }' } };
    const answer = reference(broken, spec, test);
    expect(answer).toEqual({ none: 'Our solution stops with an error, so this input is probably outside what the problem allows. Check its constraints.' });
    // A design problem says which call it stopped at.
    const stack = getProblem('min-stack')!;
    const failing = { ...stack, solutions: { ...stack.solutions, typescript: 'class MinStack { push(x: number) {} pop() { throw new Error("empty"); } }' } };
    expect(reference(failing, specFor(stack), customCase({ calls: [['MinStack'], ['push', 1], ['pop']] }))).toEqual({
      none: 'Our solution stops with an error at call 3, so this input is probably outside what the problem allows. Check its constraints.',
    });
  });
});

describe('the expected-answer service', () => {
  let db: Database;
  let close: () => Promise<void>;
  let auth: ReturnType<typeof createAuth>;

  beforeAll(async () => {
    ({ db, close } = await createTestDatabase());
    auth = createAuth(db);
  }, 60_000);

  afterAll(async () => {
    await close();
  });

  let learners = 0;
  async function learner(): Promise<string> {
    const res = await auth.api.signUpEmail({ body: { email: `expected-${++learners}@example.com`, password: 'correct horse battery', name: 'Ada' } });
    return res.user.id;
  }

  const ask = { slug: 'reverse-linked-list', language: 'python' as const, input: { head: [1, 2, 3] } };

  it('answers, and records the answer as its own kind of run', async () => {
    const userId = await learner();
    expect(await expectedAnswer(db, userId, ask)).toEqual({ expected: [3, 2, 1] });
    expect(await expectedAnswer(db, userId, { slug: 'min-stack', language: 'go', calls: [['MinStack'], ['push', 2], ['getMin']] })).toEqual({ expected: [null, null, 2] });
    const rows = await db.select().from(judgeRun).where(eq(judgeRun.userId, userId));
    expect(rows.map((r) => r.kind)).toEqual(['expected', 'expected']);
    expect(rows[0]).toMatchObject({ problem: 'reverse-linked-list', language: 'python', status: 'done', tests: 1, failed: 0 });
  });

  it('turns down input that doesn’t fit the signature, and unknown problems, before counting them', async () => {
    const userId = await learner();
    await expect(expectedAnswer(db, userId, { ...ask, input: { head: [1, 'two'] } })).rejects.toMatchObject({ status: 400, message: "head, item 2 should be a whole number, not 'two'." });
    await expect(expectedAnswer(db, userId, { ...ask, slug: 'no-such-problem' })).rejects.toMatchObject({ status: 404 });
    expect(await db.select().from(judgeRun).where(eq(judgeRun.userId, userId))).toEqual([]);
  });

  it('has its own hourly limit, apart from the server judge’s runs', async () => {
    const userId = await learner();
    process.env.EXPECTED_PER_HOUR = '2';
    process.env.JUDGE_RUNS_PER_HOUR = '1';
    try {
      const now = new Date();
      await expectedAnswer(db, userId, ask, now);
      await expectedAnswer(db, userId, ask, now);
      await expect(expectedAnswer(db, userId, ask, now)).rejects.toMatchObject({ status: 429, message: /this hour’s 2 expected answers/ });
      await expect(expectedAnswer(db, userId, ask, new Date(now.getTime() + 61 * 60_000))).resolves.toEqual({ expected: [3, 2, 1] });
      // Expected answers don't use up the learner's server runs.
      const sandbox: Sandbox = { name: 'fake', run: async () => ({ status: 'run 0 1', compile: '', stdout: '', stderr: '', answers: '{"i":0,"ms":1,"v":[1]}' }) };
      await expect(judge(db, sandbox, userId, { slug: ask.slug, language: 'java', code: 'class Solution {}', kind: 'custom', input: { head: [1] } }, now)).resolves.toBeDefined();
    } finally {
      delete process.env.EXPECTED_PER_HOUR;
      delete process.env.JUDGE_RUNS_PER_HOUR;
    }
  });

  it('validates requests', () => {
    expect(parseExpectedRequest(ask)).toEqual(ask);
    for (const bad of [null, { ...ask, language: 'rust' }, { ...ask, slug: '../etc' }, { ...ask, input: [1] }]) {
      expect(() => parseExpectedRequest(bad)).toThrow(JudgeError);
    }
  });
});
