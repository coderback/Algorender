// The placement check: a short adaptive quiz that finds where a learner
// stands on the concept graph. Knowing a concept implies knowing what it
// builds on, and not knowing one implies not knowing what builds on it, so
// each answer settles a whole chain. The next question goes to the concept
// that splits what is still unsettled most evenly, like a binary search on
// the prerequisite graph.

import { areaOf, relatives, settled, type AreaId, type MasteryGraph, type PlacementAnswer } from './mastery';

export { AREAS, areaOf, settled, type AreaId, type PlacementAnswer } from './mastery';

/** One lesson quiz question, asked about its lesson's concept. */
export type PlacementQuestion = {
  concept: string;
  lesson: string;
  quiz: string;
  question: number;
  q: string;
  choices: string[];
  answer: number;
  why: string;
  /** Wrong choices that come from a common mistake the lesson names: choice index → its id. */
  traps?: Record<string, string>;
};

/** The most questions one check asks. */
export const MAX_QUESTIONS = 12;
/** Misses in an area, with nothing right there, after which it stops asking about that area: a beginner starts at its roots. */
export const AREA_MISSES = 3;

/**
 * The concept to ask about next, or null when the check is done: among
 * unsettled concepts in the chosen areas that have questions, the one whose
 * unsettled prerequisites (settled by a right answer) and unsettled dependants
 * (settled by a wrong one) are most evenly balanced, then the one settling most.
 * An area stops being asked about after AREA_MISSES misses with nothing right.
 */
export function nextConcept(
  graph: MasteryGraph,
  available: ReadonlySet<string>,
  answers: readonly PlacementAnswer[],
  areas: readonly AreaId[],
): string | null {
  if (answers.length >= MAX_QUESTIONS) return null;
  const { ancestors, descendants } = relatives(graph);
  const { known, unknown } = settled(graph, answers);
  const asked = new Set(answers.map((a) => a.concept));
  const trackOf = new Map(graph.concepts.map((c) => [c.id, c.track]));
  const beginnerIn = (area: AreaId) => {
    const here = answers.filter((a) => areaOf(trackOf.get(a.concept) ?? '') === area);
    return here.length >= AREA_MISSES && here.every((a) => !a.correct);
  };
  const live = areas.filter((a) => !beginnerIn(a));
  const inScope = new Set(graph.concepts.filter((c) => !c.planned && live.includes(areaOf(c.track))).map((c) => c.id));
  const open = (id: string) => inScope.has(id) && !known.has(id) && !unknown.has(id);
  let best: { id: string; score: [number, number, number] } | null = null;
  for (const c of graph.concepts) {
    if (!open(c.id) || asked.has(c.id) || !available.has(c.id)) continue;
    const up = [...(ancestors.get(c.id) ?? [])].filter(open).length;
    const down = [...(descendants.get(c.id) ?? [])].filter(open).length;
    // Balanced first, then most settled, then shallowest (an easier start).
    const score: [number, number, number] = [Math.min(up, down), up + down, -c.depth];
    if (!best || compare(score, best.score) > 0) best = { id: c.id, score };
  }
  return best?.id ?? null;
}

const compare = (a: readonly number[], b: readonly number[]) => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
};

/** Which of a concept's questions to ask: varies with how far into the check the learner is, so a retake asks others. */
export function pickQuestion<T>(pool: readonly T[], seed: number): T {
  return pool[(seed * 7 + 3) % pool.length];
}
