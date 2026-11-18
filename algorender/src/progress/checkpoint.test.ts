import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { checkpointPools, openCheckpoints, planMilestones } from '@/content/checkpoints';
import { loadConcepts } from '@/content/concepts';
import { lessonMisconceptions } from '@/content/lessons/assessment';
import { masteryGraph } from '@/content/mastery';
import { stages } from '@/content/stages';
import {
  buildRound,
  canOpen,
  canTake,
  CHECKPOINT_MIN,
  EARLIER,
  interleave,
  latestRounds,
  mistakesMade,
  retakeFrom,
  ROUND_SIZE,
  roundsTaken,
  type CheckpointPools,
  type CheckpointQuestion,
} from './checkpoint';
import { EVENT_DATA, parseEvent, type EventData, type EventKind, type ProgressEvent } from './events';
import { mastery, observations } from './mastery';

let n = 0;
const DAY = 86_400_000;
const T0 = Date.UTC(2026, 10, 2, 9);
const at = (days: number) => new Date(T0 + days * DAY + n).toISOString();
function ev<K extends EventKind>(kind: K, data: EventData<K>, when: string): ProgressEvent {
  n++;
  return { id: `0190a000-0000-7000-8000-${String(n).padStart(12, '0')}`, kind, at: when, data } as ProgressEvent;
}

const question = (item: string, concept: string): CheckpointQuestion => ({
  item,
  source: item.startsWith('probe') ? 'probe' : 'quiz',
  concept,
  lesson: item.split(':')[1],
  q: item,
  choices: ['yes', 'no'],
  answer: 0,
  why: 'because',
});

/** Pools for a made-up stage: c1 and c2 with two mistakes of two probes each, quiz questions, and earlier ones. */
function pools(probes = 8, quiz = 6, earlier = 6): CheckpointPools {
  return {
    stage: 2,
    probes: Array.from({ length: probes }, (_, i) => question(`probe:l${i % 2}:m${Math.floor(i / 2) % 2}:${Math.floor(i / 4)}`, `c${i % 2}`)),
    quiz: Array.from({ length: quiz }, (_, i) => question(`quiz:l${i % 2}:quiz:${i}`, `c${i % 2}`)),
    earlier: Array.from({ length: earlier }, (_, i) => question(`quiz:e${i % 3}:quiz:${i}`, `e${i % 3}`)),
  };
}

describe('a checkpoint round', () => {
  it('asks probes first, then the stage’s quiz questions, with a few earlier ones never first', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 12 }), fc.integer({ min: 0, max: 12 }), fc.integer({ min: 0, max: 8 }), fc.nat(), (p, q, e, seed) => {
        const pool = pools(p, q, e);
        const round = buildRound(pool, new Set(), seed);
        expect(new Set(round.map((x) => x.item)).size).toBe(round.length);
        expect(round.length).toBe(Math.min(ROUND_SIZE, p + q + Math.min(e, EARLIER, ROUND_SIZE - CHECKPOINT_MIN)));
        const earlier = round.filter((x) => x.concept.startsWith('e'));
        expect(earlier.length).toBeLessThanOrEqual(EARLIER);
        if (round.length > earlier.length && earlier.length) expect(round[0].concept.startsWith('e')).toBe(false);
        // Every probe is asked before any of the stage's quiz questions is used to fill the round.
        const own = round.filter((x) => !x.concept.startsWith('e'));
        if (own.some((x) => x.source === 'quiz')) expect(own.filter((x) => x.source === 'probe').length).toBe(p);
        // The same seed gives the same round.
        expect(buildRound(pool, new Set(), seed)).toEqual(round);
      }),
    );
  });

  it('prefers probes for mistakes the learner hasn’t made', () => {
    const pool = pools(8, 0, 0);
    // With room for only four probes, the two made mistakes (l0:m0, l1:m1) wait.
    const made = new Set(['misconception:l0:m0', 'misconception:l1:m1']);
    const round = buildRound(pool, made, 3, 4);
    expect(round.map((x) => x.item.split(':').slice(1, 3).join(':')).sort()).toEqual(['l0:m1', 'l0:m1', 'l1:m0', 'l1:m0']);
  });

  it('never asks two questions in a row about one concept when it can avoid it', () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom('a', 'b', 'c'), { maxLength: 20 }), (concepts) => {
        const qs = concepts.map((c, i) => question(`quiz:l:quiz:${i}`, c));
        const out = interleave(qs);
        expect(out.map((x) => x.item).sort()).toEqual(qs.map((x) => x.item).sort());
        const counts = new Map<string, number>();
        for (const c of concepts) counts.set(c, (counts.get(c) ?? 0) + 1);
        // Repeats are forced only by a concept with more questions than all the others put together, plus one.
        const most = Math.max(0, ...counts.values());
        const forced = Math.max(0, most - (concepts.length - most) - 1);
        const repeats = out.filter((x, i) => i > 0 && out[i - 1].concept === x.concept).length;
        expect(repeats).toBeLessThanOrEqual(forced);
      }),
    );
  });

  it('opens only with enough questions about the stage itself', () => {
    expect(canOpen({ probes: pools(3).probes, quiz: pools(0, 2).quiz })).toBe(false);
    expect(canOpen({ probes: pools(4).probes, quiz: pools(0, 2).quiz })).toBe(true);
  });
});

describe('rounds taken', () => {
  const answer = (stage: number, index: number, of: number, correct: boolean, when: string, concept = 'c0') =>
    ev('checkpoint.answered', { stage, concept, item: `quiz:l0:quiz:${index}`, correct, index, of }, when);

  it('counts a round once its last question is answered, and drops one left halfway', () => {
    const events = [
      answer(1, 0, 3, true, at(0)),
      answer(1, 1, 3, false, at(0)), // left halfway
      answer(1, 0, 2, true, at(1)),
      answer(2, 0, 1, false, at(1), 'c9'),
      answer(1, 1, 2, false, at(1), 'c1'),
    ];
    const rounds = roundsTaken(events);
    expect(rounds).toHaveLength(2);
    expect(rounds[0]).toMatchObject({ stage: 2, right: 0, of: 1 });
    expect(rounds[1]).toMatchObject({ stage: 1, right: 1, of: 2, byConcept: { c0: { right: 1, of: 1 }, c1: { right: 0, of: 1 } } });
    expect(latestRounds(events).get(1)?.at).toBe(events[4].at);
  });

  it('can be taken again a week after the last round', () => {
    const last = roundsTaken([answer(1, 0, 1, true, at(0))])[0];
    expect(canTake(undefined, new Date(at(0)))).toBe(true);
    expect(canTake(last, new Date(T0 + 6.9 * DAY))).toBe(false);
    expect(canTake(last, new Date(T0 + 7 * DAY + 1000))).toBe(true);
    expect(retakeFrom(last)!.getTime() - Date.parse(last.at)).toBe(7 * DAY);
  });

  it('counts each answer for mastery like a quiz answer, on its concept', () => {
    const graph = masteryGraph();
    const events = [ev('checkpoint.answered', { stage: 1, concept: 'floating-point', item: 'probe:floating-point:exact-decimals:0', correct: true, index: 0, of: 1 }, at(0))];
    expect(observations(events, graph)).toEqual([{ concept: 'floating-point', item: 'probe:floating-point:exact-decimals:0', correct: true, at: events[0].at, source: 'quiz' }]);
    expect(mastery(events, graph).get('floating-point')?.status).toBe('learning');
    expect(mistakesMade([ev('misconception.picked', { lesson: 'l', misconception: 'm', from: 'quiz' }, at(0))])).toEqual(new Set(['misconception:l:m']));
  });

  it('records valid events only', () => {
    const ok = { stage: 1, concept: 'floating-point', item: 'quiz:floating-point:check:2', correct: false, index: 0, of: 12 };
    expect(EVENT_DATA['checkpoint.answered'].safeParse(ok).success).toBe(true);
    for (const bad of [{ ...ok, item: 'review:x:y:1' }, { ...ok, stage: 0 }, { ...ok, of: 0 }, { ...ok, concept: 'Bad Id' }]) {
      expect(EVENT_DATA['checkpoint.answered'].safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
    expect(parseEvent(ev('checkpoint.answered', ok, at(0)))).not.toBeNull();
  });
});

describe('the real checkpoints', () => {
  const live = new Set(loadConcepts().concepts.filter((c) => !c.planned).map((c) => c.id));
  const schema = EVENT_DATA['checkpoint.answered'];

  it.each(stages.map((s) => [s.id] as const))('stage %i asks only about its available concepts, with questions the event can record', (id) => {
    const stage = stages.find((s) => s.id === id)!;
    const p = checkpointPools(id);
    for (const q of [...p.probes, ...p.quiz]) expect(stage.concepts).toContain(q.concept);
    for (const q of [...p.probes, ...p.quiz, ...p.earlier]) {
      expect(live.has(q.concept), q.item).toBe(true);
      expect(schema.safeParse({ stage: id, concept: q.concept, item: q.item, correct: true, index: 0, of: 12 }).success, q.item).toBe(true);
      expect(q.answer).toBeGreaterThanOrEqual(0);
      expect(q.answer).toBeLessThan(q.choices.length);
      for (const choice of Object.keys(q.traps ?? {})) expect(Number(choice)).not.toBe(q.answer);
    }
    // Earlier questions come from earlier stages only.
    const before = new Set(stages.filter((s) => s.id < id).flatMap((s) => s.concepts));
    for (const q of p.earlier) expect(before.has(q.concept), q.item).toBe(true);
    // Every probe springs its own mistake's trap.
    const mistakes = new Set(lessonMisconceptions().map((m) => `${m.lesson}:${m.id}`));
    for (const q of p.probes) for (const t of Object.values(q.traps ?? {})) expect(mistakes.has(`${q.lesson}:${t.id}`)).toBe(true);
  });

  it('asks stage 1 about the math toolkit B1 wrote, with its mistakes and its quizzes', () => {
    const p = checkpointPools(1);
    for (const id of ['functions-graphs', 'exponents-logs', 'sums-notation', 'trigonometry']) {
      expect(p.probes.some((q) => q.concept === id), id).toBe(true);
      expect(p.quiz.some((q) => q.concept === id), id).toBe(true);
    }
  });

  it('asks stage 1 about B2’s vectors, dot product, norms and matrix multiplication too', () => {
    const p = checkpointPools(1);
    for (const id of ['vectors', 'dot-product', 'norms-distances', 'matrix-multiplication']) {
      expect(p.probes.some((q) => q.concept === id), id).toBe(true);
      expect(p.quiz.some((q) => q.concept === id), id).toBe(true);
    }
  });

  it('asks stage 1 about B3’s determinants, span, change of basis, learning from examples and least squares', () => {
    const p = checkpointPools(1);
    for (const id of ['determinants-inverses', 'span-basis-rank', 'change-of-basis', 'supervised-learning', 'projections-least-squares']) {
      expect(p.probes.some((q) => q.concept === id), id).toBe(true);
      expect(p.quiz.some((q) => q.concept === id), id).toBe(true);
    }
  });

  it('opens the first two stages today, from the lessons already written', () => {
    const open = openCheckpoints().map((c) => c.stage);
    expect(open).toContain(1);
    expect(open).toContain(2);
    for (const c of openCheckpoints()) expect(c.minutes).toBeGreaterThan(0);
    const round = buildRound(checkpointPools(2), new Set(), 7);
    expect(round).toHaveLength(ROUND_SIZE);
    expect(round.filter((q) => q.source === 'probe').length).toBeGreaterThanOrEqual(ROUND_SIZE - EARLIER);
  });

  it('makes a milestone for every stage whose checkpoint is open', () => {
    const milestones = planMilestones();
    expect(milestones.map((m) => m.stage)).toEqual(openCheckpoints().map((c) => c.stage));
    for (const m of milestones) expect(m).toMatchObject({ checkpoint: true, title: stages.find((s) => s.id === m.stage)!.title });
  });

  it('gives stage 1’s milestone its project, least squares from scratch (M1), and the time it takes', () => {
    const one = planMilestones().find((m) => m.stage === 1)!;
    const checkpoint = openCheckpoints().find((c) => c.stage === 1)!.minutes;
    expect(one.parts).toEqual(['normal-equations', 'solve-system', 'least-squares-fit', 'fit-curves']);
    expect(one.minutes).toBe(checkpoint + 4 * 60);
    // Later stages have no project yet.
    for (const m of planMilestones().filter((x) => x.stage > 1)) expect(m.parts, `stage ${m.stage}`).toBeUndefined();
  });
});
