'use client';

import type { ReactNode } from 'react';
import { FiAlertTriangle, FiTarget } from 'react-icons/fi';
import { mistakeAnchor } from './anchors';
import { useSectionIndex } from './LessonChrome';
import { MistakeNote } from './MistakeNote';
import { sectionId, STEPS, type Step } from './steps';

export { STEPS, type Step };

/** One stage of a lesson: a numbered eyebrow that says which stage it is, then its heading. */
export function Section({ step, title, children }: { step: Step; title: string; children: ReactNode }) {
  const id = sectionId(title);
  const i = useSectionIndex(id);
  return (
    <section id={id} className="flex scroll-mt-24 flex-col gap-4">
      <p className="flex items-center gap-1.5 font-mono text-xs font-medium text-accent-ink">
        {i >= 0 && <span>{String(i + 1).padStart(2, '0')}</span>}
        {i >= 0 && <span aria-hidden>·</span>}
        <span>{STEPS[step].label}</span>
      </p>
      <h2 className="-mt-2 font-display text-[28px] leading-tight font-bold tracking-[-0.02em]">{title}</h2>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

/** Pre-training: name the parts before the full animation runs (Mayer's pre-training principle). */
export function Terms({ children }: { children: ReactNode }) {
  return <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</dl>;
}

export function Term({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-[20px] bg-surface p-4">
      <dt className="font-mono text-sm font-semibold text-ink">{name}</dt>
      <dd className="text-[13px] leading-relaxed text-ink-soft [&>p]:m-0 [&>p]:text-[13px]">{children}</dd>
    </div>
  );
}

/** The one idea to keep if you forget everything else. */
export function KeyIdea({ children }: { children: ReactNode }) {
  return (
    <aside className="flex gap-4 rounded-[28px] bg-feature p-5 text-on-feature sm:p-6 [&_p]:m-0 [&_p]:text-[15px] [&_p]:leading-relaxed [&_p]:text-on-feature [&_strong]:text-on-feature [&_a]:text-feature-accent [&_a]:decoration-feature-accent">
      <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-badge text-on-badge">
        <FiTarget className="size-5" />
      </span>
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="text-eyebrow text-badge uppercase">Key idea</span>
        {children}
      </div>
    </aside>
  );
}

/**
 * A common wrong belief, named and corrected. `probes` are questions that
 * test for it later, in the review queue, once a quiz answer shows the
 * learner holds it (src/content/lessons/assessment.ts); they aren't shown here.
 */
export function Misconception({ id, title, children }: { id: string; title: string; probes?: unknown; children: ReactNode }) {
  return (
    <aside id={mistakeAnchor(id)} className="flex scroll-mt-24 flex-col gap-2 rounded-[22px] bg-warn-soft px-5 py-4 text-warn-title [&_code]:bg-surface/70 [&_p]:m-0 [&_p]:text-sm [&_p]:text-warn-title [&_strong]:text-warn-title">
      <p className="flex items-start gap-2 text-sm font-semibold">
        <FiAlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-warn-ink" /> <span>Common mistake: {title}</span>
      </p>
      {children}
      <MistakeNote id={id} />
    </aside>
  );
}
