'use client';

import { useState } from 'react';
import { FiHelpCircle } from 'react-icons/fi';
import { InlineText } from './InlineText';

/** Hints revealed one at a time, so a learner takes only as much help as they need. */
export function Hints({ hints }: { hints: readonly string[] }) {
  const [shown, setShown] = useState(0);
  if (hints.length === 0) return null;
  return (
    <div className="space-y-2">
      {shown > 0 && (
        <ol className="space-y-2 text-sm text-ink-soft">
          {hints.slice(0, shown).map((hint, i) => (
            <li key={i} className="rounded-lg border border-line-soft bg-subtle px-3 py-2">
              <span className="mr-1 font-semibold text-ink">Hint {i + 1}.</span>
              <InlineText text={hint} />
            </li>
          ))}
        </ol>
      )}
      {shown < hints.length && (
        <button
          type="button"
          onClick={() => setShown((n) => n + 1)}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-accent-ink hover:bg-accent-soft"
        >
          <FiHelpCircle aria-hidden />
          {shown === 0 ? 'Stuck? Show a hint' : 'Show another hint'} ({shown + 1} of {hints.length})
        </button>
      )}
    </div>
  );
}
