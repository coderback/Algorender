import type { Metadata } from 'next';
import Link from 'next/link';
import { FiArrowLeft, FiArrowRight } from 'react-icons/fi';
import { getVisualiserBySlug } from '@/data/visualisers';
import { ALGORITHMS } from '@/play/be-the-algorithm/algorithms';
import { SUPPORTED } from '@/play/be-the-algorithm/moves';

export const metadata: Metadata = {
  title: 'Be the algorithm | Algorender',
  description: 'Make each swap a sorting algorithm makes, on a fresh random input every round. Any move it wouldn’t make is shown.',
};

export default function BeTheAlgorithmPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <nav aria-label="Breadcrumb" className="mb-4 text-sm">
        <Link href="/play" className="inline-flex items-center gap-1.5 text-accent-ink hover:underline">
          <FiArrowLeft aria-hidden /> Play
        </Link>
      </nav>
      <header className="mb-6 max-w-3xl">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-accent-ink">Play</div>
        <h1 className="text-3xl font-bold text-ink">Be the algorithm</h1>
        <p className="mt-2 text-ink-soft">
          You are the sort. Pick the two values it swaps next, or say it is done. Every round has new values, so the only way to win is to
          follow the rule, not to remember the answer. A move it wouldn’t make shows you the one it does.
        </p>
      </header>
      <ul className="grid gap-3 sm:grid-cols-2">
        {SUPPORTED.map((slug) => (
          <li key={slug}>
            <Link
              href={`/play/be-the-algorithm/${slug}`}
              className="group flex h-full flex-col rounded-xl border border-line-soft bg-surface p-4 shadow-xs hover:border-accent-line"
            >
              <span className="font-semibold text-ink">{getVisualiserBySlug(slug)?.name ?? slug}</span>
              <span className="mt-1 text-sm text-ink-soft">{ALGORITHMS[slug].rule}</span>
              <span className="mt-auto inline-flex items-center gap-1 pt-3 text-sm font-medium text-accent-ink">
                Play <FiArrowRight aria-hidden className="transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
