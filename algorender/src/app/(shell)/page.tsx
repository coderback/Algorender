import type { Metadata } from 'next';
import { FiArrowRight } from 'react-icons/fi';
import { ButtonLink } from '@/components/ui/Button';
import { Card, TrackCardLink, trackTitle } from '@/components/ui/Card';

export const metadata: Metadata = {
  title: 'Algorender: learn algorithms by watching them think',
  description: 'Interactive, step-by-step visualisations of algorithms, data structures, math, machine learning and systems, with lessons, practice problems and spaced review.',
};

// TODO(redesign): Phase 3 builds Today here (continue, review due, this week's
// plan, mastery); Phase 8 shows the landing page to first-time visitors.
export default function TodayPage() {
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-3">
        <h1 className="font-display text-title-page">Today</h1>
        <p className="max-w-2xl text-base text-ink-soft">
          Your personal home is coming next: where you left off, what&apos;s due for review and this week&apos;s plan. Until then, pick a place to start.
        </p>
      </header>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <TrackCardLink href="/learn" track="foundations" className="min-h-40 justify-between">
          <span className="text-eyebrow uppercase">Learn</span>
          <span className={`font-display text-title-card ${trackTitle('foundations')}`}>The concept map and lessons</span>
        </TrackCardLink>
        <TrackCardLink href="/explore" track="searching-sorting" className="min-h-40 justify-between">
          <span className="text-eyebrow uppercase">Explore</span>
          <span className={`font-display text-title-card ${trackTitle('searching-sorting')}`}>Every visualiser</span>
        </TrackCardLink>
        <TrackCardLink href="/practice" track="trees" className="min-h-40 justify-between">
          <span className="text-eyebrow uppercase">Practice</span>
          <span className={`font-display text-title-card ${trackTitle('trees')}`}>Interview problems</span>
        </TrackCardLink>
      </div>
      <Card className="flex-row flex-wrap items-center justify-between gap-4">
        <p className="text-[15px] text-ink-soft">Cards come back for review on the day you&apos;re about to forget them.</p>
        <ButtonLink href="/review" kind="primary" trailing={<FiArrowRight aria-hidden />}>
          Open today&apos;s review
        </ButtonLink>
      </Card>
    </main>
  );
}
