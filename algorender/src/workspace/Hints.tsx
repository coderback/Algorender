'use client';

import { useState } from 'react';
import { FiHelpCircle } from 'react-icons/fi';
import { cx } from '@/components/ui/cx';
import { InlineText } from './InlineText';

/**
 * Hints revealed one at a time, so a learner takes only as much help as they
 * need. `card` draws them as one butter card (a page's side column); otherwise
 * each hint is its own butter tile.
 */
export function Hints({ hints, card = false }: { hints: readonly string[]; card?: boolean }) {
  const [shown, setShown] = useState(0);
  if (hints.length === 0) return null;
  const more = shown < hints.length && (
    <button
      type="button"
      onClick={() => setShown((n) => n + 1)}
      className={cx(
        'inline-flex w-fit items-center gap-1.5 text-sm font-semibold',
        card ? 'text-track-butter-title underline underline-offset-2 hover:no-underline' : 'h-9 rounded-full bg-sunken px-3.5 text-ink hover:bg-line-soft',
      )}
    >
      <FiHelpCircle aria-hidden />
      {shown === 0 ? 'Stuck? Show a hint' : `Show hint ${shown + 1}`} ({shown + 1} of {hints.length})
    </button>
  );
  return (
    <div className={cx('flex flex-col gap-3', card && 'rounded-card bg-track-butter p-5 text-track-butter-title')}>
      {card && shown === 0 && <p className="text-sm text-track-butter-ink">Hints come one at a time, so you take only as much help as you need.</p>}
      {shown > 0 && (
        <ol className="flex flex-col gap-2 text-[15px] leading-relaxed">
          {hints.slice(0, shown).map((hint, i) => (
            <li key={i} className={cx('flex flex-col gap-1.5', !card && 'rounded-well bg-track-butter px-4 py-3 text-track-butter-title')}>
              <span className="w-fit rounded-full bg-surface/70 px-2.5 py-0.5 text-xs font-semibold">Hint {i + 1}</span>
              <span>
                <InlineText text={hint} />
              </span>
            </li>
          ))}
        </ol>
      )}
      {more}
    </div>
  );
}
