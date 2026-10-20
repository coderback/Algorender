import type { Metadata } from 'next';
import { ConceptBubbles } from '@/components/learn/ConceptBubbles';
import { LearnHeader } from '@/components/learn/LearnHeader';
import { Placement } from '@/components/learn/Placement';
import { TrackCard, trackTitle } from '@/components/ui/Card';
import { cx } from '@/components/ui/cx';
import { masteryGraph, placementQuestions } from '@/content/mastery';
import { MAX_QUESTIONS } from '@/progress/placement';

export const metadata: Metadata = {
  title: 'Placement check | Algorender',
  description: 'A few adaptive questions that find what you already know on the concept map, so you start at the edge of what you know.',
};

export default function PlacementPage() {
  return (
    <main className="flex flex-col gap-6 px-4 pb-6 md:px-0 md:pt-2">
      <LearnHeader active="placement" title={false} />
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <TrackCard track="lilac" as="section" aria-labelledby="placement-title" className="gap-6 rounded-[36px] p-7 sm:p-9">
          <h1 id="placement-title" className="text-eyebrow uppercase">
            Placement check
          </h1>
          <ConceptBubbles className="hidden sm:block" />
          <p className={cx('font-display text-[clamp(28px,3vw,40px)] leading-[1.05] font-bold tracking-[-0.025em]', trackTitle('lilac'))}>Every idea builds on others. We’ll find where you start.</p>
          <p className="text-[15px] leading-relaxed">
            Up to {MAX_QUESTIONS} questions. Get one right and the check skips what it builds on; a miss steps back to what it needs. Nothing counts against you.
          </p>
        </TrackCard>
        <Placement graph={masteryGraph()} questions={placementQuestions()} />
      </div>
    </main>
  );
}
