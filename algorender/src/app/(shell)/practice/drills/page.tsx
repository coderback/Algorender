import type { Metadata } from 'next';
import Link from 'next/link';
import { FiArrowLeft } from 'react-icons/fi';
import { loadProblems } from '@/problems/load';
import { Drill, type DrillQuestion } from '@/problems/ui/Drill';
import { Markdown } from '@/problems/ui/Markdown';

export const metadata: Metadata = {
  title: 'Pattern drills | Practice | Algorender',
  description: 'Read a coding problem, name the pattern that cracks it, and see why: quick, mixed rounds that train the step most practice skips.',
};

export default function DrillsPage() {
  const questions: DrillQuestion[] = loadProblems().map((p) => ({
    slug: p.slug,
    title: p.title,
    statement: <Markdown text={p.statement} />,
    answer: p.patterns[0],
    also: p.patterns.slice(1),
    why: p.why,
  }));
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <Link href="/practice" className="mb-4 inline-flex items-center gap-1.5 text-sm text-accent-ink hover:underline">
        <FiArrowLeft aria-hidden /> All problems
      </Link>
      <div className="mb-1 text-xs font-semibold tracking-wider text-accent-ink uppercase">Practice</div>
      <h1 className="text-3xl font-bold text-ink">Pattern drills</h1>
      <p className="mt-2 mb-6 text-ink-soft">
        Most of a problem is spotting what kind of problem it is. Read each one, pick the pattern that cracks it, and
        see why. The patterns are mixed, so the clue has to come from the problem itself.
      </p>
      <Drill questions={questions} />
    </main>
  );
}
