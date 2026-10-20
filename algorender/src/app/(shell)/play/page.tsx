import type { Metadata } from 'next';
import { PlayHeader } from '@/components/play/PlayHeader';
import { PlayHub } from '@/components/play/PlayHub';
import { masteryGraph } from '@/content/mastery';

export const metadata: Metadata = {
  title: 'Play | Algorender',
  description: 'Be the algorithm, sort on a comparison budget, and break algorithms with crafted inputs. XP and badges reward learning that sticks, never time spent.',
};

export default function PlayPage() {
  return (
    <main className="flex flex-col gap-[22px] px-4 pb-6 md:px-0 md:pt-2">
      <PlayHeader active="/play" intro="Three games that check you can do it, not that you watched it." />
      <PlayHub graph={masteryGraph()} />
    </main>
  );
}
