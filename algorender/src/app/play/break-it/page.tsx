import type { Metadata } from 'next';
import Link from 'next/link';
import { FiArrowLeft } from 'react-icons/fi';
import Header from '@/components/Header';
import { BreakIt } from '@/play/break-it/BreakIt';

export const metadata: Metadata = {
  title: 'Break it | Algorender',
  description: 'Craft the input that hurts: quicksort’s worst case, a counterexample to greedy coin change, and a flood of colliding hash keys.',
};

export default function BreakItPage() {
  return (
    <div className="min-h-screen bg-subtle">
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <nav aria-label="Breadcrumb" className="mb-4 text-sm">
          <Link href="/play" className="inline-flex items-center gap-1.5 text-accent-ink hover:underline">
            <FiArrowLeft aria-hidden /> Play
          </Link>
        </nav>
        <header className="mb-6">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-accent-ink">Play</div>
          <h1 className="text-3xl font-bold text-ink">Break it</h1>
          <p className="mt-2 text-ink-soft">
            Every algorithm has inputs it hates. Find them: knowing what breaks an algorithm is how you learn what it relies on.
          </p>
        </header>
        <BreakIt />
      </main>
    </div>
  );
}
