// System-design rounds (REVAMP_PLAN.md 6f-2) on a real (in-memory) Postgres
// with a scripted stand-in model: drawing a variant, the phases and their
// gates, estimates read on the server, checks run on the server (bounded,
// counted, the deep dive's fault in that phase), the giveaway check on the
// parts the learner's design lacks, the debrief scored by code and the model,
// the self-scored fallback, and the verified event.

import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getVariant, variantsOf } from '@/content/designs/interviews';
import { MAX_CHECKS } from '@/interview/design';
import type { Design } from '@/systems/design/types';
import { createAuth } from '../auth';
import { createTestDatabase, type Database } from '../db';
import { interviewRound, progressEvent, tutorTurn } from '../db/schema';
import type { TutorConfig } from '../tutor/config';
import type { ModelRequest, TutorModel } from '../tutor/model';
import { interview, interviewStatus, parseInterviewRequest, type InterviewError, type InterviewResponse } from '.';
import type { InterviewConfig } from './config';
import { DESIGN_SCRIPTED, readDesign } from './design';
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
  const res = await auth.api.signUpEmail({ body: { email: `design-${++learners}@example.com`, password: 'correct horse battery', name: 'Ada' } });
  return res.user.id;
}

const tutor: TutorConfig = {
  provider: 'fake',
  endpoint: '',
  apiKey: '',
  models: { fast: 'luna', strong: 'sol' },
  prices: { fast: { input: 1, output: 4 }, strong: { input: 5, output: 20 } },
  turnsPerDay: 30,
  dailyUsd: 1_000,
};
const config = (over: Partial<InterviewConfig> = {}): InterviewConfig => ({ tutor, roundsPerDay: 50, replies: 16, dailyUsd: 500, ...over });

const DEBRIEF = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    dimensions: ['tradeoffs', 'communication'].map((dimension) => ({ dimension, score: 4, evidence: ['the popular menus in memory'], feedback: `Good ${dimension}.` })),
    summary: 'A good round.',
    workOn: ['Say what each part costs.'],
    ...over,
  });

function scripted(script: { replies?: string[]; leaks?: string[]; debriefs?: string[] } = {}): TutorModel & { requests: ModelRequest[] } {
  return {
    requests: [],
    async complete(request) {
      this.requests.push(request);
      if (request.schema?.name === 'leak_check') return { text: script.leaks?.shift() ?? '{"leaks":false,"reason":""}', inputTokens: 100, outputTokens: 5 };
      if (request.schema?.name === 'interview_debrief') return { text: script.debriefs?.shift() ?? DEBRIEF(), inputTokens: 5000, outputTokens: 500 };
      return { text: script.replies?.shift() ?? '{"message":"What would you assume about the evening rush?","line":null}', inputTokens: 1000, outputTokens: 40 };
    },
  };
}

const T0 = new Date('2026-11-18T10:00:00Z');
const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);
const variant = getVariant('qr-menus')!;
const EXPLAIN = 'I keep the popular menus in memory in front of the database, with edits passing through it so a changed menu is dropped, and four app servers.';
// The answers in the variant's own terms: the peak rate, then the bandwidth.
const ESTIMATES = [
  { id: 'peak', text: '5k' },
  { id: 'bandwidth', text: '100 MB/s' },
];

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

const start = (d: Deps, user: string, over: Record<string, unknown> = {}, now = T0): Promise<InterviewResponse> =>
  interview(d, user, req({ action: 'start', format: 'design', limit: 45, variant: 'qr-menus', ...over }), now);

/** Starts a round and takes it to the Design phase with its estimates given. */
async function toDesign(d: Deps, user: string) {
  const { round } = await start(d, user);
  await interview(d, user, req({ action: 'phase', round: round.id, to: 'estimate' }), at(4));
  await interview(d, user, req({ action: 'estimate', round: round.id, answers: ESTIMATES }), at(8));
  await interview(d, user, req({ action: 'phase', round: round.id, to: 'design' }), at(10));
  return round.id;
}

describe('starting a design round', () => {
  it('draws a variant the learner hasn’t had a round on, from the chosen case, and flags a repeat', async () => {
    const user = await learner();
    const d = deps();
    const first = await interview(d, user, req({ action: 'start', format: 'design', limit: 45, study: 'chat' }), T0);
    expect(first.round).toMatchObject({ format: 'design', item: 'chat', language: null, phase: 'requirements', hints: 0, repeat: false, checksLeft: MAX_CHECKS });
    expect(variantsOf('chat').map((v) => v.slug)).toContain(first.round.variant);
    expect(first.round.design).toEqual(getVariant(first.round.variant!)!.start);
    expect(first.round.transcript).toEqual([expect.objectContaining({ role: 'interviewer', text: DESIGN_SCRIPTED.open, phase: 'requirements' })]);
    await interview(d, user, req({ action: 'end', round: first.round.id }), at(1));
    const second = await interview(d, user, req({ action: 'start', format: 'design', limit: 45, study: 'chat' }), at(2));
    expect(second.round.variant).not.toBe(first.round.variant);
    expect(second.round.repeat).toBe(false);
    await interview(d, user, req({ action: 'end', round: second.round.id }), at(3));
    const third = await interview(d, user, req({ action: 'start', format: 'design', limit: 45, study: 'chat' }), at(4));
    expect(third.round.repeat).toBe(true);
  });

  it('counts design and coding rounds together against the day’s rounds, and says a coding round needs a language', async () => {
    const user = await learner();
    const d = deps(scripted(), { config: config({ roundsPerDay: 1 }) });
    expect((await fail(interview(d, user, req({ action: 'start', limit: 45, problem: 'two-sum' }), T0))).status).toBe(400);
    const { round } = await start(d, user);
    await interview(d, user, req({ action: 'end', round: round.id }), at(1));
    expect((await fail(interview(d, user, req({ action: 'start', language: 'python', limit: 45, problem: 'two-sum' }), at(2)))).status).toBe(429);
    const status = await interviewStatus(db, config({ roundsPerDay: 1 }), user, at(3));
    expect(status.recent[0]).toMatchObject({ format: 'design', title: variant.title, language: null });
  });
});

describe('the phases', () => {
  it('reads the estimates on the server and wants every one before the design', async () => {
    const user = await learner();
    const d = deps();
    const { round } = await start(d, user);
    expect((await fail(interview(d, user, req({ action: 'phase', round: round.id, to: 'design' }), at(1)))).status).toBe(409);
    await interview(d, user, req({ action: 'phase', round: round.id, to: 'estimate' }), at(2));
    expect((await fail(interview(d, user, req({ action: 'phase', round: round.id, to: 'design' }), at(3)))).status).toBe(400);
    expect((await fail(interview(d, user, req({ action: 'estimate', round: round.id, answers: [ESTIMATES[0]] }), at(3)))).status).toBe(400);
    const unreadable = await fail(interview(d, user, req({ action: 'estimate', round: round.id, answers: [ESTIMATES[0], { id: 'bandwidth', text: 'lots' }] }), at(3)));
    expect(unreadable.status).toBe(400);
    expect(unreadable.message).toContain('“lots”');
    const { round: estimated } = await interview(d, user, req({ action: 'estimate', round: round.id, answers: ESTIMATES }), at(4));
    expect(estimated.estimates).toEqual([
      { id: 'peak', text: '5k', value: 5000 },
      { id: 'bandwidth', text: '100 MB/s', value: 1e8 },
    ]);
    expect(estimated.transcript.at(-2)?.text).toContain('5k');
    const { round: designing } = await interview(d, user, req({ action: 'phase', round: round.id, to: 'design' }), at(6));
    expect(designing.transcript.at(-1)).toMatchObject({ text: DESIGN_SCRIPTED.enter.design, scripted: true });
    expect(designing.phases.design).toBe(at(6).toISOString());
  });

  it('wants the design explained in words before the deep dive, which opens with the variant’s own words', async () => {
    const user = await learner();
    const d = deps();
    const id = await toDesign(d, user);
    expect((await fail(interview(d, user, req({ action: 'phase', round: id, to: 'deepdive' }), at(20)))).status).toBe(400);
    expect((await fail(interview(d, user, req({ action: 'explain', round: id, text: 'A cache.' }), at(20)))).status).toBe(400);
    const { round } = await interview(d, user, req({ action: 'explain', round: id, text: EXPLAIN, design: variant.reference }), at(21));
    expect(round.approach?.text).toBe(EXPLAIN);
    expect(round.design).toEqual(variant.reference);
    const { round: deep } = await interview(d, user, req({ action: 'phase', round: id, to: 'deepdive' }), at(25));
    expect(deep.transcript.at(-1)).toMatchObject({ text: variant.deepDive.say, phase: 'deepdive', scripted: true });
  });

  it('keeps coding actions to coding rounds', async () => {
    const user = await learner();
    const d = deps();
    const id = await toDesign(d, user);
    expect((await fail(interview(d, user, req({ action: 'submit', round: id, code: 'x', cases: 'a', results: { tests: 1, failed: 0 } }), at(20)))).status).toBe(409);
    expect((await fail(interview(d, user, req({ action: 'approach', round: id, text: EXPLAIN, time: 'O(n)', space: 'O(n)' }), at(20)))).status).toBe(409);
  });
});

describe('checks', () => {
  it('run on the server, count, and add the deep dive’s checks in that phase', async () => {
    const user = await learner();
    const d = deps();
    const id = await toDesign(d, user);
    const first = await interview(d, user, req({ action: 'check', round: id, design: variant.start }), at(12));
    expect(first.check?.passed).toBe(false);
    expect(first.check?.checks.some((c) => c.id.startsWith('deep-'))).toBe(false);
    expect(first.check?.result.findings).toEqual([]);
    expect(first.round.submissions).toEqual([expect.objectContaining({ verified: true, deep: false, failed: expect.any(Number) })]);
    expect(first.round.checksLeft).toBe(MAX_CHECKS - 1);

    const second = await interview(d, user, req({ action: 'check', round: id, design: variant.reference }), at(18));
    expect(second.check?.passed).toBe(true);
    await interview(d, user, req({ action: 'explain', round: id, text: EXPLAIN }), at(19));
    await interview(d, user, req({ action: 'phase', round: id, to: 'deepdive' }), at(25));
    const deep = await interview(d, user, req({ action: 'check', round: id, design: variant.reference }), at(27));
    expect(deep.check?.deepResult).not.toBeNull();
    expect(deep.check?.checks.filter((c) => c.id.startsWith('deep-')).length).toBeGreaterThan(0);
    expect(deep.round.submissions.at(-1)).toMatchObject({ deep: true, failed: 0 });
  });

  it('turn away a design that can’t run without using a check, and stop at the round’s limit', async () => {
    const user = await learner();
    const d = deps();
    const id = await toDesign(d, user);
    expect((await fail(interview(d, user, req({ action: 'check', round: id, design: { components: [{ kind: 'mainframe' }] } }), at(12)))).status).toBe(400);
    const unwired: Design = { components: variant.start.components.map((c) => (c.kind === 'load-balancer' ? { ...c, to: '' } : c)) };
    const unrunnable = await fail(interview(d, user, req({ action: 'check', round: id, design: unwired }), at(12)));
    expect(unrunnable.status).toBe(400);
    expect(unrunnable.message).toContain('can’t run yet');
    for (let i = 0; i < MAX_CHECKS; i++) await interview(d, user, req({ action: 'check', round: id, design: variant.start }), at(13));
    expect((await fail(interview(d, user, req({ action: 'check', round: id, design: variant.start }), at(14)))).status).toBe(409);
  });

  it('run the variant’s traffic and fan-out, whatever the design says', () => {
    const tampered = {
      components: variant.reference.components.map((c) => (c.kind === 'clients' ? { ...c, workload: { ...c.workload, rps: 1 } } : c.kind === 'app' ? { ...c, fanout: 100 } : c)),
    };
    const read = readDesign(tampered, variant)!;
    expect(read.components.find((c) => c.kind === 'clients')).toMatchObject({ workload: variant.workload });
    expect(read.components.find((c) => c.kind === 'app')).toMatchObject({ fanout: 1 });
    expect(readDesign({ components: Array.from({ length: 30 }, () => variant.reference.components[0]) }, variant)).toBeNull();
    expect(readDesign('not a design', variant)).toBeNull();
  });
});

describe('the interviewer', () => {
  it('may not name a part the learner’s design lacks before the learner does', async () => {
    const user = await learner();
    const model = scripted({ replies: ['{"message":"Have you thought about a cache?","line":null}', '{"message":"Why a cache, though?","line":null}'] });
    const d = deps(model);
    const { round } = await start(d, user);
    const { round: after } = await interview(d, user, req({ action: 'say', round: round.id, text: 'How busy is the evening rush?' }), at(1));
    expect(after.transcript.at(-1)?.text).toBe(SCRIPTED.blocked);
    const instructions = model.requests.find((r) => r.schema?.name === 'interviewer_reply')!.instructions;
    expect(instructions).toContain('don’t: cache');
    expect(instructions).toContain('<reference_design>');

    const model2 = scripted({ replies: ['{"message":"Why a cache, though?","line":null}'] });
    const { round: named } = await interview(deps(model2), user, req({ action: 'say', round: round.id, text: 'I would put a cache in front of the database.' }), at(2));
    expect(named.transcript.at(-1)?.text).toBe('Why a cache, though?');
  });

  it('gives the authors’ hints, mildest first, when the model has no replies left', async () => {
    const user = await learner();
    const d = deps(scripted(), { config: config({ replies: 0 }) });
    const id = await toDesign(d, user);
    expect((await fail(interview(d, user, req({ action: 'hint', round: id }), at(12)))).status).toBe(400);
    const { round } = await interview(d, user, req({ action: 'hint', round: id, account: 'I don’t know what is slow.' }), at(13));
    expect(round.transcript.at(-1)).toMatchObject({ text: variant.hints[0], level: 1, scripted: true });
    expect(round.hints).toBe(1);
  });
});

describe('the debrief', () => {
  it('scores targets, estimation and cost by code from the server’s own final run, and the rest by the model; the event is verified', async () => {
    const user = await learner();
    const model = scripted();
    const d = deps(model);
    const id = await toDesign(d, user);
    await interview(d, user, req({ action: 'check', round: id, design: variant.reference }), at(14));
    await interview(d, user, req({ action: 'explain', round: id, text: EXPLAIN }), at(18));
    await interview(d, user, req({ action: 'phase', round: id, to: 'deepdive' }), at(25));
    await interview(d, user, req({ action: 'say', round: id, text: 'The other app servers take its share, and the memory layer still answers most scans.' }), at(30));
    const { round, event } = await interview(d, user, req({ action: 'end', round: id, design: variant.reference }), at(40));
    expect(round.phase).toBe('debrief');
    expect(round.passed).toBe(true);
    expect(round.scoredBy).toBe('model');
    expect(round.debrief?.dimensions.map((x) => [x.dimension, x.score])).toEqual([
      ['targets', 4],
      ['estimation', 4],
      ['cost', 4],
      ['tradeoffs', 4],
      ['communication', 4],
    ]);
    expect(round.debrief?.design?.checks.every((c) => c.ok)).toBe(true);
    expect(round.debrief?.design?.estimates.map((e) => e.verdict)).toEqual(['spot-on', 'spot-on']);
    expect(round.debrief?.dimensions.find((x) => x.dimension === 'tradeoffs')?.evidence).toEqual(['the popular menus in memory']);
    expect(event).toMatchObject({ kind: 'interview.finished', data: { format: 'design', item: 'url-shortener', variant: 'qr-menus', limit: 45, hints: 0, passed: true, by: 'model', verified: true } });
    expect(event?.data).not.toHaveProperty('language');
    const debriefCall = model.requests.find((r) => r.schema?.name === 'interview_debrief')!;
    expect(debriefCall.messages[0].content).toContain('<learner_approach>');
    expect(debriefCall.instructions).toContain('targets, scored by code: 4 of 4');
    const [stored] = await db
      .select()
      .from(progressEvent)
      .where(and(eq(progressEvent.userId, user), eq(progressEvent.kind, 'interview.finished')));
    expect(stored).toBeDefined();
    const turns = await db.select().from(tutorTurn).where(eq(tutorTurn.item, `interview:${id}`));
    expect(turns.map((t) => t.action).sort()).toContain('debrief');
  });

  it('runs the deep dive at the end even if the learner never reached it, caps trade-offs by hints, and misses the bar on a failing design', async () => {
    const user = await learner();
    const d = deps(scripted({ replies: [] }));
    const id = await toDesign(d, user);
    for (const account of ['I am stuck on what is slow.', '', '']) await interview(d, user, req({ action: 'hint', round: id, account }), at(15));
    const { round } = await interview(d, user, req({ action: 'end', round: id, design: variant.start }), at(20));
    expect(round.passed).toBe(false);
    expect(round.debrief?.design?.checks.some((c) => c.id.startsWith('deep-'))).toBe(true);
    const score = (x: string) => round.debrief?.dimensions.find((y) => y.dimension === x)?.score;
    expect(score('targets')).toBeLessThanOrEqual(2);
    expect(score('tradeoffs')).toBe(1);
  });

  it('falls back to the learner’s own scores when the model can’t, keeping what code measured', async () => {
    const user = await learner();
    const d = deps(scripted({ debriefs: ['not json'] }));
    const id = await toDesign(d, user);
    const { round } = await interview(d, user, req({ action: 'end', round: id, design: variant.reference }), at(20));
    expect(round.scoredBy).toBe('pending');
    expect(round.debrief?.dimensions.map((x) => x.dimension)).toEqual(['targets', 'estimation', 'cost']);
    expect((await fail(interview(d, user, req({ action: 'self', round: id, scores: { approach: 3, analysis: 3, testing: 3, communication: 3 } }), at(21)))).status).toBe(400);
    const { round: scored, event } = await interview(d, user, req({ action: 'self', round: id, scores: { tradeoffs: 3, communication: 2 } }), at(21));
    expect(scored.debrief?.dimensions.map((x) => [x.dimension, x.score])).toEqual([
      ['targets', 4],
      ['estimation', 4],
      ['cost', 4],
      ['tradeoffs', 3],
      ['communication', 2],
    ]);
    expect(scored.debrief?.design).toBeDefined();
    expect(event?.data).toMatchObject({ format: 'design', by: 'self', verified: true });
  });

  it('deletes what the learner wrote, the design and estimates included, and keeps the scores', async () => {
    const user = await learner();
    const d = deps();
    const id = await toDesign(d, user);
    await interview(d, user, req({ action: 'explain', round: id, text: EXPLAIN }), at(18));
    await interview(d, user, req({ action: 'end', round: id, design: variant.reference }), at(20));
    const { round } = await interview(d, user, req({ action: 'delete', round: id }), at(21));
    expect(round.transcript).toEqual([]);
    expect(round.estimates).toEqual([]);
    expect(round.design).toBeNull();
    expect(round.debrief?.dimensions).toHaveLength(5);
    const [row] = await db.select().from(interviewRound).where(eq(interviewRound.id, id));
    expect(row.approach).toMatchObject({ text: '' });
  });
});
