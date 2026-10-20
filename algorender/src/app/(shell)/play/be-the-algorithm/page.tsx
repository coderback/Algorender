import type { Metadata } from 'next';
import { FiArrowRight } from 'react-icons/fi';
import { PlayHeader } from '@/components/play/PlayHeader';
import { TrackCardLink, trackTitle } from '@/components/ui/Card';
import { getVisualiserBySlug } from '@/data/visualisers';
import { ALGORITHMS } from '@/play/be-the-algorithm/algorithms';
import { SUPPORTED } from '@/play/be-the-algorithm/moves';

export const metadata: Metadata = {
  title: 'Be the algorithm | Algorender',
  description: 'Make each swap a sorting algorithm makes, on a fresh random input every round. Any move it wouldn’t make is shown.',
};

const COLOURS = ['peach', 'butter', 'sky', 'mint'] as const;

export default function BeTheAlgorithmPage() {
  return (
    <main className="flex flex-col gap-[22px] px-4 pb-6 md:px-0 md:pt-2">
      <PlayHeader
        active="/play/be-the-algorithm"
        title="Be the algorithm"
        intro="You are the sort. Pick the two values it swaps next, or say it is done. Every round has new values, so the only way to win is to follow the rule, not to remember the answer."
      />
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {SUPPORTED.map((slug, i) => (
          <li key={slug} className="flex">
            <TrackCardLink track={COLOURS[i]} href={`/play/be-the-algorithm/${slug}`} className="min-h-[180px] w-full gap-3">
              <strong className={`font-display text-title-card ${trackTitle(COLOURS[i])}`}>{getVisualiserBySlug(slug)?.name ?? slug}</strong>
              <span className="text-sm">{ALGORITHMS[slug].rule}</span>
              <span className="mt-auto inline-flex items-center gap-1 text-sm font-semibold">
                Play a round <FiArrowRight aria-hidden />
              </span>
            </TrackCardLink>
          </li>
        ))}
      </ul>
    </main>
  );
}
