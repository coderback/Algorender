// Mock interviews' service, behind POST /api/interview (REVAMP_PLAN.md 6f).
// A coding round on a practice problem: clarify, approach, code, test, then
// a debrief. The server is the round's clock and state machine, and enforces:
// - signed-in learners only (the route's job), INTERVIEW_ROUNDS_PER_DAY rounds
//   a day each, and a round starts only with room for twice its cost in both
//   the interviews' share of the day's spend and the tutor's whole cap;
// - every open round's debrief is held back from that room, so a round
//   always gets its debrief; when a round's replies or the budget run out,
//   the interviewer falls back to scripted lines instead;
// - the approach (enough words, both complexities) before the code, and the
//   learner's list of test cases before a submission;
// - hints are the tutor's ladder, levels 1 to 3, one at a time, the first
//   only after the learner's own account of where they are;
// - every interviewer reply is leak-checked (the deterministic check and the
//   model's), and its own questions may not name the pattern before the
//   learner does (the giveaway check); a reply that fails is retried once
//   with a stricter instruction, then replaced;
// - at the end, the debrief: correctness from the submissions, the rest from
//   the strong model, checked (debrief.ts); and an `interview.finished`
//   event, written here and marked verified.
// TODO(billing): rounds are free to signed-in learners until billing exists.

import { and, count, desc, eq, gte, inArray, isNotNull, isNull, sum } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { z } from 'zod';
import {
  APPROACH_MIN_WORDS,
  COMPLEXITY_IDS,
  correctnessScore,
  edgeCaseList,
  endedPassing,
  giveaway,
  LENGTHS,
  MAX_HINT,
  nextPhase,
  slowerThanReference,
  unsaidTerms,
  wordCount,
  type ComplexityId,
  type Phase,
  type Score,
  type WorkPhase,
} from '@/interview/rules';
import type { Level } from '@/lib/tutor-ladder';
import { PROBLEM_LANGUAGE_IDS, isServerLanguage, type ProblemLanguage } from '@/problems/languages';
import { getProblem, loadProblems, solutionIn } from '@/problems/load';
import { PATTERN_IDS } from '@/problems/patterns';
import type { Problem } from '@/problems/schema';
import type { ProgressEvent } from '@/progress/events';
import type { Database } from '../db';
import { interviewRound, progressEvent, tutorTurn } from '../db/schema';
import { judge, JudgeError, type JudgeResponse } from '../judge';
import type { Sandbox } from '../judge/sandbox';
import { storeEvents } from '../progress';
import { costOf, type ModelRole } from '../tutor/config';
import { INTERVIEW_ACTIONS, startOfDay } from '../tutor';
import { deterministicLeak, LEAK_SCHEMA, leakInstructions, parseLeak } from '../tutor/leak';
import { ModelError, type ModelRequest, type TutorModel } from '../tutor/model';
import { defuse, parseReply } from '../tutor/prompt';
import { debriefEstimate, replyEstimate, roundEstimate, type InterviewConfig } from './config';
import { DEBRIEF_SCHEMA, debriefInstructions, debriefMessage, debriefProse, learnerText, parseDebrief, selfScored, type Debrief, type DimensionResult } from './debrief';
import { INTERVIEWER_SCHEMA, interviewerInstructions, interviewerMessages, SCRIPTED, type InterviewAction, type InterviewGrounding, type RoundState, type TranscriptEntry } from './prompt';

export const MAX_CODE = 20_000;
const MAX_TEXT = 1_200;
/** An open round younger than this stops the learner starting another; an older one was left, and is only theirs to end. */
const OPEN_FOR_MS = 3 * 3_600_000;
/** Ended rounds the hub lists, newest first. */
const RECENT = 20;

/** A request the service turns down, with the HTTP status that says why. */
export class InterviewError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly round?: string,
  ) {
    super(message);
  }
}

const id = z.uuid();
const slug = z.string().regex(/^[a-z0-9-]{1,80}$/);
const code = z.string().max(MAX_CODE).optional();

const RequestSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('start'),
    language: z.enum(PROBLEM_LANGUAGE_IDS),
    limit: z.union(LENGTHS.map((n) => z.literal(n)) as unknown as [z.ZodLiteral<30>, z.ZodLiteral<45>, z.ZodLiteral<60>]),
    level: z.enum(['easy', 'medium', 'hard']).optional(),
    pattern: z.enum(PATTERN_IDS).optional(),
    /** A particular problem, instead of one drawn from the filters. */
    problem: slug.optional(),
  }),
  z.object({ action: z.literal('say'), round: id, text: z.string().trim().min(1).max(MAX_TEXT), code }),
  z.object({ action: z.literal('approach'), round: id, text: z.string().trim().max(MAX_TEXT * 2), time: z.enum(COMPLEXITY_IDS), space: z.enum(COMPLEXITY_IDS), code }),
  z.object({ action: z.literal('hint'), round: id, account: z.string().trim().max(MAX_TEXT).default(''), code }),
  z.object({ action: z.literal('phase'), round: id, to: z.enum(['approach', 'code', 'test']), code }),
  z.object({
    action: z.literal('submit'),
    round: id,
    code: z.string().min(1).max(MAX_CODE),
    cases: z.string().max(MAX_TEXT * 2),
    /** A browser-judged submission's counts (Python, JavaScript, TypeScript); Java, C++ and Go are judged here. */
    results: z.object({ tests: z.number().int().min(0).max(10_000), failed: z.number().int().min(0).max(10_000) }).optional(),
  }),
  z.object({ action: z.literal('end'), round: id, code }),
  z.object({ action: z.literal('self'), round: id, scores: z.record(z.string(), z.number().int()) }),
  z.object({ action: z.literal('delete'), round: id }),
]);

export type InterviewRequest = z.infer<typeof RequestSchema>;

export function parseInterviewRequest(body: unknown): InterviewRequest {
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) throw new InterviewError('That isn’t an interview request.', 400);
  return parsed.data;
}

type Row = typeof interviewRound.$inferSelect;
type Submission = { tests: number; failed: number; at: string; verified?: boolean };

/** A round as the page sees it. Times are ISO strings; `now` is the server's clock, so the page's timer follows it. */
export type RoundView = {
  id: string;
  item: string;
  language: ProblemLanguage;
  limit: number;
  phase: Phase;
  phases: Partial<Record<Phase, string>>;
  startedAt: string;
  endedAt: string | null;
  now: string;
  hints: number;
  repliesLeft: number;
  transcript: TranscriptEntry[];
  approach: { text: string; time: string; space: string } | null;
  edgeCases: string;
  submissions: Submission[];
  debrief: Debrief | null;
  passed: boolean | null;
  scoredBy: 'model' | 'self' | 'pending' | null;
  /** The problem was solved before this round started. */
  repeat: boolean;
};

export type InterviewResponse = { round: RoundView; event?: ProgressEvent; judge?: JudgeResponse };

export function view(row: Row, config: InterviewConfig, now: Date): RoundView {
  return {
    id: row.id,
    item: row.item,
    language: row.language as ProblemLanguage,
    limit: row.limitMin,
    phase: row.phase as Phase,
    phases: row.phases as RoundView['phases'],
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt?.toISOString() ?? null,
    now: now.toISOString(),
    hints: row.hints,
    repliesLeft: Math.max(0, config.replies - row.replies),
    transcript: row.transcript as TranscriptEntry[],
    approach: (row.approach as RoundView['approach']) ?? null,
    edgeCases: row.edgeCases ?? '',
    submissions: row.submissions as Submission[],
    debrief: (row.debrief as Debrief | null) ?? null,
    passed: row.passed,
    scoredBy: (row.scoredBy as RoundView['scoredBy']) ?? null,
    repeat: row.repeat,
  };
}

/** The interviewer's grounding: the tutor's, plus the problem's pattern, why and complexity. */
export function interviewGrounding(p: Problem, language: ProblemLanguage): InterviewGrounding {
  return {
    slug: p.slug,
    title: p.title,
    statement: [p.statement, '', 'Constraints:', ...p.constraints.map((c) => `- ${c}`)].join('\n'),
    hints: p.hints,
    approach: p.approach,
    why: p.why,
    patterns: p.patterns,
    complexity: p.complexity,
    solution: solutionIn(p, language),
    language,
  };
}

// ── Budgets ─────────────────────────────────────────────────────────────────

/** Today's spend across everyone (all model calls, and interviews' alone), and the debriefs held back for open rounds. */
async function spending(db: Database, config: InterviewConfig, now: Date) {
  const day = startOfDay(now);
  const [[all], [interviews], [open]] = await Promise.all([
    db.select({ usd: sum(tutorTurn.costUsd) }).from(tutorTurn).where(gte(tutorTurn.createdAt, day)),
    db
      .select({ usd: sum(tutorTurn.costUsd) })
      .from(tutorTurn)
      .where(and(gte(tutorTurn.createdAt, day), inArray(tutorTurn.action, INTERVIEW_ACTIONS))),
    db
      .select({ n: count() })
      .from(interviewRound)
      .where(and(gte(interviewRound.startedAt, day), isNull(interviewRound.endedAt))),
  ]);
  const reserved = open.n * debriefEstimate(config);
  return { total: Number(all.usd ?? 0), interviews: Number(interviews.usd ?? 0), reserved };
}

/** Room left today in the tutor's cap and in the interviews' share, after the debriefs held back. */
async function room(db: Database, config: InterviewConfig, now: Date) {
  const s = await spending(db, config, now);
  return { total: config.tutor.dailyUsd - s.total - s.reserved, interviews: config.dailyUsd - s.interviews - s.reserved };
}

async function roundsToday(db: Database, userId: string, now: Date) {
  const [r] = await db
    .select({ n: count() })
    .from(interviewRound)
    .where(and(eq(interviewRound.userId, userId), gte(interviewRound.startedAt, startOfDay(now))));
  return r.n;
}

/** What the hub needs: rounds left today, whether a round could start now, and the learner's unfinished rounds. */
export async function interviewStatus(db: Database, config: InterviewConfig, userId: string, now = new Date()) {
  const [used, left, open, recent] = await Promise.all([
    roundsToday(db, userId, now),
    room(db, config, now),
    db
      .select({ id: interviewRound.id, item: interviewRound.item, startedAt: interviewRound.startedAt, phase: interviewRound.phase })
      .from(interviewRound)
      .where(and(eq(interviewRound.userId, userId), isNull(interviewRound.endedAt)))
      .orderBy(interviewRound.startedAt),
    db
      .select({
        id: interviewRound.id,
        item: interviewRound.item,
        language: interviewRound.language,
        startedAt: interviewRound.startedAt,
        endedAt: interviewRound.endedAt,
        limitMin: interviewRound.limitMin,
        hints: interviewRound.hints,
        passed: interviewRound.passed,
        scoredBy: interviewRound.scoredBy,
        debrief: interviewRound.debrief,
      })
      .from(interviewRound)
      .where(and(eq(interviewRound.userId, userId), isNotNull(interviewRound.endedAt)))
      .orderBy(desc(interviewRound.endedAt))
      .limit(RECENT),
  ]);
  const need = 2 * roundEstimate(config);
  return {
    roundsLeft: Math.max(0, config.roundsPerDay - used),
    roundsPerDay: config.roundsPerDay,
    budget: left.total >= need && left.interviews >= need,
    open: open.map((r) => ({ id: r.id, item: r.item, phase: r.phase, startedAt: r.startedAt.toISOString(), title: getProblem(r.item)?.title ?? r.item })),
    recent: recent.map((r) => ({
      id: r.id,
      item: r.item,
      title: getProblem(r.item)?.title ?? r.item,
      language: r.language as ProblemLanguage,
      endedAt: r.endedAt!.toISOString(),
      minutes: Math.round((r.endedAt!.getTime() - r.startedAt.getTime()) / 60_000),
      limit: r.limitMin,
      hints: r.hints,
      passed: !!r.passed,
      scoredBy: r.scoredBy,
      scores: ((r.debrief as Debrief | null)?.dimensions ?? []).map((d) => ({ dimension: d.dimension, score: d.score })),
    })),
  };
}

// ── Rounds ──────────────────────────────────────────────────────────────────

type Deps = { db: Database; model: TutorModel; config: InterviewConfig; sandbox?: Sandbox | null };

async function solvedProblems(db: Database, userId: string): Promise<Set<string>> {
  const rows = await db
    .select({ data: progressEvent.data })
    .from(progressEvent)
    .where(and(eq(progressEvent.userId, userId), eq(progressEvent.kind, 'problem.submitted')));
  return new Set(rows.map((r) => r.data as { problem: string; passed: boolean }).filter((d) => d.passed).map((d) => d.problem));
}

/** A problem for the round: one the learner hasn't solved, from the filters, else any from them (a repeat). */
function chooseProblem(request: Extract<InterviewRequest, { action: 'start' }>, solved: Set<string>, random: () => number): Problem {
  if (request.problem) {
    const p = getProblem(request.problem);
    if (!p) throw new InterviewError('There is no such problem.', 404);
    return p;
  }
  const matching = loadProblems().filter((p) => (!request.level || p.difficulty === request.level) && (!request.pattern || p.patterns.includes(request.pattern)));
  if (matching.length === 0) throw new InterviewError('No problem matches those settings. Try fewer filters.', 404);
  const fresh = matching.filter((p) => !solved.has(p.slug));
  const pool = fresh.length > 0 ? fresh : matching;
  return pool[Math.floor(random() * pool.length)];
}

export async function startRound({ db, config }: Deps, userId: string, request: Extract<InterviewRequest, { action: 'start' }>, now = new Date(), random = Math.random): Promise<InterviewResponse> {
  const [used, left, [open]] = await Promise.all([
    roundsToday(db, userId, now),
    room(db, config, now),
    db
      .select({ id: interviewRound.id })
      .from(interviewRound)
      .where(and(eq(interviewRound.userId, userId), isNull(interviewRound.endedAt), gte(interviewRound.startedAt, new Date(now.getTime() - OPEN_FOR_MS))))
      .limit(1),
  ]);
  if (open) throw new InterviewError('You have a round in progress. Finish it or end it before starting another.', 409, open.id);
  if (used >= config.roundsPerDay) throw new InterviewError(`You’ve had today’s ${config.roundsPerDay} mock interviews. More tomorrow.`, 429);
  const need = 2 * roundEstimate(config);
  if (left.total < need || left.interviews < need) throw new InterviewError('Mock interviews have reached today’s budget and will be back tomorrow.', 503);

  const solved = await solvedProblems(db, userId);
  const problem = chooseProblem(request, solved, random);
  const at = now.toISOString();
  const [row] = await db
    .insert(interviewRound)
    .values({
      id: uuidv7(),
      userId,
      format: 'coding',
      item: problem.slug,
      language: request.language,
      limitMin: request.limit,
      phase: 'clarify',
      phases: { clarify: at },
      startedAt: now,
      transcript: [{ role: 'interviewer', text: SCRIPTED.open, phase: 'clarify', at, scripted: true }] satisfies TranscriptEntry[],
      submissions: [],
      repeat: solved.has(problem.slug),
    })
    .returning();
  return { round: view(row, config, now) };
}

/** The learner's round, or a 404 that doesn't say whether someone else's exists. */
export async function getRound(db: Database, userId: string, roundId: string): Promise<Row> {
  const [row] = await db
    .select()
    .from(interviewRound)
    .where(and(eq(interviewRound.id, roundId), eq(interviewRound.userId, userId)))
    .limit(1);
  if (!row) throw new InterviewError('There is no such round.', 404);
  return row;
}

const stateOf = (row: Row, code?: string): RoundState => ({
  phase: row.phase as WorkPhase,
  transcript: row.transcript as TranscriptEntry[],
  approach: (row.approach as RoundState['approach']) ?? null,
  edgeCases: row.edgeCases ?? '',
  code: code ?? row.code ?? '',
  submissions: row.submissions as Submission[],
});

const working = (row: Row) => {
  if (row.endedAt || row.phase === 'debrief') throw new InterviewError('This round has ended.', 409);
  return row.phase as WorkPhase;
};

/** Records a round's model calls as one tutor_turn row, so the tutor's daily cap covers them. */
async function logCalls(db: Database, userId: string, roundId: string, action: 'interview' | 'debrief', level: number, usage: Usage, now: Date) {
  if (usage.calls === 0) return;
  await db.insert(tutorTurn).values({
    id: uuidv7(),
    userId,
    item: `interview:${roundId}`,
    action,
    level,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    costUsd: usage.cost,
    leakBlocked: usage.blocked,
    createdAt: now,
  });
}

type Usage = { calls: number; inputTokens: number; outputTokens: number; cost: number; blocked: boolean };

/** A model wrapper that adds up what a turn's calls cost. */
function metered(model: TutorModel, config: InterviewConfig) {
  const usage: Usage = { calls: 0, inputTokens: 0, outputTokens: 0, cost: 0, blocked: false };
  const call = async (request: ModelRequest) => {
    const reply = await model.complete(request);
    usage.calls++;
    usage.inputTokens += reply.inputTokens;
    usage.outputTokens += reply.outputTokens;
    usage.cost += costOf(config.tutor, request.role as ModelRole, reply.inputTokens, reply.outputTokens);
    return reply.text;
  };
  return { call, usage };
}

/** The model's leak check on a reply, at a level (fails safe when unreadable). */
async function modelLeaks(call: (r: ModelRequest) => Promise<string>, reply: string, solution: string, level: Level) {
  const verdict = await call({
    role: 'fast',
    instructions: leakInstructions(level),
    messages: [{ role: 'user', content: `<reference_solution>\n${solution}\n</reference_solution>\n<reply>\n${defuse(reply)}\n</reply>` }],
    maxTokens: 120,
    schema: LEAK_SCHEMA,
  });
  return parseLeak(verdict).leaks;
}

/** Whether the round may spend on another model reply: replies left, its own allowance, and room in both caps. */
async function mayReply(db: Database, config: InterviewConfig, row: Row, now: Date) {
  if (row.replies >= config.replies) return false;
  const each = replyEstimate(config);
  if (row.costUsd + each > config.replies * each) return false;
  const left = await room(db, config, now);
  return left.total >= each && left.interviews >= each;
}

type Reply = { message: string; line: number | null; scripted: boolean };

/**
 * One interviewer reply from the model, checked: the deterministic leak check
 * at its level (a question counts as level 1), the giveaway check for the
 * interviewer's own questions, and the model's leak check on every reply.
 * A reply that fails is retried once, stricter, then replaced. When the model
 * fails, the round goes on with a scripted line.
 */
async function interviewerReply(deps: Deps, userId: string, row: Row, state: RoundState, action: InterviewAction, level: Level | null, account: string, fallback: string, now: Date): Promise<Reply> {
  const problem = getProblem(row.item)!;
  const item = interviewGrounding(problem, row.language as ProblemLanguage);
  const { call, usage } = metered(deps.model, deps.config);
  const said = learnerText(state);
  // Words a hint already said are given away already: the learner paid for them.
  const known = [said, ...state.transcript.filter((t) => t.role === 'interviewer' && t.level).map((t) => t.text)].join('\n');
  const checkLevel: Level = level ?? 1;
  const slower = action === 'approach' && !!state.approach && slowerThanReference(state.approach.time as ComplexityId, problem.complexity.time);
  const ask = async (stricter: boolean) =>
    parseReply(
      await call({
        role: 'fast',
        instructions: interviewerInstructions(item, state.phase, action, level, { slower, stricter, forbidden: action === 'hint' ? [] : unsaidTerms(item.patterns, `${known}\n${item.statement}`) }),
        messages: interviewerMessages(item, state, action, account),
        maxTokens: 300,
        schema: INTERVIEWER_SCHEMA,
      }),
    );
  const fails = async (reply: string) => {
    if (action !== 'hint' && giveaway(reply, item.patterns, known, `${item.title}\n${item.statement}`)) return true;
    if (deterministicLeak(reply, item.solution, state.code, checkLevel).leaks) return true;
    return modelLeaks(call, reply, item.solution, checkLevel);
  };
  let reply: { message: string; line: number | null };
  let scripted = false;
  try {
    reply = await ask(false);
    if (await fails(reply.message)) {
      reply = await ask(true);
      if (await fails(reply.message)) {
        reply = { message: SCRIPTED.blocked, line: null };
        usage.blocked = true;
      }
    }
    if (!reply.message) reply = { message: fallback, line: null };
  } catch (e) {
    if (!(e instanceof ModelError)) throw e;
    console.error('The interviewer model failed:', e.message);
    reply = { message: fallback, line: null };
    scripted = true;
  }
  await logCalls(deps.db, userId, row.id, 'interview', level ?? 0, usage, now);
  row.costUsd += usage.cost;
  const lines = state.code.split('\n').length;
  const line = level != null && level >= 2 && reply.line != null && reply.line >= 1 && reply.line <= lines ? reply.line : null;
  return { message: reply.message, line, scripted };
}

const entry = (role: TranscriptEntry['role'], text: string, phase: WorkPhase, now: Date, extra: Partial<TranscriptEntry> = {}): TranscriptEntry => ({ role, text, phase, at: now.toISOString(), ...extra });

/** Saves a round's changed fields, only if it hasn't ended meanwhile. */
async function save(db: Database, row: Row, set: Partial<typeof interviewRound.$inferInsert>): Promise<Row> {
  const [updated] = await db
    .update(interviewRound)
    .set(set)
    .where(and(eq(interviewRound.id, row.id), isNull(interviewRound.endedAt)))
    .returning();
  if (!updated) throw new InterviewError('This round has ended.', 409);
  return updated;
}

/** The learner says something; the interviewer answers (from the model while the round's budget lasts, else a scripted line). */
export async function say(deps: Deps, userId: string, request: Extract<InterviewRequest, { action: 'say' }>, now = new Date()): Promise<InterviewResponse> {
  const row = await getRound(deps.db, userId, request.round);
  const phase = working(row);
  const state = stateOf(row, request.code);
  state.transcript = [...state.transcript, entry('learner', request.text, phase, now)];
  const useModel = await mayReply(deps.db, deps.config, row, now);
  const reply = useModel ? await interviewerReply(deps, userId, row, state, 'say', null, '', SCRIPTED.reply[phase], now) : { message: SCRIPTED.reply[phase], line: null, scripted: true };
  const updated = await save(deps.db, row, {
    transcript: [...state.transcript, entry('interviewer', reply.message, phase, now, reply.scripted ? { scripted: true } : {})],
    replies: row.replies + (useModel ? 1 : 0),
    costUsd: row.costUsd,
    ...(request.code !== undefined && { code: request.code }),
  });
  return { round: view(updated, deps.config, now) };
}

/** The learner states their approach and its complexity; the interviewer probes it. */
export async function stateApproach(deps: Deps, userId: string, request: Extract<InterviewRequest, { action: 'approach' }>, now = new Date()): Promise<InterviewResponse> {
  const row = await getRound(deps.db, userId, request.round);
  const phase = working(row);
  if (phase !== 'approach') throw new InterviewError('Say your approach in the Approach phase.', 409);
  if (wordCount(request.text) < APPROACH_MIN_WORDS) throw new InterviewError(`Say a bit more: at least ${APPROACH_MIN_WORDS} words on how it works and why.`, 400);
  const approach = { text: request.text, time: request.time, space: request.space };
  const state = { ...stateOf(row, request.code), approach };
  const said = `My approach: ${request.text}\n\nTime: ${request.time}. Space: ${request.space}.`;
  state.transcript = [...state.transcript, entry('learner', said, phase, now)];
  const useModel = await mayReply(deps.db, deps.config, row, now);
  const reply = useModel ? await interviewerReply(deps, userId, row, state, 'approach', null, '', SCRIPTED.approach, now) : { message: SCRIPTED.approach, line: null, scripted: true };
  const updated = await save(deps.db, row, {
    approach,
    transcript: [...state.transcript, entry('interviewer', reply.message, phase, now, reply.scripted ? { scripted: true } : {})],
    replies: row.replies + (useModel ? 1 : 0),
    costUsd: row.costUsd,
  });
  return { round: view(updated, deps.config, now) };
}

/** "I'm stuck": the next hint, levels 1 to 3. The first needs the learner's account of where they are. */
export async function hint(deps: Deps, userId: string, request: Extract<InterviewRequest, { action: 'hint' }>, now = new Date()): Promise<InterviewResponse> {
  const row = await getRound(deps.db, userId, request.round);
  const phase = working(row);
  if (row.hints >= MAX_HINT) throw new InterviewError('That was the last hint an interview gives. Talk the interviewer through where you are instead.', 409);
  if (row.hints === 0 && request.account.length < 5) throw new InterviewError('First say in a sentence where you are and what you’re stuck on.', 400);
  const level = (row.hints + 1) as Level;
  const state = stateOf(row, request.code);
  if (request.account) state.transcript = [...state.transcript, entry('learner', request.account, phase, now)];
  const problem = getProblem(row.item)!;
  // Without the model, the authors' own hints, mildest first.
  const authored = problem.hints[Math.min(level, problem.hints.length) - 1] ?? SCRIPTED.reply[phase];
  const useModel = await mayReply(deps.db, deps.config, row, now);
  const reply = useModel ? await interviewerReply(deps, userId, row, state, 'hint', level, request.account, authored, now) : { message: authored, line: null, scripted: true };
  const updated = await save(deps.db, row, {
    hints: level,
    transcript: [...state.transcript, entry('interviewer', reply.message, phase, now, { level, ...(reply.line != null && { line: reply.line }), ...(reply.scripted && { scripted: true }) })],
    replies: row.replies + (useModel ? 1 : 0),
    costUsd: row.costUsd,
    ...(request.code !== undefined && { code: request.code }),
  });
  return { round: view(updated, deps.config, now) };
}

/** Moves the round on one phase, stamped on the server's clock. The code waits for a stated approach. */
export async function changePhase(deps: Deps, userId: string, request: Extract<InterviewRequest, { action: 'phase' }>, now = new Date()): Promise<InterviewResponse> {
  const row = await getRound(deps.db, userId, request.round);
  const phase = working(row);
  if (nextPhase(phase) !== request.to) throw new InterviewError(`The round is in ${phase}; it moves on one phase at a time.`, 409);
  if (request.to === 'code') {
    const a = row.approach as RoundState['approach'];
    if (!a || wordCount(a.text) < APPROACH_MIN_WORDS || !a.time || !a.space) throw new InterviewError('Tell the interviewer your approach, with its time and space complexity, before you code.', 400);
  }
  const to = request.to as Exclude<WorkPhase, 'clarify'>;
  const [updated] = await deps.db
    .update(interviewRound)
    .set({
      phase: to,
      phases: { ...(row.phases as object), [to]: now.toISOString() },
      transcript: [...(row.transcript as TranscriptEntry[]), entry('interviewer', SCRIPTED.enter[to], to, now, { scripted: true })],
      ...(request.code !== undefined && { code: request.code }),
    })
    .where(and(eq(interviewRound.id, row.id), eq(interviewRound.phase, phase), isNull(interviewRound.endedAt)))
    .returning();
  if (!updated) throw new InterviewError('The round moved on already.', 409);
  return { round: view(updated, deps.config, now) };
}

/**
 * A submission of every test, in the Test phase, once the learner has listed
 * the cases they'd test. Java, C++ and Go are judged here (which records a
 * verified `problem.submitted`, as the judge always does); Python, JavaScript
 * and TypeScript are judged in the browser, which reports the counts.
 */
export async function submit(deps: Deps, userId: string, request: Extract<InterviewRequest, { action: 'submit' }>, now = new Date()): Promise<InterviewResponse> {
  const row = await getRound(deps.db, userId, request.round);
  const phase = working(row);
  if (phase !== 'test') throw new InterviewError('Submit in the Test phase, after listing the cases you’d test.', 409);
  if (edgeCaseList(request.cases).length === 0) throw new InterviewError('List the cases you’d test first, one per line.', 400);
  const language = row.language as ProblemLanguage;
  let submission: Submission;
  let judged: JudgeResponse | undefined;
  if (isServerLanguage(language)) {
    if (!deps.sandbox) throw new InterviewError('The server judge isn’t set up here, so Java, C++ and Go can’t run.', 503);
    try {
      judged = await judge(deps.db, deps.sandbox, userId, { slug: row.item, language, code: request.code, kind: 'submit' }, now);
    } catch (e) {
      if (e instanceof JudgeError) throw new InterviewError(e.message, e.status);
      throw e;
    }
    const data = judged.event?.kind === 'problem.submitted' ? judged.event.data : null;
    submission = { tests: data?.tests ?? 0, failed: data?.failed ?? 0, at: now.toISOString(), verified: true };
  } else {
    if (!request.results || request.results.failed > request.results.tests) throw new InterviewError('Send the submission’s results.', 400);
    submission = { tests: request.results.tests, failed: request.results.failed, at: now.toISOString() };
  }
  const updated = await save(deps.db, row, { submissions: [...(row.submissions as Submission[]), submission], edgeCases: request.cases, code: request.code });
  return { round: view(updated, deps.config, now), judge: judged };
}

/**
 * Ends the round (at any phase: past the time limit the learner may finish,
 * and the overtime shows) and writes its debrief. When the model can't score,
 * the learner scores those dimensions themself against the rubric (`self`).
 */
export async function end(deps: Deps, userId: string, request: Extract<InterviewRequest, { action: 'end' }>, now = new Date()): Promise<InterviewResponse> {
  const row = await getRound(deps.db, userId, request.round);
  working(row);
  // Claim the end first, so two requests can't both write a debrief.
  const [claimed] = await deps.db
    .update(interviewRound)
    .set({
      phase: 'debrief',
      endedAt: now,
      phases: { ...(row.phases as object), debrief: now.toISOString() },
      ...(request.code !== undefined && { code: request.code }),
    })
    .where(and(eq(interviewRound.id, row.id), isNull(interviewRound.endedAt)))
    .returning();
  if (!claimed) throw new InterviewError('This round has ended.', 409);

  const state = stateOf(claimed);
  const submissions = claimed.submissions as Submission[];
  const correctness = correctnessScore(submissions);
  const passed = endedPassing(submissions);
  const problem = getProblem(claimed.item)!;
  const item = interviewGrounding(problem, claimed.language as ProblemLanguage);
  const last = submissions.at(-1);
  const tests = last ? `${last.tests - last.failed} of ${last.tests} tests passed at the last of ${submissions.length} submission${submissions.length === 1 ? '' : 's'}` : 'never submitted';

  const { call, usage } = metered(deps.model, deps.config);
  let scored: Debrief | null = null;
  try {
    const run = async (stricter: boolean) => {
      const text = await call({
        role: 'strong',
        instructions: debriefInstructions(item, { correctness, tests, hints: claimed.hints, stricter }),
        messages: [{ role: 'user', content: debriefMessage(item, state) }],
        maxTokens: 1_200,
        schema: DEBRIEF_SCHEMA,
      });
      return parseDebrief(text, state, claimed.hints);
    };
    const leaks = async (d: Debrief) => deterministicLeak(debriefProse(d), item.solution, state.code, 3).leaks || (await modelLeaks(call, debriefProse(d), item.solution, 3));
    let d: Debrief = await run(false);
    if (await leaks(d)) {
      d = await run(true);
      if (await leaks(d)) {
        // Keep the scores; the authored approach, open now, explains the solution instead.
        d = { ...d, summary: '', workOn: [], dimensions: d.dimensions.map((x) => ({ ...x, feedback: '' })), withheld: true };
        usage.blocked = true;
      }
    }
    scored = d;
  } catch (e) {
    if (!(e instanceof ModelError)) throw e;
    console.error('The debrief model failed:', e.message);
  }
  await logCalls(deps.db, userId, claimed.id, 'debrief', 0, usage, now);

  const correct: DimensionResult = { dimension: 'correctness', score: correctness, evidence: [], feedback: tests[0].toUpperCase() + tests.slice(1) + '.' };
  if (!scored) {
    const pending = await finishRow(deps.db, claimed.id, { passed, scoredBy: 'pending', costUsd: claimed.costUsd + usage.cost, debrief: { dimensions: [correct], summary: '', workOn: [] } satisfies Debrief });
    return { round: view(pending, deps.config, now) };
  }
  const debrief: Debrief = { ...scored, dimensions: [correct, ...scored.dimensions] };
  return finish(deps, userId, claimed, debrief, passed, 'model', usage.cost, now);
}

/** Updates an ended round. */
async function finishRow(db: Database, roundId: string, set: Partial<typeof interviewRound.$inferInsert>): Promise<Row> {
  const [updated] = await db.update(interviewRound).set(set).where(eq(interviewRound.id, roundId)).returning();
  return updated;
}

/** Writes the debrief and the round's `interview.finished` event, verified. */
async function finish(deps: Deps, userId: string, row: Row, debrief: Debrief, passed: boolean, by: 'model' | 'self', cost: number, now: Date): Promise<InterviewResponse> {
  const ended = row.endedAt ?? now;
  const event: ProgressEvent = {
    id: uuidv7(),
    kind: 'interview.finished',
    at: ended.toISOString(),
    data: {
      format: 'coding',
      item: row.item,
      language: row.language as ProblemLanguage,
      minutes: Math.min(240, Math.round((ended.getTime() - row.startedAt.getTime()) / 60_000)),
      limit: row.limitMin,
      hints: row.hints,
      passed,
      scores: debrief.dimensions.map((d) => ({ dimension: d.dimension, score: d.score })),
      by,
      verified: true,
    },
  };
  await storeEvents(deps.db, userId, [event]);
  const updated = await finishRow(deps.db, row.id, { debrief, passed, scoredBy: by, eventId: event.id, costUsd: row.costUsd + cost });
  return { round: view(updated, deps.config, now), event };
}

/** The learner scores the dimensions the model couldn't, against the rubric (a hint still caps the approach). */
export async function selfScore(deps: Deps, userId: string, request: Extract<InterviewRequest, { action: 'self' }>, now = new Date()): Promise<InterviewResponse> {
  const row = await getRound(deps.db, userId, request.round);
  if (row.scoredBy !== 'pending') throw new InterviewError('This round is scored already.', 409);
  let dims: DimensionResult[];
  try {
    dims = selfScored(request.scores, row.hints);
  } catch (e) {
    throw new InterviewError((e as Error).message, 400);
  }
  const prior = (row.debrief as Debrief | null)?.dimensions.filter((d) => d.dimension === 'correctness') ?? [];
  // Claim it, so a double click can't write two events.
  const [claimed] = await deps.db
    .update(interviewRound)
    .set({ scoredBy: 'self' })
    .where(and(eq(interviewRound.id, row.id), eq(interviewRound.scoredBy, 'pending')))
    .returning();
  if (!claimed) throw new InterviewError('This round is scored already.', 409);
  return finish(deps, userId, claimed, { dimensions: [...prior, ...dims], summary: '', workOn: [] }, !!row.passed, 'self', 0, now);
}

/** Deletes what the learner wrote in an ended round (the transcript, approach, cases, code and quotes); the scores stay. */
export async function deleteTranscript(deps: Deps, userId: string, request: Extract<InterviewRequest, { action: 'delete' }>, now = new Date()): Promise<InterviewResponse> {
  const row = await getRound(deps.db, userId, request.round);
  if (!row.endedAt) throw new InterviewError('End the round first.', 409);
  const a = row.approach as RoundState['approach'];
  const d = row.debrief as Debrief | null;
  const updated = await finishRow(deps.db, row.id, {
    transcript: [],
    approach: a ? { text: '', time: a.time, space: a.space } : null,
    edgeCases: null,
    code: null,
    debrief: d ? { ...d, dimensions: d.dimensions.map((x) => ({ ...x, evidence: [] })) } : null,
  });
  return { round: view(updated, deps.config, now) };
}

/** Runs a request for a signed-in learner. */
export async function interview(deps: Deps, userId: string, request: InterviewRequest, now = new Date()): Promise<InterviewResponse> {
  switch (request.action) {
    case 'start':
      return startRound(deps, userId, request, now);
    case 'say':
      return say(deps, userId, request, now);
    case 'approach':
      return stateApproach(deps, userId, request, now);
    case 'hint':
      return hint(deps, userId, request, now);
    case 'phase':
      return changePhase(deps, userId, request, now);
    case 'submit':
      return submit(deps, userId, request, now);
    case 'end':
      return end(deps, userId, request, now);
    case 'self':
      return selfScore(deps, userId, request, now);
    case 'delete':
      return deleteTranscript(deps, userId, request, now);
  }
}

export type { Score };

/** What the hub shows: rounds left, room in the budget, unfinished rounds and recent ones. */
export type InterviewStatus = Awaited<ReturnType<typeof interviewStatus>>;
