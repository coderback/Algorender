'use client';

import { FiZap } from 'react-icons/fi';

/** "Try this" prompts: each starts the visualiser from a named example and says what to look for. */
export function Experiments({
  items,
  suffix,
}: {
  items: readonly { key: string; label: string; prompt: string; onTry: () => void }[];
  /** Appended to each label, e.g. "input" → "Sorted input →". */
  suffix: string;
}) {
  if (items.length === 0) return null;
  return (
    <section className="rounded-xl border border-line-soft bg-surface p-4 shadow-xs">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
        <FiZap aria-hidden className="text-warn-ink" /> Try this
      </h2>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((x) => (
          <li key={x.key}>
            <button
              type="button"
              onClick={x.onTry}
              className="h-full w-full rounded-lg border border-line p-3 text-left text-sm transition-colors hover:border-accent-line hover:bg-accent-soft"
            >
              <span className="mb-1 block font-medium text-accent-ink">
                {x.label}
                {suffix && ` ${suffix}`} →
              </span>
              <span className="text-ink-soft">{x.prompt}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
