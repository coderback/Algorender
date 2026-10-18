// Mastery per concept, from the progress events alone (REVAMP_PLAN.md §6.7):
// every answer, prediction, exercise, submission and review is evidence about
// a concept on the concept graph, and Bayesian knowledge tracing turns the
// evidence into the chance the learner knows it. Like review scheduling, it is
// a pure function of the events, so every device agrees.
//
// A concept counts as mastered only after delayed, varied retrieval: a high
// chance of knowing it, evidence from at least two different items, and a
// right answer at least DELAY_HOURS after the first contact. A good run in one
// sitting only makes it "practised".
//
// The placement check sets where tracing starts. A right answer there says
// the learner knows that concept, and what it builds on; a wrong one says
// they don't, nor what builds on it.

import type { ProgressEvent } from './events';

/** A concept as mastery needs it: a client-safe slice of src/content/concepts.yaml. */
export type MasteryConcept = {
  id: string;
  title: string;
  track: string;
  prereqs: string[];
  lesson?: string;
  visualisers: string[];
  planned: boolean;
  /** Depth in the prerequisite graph (0: builds on nothing). */
  depth: number;
};

/** The concept graph plus which concept each piece of content gives evidence about. */
export type MasteryGraph = {
  concepts: MasteryConcept[];
  /** Lesson slug → its concept. */
  lessons: Record<string, string>;
  /** Exercise slug → the concepts its visualiser teaches. */
  exercises: Record<string, string[]>;
  /** Problem slug → the concepts its patterns belong to. */
  problems: Record<string, string[]>;
};

export type Source = 'quiz' | 'prediction' | 'exercise' | 'problem' | 'review';

/** One piece of evidence: an item (a question, an exercise, a problem) answered right or wrong. */
export type Observation = { concept: string; item: string; correct: boolean; at: string; source: Source };

/**
 * - `new`: no evidence yet.
 * - `learning`: some evidence, not yet likely known.
 * - `practised`: likely known, but not yet retrieved on a later day from varied items.
 * - `mastered`: likely known, from varied items, retrieved again after a delay.
 * - `placed`: shown in the placement check (or marked as known), with no practice since.
 * - `assumed`: no evidence of its own, but something built on it is known.
 */
export type MasteryStatus = 'new' | 'learning' | 'practised' | 'mastered' | 'placed' | 'assumed';

export type ConceptMastery = {
  id: string;
  status: MasteryStatus;
  /** The chance the learner knows it, after every observation. */
  p: number;
  observations: number;
  correct: number;
  /** Distinct items answered. */
  items: number;
  first?: string;
  last?: string;
  /** A right answer came at least DELAY_HOURS after the first observation. */
  delayed: boolean;
};

/** Statuses that count as known when deciding what is ready to learn. */
export const KNOWN: ReadonlySet<MasteryStatus> = new Set(['practised', 'mastered', 'placed', 'assumed']);

/**
 * Knowledge-tracing parameters: the chance of learning it at each practice
 * opportunity, of slipping when known, of guessing when not (lesson quizzes
 * mostly have four choices), and the starting chance with no placement.
 */
export const BKT = { learn: 0.15, slip: 0.1, guess: 0.2, prior: 0.1 } as const;
/** Where placement puts a concept answered right, its prerequisites, and a concept answered wrong. */
export const PLACED = { known: 0.85, implied: 0.75, unknown: 0.05 } as const;
export const PRACTISED_AT = 0.8;
export const MASTERED_AT = 0.95;
/** How long after the first contact a right answer counts as delayed retrieval. */
export const DELAY_HOURS = 20;

/** The posterior after one answer, then the chance of learning from the practice. */
export function bktUpdate(p: number, correct: boolean, k: { learn: number; slip: number; guess: number } = BKT): number {
  const known = correct ? p * (1 - k.slip) : p * k.slip;
  const unknown = correct ? (1 - p) * k.guess : (1 - p) * (1 - k.guess);
  const post = known / (known + unknown);
  return post + (1 - post) * k.learn;
}

/** The evidence in the events, in their order. Events must be in time order. */
export function observations(events: readonly ProgressEvent[], graph: MasteryGraph): Observation[] {
  const out: Observation[] = [];
  const push = (concepts: readonly string[] | string | undefined, o: Omit<Observation, 'concept'>) => {
    for (const concept of typeof concepts === 'string' ? [concepts] : (concepts ?? [])) out.push({ concept, ...o });
  };
  // Repeated submissions of one problem in a day are one observation each way: a day of failed runs isn't ten pieces of evidence.
  const seenSubmissions = new Set<string>();
  for (const e of events) {
    switch (e.kind) {
      case 'quiz.answered':
        push(graph.lessons[e.data.lesson], { item: `quiz:${e.data.lesson}:${e.data.quiz}:${e.data.question}`, correct: e.data.correct, at: e.at, source: 'quiz' });
        break;
      case 'lesson.scored':
        // Quizzes count question by question (quiz.answered); a prediction challenge counts as one answer.
        if (e.data.kind === 'prediction' && e.data.total > 0) {
          push(graph.lessons[e.data.lesson], { item: `prediction:${e.data.lesson}:${e.data.key}`, correct: e.data.correct / e.data.total >= 0.7, at: e.at, source: 'prediction' });
        }
        break;
      case 'exercise.passed':
        push(graph.exercises[e.data.exercise], { item: `exercise:${e.data.exercise}`, correct: true, at: e.at, source: 'exercise' });
        break;
      case 'problem.submitted': {
        const key = `${e.data.problem}:${e.at.slice(0, 10)}:${e.data.passed}`;
        if (seenSubmissions.has(key)) break;
        seenSubmissions.add(key);
        push(graph.problems[e.data.problem], { item: `problem:${e.data.problem}`, correct: e.data.passed, at: e.at, source: 'problem' });
        break;
      }
      case 'review.rated': {
        const [kind, slug] = e.data.card.split(':');
        const concepts = kind === 'quiz' ? graph.lessons[slug] : kind === 'problem' ? graph.problems[slug] : undefined;
        // Again is a lapse; Hard, Good and Easy are recalled.
        push(concepts, { item: e.data.card, correct: e.data.rating >= 2, at: e.at, source: 'review' });
        break;
      }
    }
  }
  return out;
}

export type PlacementAnswer = { concept: string; correct: boolean };

/**
 * What placement answers settle: concepts known and not known. A concept's
 * own (latest) answer always decides it; otherwise a right answer to
 * something built on it makes it known, a wrong answer to something it
 * builds on makes it unknown, and a concept implied both ways stays open.
 */
export function settled(graph: MasteryGraph, answers: readonly PlacementAnswer[]): { known: Set<string>; unknown: Set<string> } {
  const { ancestors, descendants } = relatives(graph);
  const direct = new Map(answers.map((a) => [a.concept, a.correct]));
  const impliedKnown = new Set<string>();
  const impliedUnknown = new Set<string>();
  for (const [concept, correct] of direct) {
    if (correct) for (const x of ancestors.get(concept) ?? []) impliedKnown.add(x);
    else for (const x of descendants.get(concept) ?? []) impliedUnknown.add(x);
  }
  const known = new Set<string>();
  const unknown = new Set<string>();
  for (const [concept, correct] of direct) (correct ? known : unknown).add(concept);
  for (const x of impliedKnown) if (!direct.has(x) && !impliedUnknown.has(x)) known.add(x);
  for (const x of impliedUnknown) if (!direct.has(x) && !impliedKnown.has(x)) unknown.add(x);
  return { known, unknown };
}

/**
 * Where tracing starts for each concept, from the placement answers and the
 * concepts the learner marked as known (a self-check counts like a right
 * answer; unmarking counts like a miss), and which concepts were settled directly.
 */
export function placementPriors(events: readonly ProgressEvent[], graph: MasteryGraph): { prior: Map<string, number>; tested: Map<string, boolean> } {
  const answers: PlacementAnswer[] = [];
  for (const e of events) {
    if (e.kind === 'placement.answered') answers.push({ concept: e.data.concept, correct: e.data.correct });
    else if (e.kind === 'concept.marked') answers.push({ concept: e.data.concept, correct: e.data.known });
  }
  const tested = new Map(answers.map((a) => [a.concept, a.correct]));
  const { known, unknown } = settled(graph, answers);
  const prior = new Map<string, number>();
  for (const c of known) prior.set(c, tested.get(c) ? PLACED.known : PLACED.implied);
  for (const c of unknown) prior.set(c, tested.has(c) ? PLACED.unknown : BKT.prior);
  return { prior, tested };
}

/** Every concept's mastery. Events must be in time order. */
export function mastery(events: readonly ProgressEvent[], graph: MasteryGraph): Map<string, ConceptMastery> {
  const { prior, tested } = placementPriors(events, graph);
  const byConcept = new Map<string, Observation[]>();
  for (const o of observations(events, graph)) {
    const list = byConcept.get(o.concept);
    if (list) list.push(o);
    else byConcept.set(o.concept, [o]);
  }
  const out = new Map<string, ConceptMastery>();
  for (const c of graph.concepts) {
    const obs = byConcept.get(c.id) ?? [];
    const start = prior.get(c.id) ?? BKT.prior;
    let p = start;
    for (const o of obs) p = bktUpdate(p, o.correct);
    const first = obs[0]?.at;
    const delayed = !!first && obs.some((o) => o.correct && hoursBetween(first, o.at) >= DELAY_HOURS);
    const items = new Set(obs.map((o) => o.item)).size;
    let status: MasteryStatus;
    if (obs.length === 0) status = tested.get(c.id) === true ? 'placed' : start >= PLACED.implied ? 'assumed' : 'new';
    else if (p >= MASTERED_AT && items >= 2 && delayed) status = 'mastered';
    else if (p >= PRACTISED_AT) status = 'practised';
    else status = 'learning';
    out.set(c.id, { id: c.id, status, p, observations: obs.length, correct: obs.filter((o) => o.correct).length, items, first, last: obs.at(-1)?.at, delayed });
  }
  // Something built on a concept being known is evidence for the concept: fill in what has no evidence of its own.
  const { ancestors } = relatives(graph);
  for (const m of [...out.values()]) {
    if (m.status !== 'practised' && m.status !== 'mastered') continue;
    for (const a of ancestors.get(m.id) ?? []) {
      const am = out.get(a);
      if (am && am.status === 'new') out.set(a, { ...am, status: 'assumed' });
    }
  }
  return out;
}

/** The broad areas of the graph, each a set of tracks: what the placement check offers and next steps spread across. */
export const AREAS = [
  { id: 'dsa', label: 'Data structures and algorithms' },
  { id: 'math', label: 'Math for CS and ML' },
  { id: 'ml', label: 'Machine learning' },
] as const;
export type AreaId = (typeof AREAS)[number]['id'];

export const areaOf = (track: string): AreaId => (track === 'math' ? 'math' : track === 'ml' ? 'ml' : 'dsa');

export type NextStep = { concept: MasteryConcept; reason: 'continue' | 'ready' };

/**
 * What to learn next: concepts already started (still learning), most recent
 * first, then concepts on the outer fringe of what is known (every
 * prerequisite known, the concept itself not yet), taking each area in turn,
 * within an area those with a lesson first, shallowest first. `toward` limits
 * them to some goal concepts and what leads to them (an ML goal may start in math).
 */
export function nextSteps(m: Map<string, ConceptMastery>, graph: MasteryGraph, { limit = 3, toward }: { limit?: number; toward?: readonly string[] } = {}): NextStep[] {
  const known = (id: string) => KNOWN.has(m.get(id)?.status ?? 'new');
  let scope: Set<string> | null = null;
  if (toward) {
    const { ancestors } = relatives(graph);
    scope = new Set(toward.flatMap((id) => [id, ...(ancestors.get(id) ?? [])]));
  }
  const inScope = (c: MasteryConcept) => !c.planned && (!scope || scope.has(c.id));
  // Something already started is worth finishing, whether or not what it builds on is known.
  const started = graph.concepts
    .filter((c) => inScope(c) && m.get(c.id)?.status === 'learning')
    .sort((a, b) => (m.get(b.id)!.last ?? '').localeCompare(m.get(a.id)!.last ?? ''));
  const fringe = graph.concepts.filter((c) => inScope(c) && !known(c.id) && m.get(c.id)?.status !== 'learning' && c.prereqs.every(known));
  const byArea = AREAS.map(({ id }) =>
    fringe
      .filter((c) => areaOf(c.track) === id)
      .sort((a, b) => Number(!a.lesson) - Number(!b.lesson) || a.depth - b.depth || a.title.localeCompare(b.title)),
  );
  const fresh: MasteryConcept[] = [];
  for (let i = 0; byArea.some((list) => i < list.length); i++) for (const list of byArea) if (i < list.length) fresh.push(list[i]);
  return [...started.map((concept) => ({ concept, reason: 'continue' as const })), ...fresh.map((concept) => ({ concept, reason: 'ready' as const }))].slice(0, limit);
}

/** Whether a concept is on the fringe: not yet known, with every prerequisite known. */
export function isReady(id: string, m: Map<string, ConceptMastery>, graph: MasteryGraph): boolean {
  const c = graph.concepts.find((x) => x.id === id);
  const known = (x: string) => KNOWN.has(m.get(x)?.status ?? 'new');
  return !!c && !c.planned && !known(id) && c.prereqs.every(known);
}

const relativesCache = new WeakMap<MasteryGraph, { ancestors: Map<string, Set<string>>; descendants: Map<string, Set<string>> }>();

/** Every concept's transitive prerequisites (ancestors) and the concepts that transitively build on it (descendants). */
export function relatives(graph: MasteryGraph) {
  const cached = relativesCache.get(graph);
  if (cached) return cached;
  const byId = new Map(graph.concepts.map((c) => [c.id, c]));
  const ancestors = new Map<string, Set<string>>();
  const visit = (id: string): Set<string> => {
    const known = ancestors.get(id);
    if (known) return known;
    const set = new Set<string>();
    ancestors.set(id, set);
    for (const p of byId.get(id)?.prereqs ?? []) {
      set.add(p);
      for (const a of visit(p)) set.add(a);
    }
    return set;
  };
  graph.concepts.forEach((c) => visit(c.id));
  const descendants = new Map<string, Set<string>>(graph.concepts.map((c) => [c.id, new Set()]));
  for (const [id, anc] of ancestors) for (const a of anc) descendants.get(a)?.add(id);
  const result = { ancestors, descendants };
  relativesCache.set(graph, result);
  return result;
}

const hoursBetween = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 3_600_000;
