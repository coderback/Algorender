import type { Metadata } from 'next';
import Header from '@/components/Header';
import { CompareLab } from '@/components/compare/CompareLab';

export const metadata: Metadata = {
  title: 'Sorting race and complexity playground | Algorender',
  description:
    'Race sorting algorithms on the same input, then watch how their work grows with n against the n² and n log n curves.',
};

export default function ComparePage() {
  return (
    <div className="min-h-screen bg-subtle">
      <Header />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-accent-ink">Compare</div>
          <h1 className="text-3xl font-bold text-ink">Sorting race and complexity playground</h1>
          <p className="mt-1 max-w-3xl text-ink-soft">
            Big-O is a claim about how work grows. Here you can test it: race algorithms on the same input, change its shape,
            and see which curve each one follows as n grows.
          </p>
        </div>
        <CompareLab />
      </main>
    </div>
  );
}
