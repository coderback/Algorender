import type { ReactNode } from 'react';
import { FiAlertTriangle, FiCheckSquare, FiEye, FiFlag, FiHelpCircle, FiKey, FiList, FiTool } from 'react-icons/fi';

// The learning loop every lesson follows (REVAMP_PLAN.md §3.1). Each stage has
// a fixed label and icon, so learners always know what kind of step they're on.
export const STEPS = {
  hook: { label: 'Why it matters', icon: FiFlag },
  parts: { label: 'Key parts', icon: FiList },
  see: { label: 'See it work', icon: FiEye },
  predict: { label: 'Predict', icon: FiHelpCircle },
  do: { label: 'Try it', icon: FiTool },
  check: { label: 'Check yourself', icon: FiCheckSquare },
  recap: { label: 'Recap', icon: FiKey },
} as const;

export type Step = keyof typeof STEPS;

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** One stage of a lesson, with a heading that says which stage it is. */
export function Section({ step, title, children }: { step: Step; title: string; children: ReactNode }) {
  const { label, icon: Icon } = STEPS[step];
  return (
    <section className="scroll-mt-24 border-t border-gray-100 pt-8 first:border-t-0 first:pt-0" id={slug(title)}>
      <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-700">
        <Icon aria-hidden /> {label}
      </div>
      <h2 className="mb-4 text-2xl font-bold text-gray-900">{title}</h2>
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
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <dt className="mb-1 font-mono text-sm font-semibold text-gray-900">{name}</dt>
      <dd className="text-sm leading-relaxed text-gray-600 [&>p]:m-0">{children}</dd>
    </div>
  );
}

/** The one idea to keep if you forget everything else. */
export function KeyIdea({ children }: { children: ReactNode }) {
  return (
    <aside className="rounded-xl border-l-4 border-blue-600 bg-blue-50 px-5 py-4 text-gray-800 [&>p]:m-0">
      <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-blue-800">
        <FiKey aria-hidden /> Key idea
      </div>
      {children}
    </aside>
  );
}

/** A common wrong belief, named and corrected. */
export function Misconception({ title, children }: { title: string; children: ReactNode }) {
  return (
    <aside className="rounded-xl border-l-4 border-amber-500 bg-amber-50 px-5 py-4 text-gray-800 [&>p]:m-0">
      <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-amber-900">
        <FiAlertTriangle aria-hidden /> Common mistake: {title}
      </div>
      {children}
    </aside>
  );
}
