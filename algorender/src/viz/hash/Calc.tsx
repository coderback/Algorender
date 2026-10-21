'use client';

import { Fragment } from 'react';
import { cx } from '@/components/ui/cx';
import { CAPTION } from '@/viz/parts';

/**
 * The hash computation for the key in hand as a strip of steps (key → hash →
 * mod → bucket), the newest in ink. With nothing in hand it shows the rule
 * instead, so the strip keeps its place and the table below doesn't jump.
 */
export function Calc({ lines, rule }: { lines: readonly string[]; rule: string }) {
  return (
    <div className="flex min-h-[4.25rem] flex-col justify-center gap-1.5 rounded-[18px] bg-surface px-4 py-3 ring-1 ring-line-soft ring-inset">
      <div className={CAPTION}>Hash</div>
      {lines.length === 0 ? (
        <div className="font-mono text-[13px] text-ink-muted">{rule}</div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 font-mono text-[13px]">
          {lines.map((line, i) => (
            <Fragment key={i}>
              {i > 0 && <span className="text-ink-muted">→</span>}
              <span className={cx('rounded-[10px] px-2.5 py-1 break-words', i === lines.length - 1 ? 'bg-primary font-semibold text-on-primary' : 'bg-sunken text-ink')}>{line}</span>
            </Fragment>
          ))}
        </div>
      )}
    </div>
  );
}
