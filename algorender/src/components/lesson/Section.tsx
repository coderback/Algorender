import type { ReactNode } from 'react';
import { FiAlertTriangle, FiCheckSquare, FiCode, FiEdit3, FiEye, FiFlag, FiHelpCircle, FiKey, FiList, FiPlay, FiSearch, FiTool } from 'react-icons/fi';

// The learning loop every lesson follows (REVAMP_PLAN.md §3.1). Each stage has
// a fixed label and icon, so learners always know what kind of step they're on.
export const STEPS = {
  hook: { label: 'Why it matters', icon: FiFlag },
  parts: { label: 'Key parts', icon: FiList },
  see: { label: 'See it work', icon: FiEye },
  predict: { label: 'Predict', icon: FiHelpCircle },
  do: { label: 'Try it', icon: FiTool },
  // PRIMM (Sentance et al. 2019): read and run code before changing and writing it.
  run: { label: 'Run it', icon: FiPlay },
  investigate: { label: 'Investigate', icon: FiSearch },
  modify: { label: 'Modify', icon: FiEdit3 },
  make: { label: 'Make', icon: FiCode },
  check: { label: 'Check yourself', icon: FiCheckSquare },
  recap: { label: 'Recap', icon: FiKey },
} as const;

export type Step = keyof typeof STEPS;

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** One stage of a lesson, with a heading that says which stage it is. */
export function Section({ step, title, children }: { step: Step; title: string; children: ReactNode }) {
  const { label, icon: Icon } = STEPS[step];
  return (
    <section className="border-t border-line-soft pt-8 first:border-t-0 first:pt-0" id={slug(title)}>
      <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-accent-ink">
        <Icon aria-hidden /> {label}
      </div>
      <h2 className="mb-4 text-2xl font-bold text-ink">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

/** Pre-training: name the parts before the full animation runs (Mayer's pre-training principle). */
export function Terms({ children }: { children: ReactNode }) {
  return <dl className="grid gap-3 sm:grid-cols-2">{children}</dl>;
}

export function Term({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <dt className="mb-1 font-mono text-sm font-semibold text-ink">{name}</dt>
      <dd className="text-sm leading-relaxed text-ink-soft [&>p]:m-0">{children}</dd>
    </div>
  );
}

/** The one idea to keep if you forget everything else. */
export function KeyIdea({ children }: { children: ReactNode }) {
  return (
    <aside className="rounded-xl border-l-4 border-accent bg-accent-soft px-5 py-4 text-ink [&>p]:m-0">
      <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-accent-ink">
        <FiKey aria-hidden /> Key idea
      </div>
      {children}
    </aside>
  );
}

/** A common wrong belief, named and corrected. */
export function Misconception({ title, children }: { title: string; children: ReactNode }) {
  return (
    <aside className="rounded-xl border-l-4 border-warn-line bg-warn-soft px-5 py-4 text-ink [&>p]:m-0">
      <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-warn-ink">
        <FiAlertTriangle aria-hidden /> Common mistake: {title}
      </div>
      {children}
    </aside>
  );
}
