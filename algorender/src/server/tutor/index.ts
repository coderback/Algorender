// The AI tutor's service, behind POST /api/tutor (REVAMP_PLAN.md §6.8).
//
// Guardrails are enforced here, not just asked for in the prompt:
// - a signed-in learner gets TUTOR_TURNS_PER_DAY turns a day, and the tutor
//   rests for everyone once the day's spend reaches TUTOR_DAILY_USD;
// - hints climb one level at a time per item (the ladder), a review needs a
//   first hint, and the last level needs a failed run and earlier turns;
// - a first hint or a review needs the learner's own account of what is
//   happening first;
// - every reply is checked for solution leaks, retried once with a stricter
//   instruction if it leaks, and replaced if it still does.

import { and, eq, gte, max, sql, sum } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { z } from 'zod';
import { getExercise } from '@/content/exercises';
import { PROBLEM_LANGUAGE_IDS, type ProblemLanguage } from '@/problems/languages';
import { getProblem, solutionIn } from '@/problems/load';
import type { Database } from '../db';
import { tutorTurn } from '../db/schema';
import { unlockedLevel, type Level } from '@/lib/tutor-ladder';
import { costOf, type ModelRole, type TutorConfig } from './config';
import { deterministicLeak, LEAK_SCHEMA, leakInstructions, parseLeak } from './leak';
import { ModelError, type TutorModel } from './model';
import { defuse, instructions, messages, parseReply, REPLY_SCHEMA, type Action, type Grounding, type LearnerState } from './prompt';

export { unlockedLevel };

export const MAX_CODE = 20_000;
const text = (n: number) => z.string().max(n);

const TutorRequestSchema = z.object({
  item: z.object({ kind: z.enum(['problem', 'exercise']), slug: z.string().regex(/^[a-z0-9-]{1,80}$/) }),
  language: z.enum(PROBLEM_LANGUAGE_IDS),
  code: text(MAX_CODE),
  action: z.enum(['hint', 'review', 'ask']),
  explanation: text(600).default(''),
  question: text(600).default(''),
  results: z
    .object({
      passed: z.number().int().min(0).max(10_000),
      total: z.number().int().min(0).max(10_000),
      fatal: text(1000).optional(),
      failing: z.object({ label: text(120), input: text(1500), expected: text(1500), got: text(1500), error: text(1000).optional() }).optional(),
    })
    .optional(),
  history: z.array(z.object({ role: z.enum(['learner', 'tutor']), text: text(2000) })).max(10).default([]),
});

export type TutorRequest = z.infer<typeof TutorRequestSchema>;

export type TutorResponse = {
  reply: string;
  /** The line of the learner's code the reply points at. */
  line: number | null;
  level: Level;
  /** The highest hint level the learner may ask for next on this item. */
  unlocked: Level;
  turnsLeft: number;
  /** The reply gave too much away and was replaced. */
  blocked: boolean;
};

/** A request the tutor turns down, with the HTTP status that says why. */
export class TutorError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export function parseTutorRequest(body: unknown): TutorRequest {
  const parsed = TutorRequestSchema.safeParse(body);
  if (!parsed.success) throw new TutorError('That isn’t a tutor request.', 400);
  return parsed.data;
}

/** What the tutor is grounded in for an item, in the learner's language. */
export function grounding(item: TutorRequest['item'], language: ProblemLanguage): Grounding {
  if (item.kind === 'problem') {
    const p = getProblem(item.slug);
    if (!p) throw new TutorError('There is no such problem.', 404);
    return {
      kind: 'problem',
      slug: p.slug,
      title: p.title,
      statement: [p.statement, '', 'Constraints:', ...p.constraints.map((c) => `- ${c}`)].join('\n'),
      hints: p.hints,
      approach: p.approach,
      solution: solutionIn(p, language),
      language,
    };
  }
  const e = getExercise(item.slug);
  if (!e) throw new TutorError('There is no such exercise.', 404);
  if (language !== 'python' && language !== 'javascript' && language !== 'typescript') throw new TutorError('Exercises are in Python, JavaScript and TypeScript.', 400);
  return { kind: 'exercise', slug: e.slug, title: e.title, statement: e.task.join('\n\n'), hints: e.hints ?? [], solution: e.solution[language], language };
}

const startOfDay = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
const LADDER_WINDOW_MS = 30 * 86_400_000;

/** How many turns the learner has taken today, the day's spend across everyone, and the item's highest level so far. */
async function usage(db: Database, userId: string, item: string, now: Date) {
  const day = startOfDay(now);
  const [[mine], [all], [ladder]] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(tutorTurn).where(and(eq(tutorTurn.userId, userId), gte(tutorTurn.createdAt, day))),
    db.select({ usd: sum(tutorTurn.costUsd) }).from(tutorTurn).where(gte(tutorTurn.createdAt, day)),
    db
      .select({ level: max(tutorTurn.level), turns: sql<number>`count(*)::int` })
      .from(tutorTurn)
      .where(and(eq(tutorTurn.userId, userId), eq(tutorTurn.item, item), gte(tutorTurn.createdAt, new Date(now.getTime() - LADDER_WINDOW_MS)))),
  ]);
  return { turns: Number(mine.n), spent: Number(all.usd ?? 0), top: Number(ladder.level ?? 0), itemTurns: Number(ladder.turns) };
}

/** What the panel needs before the learner asks: turns left today, and how far up the ladder they are on an item. */
export async function tutorStatus(db: Database, config: TutorConfig, userId: string, item: string, now = new Date()) {
  const { turns, top, itemTurns } = await usage(db, userId, item, now);
  return { turnsLeft: Math.max(0, config.turnsPerDay - turns), top, itemTurns };
}

const FALLBACK = 'That answer gave away too much, so here’s what to do instead: look again at the step I pointed you to, change one thing, run the tests, and ask me again if you’re still stuck.';

export async function tutor(db: Database, model: TutorModel, config: TutorConfig, userId: string, request: TutorRequest, now = new Date()): Promise<TutorResponse> {
  const item = grounding(request.item, request.language);
  const key = `${request.item.kind}:${request.item.slug}`;
  const { turns, spent, top, itemTurns } = await usage(db, userId, key, now);
  if (turns >= config.turnsPerDay) throw new TutorError(`You’ve used today’s ${config.turnsPerDay} tutor turns. They come back tomorrow; the hints in the problem are always there.`, 429);
  if (spent >= config.dailyUsd) throw new TutorError('The tutor has reached its budget for today and will be back tomorrow. The hints in the problem are always there.', 503);

  const failedRun = !!request.results && (!!request.results.fatal || request.results.passed < request.results.total);
  const unlocked = unlockedLevel(top, itemTurns, failedRun);
  const action: Action = request.action;
  // The first turn on an item, and every review, starts from the learner's own account of what is going on.
  if ((top === 0 || action === 'review') && request.explanation.trim().length < 5) {
    throw new TutorError('Say in a sentence what you think is happening first: it’s the most useful thing you can do before asking for help.', 400);
  }
  if (action === 'review' && top === 0) throw new TutorError('Ask for a hint first; a review comes after that.', 400);
  if (action === 'review' && !failedRun) throw new TutorError('Run the tests first, so the review has something to explain.', 400);
  if (action === 'ask' && request.question.trim().length < 3) throw new TutorError('Ask a question.', 400);
  const level: Level = action === 'hint' ? unlocked : action === 'review' ? (Math.max(2, Math.min(top, 3)) as Level) : (Math.max(1, top) as Level);
  const role: ModelRole = action === 'review' ? 'strong' : 'fast';

  const state: LearnerState = { code: request.code, explanation: request.explanation, question: request.question, results: request.results, history: request.history };
  let inputTokens = 0;
  let outputTokens = 0;
  let cost = 0;
  const call = async (r: ModelRole, req: Parameters<TutorModel['complete']>[0]) => {
    const reply = await model.complete(req);
    inputTokens += reply.inputTokens;
    outputTokens += reply.outputTokens;
    cost += costOf(config, r, reply.inputTokens, reply.outputTokens);
    return reply.text;
  };
  const ask = async (stricter: boolean) => {
    const system = instructions(item, action, level) + (stricter ? '\nYour previous answer gave away too much. Give a smaller hint this time.' : '');
    return parseReply(await call(role, { role, instructions: system, messages: messages(item, action, state), maxTokens: 400, schema: REPLY_SCHEMA }));
  };
  const leaks = async (reply: string) => {
    if (deterministicLeak(reply, item.solution, request.code, level).leaks) return true;
    if (level < 3 && action !== 'review') return false;
    const verdict = await call('fast', {
      role: 'fast',
      instructions: leakInstructions(level),
      messages: [{ role: 'user', content: `<reference_solution>\n${item.solution}\n</reference_solution>\n<reply>\n${defuse(reply)}\n</reply>` }],
      maxTokens: 120,
      schema: LEAK_SCHEMA,
    });
    return parseLeak(verdict).leaks;
  };

  let reply: { message: string; line: number | null };
  let blocked = false;
  try {
    reply = await ask(false);
    if (await leaks(reply.message)) {
      reply = await ask(true);
      if (await leaks(reply.message)) {
        reply = { message: FALLBACK, line: reply.line };
        blocked = true;
      }
    }
  } catch (e) {
    if (e instanceof ModelError) {
      console.error('The tutor model failed:', e.message);
      throw new TutorError('The tutor couldn’t answer just now. Try again in a moment.', 502);
    }
    throw e;
  }

  const lines = request.code.split('\n').length;
  const line = level >= 2 && reply.line != null && reply.line >= 1 && reply.line <= lines ? reply.line : null;
  await db.insert(tutorTurn).values({ id: uuidv7(), userId, item: key, action, level, inputTokens, outputTokens, costUsd: cost, leakBlocked: blocked, createdAt: now });
  return {
    reply: reply.message || 'Try running the tests again and look closely at the first one that fails.',
    line,
    level,
    unlocked: action === 'hint' ? unlockedLevel(Math.max(top, level), itemTurns + 1, failedRun) : unlocked,
    turnsLeft: Math.max(0, config.turnsPerDay - turns - 1),
    blocked,
  };
}
