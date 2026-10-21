'use client';

import { FiCheck } from 'react-icons/fi';
import { TrackCardLink, trackTitle } from '@/components/ui/Card';
import { useProgressSnapshot } from '@/progress/hooks';
import { caseColour } from './format';
import { usePassedDesigns } from './progress';

export type CaseCard = { slug: string; title: string; summary: string; targets: number };

/** The case studies as a row of track cards: number, targets or a pass, title and the brief in a line. */
export function CaseStudies({ cases }: { cases: readonly CaseCard[] }) {
  const passed = usePassedDesigns();
  const { ready } = useProgressSnapshot();
  const count = cases.filter((c) => passed.has(c.slug)).length;
  return (
    <section aria-labelledby="cases" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="cases" className="font-display text-title-section">
          Case studies
        </h2>
        {ready && (
          <p className="text-[13px] text-ink-muted">
            {count} of {cases.length} passed
          </p>
        )}
      </div>
      <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">
        {cases.map((c, i) => {
          const colour = caseColour(i);
          const done = passed.has(c.slug);
          return (
            <li key={c.slug} className="flex">
              <TrackCardLink track={colour} href={`/design/${c.slug}`} dense className="min-h-[220px] w-full gap-3 rounded-tile">
                <span className="flex items-center justify-between gap-2 text-xs font-semibold">
                  <span className="rounded-full bg-surface/70 px-2.5 py-1">Case {i + 1}</span>
                  <span className="inline-flex items-center gap-1">
                    {done ? (
                      <>
                        <FiCheck aria-hidden strokeWidth={3} /> Passed
                      </>
                    ) : (
                      `${c.targets} targets`
                    )}
                  </span>
                </span>
                <strong className={`mt-auto font-display text-[22px] leading-[1.1] font-bold tracking-[-0.01em] ${trackTitle(colour)}`}>{c.title}</strong>
                <span className="text-[13px] leading-normal">{c.summary}</span>
              </TrackCardLink>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** "Passed" on a case's brief, once the learner has passed it. */
export function PassedChip({ slug }: { slug: string }) {
  const passed = usePassedDesigns();
  if (!passed.has(slug)) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-surface/70 px-2.5 py-1 text-xs font-semibold">
      <FiCheck aria-hidden strokeWidth={3} /> Passed
    </span>
  );
}
