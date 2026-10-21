import type { Metadata } from 'next';
import { PlayHeader } from '@/components/play/PlayHeader';
import { BreakIt } from '@/play/break-it/BreakIt';

export const metadata: Metadata = {
  title: 'Break it | Algorender',
  description: 'Craft the input that hurts: quicksort’s worst case, a counterexample to greedy coin change, and a flood of colliding hash keys.',
};

export default function BreakItPage() {
  return (
    <main className="flex flex-col gap-[22px] px-4 pb-6 md:px-0 md:pt-2">
      <PlayHeader active="/play/break-it" title="Break it" intro="Every algorithm has inputs it hates. Find them: knowing what breaks an algorithm is how you learn what it relies on." />
      <BreakIt />
    </main>
  );
}
