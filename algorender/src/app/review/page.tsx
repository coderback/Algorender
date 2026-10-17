import type { Metadata } from 'next';
import Header from '@/components/Header';
import { ReviewQueue, type CardFace } from '@/components/review/ReviewQueue';
import { lessons } from '@/content/lessons';
import { lessonQuizzes } from '@/content/lessons/quizzes';
import { loadProblems } from '@/problems/load';
import { PATTERNS } from '@/problems/patterns';
import { Markdown } from '@/problems/ui/Markdown';
import { problemCard, quizCard } from '@/progress/review';

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
  const problems: CardFace[] = loadProblems().map((p) => ({
    id: problemCard(p.slug),
    kind: 'problem',
    slug: p.slug,
    title: p.title,
    summary: p.summary,
    pattern: p.patterns.map((id) => PATTERNS[id].title).join(', '),
    why: p.why,
    approach: <Markdown text={p.approach} className="text-sm" />,
    complexity: `Time ${p.complexity.time} · space ${p.complexity.space}`,
  }));
  const titles = new Map(lessons.map((l) => [l.slug, l.title]));
  const quizzes: CardFace[] = lessonQuizzes().flatMap(({ lesson, quiz, questions }) =>
    questions.map((q, i) => ({ id: quizCard(lesson, quiz, i), kind: 'quiz' as const, lesson, lessonTitle: titles.get(lesson) ?? lesson, ...q })),
  );
  return [...problems, ...quizzes];
}

export default function ReviewPage() {
  return (
    <div className="min-h-screen bg-subtle">
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <div className="mb-1 text-xs font-semibold tracking-wider text-accent-ink uppercase">Review</div>
        <h1 className="text-3xl font-bold text-ink">Daily review</h1>
        <p className="mt-2 mb-6 text-ink-soft">
          Problems you solve and quiz questions you answer come back here, just before you’d forget them. A few minutes
          a day keeps them for good. It works offline, too.
        </p>
        <ReviewQueue faces={faces()} />
      </main>
    </div>
  );
}
