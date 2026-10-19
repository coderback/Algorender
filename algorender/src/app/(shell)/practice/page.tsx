import type { Metadata } from 'next';
import Link from 'next/link';
import { FiArrowRight } from 'react-icons/fi';
import { loadProblems } from '@/problems/load';
import { Rng } from '@/problems/random';
import { ProblemList, type ProblemRow } from '@/problems/ui/ProblemList';

export const metadata: Metadata = {
  title: 'Practice problems | Algorender',
  description:
    'Interview-style coding problems grouped by pattern. Solve them in Python, JavaScript or TypeScript in your browser, and watch your own code run on any test it fails.',
};

export default function PracticeIndex() {
  const problems = loadProblems();
  const rows: ProblemRow[] = problems.map((p) => ({ slug: p.slug, title: p.title, difficulty: p.difficulty, summary: p.summary, pattern: p.patterns[0] }));
  // The mixed order is fixed, so the page renders the same on the server and in the browser.
  const mixed = new Rng(2026).shuffle(rows.map((r) => r.slug));
  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="mb-1 text-xs font-semibold tracking-wider text-accent-ink uppercase">Practice</div>
      <h1 className="text-3xl font-bold text-ink">Practice problems</h1>
      <p className="mt-2 max-w-3xl text-ink-soft">
        Interview-style problems, grouped by the pattern that cracks them. Solve them in Python, JavaScript or TypeScript,
        right here. When a test fails, watch your own code run on it, step by step.
      </p>
      <Link
        href="/practice/drills"
        className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-accent-line bg-accent-soft px-3.5 py-2 text-sm font-medium text-accent-ink hover:bg-surface"
      >
        Pattern drills: practise spotting which pattern fits <FiArrowRight aria-hidden />
      </Link>
      <div className="mt-6">
        <ProblemList rows={rows} mixed={mixed} />
      </div>
    </main>
  );
}
