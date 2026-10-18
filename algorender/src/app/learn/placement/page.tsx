import type { Metadata } from 'next';
import Link from 'next/link';
import { FiArrowLeft } from 'react-icons/fi';
import { Placement } from '@/components/learn/Placement';
import { masteryGraph, placementQuestions } from '@/content/mastery';

export const metadata: Metadata = {
  title: 'Placement check | Algorender',
  description: 'A few adaptive questions that find what you already know on the concept map, so you start at the edge of what you know.',
};

export default function PlacementPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <nav aria-label="Breadcrumb" className="mb-4 text-sm">
        <Link href="/learn" className="inline-flex items-center gap-1.5 text-accent-ink hover:underline">
          <FiArrowLeft aria-hidden /> Concept map
        </Link>
      </nav>
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-ink">Placement check</h1>
        <p className="mt-2 text-ink-soft">
          A few questions to find what you already know, so the concept map can mark it and suggest where to start. Questions adapt to your
          answers: a right one moves on to harder ideas, a miss steps back to what it builds on.
        </p>
      </header>
      <Placement graph={masteryGraph()} questions={placementQuestions()} />
    </main>
  );
}
