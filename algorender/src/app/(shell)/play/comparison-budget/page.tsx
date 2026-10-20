import type { Metadata } from 'next';
import { PlayHeader } from '@/components/play/PlayHeader';
import { ComparisonBudget } from '@/play/comparison-budget/ComparisonBudget';

export const metadata: Metadata = {
  title: 'Comparison budget | Algorender',
  description: 'Sort hidden cards by comparing two at a time. Beat merge sort, and find out why no sort can beat log₂ n! comparisons.',
};

export default function ComparisonBudgetPage() {
  return (
    <main className="flex flex-col gap-[22px] px-4 pb-6 md:px-0 md:pt-2">
      <PlayHeader active="/play/comparison-budget" title="Comparison budget" intro="The cards are face down. Ask which of two is smaller, put them in order, and stay within what any method could promise. Your order only counts if your comparisons prove it." />
      <ComparisonBudget />
    </main>
  );
}
