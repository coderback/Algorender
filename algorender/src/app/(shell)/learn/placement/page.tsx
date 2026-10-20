import type { Metadata } from 'next';
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

/** Concepts floating on the intro panel: a picture of ideas building on each other. */
const BUBBLES = [
  { label: 'Big-O', className: 'left-[2%] top-[6%] size-24 bg-surface text-ink' },
  { label: 'Hash tables', className: 'right-[12%] top-0 size-20 bg-track-mint text-track-mint-title' },
  { label: 'Binary search', className: 'left-[36%] top-[30%] size-21 bg-track-peach text-track-peach-title' },
  { label: 'Two pointers', className: 'left-[14%] top-[58%] size-22 bg-track-butter text-track-butter-title' },
  { label: 'Your goal', className: 'left-[52%] top-[60%] size-26 bg-feature text-on-feature' },
];

export default function PlacementPage() {
  return (
    <main className="flex flex-col gap-6 px-4 pb-6 md:px-0 md:pt-2">
      <LearnHeader active="placement" title={false} />
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <TrackCard track="lilac" as="section" aria-labelledby="placement-title" className="gap-6 rounded-[36px] p-7 sm:p-9">
          <h1 id="placement-title" className="text-eyebrow uppercase">
            Placement check
          </h1>
          <div aria-hidden className="relative hidden h-64 sm:block">
            {BUBBLES.map((b) => (
              <span key={b.label} className={cx('absolute flex items-center justify-center rounded-full p-2 text-center text-sm leading-tight font-semibold', b.className)}>
                {b.label}
              </span>
            ))}
          </div>
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
