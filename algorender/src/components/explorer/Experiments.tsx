'use client';

import { FiArrowRight } from 'react-icons/fi';
import { ButtonLink } from '@/components/ui/Button';
import { cx } from '@/components/ui/cx';
import { TRACK_CLASSES, type TrackColour } from '@/data/tracks';

/**
 * "Try it out next": each experiment starts the visualiser from a named
 * example and says what to look for, in the page's track colour, with an
 * optional last step (the sorting race).
 */
export function Experiments({
  items,
  suffix,
  colour = 'lilac',
  next,
}: {
  items: readonly { key: string; label: string; prompt: string; onTry: () => void }[];
  /** Appended to each label, e.g. "input" → "Sorted input →". */
  suffix: string;
  colour?: TrackColour;
  next?: { href: string; label: string };
}) {
  if (items.length === 0 && !next) return null;
  const c = TRACK_CLASSES[colour];
  return (
    <section aria-labelledby="try-next" className="flex flex-wrap items-center gap-6 rounded-card bg-surface p-6">
      <div className="flex flex-[1_1_260px] flex-col gap-1.5">
        <h2 id="try-next" className="font-display text-title-card">
          Try it out next
        </h2>
        <p className="text-sm text-ink-muted">{next ? 'Experiments to run, then a race against other sorts.' : 'Experiments to run: each starts from its own input.'}</p>
      </div>
      <ul className="flex flex-[2_1_480px] flex-wrap gap-2.5">
        {items.map((x) => (
          <li key={x.key} className="flex max-w-full min-w-0 flex-[1_1_220px]">
            <button
              type="button"
              onClick={x.onTry}
              className={cx(
                'flex w-full flex-col gap-1 rounded-tile px-[18px] py-3 text-left transition-transform duration-150 ease-standard hover:-translate-y-0.5',
                c.bg,
                c.ink,
              )}
            >
              <span className={cx('text-sm font-semibold', c.title)}>
                {x.label}
                {suffix && ` ${suffix}`} →
              </span>
              <span className="text-[13px] leading-snug">{x.prompt}</span>
            </button>
          </li>
        ))}
        {next && (
          <li className="flex items-center">
            <ButtonLink href={next.href} trailing={<FiArrowRight aria-hidden />}>
              {next.label}
            </ButtonLink>
          </li>
        )}
      </ul>
    </section>
  );
}
