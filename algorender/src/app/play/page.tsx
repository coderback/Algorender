import type { Metadata } from 'next';
import Header from '@/components/Header';
import { PlayHub } from '@/components/play/PlayHub';
import { masteryGraph } from '@/content/mastery';

export const metadata: Metadata = {
  title: 'Play | Algorender',
  description: 'Be the algorithm, sort on a comparison budget, and break algorithms with crafted inputs. XP and badges reward learning that sticks, never time spent.',
};

export default function PlayPage() {
  return (
    <div className="min-h-screen bg-subtle">
      <Header />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <header className="mb-6 max-w-3xl">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-accent-ink">Play</div>
          <h1 className="text-3xl font-bold text-ink">Play</h1>
          <p className="mt-2 text-ink-soft">
            Games where the learning is the game: make the moves yourself, find the limits, break things on purpose. XP counts what you can do
            and remember, not how long you spent.
          </p>
        </header>
        <PlayHub graph={masteryGraph()} />
      </main>
    </div>
  );
}
