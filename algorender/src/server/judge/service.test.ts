// The judge service on a real (in-memory) Postgres with a stand-in sandbox:
// quotas, one run at a time, recorded runs, and verdicts written as verified
// events that only the server can write.

import { eq } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SandboxOutput } from '@/problems/drivers';
import { getProblem, specFor } from '@/problems/load';
import { createAuth } from '../auth';
import { createTestDatabase, type Database } from '../db';
import { judgeRun } from '../db/schema';
import { sync } from '../progress';
import { judge, JudgeError, MAX_CODE, parseJudgeRequest, type JudgeRequest } from '.';
import type { Sandbox } from './sandbox';

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
  const res = await auth.api.signUpEmail({ body: { email: `judge-${++learners}@example.com`, password: 'correct horse battery', name: 'Ada' } });
  return res.user.id;
}

const SLUG = 'reverse-linked-list';
const spec = specFor(getProblem(SLUG)!);

/** A sandbox that answers every test with its expected answer (or a wrong one), as the driver would write them. */
function fakeSandbox({ wrong = false, fail = false } = {}): Sandbox & { runs: number } {
  return {
    name: 'fake',
    runs: 0,
    async run(files): Promise<SandboxOutput> {
      this.runs++;
      if (fail) throw new Error('the sandbox is down');
      const count = Number(files['tests.txt'].split('\n')[0]);
      const answers = spec.cases
        .slice(0, count)
        .map((c, i) => JSON.stringify({ i, ms: 1, v: wrong && i === 0 ? [42] : c.expected }))
        .join('\n');
      return { status: 'run 0 1', compile: '', stdout: '', stderr: '', answers };
    },
  };
}

const request = (kind: 'run' | 'submit', code = 'class Solution {}'): JudgeRequest => ({ slug: SLUG, language: 'java', code, kind });

describe('the judge service', () => {
  it('runs the examples, and records the run without an event', async () => {
    const userId = await learner();
    const result = await judge(db, fakeSandbox(), userId, request('run'));
    const examples = spec.cases.filter((c) => c.group === 'example');
    expect(result.checked.map((c) => c.verdict.status)).toEqual(examples.map(() => 'pass'));
    expect(result.event).toBeUndefined();
    const [row] = await db.select().from(judgeRun).where(eq(judgeRun.userId, userId));
    expect(row).toMatchObject({ problem: SLUG, language: 'java', kind: 'run', status: 'done', tests: examples.length, failed: 0 });
  });

  it('writes a submission’s verdict as a verified event the learner’s devices pull', async () => {
    const userId = await learner();
    const passed = await judge(db, fakeSandbox(), userId, request('submit'));
    expect(passed.event).toMatchObject({ kind: 'problem.submitted', data: { problem: SLUG, language: 'java', passed: true, tests: spec.cases.length, failed: 0, verified: true } });
    const failed = await judge(db, fakeSandbox({ wrong: true }), userId, request('submit'));
    expect(failed.event?.data).toMatchObject({ passed: false, failed: 1 });
    const pulled = await sync(db, userId, { events: [], cursor: 0 });
    expect(pulled.events.map((e) => e.id)).toEqual([passed.event!.id, failed.event!.id]);
  });

  it('drops a device’s own claim to a verified submission', async () => {
    const userId = await learner();
    const forged = { id: uuidv7(), kind: 'problem.submitted', at: new Date().toISOString(), data: { problem: SLUG, language: 'java', passed: true, tests: 9, failed: 0, verified: true } };
    const res = await sync(db, userId, { events: [forged], cursor: 0 });
    expect(res.accepted).toEqual([forged.id]);
    expect(res.events[0].data).not.toHaveProperty('verified');
  });

  it('allows one run at a time, but not a run its server abandoned', async () => {
    const userId = await learner();
    const now = new Date();
    await db.insert(judgeRun).values({ id: uuidv7(), userId, problem: SLUG, language: 'go', kind: 'run', status: 'running', tests: 3, createdAt: now });
    await expect(judge(db, fakeSandbox(), userId, request('run'), now)).rejects.toMatchObject({ status: 429, message: /still going/ });
    const later = new Date(now.getTime() + 5 * 60_000);
    await expect(judge(db, fakeSandbox(), userId, request('run'), later)).resolves.toBeDefined();
  });

  it('stops at the hourly quota, and starts again an hour later', async () => {
    const userId = await learner();
    process.env.JUDGE_RUNS_PER_HOUR = '2';
    try {
      const now = new Date();
      const sandbox = fakeSandbox();
      await judge(db, sandbox, userId, request('run'), now);
      await judge(db, sandbox, userId, request('run'), now);
      await expect(judge(db, sandbox, userId, request('run'), now)).rejects.toMatchObject({ status: 429, message: /this hour’s 2 server runs/ });
      expect(sandbox.runs).toBe(2);
      await expect(judge(db, sandbox, userId, request('run'), new Date(now.getTime() + 61 * 60_000))).resolves.toBeDefined();
    } finally {
      delete process.env.JUDGE_RUNS_PER_HOUR;
    }
  });

  it('says so when the sandbox fails, and marks the run failed', async () => {
    const userId = await learner();
    await expect(judge(db, fakeSandbox({ fail: true }), userId, request('submit'))).rejects.toMatchObject({ status: 502 });
    const [row] = await db.select().from(judgeRun).where(eq(judgeRun.userId, userId));
    expect(row.status).toBe('failed');
    expect((await sync(db, userId, { events: [], cursor: 0 })).events).toEqual([]);
  });

  it('refuses unknown problems', async () => {
    await expect(judge(db, fakeSandbox(), await learner(), { ...request('run'), slug: 'no-such-problem' })).rejects.toMatchObject({ status: 404 });
  });

  it('validates requests: a server language, a problem slug, and code of a sensible size', () => {
    const ok = { slug: SLUG, language: 'go', code: 'func f() {}', kind: 'submit' };
    expect(parseJudgeRequest(ok)).toEqual(ok);
    for (const bad of [null, { ...ok, language: 'python' }, { ...ok, slug: '../etc' }, { ...ok, kind: 'watch' }, { ...ok, code: '' }]) {
      expect(() => parseJudgeRequest(bad)).toThrow(JudgeError);
    }
    expect(() => parseJudgeRequest({ ...ok, code: 'x'.repeat(MAX_CODE + 1) })).toThrow(/limited to 64,000 characters/);
  });
});
