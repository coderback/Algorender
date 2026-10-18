import { loadProblems } from '@/problems/load';
import { PATTERNS } from '@/problems/patterns';
import type { MasteryGraph } from '@/progress/mastery';
import type { PlacementQuestion } from '@/progress/placement';
import { depths, loadConcepts } from './concepts';
import { exercises } from './exercises';
import { lessons } from './lessons';
import { lessonQuizzes } from './lessons/quizzes';

// The concept graph as mastery tracking needs it (src/progress/mastery.ts),
// built on the server and handed to client components as plain data: each
// concept, and which concept each lesson, exercise and problem is evidence about.

let cache: MasteryGraph | null = null;

export function masteryGraph(): MasteryGraph {
  if (cache) return cache;
  const { concepts } = loadConcepts();
  const depth = depths();
  const teaching = (visualiser: string) => concepts.filter((c) => c.visualisers.includes(visualiser)).map((c) => c.id);
  cache = {
    concepts: concepts.map((c) => ({
      id: c.id,
      title: c.title,
      track: c.track,
      prereqs: c.prereqs,
      ...(c.lesson && { lesson: c.lesson }),
      visualisers: c.visualisers,
      planned: c.planned,
      depth: depth.get(c.id) ?? 0,
    })),
    lessons: Object.fromEntries(lessons.map((l) => [l.slug, l.concept])),
    exercises: Object.fromEntries(exercises.map((e) => [e.slug, teaching(e.visualiser)])),
    problems: Object.fromEntries(
      loadProblems().map((p) => [p.slug, [...new Set(p.patterns.map((id) => PATTERNS[id].concept).filter((c): c is string => !!c))]]),
    ),
  };
  return cache;
}

/** Every question the placement check can ask, by concept: the quiz questions of the concept's lesson. */
export function placementQuestions(): Record<string, PlacementQuestion[]> {
  const conceptOf = new Map(lessons.map((l) => [l.slug, l.concept]));
  const out: Record<string, PlacementQuestion[]> = {};
  for (const { lesson, quiz, questions } of lessonQuizzes()) {
    const concept = conceptOf.get(lesson);
    if (!concept) continue;
    questions.forEach((q, question) => (out[concept] ??= []).push({ concept, lesson, quiz, question, q: q.q, choices: q.choices, answer: q.answer, why: q.why }));
  }
  return out;
}
