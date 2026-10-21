import type { Metadata } from 'next';
import { PracticeHeader } from '@/components/practice/PracticeHeader';
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
    <main className="flex flex-col gap-[22px] px-4 pb-6 md:px-0 md:pt-2">
      <PracticeHeader
        active="drills"
        title="Pattern drills"
        intro="Read a problem and name the pattern before you write any code. The patterns are mixed, so the clue has to come from the problem itself."
      />
      <Drill questions={questions} />
    </main>
  );
}
