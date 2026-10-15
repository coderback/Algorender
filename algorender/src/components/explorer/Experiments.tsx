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
    <section className="rounded-xl border border-gray-100 bg-white p-4 shadow-xs">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
        <FiZap aria-hidden className="text-amber-500" /> Try this
      </h2>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((x) => (
          <li key={x.key}>
            <button
              type="button"
              onClick={x.onTry}
              className="h-full w-full rounded-lg border border-gray-200 p-3 text-left text-sm transition-colors hover:border-blue-300 hover:bg-blue-50"
            >
              <span className="mb-1 block font-medium text-blue-700">
                {x.label}
                {suffix && ` ${suffix}`} →
              </span>
              <span className="text-gray-600">{x.prompt}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
