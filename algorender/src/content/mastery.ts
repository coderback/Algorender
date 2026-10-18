import { loadProblems } from '@/problems/load';
import { PATTERNS } from '@/problems/patterns';
import { getVisualiserBySlug } from '@/data/visualisers';
import type { MasteryGraph } from '@/progress/mastery';
import type { PlacementQuestion } from '@/progress/placement';
import { effort } from '@/progress/plan';
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

/** What a concept offers a study plan: where to learn it, what to practise, and roughly how long it takes. */
export type ConceptCatalogEntry = {
  minutes: number;
  lesson?: { slug: string; title: string; minutes: number };
  visualisers: { slug: string; name: string }[];
  problems: { slug: string; title: string; difficulty: 'easy' | 'medium' | 'hard' }[];
  exercises: { slug: string; title: string }[];
  /** Other pages that teach it (the concept's `links` in concepts.yaml). */
  links: { href: string; label: string }[];
};

const DIFFICULTY = { easy: 0, medium: 1, hard: 2 } as const;

/** Every concept's catalog entry, by id. */
export function planCatalog(): Record<string, ConceptCatalogEntry> {
  const graph = masteryGraph();
  const problems = loadProblems();
  const linksOf = new Map(loadConcepts().concepts.map((c) => [c.id, c.links]));
  const out: Record<string, ConceptCatalogEntry> = {};
  for (const c of graph.concepts) {
    const lesson = c.lesson ? lessons.find((l) => l.slug === c.lesson) : undefined;
    const mine = problems
      .filter((p) => graph.problems[p.slug]?.includes(c.id))
      .sort((a, b) => DIFFICULTY[a.difficulty] - DIFFICULTY[b.difficulty] || a.title.localeCompare(b.title))
      .map((p) => ({ slug: p.slug, title: p.title, difficulty: p.difficulty }));
    const ex = exercises.filter((e) => graph.exercises[e.slug]?.includes(c.id)).map((e) => ({ slug: e.slug, title: e.title }));
    out[c.id] = {
      minutes: effort({ lessonMinutes: lesson?.minutes, visualisers: c.visualisers.length, problems: mine.length, exercises: ex.length }),
      ...(lesson && { lesson: { slug: lesson.slug, title: lesson.title, minutes: lesson.minutes } }),
      visualisers: c.visualisers.map((slug) => ({ slug, name: getVisualiserBySlug(slug)?.name ?? slug })),
      problems: mine,
      exercises: ex,
      links: linksOf.get(c.id) ?? [],
    };
  }
  return out;
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
