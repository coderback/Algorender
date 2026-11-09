// The server judge's service, behind POST /api/judge: checks the request and
// the learner's quota, runs their code in the sandbox, and records the run.
// A submission's verdict becomes a `problem.submitted` event written here,
// marked verified, which reaches the learner's devices like any other.

import { and, count, eq, gt, ne } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { z } from 'zod';
import { customCase, customError, type CustomInput } from '@/problems/custom';
import type { ServerVerdicts } from '@/problems/drivers';
import type { JudgeCase, ProblemSpec } from '@/problems/judge';
import { isServerLanguage, type ServerLanguage } from '@/problems/languages';
import { getProblem, specFor } from '@/problems/load';
import type { ProgressEvent } from '@/progress/events';
import type { Database } from '../db';
import { judgeRun } from '../db/schema';
import { storeEvents } from '../progress';
import { judgeInSandbox, type Sandbox } from './sandbox';

/** The longest code accepted, in characters. */
export const MAX_CODE = 64_000;

const number = (value: string | undefined, fallback: number) => (value && Number.isFinite(Number(value)) ? Number(value) : fallback);

/** Runs each learner may start per hour and per day (JUDGE_RUNS_PER_HOUR, JUDGE_RUNS_PER_DAY). */
export const quota = () => ({ hour: number(process.env.JUDGE_RUNS_PER_HOUR, 30), day: number(process.env.JUDGE_RUNS_PER_DAY, 200) });

/** A run still marked 'running' after this long died with its server, and no longer blocks the next one. */
const STALE_MS = 3 * 60_000;

const HOUR = 3_600_000;

const JudgeRequestSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]{1,80}$/),
  language: z.string().refine(isServerLanguage, 'The server judge runs Java, C++ and Go.'),
  code: z.string().min(1).max(MAX_CODE),
  kind: z.enum(['run', 'submit', 'custom']),
  /** A custom test's values (kind 'custom'): a function problem's arguments by name, or a design problem's calls. Checked against the signature in judge(). */
  input: z.record(z.string(), z.unknown()).optional(),
  calls: z.array(z.unknown()).optional(),
});

/** Run the examples, submit every test, or run the learner's own test ('custom', with its input or calls). */
export type JudgeRequest = { slug: string; language: ServerLanguage; code: string; kind: 'run' | 'submit' | 'custom' } & CustomInput;

/** What /api/judge answers: the verdicts, and for a submission the event recorded for it. */
export type JudgeResponse = ServerVerdicts & { event?: ProgressEvent };

/** A request the judge turns down, with the HTTP status that says why. */
export class JudgeError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export function parseJudgeRequest(body: unknown): JudgeRequest {
  const parsed = JudgeRequestSchema.safeParse(body);
  if (!parsed.success) {
    const tooLong = parsed.error.issues.some((i) => i.path[0] === 'code' && i.code === 'too_big');
    throw new JudgeError(tooLong ? `Code is limited to ${MAX_CODE.toLocaleString('en')} characters.` : 'That isn’t a judge request.', 400);
  }
  return parsed.data as JudgeRequest;
}

/** Turns the request down when the learner has a run going already, or has used up their runs for the hour or the day. */
async function checkQuota(db: Database, userId: string, now: Date) {
  // Expected answers (expected.ts) have their own limit.
  const since = (ms: number) => and(eq(judgeRun.userId, userId), ne(judgeRun.kind, 'expected'), gt(judgeRun.createdAt, new Date(now.getTime() - ms)));
  const [[running], [hour], [day]] = await Promise.all([
    db.select({ n: count() }).from(judgeRun).where(and(since(STALE_MS), eq(judgeRun.status, 'running'))),
    db.select({ n: count() }).from(judgeRun).where(since(HOUR)),
    db.select({ n: count() }).from(judgeRun).where(since(24 * HOUR)),
  ]);
  const limits = quota();
  if (running.n > 0) throw new JudgeError('Your last run is still going; wait for it to finish.', 429);
  if (hour.n >= limits.hour) throw new JudgeError(`You’ve used this hour’s ${limits.hour} server runs. Python, JavaScript and TypeScript run in your browser, without a limit.`, 429);
  if (day.n >= limits.day) throw new JudgeError(`You’ve used today’s ${limits.day} server runs. Python, JavaScript and TypeScript run in your browser, without a limit.`, 429);
}

/** Judges a request for a signed-in learner. */
export async function judge(db: Database, sandbox: Sandbox, userId: string, request: JudgeRequest, now = new Date()): Promise<JudgeResponse> {
  const problem = getProblem(request.slug);
  if (!problem) throw new JudgeError('There is no such problem.', 404);
  const spec = specFor(problem);
  // A custom test is checked before it counts against the learner's runs.
  const tests = testsFor(spec, request);
  await checkQuota(db, userId, now);

  const id = uuidv7();
  await db.insert(judgeRun).values({ id, userId, problem: problem.slug, language: request.language, kind: request.kind, status: 'running', tests: tests.length, createdAt: now });

  const started = Date.now();
  let verdicts: ServerVerdicts;
  try {
    verdicts = await judgeInSandbox(sandbox, spec, request.language, request.code, tests);
  } catch (e) {
    console.error(`The ${sandbox.name} sandbox failed:`, e);
    await db.update(judgeRun).set({ status: 'failed', seconds: (Date.now() - started) / 1000 }).where(eq(judgeRun.id, id));
    throw new JudgeError('The judge couldn’t run your code just now. Try again in a moment.', 502);
  }

  // A custom test that ran has nothing to fail: there's no expected answer.
  const failed = verdicts.fatal ? tests.length : verdicts.checked.filter((c) => c.verdict.status !== 'pass' && c.verdict.status !== 'ran').length + verdicts.skipped;
  await db.update(judgeRun).set({ status: 'done', failed, seconds: (Date.now() - started) / 1000 }).where(eq(judgeRun.id, id));
  if (request.kind !== 'submit') return verdicts;

  const event: ProgressEvent = {
    id: uuidv7(),
    kind: 'problem.submitted',
    at: new Date().toISOString(),
    data: { problem: problem.slug, language: request.language, passed: failed === 0, tests: tests.length, failed, verified: true },
  };
  await storeEvents(db, userId, [event]);
  return { ...verdicts, event };
}

/** The tests a request runs: the examples, every test, or the learner's own, once it fits the problem's signature. */
function testsFor(spec: ProblemSpec, request: JudgeRequest): JudgeCase[] {
  if (request.kind === 'run') return spec.cases.filter((c) => c.group === 'example');
  if (request.kind === 'submit') return spec.cases;
  const custom = { ...(request.input !== undefined && { input: request.input }), ...(request.calls !== undefined && { calls: request.calls }) };
  const problem = customError(spec, custom, request.language);
  if (problem) throw new JudgeError(problem, 400);
  return [customCase(custom)];
}
