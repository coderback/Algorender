import type { Metadata } from 'next';
import Link from 'next/link';
import { FiArrowLeft } from 'react-icons/fi';
import { ComparisonBudget } from '@/play/comparison-budget/ComparisonBudget';

export const metadata: Metadata = {
  title: 'Comparison budget | Algorender',
  description: 'Sort hidden cards by comparing two at a time. Beat merge sort, and find out why no sort can beat log₂ n! comparisons.',
};

export default function ComparisonBudgetPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <nav aria-label="Breadcrumb" className="mb-4 text-sm">
        <Link href="/play" className="inline-flex items-center gap-1.5 text-accent-ink hover:underline">
          <FiArrowLeft aria-hidden /> Play
        </Link>
      </nav>
      <header className="mb-6 max-w-3xl">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-accent-ink">Play</div>
        <h1 className="text-3xl font-bold text-ink">Comparison budget</h1>
        <p className="mt-2 text-ink-soft">
          Each card hides a number. Compare two cards to learn which is smaller, then put them in order, smallest first. Your order only counts
          if your comparisons prove it, and you win by using no more comparisons than merge sort would need. Watch how fast the orders still
          possible shrink.
        </p>
      </header>
      <ComparisonBudget />
    </main>
  );
}
