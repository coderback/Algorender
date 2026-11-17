// Mock interviews on a real (in-memory) Postgres with a scripted stand-in
// model: the phases and their gates, the clock, budgets and admission, the
// held-back debrief, the leak and giveaway checks, the debrief's checks and
// caps, the self-scored fallback, and the verified event.

import { and, eq } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SandboxOutput } from '@/problems/drivers';
import { getProblem, specFor } from '@/problems/load';
import { createAuth } from '../auth';
import { createTestDatabase, type Database } from '../db';
import { interviewRound, progressEvent, tutorTurn } from '../db/schema';
import type { Sandbox } from '../judge/sandbox';
import { sync } from '../progress';
import { dailyUsage } from '../tutor';
import type { TutorConfig } from '../tutor/config';
import type { ModelRequest, TutorModel } from '../tutor/model';
import { interview, InterviewError, interviewStatus, parseInterviewRequest, type InterviewRequest, type InterviewResponse } from '.';
import { interviewConfig, roundEstimate, type InterviewConfig } from './config';
import { parseDebrief } from './debrief';
import { SCRIPTED } from './prompt';

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
  const res = await auth.api.signUpEmail({ body: { email: `interview-${++learners}@example.com`, password: 'correct horse battery', name: 'Ada' } });
  return res.user.id;
}

const tutor: TutorConfig = {
  provider: 'fake',
  endpoint: '',
  apiKey: '',
  models: { fast: 'luna', strong: 'sol' },
  prices: { fast: { input: 1, output: 4 }, strong: { input: 5, output: 20 } },
  turnsPerDay: 30,
  // Large, so the many learners in this file share a day without running out.
  dailyUsd: 1_000,
};
const config = (over: Partial<InterviewConfig> = {}): InterviewConfig => ({ tutor, roundsPerDay: 50, replies: 16, dailyUsd: 500, ...over });

const DEBRIEF = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    dimensions: ['approach', 'analysis', 'testing', 'communication'].map((dimension) => ({ dimension, score: 4, evidence: ['map from each number'], feedback: `Good ${dimension}.` })),
    summary: 'A good round.',
    workOn: ['Say the complexity of each step.'],
    ...over,
  });

/** A model that answers from scripts per kind of call (or defaults) and records every request. */
function scripted(script: { replies?: string[]; leaks?: string[]; debriefs?: string[] } = {}): TutorModel & { requests: ModelRequest[] } {
  return {
    requests: [],
    async complete(request) {
      this.requests.push(request);
      if (request.schema?.name === 'leak_check') return { text: script.leaks?.shift() ?? '{"leaks":false,"reason":""}', inputTokens: 100, outputTokens: 5 };
      if (request.schema?.name === 'interview_debrief') return { text: script.debriefs?.shift() ?? DEBRIEF(), inputTokens: 5000, outputTokens: 500 };
      return { text: script.replies?.shift() ?? '{"message":"What would you assume about duplicates?","line":null}', inputTokens: 1000, outputTokens: 40 };
    },
  };
}

const T0 = new Date('2026-11-16T10:00:00Z');
const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);
const APPROACH = 'Walk the list once and keep a map from each number seen so far to its index, checking for the partner target minus x before adding x.';
const CODE = 'def two_sum(nums, target):\n    seen = {}\n    for i, x in enumerate(nums):\n        if target - x in seen:\n            return [seen[target - x], i]\n        seen[x] = i';

type Deps = Parameters<typeof interview>[0];
const deps = (model: TutorModel = scripted(), over: Partial<Deps> = {}): Deps => ({ db, model, config: config(), ...over });
const req = (body: Record<string, unknown>) => parseInterviewRequest(body);

const fail = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e as InterviewError;
  }
  throw new Error('expected the request to be turned down');
};

async function start(d: Deps, user: string, over: Record<string, unknown> = {}, now = T0): Promise<InterviewResponse> {
  return interview(d, user, req({ action: 'start', language: 'python', limit: 45, problem: 'two-sum', ...over }), now);
}

/** Starts a round and takes it to the Test phase with a stated approach. */
async function toTest(d: Deps, user: string, time = 'O(n)') {
  const { round } = await start(d, user);
  await interview(d, user, req({ action: 'phase', round: round.id, to: 'approach' }), at(4));
  await interview(d, user, req({ action: 'approach', round: round.id, text: APPROACH, time, space: 'O(n)' }), at(8));
  await interview(d, user, req({ action: 'phase', round: round.id, to: 'code' }), at(12));
  await interview(d, user, req({ action: 'phase', round: round.id, to: 'test' }), at(30));
  return round.id;
}

const submitted = (d: Deps, user: string, round: string, failed: number, now = at(33)) =>
  interview(d, user, req({ action: 'submit', round, code: CODE, cases: 'empty list\nduplicates like [3, 3]', results: { tests: 20, failed } }), now);

describe('starting a round', () => {
  it('draws an unsolved problem from the filters, and flags a repeat', async () => {
    const user = await learner();
    const d = deps();
    const { round } = await interview(d, user, req({ action: 'start', language: 'java', limit: 30, level: 'easy', pattern: 'hashing' }), T0);
    const problem = getProblem(round.item)!;
    expect(problem.difficulty).toBe('easy');
    expect(problem.patterns).toContain('hashing');
    expect(round).toMatchObject({ phase: 'clarify', limit: 30, language: 'java', hints: 0, repeat: false, startedAt: T0.toISOString() });
    expect(round.transcript).toEqual([expect.objectContaining({ role: 'interviewer', text: SCRIPTED.open, scripted: true })]);

    // Solved before: still allowed, but flagged.
    const other = await learner();
    await sync(db, other, { cursor: 0, events: [{ id: uuidv7(), kind: 'problem.submitted', at: T0.toISOString(), data: { problem: 'two-sum', language: 'python', passed: true, tests: 3, failed: 0 } }] });
    expect((await start(d, other)).round.repeat).toBe(true);
  });

  it('allows one open round at a time and the day’s rounds, then turns the learner down', async () => {
    const user = await learner();
    const d = deps(scripted(), { config: config({ roundsPerDay: 2 }) });
    const { round } = await start(d, user);
    const busy = await fail(start(d, user, {}, at(1)));
    expect(busy.status).toBe(409);
    expect(busy.round).toBe(round.id);
    await interview(d, user, req({ action: 'end', round: round.id }), at(2));
    const second = await start(d, user, {}, at(3));
    await interview(d, user, req({ action: 'end', round: second.round.id }), at(4));
    expect((await fail(start(d, user, {}, at(5)))).status).toBe(429);
    expect((await interviewStatus(db, d.config, user, at(5))).roundsLeft).toBe(0);
    // A new day, new rounds.
    expect((await start(d, user, {}, new Date('2026-11-17T09:00:00Z'))).round.phase).toBe('clarify');
  });

  it('starts only with room for twice a round’s cost in both caps, holding back open rounds’ debriefs', async () => {
    const user = await learner();
    // A fresh database's day: spend in this file's other days doesn't count.
    const day = new Date('2026-12-01T09:00:00Z');
    const tight = config({ dailyUsd: 2 * roundEstimate(config()) + 0.01 });
    const d = deps(scripted(), { config: { ...tight, tutor: { ...tutor, dailyUsd: 10 } } });
    expect((await interviewStatus(db, d.config, user, day)).budget).toBe(true);
    await db.insert(tutorTurn).values({ id: uuidv7(), userId: user, item: 'interview:x', action: 'interview', level: 0, costUsd: 0.05, createdAt: day });
    expect((await fail(start(d, user, {}, day))).status).toBe(503);
    expect((await interviewStatus(db, d.config, user, day)).budget).toBe(false);
  });

  it('is off with the kill switch or without the tutor, and has its own settings', () => {
    const env = { TUTOR_PROVIDER: 'fake', TUTOR_DAILY_USD: '8' };
    expect(interviewConfig({ ...env, INTERVIEWS_ENABLED: 'off' })).toBeNull();
    expect(interviewConfig({ TUTOR_ENABLED: 'off', TUTOR_PROVIDER: 'fake' })).toBeNull();
    expect(interviewConfig(env)).toMatchObject({ roundsPerDay: 2, replies: 16, dailyUsd: 4 });
    expect(interviewConfig({ ...env, INTERVIEW_ROUNDS_PER_DAY: '3', INTERVIEW_REPLIES: '10', INTERVIEW_DAILY_USD: '20' })).toMatchObject({ roundsPerDay: 3, replies: 10, dailyUsd: 8 });
  });

  it('refuses requests that aren’t one', () => {
    expect(() => parseInterviewRequest({ action: 'start', language: 'python', limit: 50 })).toThrow(InterviewError);
    expect(() => parseInterviewRequest({ action: 'say', round: 'nope', text: 'hi' })).toThrow(InterviewError);
    expect(() => parseInterviewRequest({ action: 'approach', round: uuidv7(), text: 'x', time: 'O(n^2)', space: 'O(1)' })).toThrow(InterviewError);
  });
});

describe('the phases', () => {
  it('move on one at a time, stamped on the server’s clock, with the approach before the code', async () => {
    const user = await learner();
    const d = deps();
    const { round } = await start(d, user);
    expect((await fail(interview(d, user, req({ action: 'phase', round: round.id, to: 'code' }), at(1)))).status).toBe(409);
    await interview(d, user, req({ action: 'phase', round: round.id, to: 'approach' }), at(4));
    expect((await fail(interview(d, user, req({ action: 'phase', round: round.id, to: 'code' }), at(5)))).status).toBe(400);
    const short = await fail(interview(d, user, req({ action: 'approach', round: round.id, text: 'Use a loop.', time: 'O(n)', space: 'O(1)' }), at(6)));
    expect(short.message).toMatch(/15 words/);
    await interview(d, user, req({ action: 'approach', round: round.id, text: APPROACH, time: 'O(n)', space: 'O(n)' }), at(7));
    const { round: coding } = await interview(d, user, req({ action: 'phase', round: round.id, to: 'code' }), at(12));
    expect(coding.phase).toBe('code');
    expect(coding.phases).toEqual({ clarify: T0.toISOString(), approach: at(4).toISOString(), code: at(12).toISOString() });
    expect(coding.transcript.at(-1)).toMatchObject({ role: 'interviewer', text: SCRIPTED.enter.code, phase: 'code' });
    // The approach is said in its own phase only.
    expect((await fail(interview(d, user, req({ action: 'approach', round: round.id, text: APPROACH, time: 'O(n)', space: 'O(n)' }), at(13)))).status).toBe(409);
  });

  it('submits only in the Test phase, after the learner lists their cases', async () => {
    const user = await learner();
    const d = deps();
    const { round } = await start(d, user);
    expect((await fail(submitted(d, user, round.id, 0, at(1)))).status).toBe(409);
    const other = await learner();
    const id = await toTest(d, other);
    const none = await fail(interview(d, other, req({ action: 'submit', round: id, code: CODE, cases: '  \n- ', results: { tests: 20, failed: 0 } }), at(31)));
    expect(none.status).toBe(400);
    const { round: after } = await submitted(d, other, id, 3);
    expect(after.submissions).toEqual([{ tests: 20, failed: 3, at: at(33).toISOString() }]);
    expect(after.edgeCases).toBe('empty list\nduplicates like [3, 3]');
  });

  it('judges Java, C++ and Go submissions on the server, recording a verified submission', async () => {
    const user = await learner();
    const spec = specFor(getProblem('two-sum')!);
    const sandbox: Sandbox = {
      name: 'fake',
      async run(files): Promise<SandboxOutput> {
        const count = Number(files['tests.txt'].split('\n')[0]);
        const answers = spec.cases
          .slice(0, count)
          .map((c, i) => JSON.stringify({ i, ms: 1, v: i === 0 ? [9, 9] : c.expected }))
          .join('\n');
        return { status: 'run 0 1', compile: '', stdout: '', stderr: '', answers };
      },
    };
    const d = deps(scripted(), { sandbox });
    const { round } = await start(d, user, { language: 'java' });
    await interview(d, user, req({ action: 'phase', round: round.id, to: 'approach' }), at(1));
    await interview(d, user, req({ action: 'approach', round: round.id, text: APPROACH, time: 'O(n)', space: 'O(n)' }), at(2));
    await interview(d, user, req({ action: 'phase', round: round.id, to: 'code' }), at(3));
    await interview(d, user, req({ action: 'phase', round: round.id, to: 'test' }), at(4));
    // The device's counts are ignored for a server language.
    const res = await interview(d, user, req({ action: 'submit', round: round.id, code: 'class Solution {}', cases: 'empty', results: { tests: 1, failed: 0 } }), at(5));
    expect(res.round.submissions).toEqual([{ tests: spec.cases.length, failed: 1, at: at(5).toISOString(), verified: true }]);
    expect(res.judge?.event).toMatchObject({ kind: 'problem.submitted', data: { problem: 'two-sum', passed: false, verified: true } });
  });
});

describe('the interviewer', () => {
  it('answers from the model, leak-checks every reply, and costs no tutor turns', async () => {
    const user = await learner();
    const model = scripted();
    const d = deps(model);
    const { round } = await start(d, user);
    const { round: after } = await interview(d, user, req({ action: 'say', round: round.id, text: 'Can the list be empty?' }), at(1));
    expect(after.transcript.slice(-2)).toEqual([
      expect.objectContaining({ role: 'learner', text: 'Can the list be empty?', phase: 'clarify' }),
      expect.objectContaining({ role: 'interviewer', text: 'What would you assume about duplicates?' }),
    ]);
    expect(after.repliesLeft).toBe(15);
    expect(model.requests.map((r) => r.schema?.name)).toEqual(['interviewer_reply', 'leak_check']);
    const [first] = model.requests;
    expect(first.instructions).toMatch(/Phase: Clarify/);
    expect(first.instructions).toMatch(/hash map/); // a word it may not say first
    expect(first.instructions).toContain('<reference_solution');
    expect(first.messages.at(-2)?.content).toContain('<learner_message>\nCan the list be empty?');
    const turns = await db.select().from(tutorTurn).where(eq(tutorTurn.item, `interview:${round.id}`));
    expect(turns).toEqual([expect.objectContaining({ action: 'interview', level: 0, inputTokens: 1100 })]);
    expect((await dailyUsage(db, user, at(1))).turns).toBe(0);
  });

  it('may not name the pattern before the learner does: retried, then replaced', async () => {
    const user = await learner();
    const leaky = '{"message":"Have you thought about a hash map?","line":null}';
    const model = scripted({ replies: [leaky, leaky] });
    const d = deps(model);
    const { round } = await start(d, user);
    const { round: after } = await interview(d, user, req({ action: 'say', round: round.id, text: 'Any ideas?' }), at(1));
    expect(after.transcript.at(-1)?.text).toBe(SCRIPTED.blocked);
    expect(model.requests[1].instructions).toMatch(/gave away too much/);
    const [turn] = await db.select().from(tutorTurn).where(eq(tutorTurn.item, `interview:${round.id}`));
    expect(turn.leakBlocked).toBe(true);

    // Once the learner has said it, it's theirs.
    const free = scripted({ replies: [leaky] });
    const { round: said } = await interview(deps(free), user, req({ action: 'say', round: round.id, text: 'Could a hash map help here?' }), at(2));
    expect(said.transcript.at(-1)?.text).toBe('Have you thought about a hash map?');
  });

  it('replaces a reply the leak check flags, after one stricter retry', async () => {
    const user = await learner();
    const model = scripted({ leaks: ['{"leaks":true,"reason":"code"}', '{"leaks":false,"reason":""}'], replies: ['{"message":"Q1","line":null}', '{"message":"Q2","line":null}'] });
    const { round } = await start(deps(model), user);
    const { round: after } = await interview(deps(model), user, req({ action: 'say', round: round.id, text: 'Hmm' }), at(1));
    expect(after.transcript.at(-1)?.text).toBe('Q2');
    // Code in a question fails the deterministic check without asking the model.
    const coded = scripted({ replies: ['{"message":"```\\nseen = {}\\n```","line":null}', '{"message":"```\\nx\\n```","line":null}'] });
    const { round: again } = await interview(deps(coded), user, req({ action: 'say', round: round.id, text: 'Show me?' }), at(2));
    expect(again.transcript.at(-1)?.text).toBe(SCRIPTED.blocked);
    expect(coded.requests.filter((r) => r.schema?.name === 'leak_check')).toHaveLength(0);
  });

  it('may ask “can you do better?” when the stated approach is slower than the reference', async () => {
    const user = await learner();
    const model = scripted();
    const d = deps(model);
    const { round } = await start(d, user);
    await interview(d, user, req({ action: 'phase', round: round.id, to: 'approach' }), at(1));
    await interview(d, user, req({ action: 'approach', round: round.id, text: APPROACH, time: 'O(n²)', space: 'O(1)' }), at(2));
    expect(model.requests[0].instructions).toMatch(/can do better/);
    const fast = scripted();
    await interview(deps(fast), user, req({ action: 'approach', round: round.id, text: APPROACH, time: 'O(n)', space: 'O(n)' }), at(3));
    expect(fast.requests[0].instructions).not.toMatch(/can do better/);
  });

  it('gives hints up the ladder to level 3, the first after the learner’s account', async () => {
    const user = await learner();
    const model = scripted();
    const d = deps(model);
    const { round } = await start(d, user);
    expect((await fail(interview(d, user, req({ action: 'hint', round: round.id }), at(1)))).status).toBe(400);
    const levels: number[] = [];
    for (let i = 0; i < 3; i++) {
      const { round: r } = await interview(d, user, req({ action: 'hint', round: round.id, account: 'I only see the pairs approach' }), at(2 + i));
      levels.push(r.hints);
    }
    expect(levels).toEqual([1, 2, 3]);
    expect(model.requests.filter((r) => r.schema?.name === 'interviewer_reply').map((r) => /HINT LEVEL (\d)/.exec(r.instructions)?.[1])).toEqual(['1', '2', '3']);
    expect((await fail(interview(d, user, req({ action: 'hint', round: round.id, account: 'still stuck' }), at(6)))).status).toBe(409);
    // A hint may name the pattern: the learner asked for it, and pays in the approach score.
    const named = scripted({ replies: ['{"message":"Think about a hash map.","line":null}'] });
    const other = await learner();
    const r2 = (await start(deps(named), other)).round;
    const { round: hinted } = await interview(deps(named), other, req({ action: 'hint', round: r2.id, account: 'No idea where to start' }), at(1));
    expect(hinted.transcript.at(-1)).toMatchObject({ text: 'Think about a hash map.', level: 1 });
  });

  it('falls back to scripted lines once the round’s replies run out, or the model fails', async () => {
    const user = await learner();
    const model = scripted();
    const d = deps(model, { config: config({ replies: 1 }) });
    const { round } = await start(d, user);
    await interview(d, user, req({ action: 'say', round: round.id, text: 'One' }), at(1));
    const { round: after } = await interview(d, user, req({ action: 'say', round: round.id, text: 'Two' }), at(2));
    expect(after.transcript.at(-1)).toMatchObject({ text: SCRIPTED.reply.clarify, scripted: true });
    expect(after.repliesLeft).toBe(0);
    expect(model.requests.filter((r) => r.schema?.name === 'interviewer_reply')).toHaveLength(1);
    // Hints fall back to the authors' own, mildest first.
    const { round: hinted } = await interview(d, user, req({ action: 'hint', round: round.id, account: 'stuck on the pairs' }), at(3));
    expect(hinted.transcript.at(-1)?.text).toBe(getProblem('two-sum')!.hints[0]);

    const broken: TutorModel = {
      async complete() {
        throw new (await import('../tutor/model')).ModelError('down');
      },
    };
    const other = await learner();
    const r2 = (await start(deps(broken), other)).round;
    const { round: down } = await interview(deps(broken), other, req({ action: 'say', round: r2.id, text: 'Hello?' }), at(1));
    expect(down.transcript.at(-1)).toMatchObject({ text: SCRIPTED.reply.clarify, scripted: true });
  });
});

describe('the debrief', () => {
  it('scores correctness by code and the rest by the model, writes a verified event, and meets the bar', async () => {
    const user = await learner();
    const model = scripted();
    const d = deps(model);
    const id = await toTest(d, user);
    await submitted(d, user, id, 2);
    await submitted(d, user, id, 0, at(36));
    const { round, event } = await interview(d, user, req({ action: 'end', round: id, code: CODE }), at(52));
    expect(round.phase).toBe('debrief');
    expect(round.debrief?.dimensions.map((x) => [x.dimension, x.score])).toEqual([
      ['correctness', 4],
      ['approach', 4],
      ['analysis', 4],
      ['testing', 4],
      ['communication', 4],
    ]);
    expect(round.debrief?.dimensions[1].evidence).toEqual(['map from each number']);
    expect(round.scoredBy).toBe('model');
    expect(event).toMatchObject({ kind: 'interview.finished', at: at(52).toISOString(), data: { format: 'coding', item: 'two-sum', language: 'python', minutes: 52, limit: 45, hints: 0, passed: true, by: 'model', verified: true } });
    const debriefCall = model.requests.find((r) => r.schema?.name === 'interview_debrief')!;
    expect(debriefCall.role).toBe('strong');
    expect(debriefCall.instructions).toMatch(/Correctness, scored by the judge: 4 of 4/);
    expect(debriefCall.messages[0].content).toContain('<learner_transcript>');
    const [stored] = await db.select().from(progressEvent).where(and(eq(progressEvent.userId, user), eq(progressEvent.kind, 'interview.finished')));
    expect(stored.id).toBe(event!.id);
    // Ended means ended.
    expect((await fail(interview(d, user, req({ action: 'end', round: id }), at(53)))).status).toBe(409);
    expect((await fail(interview(d, user, req({ action: 'say', round: id, text: 'One more thing' }), at(53)))).status).toBe(409);
  });

  it('caps the approach by the hints used, and keeps only quotes that are the learner’s words', async () => {
    const user = await learner();
    const model = scripted({
      debriefs: [
        JSON.stringify({
          dimensions: ['approach', 'analysis', 'testing', 'communication'].map((dimension) => ({ dimension, score: 4, evidence: ['I invented this quote', 'duplicates like [3, 3]'], feedback: 'ok' })),
          summary: 's',
          workOn: [],
        }),
      ],
    });
    const d = deps(model);
    const id = await toTest(d, user);
    await interview(d, user, req({ action: 'hint', round: id, account: 'unsure about duplicates' }), at(31));
    await interview(d, user, req({ action: 'hint', round: id }), at(32));
    const { round, event } = await interview(d, user, req({ action: 'end', round: id }), at(40));
    expect(round.debrief?.dimensions.find((x) => x.dimension === 'approach')?.score).toBe(2);
    expect(round.debrief?.dimensions.find((x) => x.dimension === 'testing')?.evidence).toEqual([]); // cases were never submitted
    expect(round.debrief?.dimensions.find((x) => x.dimension === 'correctness')?.score).toBe(1);
    expect(event?.data).toMatchObject({ hints: 2, passed: false });
  });

  it('withholds feedback that gives the solution away, and keeps the scores', async () => {
    const user = await learner();
    const leaky = DEBRIEF({ workOn: ['```\nseen = {}\nfor i, x in enumerate(nums):\n    if target - x in seen:\n        return [seen[target - x], i]\n    seen[x] = i\n```'] });
    const d = deps(scripted({ debriefs: [leaky, leaky] }));
    const id = await toTest(d, user);
    const { round } = await interview(d, user, req({ action: 'end', round: id }), at(40));
    expect(round.debrief).toMatchObject({ withheld: true, workOn: [], summary: '' });
    expect(round.debrief?.dimensions.every((x) => x.feedback === '' || x.dimension === 'correctness')).toBe(true);
  });

  it('falls back to the learner’s own scores when the model can’t score', async () => {
    const user = await learner();
    const d = deps(scripted({ debriefs: ['{"dimensions":[],"summary":"","workOn":[]}'] }));
    const id = await toTest(d, user);
    await submitted(d, user, id, 0);
    const { round, event } = await interview(d, user, req({ action: 'end', round: id }), at(40));
    expect(round.scoredBy).toBe('pending');
    expect(event).toBeUndefined();
    expect((await fail(interview(d, user, req({ action: 'self', round: id, scores: { approach: 3 } }), at(41)))).status).toBe(400);
    const done = await interview(d, user, req({ action: 'self', round: id, scores: { approach: 4, analysis: 3, testing: 3, communication: 4 } }), at(41));
    expect(done.round.scoredBy).toBe('self');
    expect(done.event?.data).toMatchObject({ by: 'self', passed: true, scores: [{ dimension: 'correctness', score: 4 }, { dimension: 'approach', score: 4 }, { dimension: 'analysis', score: 3 }, { dimension: 'testing', score: 3 }, { dimension: 'communication', score: 4 }] });
    expect((await fail(interview(d, user, req({ action: 'self', round: id, scores: { approach: 4, analysis: 3, testing: 3, communication: 4 } }), at(42)))).status).toBe(409);
  });

  it('checks the model’s reply: one score per dimension, in range', () => {
    const state = { phase: 'test' as const, transcript: [], approach: null, edgeCases: '', code: '', submissions: [] };
    expect(() => parseDebrief('nope', state, 0)).toThrow();
    expect(() => parseDebrief(DEBRIEF({ dimensions: [{ dimension: 'approach', score: 9, evidence: [], feedback: '' }] }), state, 0)).toThrow();
    expect(parseDebrief(DEBRIEF(), state, 3).dimensions[0]).toMatchObject({ dimension: 'approach', score: 1, evidence: [] });
  });

  it('runs even when the day’s budget is spent: it was held back', async () => {
    const user = await learner();
    const model = scripted();
    const d = deps(model);
    const id = await toTest(d, user);
    await db.insert(tutorTurn).values({ id: uuidv7(), userId: user, item: 'problem:x', action: 'hint', level: 1, costUsd: 5_000, createdAt: at(31) });
    const { round: said } = await interview(d, user, req({ action: 'say', round: id, text: 'Ready?' }), at(32));
    expect(said.transcript.at(-1)?.scripted).toBe(true);
    const { round } = await interview(d, user, req({ action: 'end', round: id }), at(40));
    expect(round.scoredBy).toBe('model');
    await db.delete(tutorTurn).where(eq(tutorTurn.item, 'problem:x'));
  });

  it('keeps the transcript to reread until the learner deletes it; the scores stay', async () => {
    const user = await learner();
    const d = deps();
    const id = await toTest(d, user);
    expect((await fail(interview(d, user, req({ action: 'delete', round: id }), at(31)))).status).toBe(409);
    await interview(d, user, req({ action: 'end', round: id, code: CODE }), at(40));
    const { round } = await interview(d, user, req({ action: 'delete', round: id }), at(41));
    expect(round.transcript).toEqual([]);
    expect(round.approach).toEqual({ text: '', time: 'O(n)', space: 'O(n)' });
    expect(round.debrief?.dimensions.every((x) => x.evidence.length === 0)).toBe(true);
    expect(round.debrief?.dimensions).toHaveLength(5);
    const [row] = await db.select().from(interviewRound).where(eq(interviewRound.id, id));
    expect(row.code).toBeNull();
  });

  it('keeps one learner out of another’s rounds', async () => {
    const owner = await learner();
    const d = deps();
    const { round } = await start(d, owner);
    expect((await fail(interview(d, await learner(), req({ action: 'say', round: round.id, text: 'hi' }), at(1)))).status).toBe(404);
  });

  it('is the only writer of a verified round: sync drops a device’s claim', async () => {
    const user = await learner();
    const event = {
      id: uuidv7(),
      kind: 'interview.finished',
      at: T0.toISOString(),
      data: { format: 'coding', item: 'two-sum', minutes: 30, limit: 45, hints: 0, passed: true, scores: [{ dimension: 'approach', score: 4 }], by: 'model', verified: true },
    };
    const res = await sync(db, user, { cursor: 0, events: [event] });
    expect(res.events.find((e) => e.id === event.id)?.data).not.toHaveProperty('verified');
  });
});

export type { InterviewRequest };
