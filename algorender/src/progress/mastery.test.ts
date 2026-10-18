import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { masteryGraph, placementQuestions } from '@/content/mastery';
import type { EventData, EventKind, ProgressEvent } from './events';
import { BKT, bktUpdate, mastery, nextSteps, observations, relatives, settled, type MasteryGraph } from './mastery';
import { AREA_MISSES, AREAS, areaOf, MAX_QUESTIONS, nextConcept, type AreaId } from './placement';

let n = 0;
const at = (day: number, hour = 10) => new Date(Date.UTC(2026, 9, 1 + day, hour, n % 60)).toISOString();
function ev<K extends EventKind>(kind: K, data: EventData<K>, when: string): ProgressEvent {
  n++;
  return { id: `0190a000-0000-7000-8000-${String(n).padStart(12, '0')}`, kind, at: when, data } as ProgressEvent;
}

// A small graph: a → b → c, and a → d.
const tiny: MasteryGraph = {
  concepts: [
    { id: 'a', title: 'A', track: 'foundations', prereqs: [], lesson: 'la', visualisers: ['va'], planned: false, depth: 0 },
    { id: 'b', title: 'B', track: 'foundations', prereqs: ['a'], lesson: 'lb', visualisers: ['vb'], planned: false, depth: 1 },
    { id: 'c', title: 'C', track: 'foundations', prereqs: ['b'], visualisers: ['vc'], planned: false, depth: 2 },
    { id: 'd', title: 'D', track: 'foundations', prereqs: ['a'], lesson: 'ld', visualisers: [], planned: false, depth: 1 },
  ],
  lessons: { la: 'a', lb: 'b', ld: 'd' },
  exercises: { ex: ['c'] },
  problems: { p1: ['b'], p2: ['b', 'c'] },
};

const quiz = (lesson: string, question: number, correct: boolean, when: string) => ev('quiz.answered', { lesson, quiz: 'quiz', question, correct }, when);

describe('knowledge tracing', () => {
  it('a right answer raises the chance of knowing, a wrong one lowers it', () => {
    fc.assert(
      fc.property(fc.double({ min: 0.01, max: 0.99, noNaN: true }), (p) => {
        expect(bktUpdate(p, true)).toBeGreaterThan(bktUpdate(p, false));
        expect(bktUpdate(p, true)).toBeGreaterThanOrEqual(p);
        expect(bktUpdate(p, true)).toBeLessThanOrEqual(1);
        expect(bktUpdate(p, false)).toBeGreaterThanOrEqual(BKT.learn);
      }),
    );
  });

  it('turns every kind of event into evidence about the right concepts', () => {
    const events = [
      quiz('la', 0, true, at(0)),
      ev('lesson.scored', { lesson: 'lb', key: 'predict', kind: 'prediction', correct: 4, total: 5 }, at(0)),
      ev('lesson.scored', { lesson: 'lb', key: 'quiz', kind: 'quiz', correct: 3, total: 3 }, at(0)),
      ev('exercise.passed', { exercise: 'ex', stage: 'write' }, at(0)),
      ev('problem.submitted', { problem: 'p2', language: 'python', passed: false, tests: 5, failed: 2 }, at(0)),
      ev('problem.submitted', { problem: 'p2', language: 'python', passed: false, tests: 5, failed: 1 }, at(0)),
      ev('problem.submitted', { problem: 'p2', language: 'python', passed: true, tests: 5, failed: 0 }, at(0)),
      ev('review.rated', { card: 'quiz:la:quiz:0', rating: 1 }, at(3)),
      ev('review.rated', { card: 'problem:p1', rating: 3 }, at(3)),
      ev('placement.answered', { concept: 'a', lesson: 'la', quiz: 'quiz', question: 0, correct: true }, at(3)),
    ];
    const obs = observations(events, tiny).map((o) => `${o.concept} ${o.source} ${o.correct}`);
    expect(obs).toEqual([
      'a quiz true',
      'b prediction true',
      'c exercise true',
      // Two failed runs on one day count once; the pass counts too, for both of the problem's concepts.
      'b problem false',
      'c problem false',
      'b problem true',
      'c problem true',
      'a review false',
      'b review true',
    ]);
  });

  it('a good run in one sitting is practised; a right answer on a later day, from varied items, is mastered', () => {
    const sitting = [0, 1, 2, 3, 0, 1, 2, 3].map((q, i) => quiz('la', q, true, at(0, 9 + i / 10)));
    expect(mastery(sitting, tiny).get('a')!.status).toBe('practised');
    const later = [...sitting, quiz('la', 0, true, at(2))];
    const m = mastery(later, tiny).get('a')!;
    expect(m).toMatchObject({ status: 'mastered', delayed: true, items: 4 });
    // One item answered again and again, however late, isn't varied.
    const same = [0, 1, 2, 3, 4, 5, 6].map((d) => quiz('la', 0, true, at(d)));
    expect(mastery(same, tiny).get('a')!.status).toBe('practised');
  });

  it('wrong answers keep a concept in learning', () => {
    const events = [quiz('la', 0, false, at(0)), quiz('la', 1, true, at(0)), quiz('la', 2, false, at(0))];
    expect(mastery(events, tiny).get('a')!.status).toBe('learning');
  });

  it('knowing something built on a concept makes an untouched concept assumed', () => {
    const events = [0, 1, 2, 3, 4, 5].map((q) => quiz('lb', q, true, at(0)));
    const m = mastery(events, tiny);
    expect(m.get('b')!.status).toBe('practised');
    expect(m.get('a')!.status).toBe('assumed');
    expect(m.get('d')!.status).toBe('new');
  });
});

describe('placement', () => {
  const placed = (concept: string, correct: boolean, day = 0) => ev('placement.answered', { concept, lesson: 'l', quiz: 'quiz', question: 0, correct }, at(day));

  it('a right answer places the concept out and assumes what it builds on', () => {
    const m = mastery([placed('c', true)], tiny);
    expect(m.get('c')!.status).toBe('placed');
    expect(m.get('b')!.status).toBe('assumed');
    expect(m.get('a')!.status).toBe('assumed');
    expect(m.get('d')!.status).toBe('new');
  });

  it("a wrong answer settles what builds on it as unknown, and a concept's own answer always wins", () => {
    expect(settled(tiny, [{ concept: 'b', correct: false }])).toEqual({ known: new Set(), unknown: new Set(['b', 'c']) });
    // Right on c implies b; wrong on a implies not b: b is left open, a and c keep their own answers.
    const s = settled(tiny, [
      { concept: 'c', correct: true },
      { concept: 'a', correct: false },
    ]);
    expect([...s.known]).toEqual(['c']);
    expect([...s.unknown].sort()).toEqual(['a', 'd']);
  });

  it('placement only sets where tracing starts: practice still moves it', () => {
    const events = [placed('a', true), quiz('la', 0, false, at(1)), quiz('la', 1, false, at(1)), quiz('la', 2, false, at(1))];
    expect(mastery(events, tiny).get('a')!.status).toBe('learning');
  });

  it('next steps are the fringe: not known, with every prerequisite known', () => {
    expect(nextSteps(mastery([], tiny), tiny).map((s) => s.concept.id)).toEqual(['a']);
    const steps = nextSteps(mastery([placed('a', true)], tiny), tiny);
    // Lessons first (b, d); c still needs b.
    expect(steps.map((s) => s.concept.id)).toEqual(['b', 'd']);
    const started = nextSteps(mastery([placed('a', true), quiz('ld', 0, false, at(1))], tiny), tiny);
    expect(started[0]).toMatchObject({ reason: 'continue', concept: { id: 'd' } });
  });

  it('next steps toward a goal include what leads to it, and nothing off the way', () => {
    const m = mastery([placed('a', true)], tiny);
    expect(nextSteps(m, tiny, { toward: ['c'] }).map((s) => s.concept.id)).toEqual(['b']);
    expect(nextSteps(mastery([], tiny), tiny, { toward: ['c'] }).map((s) => s.concept.id)).toEqual(['a']);
  });
});

describe('the real concept graph', () => {
  const graph = masteryGraph();
  const questions = placementQuestions();
  const ids = new Set(graph.concepts.map((c) => c.id));

  it('maps every lesson, exercise and problem to concepts that exist', () => {
    for (const [lesson, concept] of Object.entries(graph.lessons)) expect(ids.has(concept), lesson).toBe(true);
    for (const [exercise, concepts] of Object.entries(graph.exercises)) {
      expect(concepts.length, `${exercise} teaches no concept`).toBeGreaterThan(0);
      for (const c of concepts) expect(ids.has(c), exercise).toBe(true);
    }
    const unmapped = Object.entries(graph.problems).filter(([, cs]) => cs.length === 0);
    for (const [, cs] of Object.entries(graph.problems)) for (const c of cs) expect(ids.has(c)).toBe(true);
    // Problems whose only patterns have no concept yet (math, bit manipulation) give no evidence; keep that a small minority.
    expect(unmapped.length).toBeLessThan(Object.keys(graph.problems).length / 5);
  });

  it('has placement questions for every concept with a lesson, each well formed', () => {
    for (const c of graph.concepts.filter((x) => x.lesson)) expect(questions[c.id]?.length, c.id).toBeGreaterThan(0);
    for (const pool of Object.values(questions)) for (const q of pool) expect(q.answer >= 0 && q.answer < q.choices.length).toBe(true);
  });

  const available = new Set(Object.keys(questions));
  const { ancestors } = relatives(graph);
  // A learner whose knowledge respects the graph: everything they know, they know the prerequisites of.
  const learner = fc.tuple(fc.subarray(graph.concepts.map((c) => c.id)), fc.subarray([...AREAS.map((a) => a.id)], { minLength: 1 })).map(([seeds, areas]) => {
    const known = new Set<string>();
    for (const s of seeds) {
      known.add(s);
      for (const a of ancestors.get(s) ?? []) known.add(a);
    }
    return { known, areas: areas as AreaId[] };
  });

  it('settles concepts to what a consistent learner really knows, in at most MAX_QUESTIONS questions within their areas', () => {
    fc.assert(
      fc.property(learner, ({ known, areas }) => {
        const answers: { concept: string; correct: boolean }[] = [];
        for (let next = nextConcept(graph, available, answers, areas); next; next = nextConcept(graph, available, answers, areas)) {
          const c = graph.concepts.find((x) => x.id === next)!;
          expect(areas).toContain(areaOf(c.track));
          expect(answers.some((a) => a.concept === next)).toBe(false);
          answers.push({ concept: next, correct: known.has(next) });
        }
        expect(answers.length).toBeLessThanOrEqual(MAX_QUESTIONS);
        const s = settled(graph, answers);
        for (const c of s.known) expect(known.has(c), `${c} settled known`).toBe(true);
        for (const c of s.unknown) expect(known.has(c), `${c} settled unknown`).toBe(false);
      }),
      { numRuns: 200 },
    );
  });

  it('lets a beginner off after a few misses in each area', () => {
    const run = (areas: AreaId[]) => {
      const answers: { concept: string; correct: boolean }[] = [];
      for (let next = nextConcept(graph, available, answers, areas); next; next = nextConcept(graph, available, answers, areas)) answers.push({ concept: next, correct: false });
      return answers.length;
    };
    expect(run(['dsa'])).toBe(AREA_MISSES);
    expect(run(['dsa', 'math', 'ml'])).toBeLessThanOrEqual(3 * AREA_MISSES);
  });
});
