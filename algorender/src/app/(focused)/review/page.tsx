import type { Metadata } from 'next';
import { ReviewQueue, type CardFace } from '@/components/review/ReviewQueue';
import { loadConcepts } from '@/content/concepts';
import { lessons } from '@/content/lessons';
import { lessonMisconceptions } from '@/content/lessons/assessment';
import { lessonQuizzes } from '@/content/lessons/quizzes';
import { loadProblems } from '@/problems/load';
import { PATTERNS } from '@/problems/patterns';
import { Markdown } from '@/problems/ui/Markdown';
import { misconceptionCard, problemCard, quizCard } from '@/progress/review';

export const metadata: Metadata = {
  title: 'Daily review | Algorender',
  description: 'A few minutes of spaced review a day: the problems you solved and the quiz questions you answered come back just before you would forget them.',
  robots: { index: false },
};

/**
 * Every card there could be, with what each side shows. It ships with the
 * page, so the queue works offline once the page has been visited; which
 * cards the learner has, and when each is due, comes from their events.
 */
function faces(): CardFace[] {
  const { concepts } = loadConcepts();
  const concept = new Map(concepts.map((c) => [c.id, c]));
  const lessonConcept = new Map(lessons.map((l) => [l.slug, concept.get(l.concept)]));
  const problems: CardFace[] = loadProblems().map((p) => {
    const main = PATTERNS[p.patterns[0]];
    return {
      id: problemCard(p.slug),
      kind: 'problem',
      slug: p.slug,
      title: p.title,
      summary: p.summary,
      pattern: p.patterns.map((id) => PATTERNS[id].title).join(', '),
      topic: main.title,
      track: (main.concept && concept.get(main.concept)?.track) || 'patterns',
      difficulty: p.difficulty,
      why: p.why,
      approach: <Markdown text={p.approach} className="text-[15px]" />,
      complexity: `Time ${p.complexity.time} · space ${p.complexity.space}`,
    };
  });
  const titles = new Map(lessons.map((l) => [l.slug, l.title]));
  const topicOf = (lesson: string) => ({ topic: lessonConcept.get(lesson)?.title ?? lesson, track: lessonConcept.get(lesson)?.track ?? 'foundations' });
  const quizzes: CardFace[] = lessonQuizzes().flatMap(({ lesson, quiz, questions }) =>
    questions.map(({ q, choices, answer, why }, i) => ({ id: quizCard(lesson, quiz, i), kind: 'quiz' as const, lesson, lessonTitle: titles.get(lesson) ?? lesson, ...topicOf(lesson), q, choices, answer, why })),
  );
  const mistakes: CardFace[] = lessonMisconceptions()
    .filter((m) => m.probes.length > 0)
    .map((m) => ({
      id: misconceptionCard(m.lesson, m.id),
      kind: 'misconception',
      lesson: m.lesson,
      lessonTitle: titles.get(m.lesson) ?? m.lesson,
      ...topicOf(m.lesson),
      title: m.title,
      correction: <Markdown text={m.correction} className="text-sm" />,
      probes: m.probes.map(({ q, choices, answer, why }) => ({ q, choices, answer, why })),
    }));
  return [...problems, ...quizzes, ...mistakes];
}

export default function ReviewPage() {
  return <ReviewQueue faces={faces()} />;
}
