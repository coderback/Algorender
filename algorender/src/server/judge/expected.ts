// The expected answer to a learner's own test, behind POST /api/expected: the
// problem's reference solution (the TypeScript one, trusted code) runs here
// on the learner's input, with a time limit. The solution itself never
// leaves the server; only its answer does. Signed-in learners only, with an
// hourly and daily limit counted in the judge_run table (kind 'expected'),
// apart from the server judge's own runs.

import vm from 'node:vm';
import { and, count, eq, gt } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { z } from 'zod';
import { customCase, customError, type CustomInput } from '@/problems/custom';
import { answerOf, judgeRequest, type JudgeCase, type ProblemSpec } from '@/problems/judge';
import { isProblemLanguage, type ProblemLanguage } from '@/problems/languages';
import { getProblem, specFor } from '@/problems/load';
import type { Problem } from '@/problems/schema';
import { runJs } from '@/workspace/js/runtime';
import type { Json, RunResult } from '@/workspace/protocol';
import type { Database } from '../db';
import { judgeRun } from '../db/schema';
import { JudgeError } from '.';

const number = (value: string | undefined, fallback: number) => (value && Number.isFinite(Number(value)) ? Number(value) : fallback);

/** Expected answers each learner may ask for per hour and per day (EXPECTED_PER_HOUR, EXPECTED_PER_DAY). */
export const expectedQuota = () => ({ hour: number(process.env.EXPECTED_PER_HOUR, 60), day: number(process.env.EXPECTED_PER_DAY, 300) });

/** The longest the reference solution may take on a learner's input. Problems' own tests take a few milliseconds. */
export const EXPECTED_MS = 2_000;

const HOUR = 3_600_000;

const ExpectedRequestSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]{1,80}$/),
  /** The learner's language: messages about the input name things as it does. */
  language: z.string().refine(isProblemLanguage),
  input: z.record(z.string(), z.unknown()).optional(),
  calls: z.array(z.unknown()).optional(),
});

export type ExpectedRequest = { slug: string; language: ProblemLanguage } & CustomInput;

/** The reference solution's answer, or why it has none (it raised, or ran past the limit). */
export type ExpectedResponse = { expected: Json } | { none: string };

export function parseExpectedRequest(body: unknown): ExpectedRequest {
  const parsed = ExpectedRequestSchema.safeParse(body);
  if (!parsed.success) throw new JudgeError('That isn’t a request for an expected answer.', 400);
  return parsed.data as ExpectedRequest;
}

/** The expected answer to a signed-in learner's own test, counted against their limit once the input fits the signature. */
export async function expectedAnswer(db: Database, userId: string, request: ExpectedRequest, now = new Date()): Promise<ExpectedResponse> {
  const problem = getProblem(request.slug);
  if (!problem) throw new JudgeError('There is no such problem.', 404);
  const spec = specFor(problem);
  const custom: CustomInput = { ...(request.input !== undefined && { input: request.input }), ...(request.calls !== undefined && { calls: request.calls }) };
  const wrong = customError(spec, custom, request.language);
  if (wrong) throw new JudgeError(wrong, 400);
  await checkQuota(db, userId, now);

  const started = Date.now();
  const answer = reference(problem, spec, customCase(custom));
  await db.insert(judgeRun).values({
    id: uuidv7(),
    userId,
    problem: problem.slug,
    language: request.language,
    kind: 'expected',
    status: 'done',
    tests: 1,
    failed: 'none' in answer ? 1 : 0,
    seconds: (Date.now() - started) / 1000,
    createdAt: now,
  });
  return answer;
}

async function checkQuota(db: Database, userId: string, now: Date) {
  const since = (ms: number) => and(eq(judgeRun.userId, userId), eq(judgeRun.kind, 'expected'), gt(judgeRun.createdAt, new Date(now.getTime() - ms)));
  const [[hour], [day]] = await Promise.all([db.select({ n: count() }).from(judgeRun).where(since(HOUR)), db.select({ n: count() }).from(judgeRun).where(since(24 * HOUR))]);
  const limits = expectedQuota();
  if (hour.n >= limits.hour) throw new JudgeError(`You’ve seen this hour’s ${limits.hour} expected answers. Your test still runs; work out what it should give.`, 429);
  if (day.n >= limits.day) throw new JudgeError(`You’ve seen today’s ${limits.day} expected answers. Your test still runs; work out what it should give.`, 429);
}

/**
 * The reference solution's answer to a test. It runs in this process, so the
 * time limit is vm's: its watchdog stops any JavaScript running inside the
 * call, the solution included, after `ms`.
 */
export function reference(problem: Problem, spec: ProblemSpec, test: JudgeCase, ms = EXPECTED_MS): ExpectedResponse {
  const request = judgeRequest(spec, test, 'typescript', problem.solutions.typescript);
  let result: RunResult;
  try {
    result = vm.runInNewContext('run()', { run: () => runJs(request) }, { timeout: ms }) as RunResult;
  } catch (e) {
    if ((e as { code?: string }).code === 'ERR_SCRIPT_EXECUTION_TIMEOUT') {
      return { none: `Our solution took longer than ${ms / 1000} s on this input, so there’s no expected answer. Is it bigger than the problem allows?` };
    }
    throw e;
  }
  // The error's message and line are left out: they would describe our solution.
  if (result.error) {
    const calls = test.calls ?? [];
    const at = spec.design && Array.isArray(result.returned) ? result.returned.length : -1;
    const where = at >= 0 && at < calls.length ? ` at call ${at + 1}` : '';
    return { none: `Our solution stops with an error${where}, so this input is probably outside what the problem allows. Check its constraints.` };
  }
  return { expected: answerOf(spec, result) };
}
