'use client';

import Link from 'next/link';
import { FiFlag } from 'react-icons/fi';
import { mistakeAnchor } from '@/components/lesson/anchors';
import { TrackCard } from '@/components/ui/Card';
import { useMistakes, useProgressSnapshot } from '@/progress/hooks';
import type { MasteryConcept } from '@/progress/mastery';
import { CLEAR_AFTER } from '@/progress/misconceptions';

// Mastery on the concept map, from the learner's own events. Everything waits
// for the progress store, so the server and first client render show none of it.

/** Where a concept is learned: its lesson, else its first visualiser, else its node on the path. */
export function conceptHref(c: MasteryConcept): string {
  return c.lesson ? `/learn/${c.lesson}` : c.visualisers[0] ? `/visualisers/${c.visualisers[0]}` : `/learn#${c.id}`;
}

/**
 * Common mistakes the learner has made and not yet cleared, each linked to
 * the lesson's correction. `titles` names each mistake card (built on the server).
 */
export function MistakesToClear({ titles }: { titles: Record<string, { title: string; lessonTitle: string }> }) {
  const { ready } = useProgressSnapshot();
  const all = useMistakes();
  if (!ready) return null;
  const open = [...all.entries()].filter(([card, m]) => m.status !== 'cleared' && titles[card]);
  if (open.length === 0) return null;
  return (
    <TrackCard track="peach" aria-labelledby="mistakes" className="gap-3 rounded-[28px] p-5 lg:col-start-2">
      <h2 id="mistakes" className="flex items-center gap-2 text-[15px] font-semibold">
        <FiFlag aria-hidden className="size-[18px]" /> Mistakes to clear
      </h2>
      <p className="text-xs">
        Each comes back in your{' '}
        <Link href="/review" className="font-semibold underline underline-offset-2">
          daily review
        </Link>{' '}
        until you’ve answered it right {CLEAR_AFTER} times in a row; until then, its concept can’t be mastered.
      </p>
      <ul className="flex flex-col gap-2">
        {open.map(([card, m]) => (
          <li key={card}>
            <Link href={`/learn/${m.lesson}#${mistakeAnchor(m.id)}`} className="flex flex-col gap-0.5 rounded-[18px] bg-surface px-3.5 py-3 text-ink hover:ring-1 hover:ring-line-strong hover:ring-inset">
              <span className="text-[15px] font-semibold">{titles[card].title}</span>
              <span className="text-xs text-ink-muted">
                {titles[card].lessonTitle} · {m.status === 'clearing' ? `right ${m.right} of ${CLEAR_AFTER} times so far` : 'not answered right since'}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </TrackCard>
  );
}
