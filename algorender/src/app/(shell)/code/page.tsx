import type { Metadata } from 'next';
import Link from 'next/link';
import { PracticeHeader } from '@/components/practice/PracticeHeader';
import { TrackCardLink, trackTitle } from '@/components/ui/Card';
import { cx } from '@/components/ui/cx';
import { exercises } from '@/content/exercises';
import { masteryGraph } from '@/content/mastery';
import { getVisualiserBySlug } from '@/data/visualisers';
import { trackColour } from '@/data/tracks';
import { stagesFor } from '@/workspace/ladder';

export const metadata: Metadata = {
  title: 'Code it yourself | Algorender',
  description:
    'Write the classic algorithms in Python, JavaScript or TypeScript, right in your browser, and watch your own code drive the visualiser step by step.',
};

const GROUPS = [
  { kind: 'write', title: 'Write it', blurb: 'Order the lines, fill the gaps, then write it whole' },
  { kind: 'modify', title: 'Change it', blurb: 'Start from working code and make it do something new' },
  { kind: 'bug', title: 'Find the bug', blurb: 'Run it, watch where it goes wrong, fix it' },
] as const;

export default function CodeIndex() {
  const graph = masteryGraph();
  // An exercise takes the colour of the concept its visualiser teaches.
  const colourOf = (visualiser: string) => trackColour(graph.concepts.find((c) => !c.planned && c.visualisers.includes(visualiser))?.track ?? '');
  return (
    <main className="flex flex-col gap-[22px] px-4 pb-6 md:px-0 md:pt-2">
      <PracticeHeader
        active="code"
        intro="Write the classics yourself in Python, JavaScript or TypeScript. Your code runs in your browser and drives the same visualiser as the built-in version, next to your own lines."
      />
      {GROUPS.map((g) => {
        const items = exercises.filter((e) => e.kind === g.kind);
        if (items.length === 0) return null;
        return (
          <section key={g.kind} aria-labelledby={`group-${g.kind}`} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 id={`group-${g.kind}`} className="font-display text-title-section">
                {g.title}
              </h2>
              <p className="text-sm text-ink-muted">{g.blurb}</p>
            </div>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(240px,1fr))]">
              {items.map((e) => {
                const stages = stagesFor(e).length;
                const category = getVisualiserBySlug(e.visualiser)?.category ?? 'Code';
                const eyebrow = `${category} · ${stages === 1 ? '1 stage' : `${stages} stages`}`;
                const inner = (title: string, bug: boolean) => (
                  <>
                    <span className={cx('text-xs font-semibold', bug && 'text-bad-ink')}>{bug ? 'Bug hunt' : eyebrow}</span>
                    <strong className={cx('font-display text-xl leading-tight font-bold', title)}>{e.title}</strong>
                    <span className={cx('mt-auto text-[13px] leading-normal', bug && 'text-ink-muted')}>{e.summary}</span>
                  </>
                );
                return (
                  <li key={e.slug} className="flex">
                    {e.kind === 'bug' ? (
                      <Link href={`/code/${e.slug}`} className="flex min-h-[150px] w-full flex-col gap-3 rounded-tile bg-surface p-[18px] text-ink transition-transform duration-150 ease-standard hover:-translate-y-0.5">
                        {inner('text-ink', true)}
                      </Link>
                    ) : (
                      <TrackCardLink track={colourOf(e.visualiser)} href={`/code/${e.slug}`} dense className="min-h-[150px] w-full gap-3 rounded-tile p-[18px]">
                        {inner(trackTitle(colourOf(e.visualiser)), false)}
                      </TrackCardLink>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </main>
  );
}
