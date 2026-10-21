import { cx } from './cx';
import type { ReactNode } from 'react';
import { TRACK_CLASSES, type TrackColour } from '@/data/tracks';

/**
 * A count in a small tile: Comparisons / Swaps, Easy / Medium / Hard. On a
 * track colour the number takes the track's title ink; otherwise the tile is
 * a well.
 */
export function CountTile({ value, label, track, className }: { value: ReactNode; label: ReactNode; track?: TrackColour; className?: string }) {
  const c = track && TRACK_CLASSES[track];
  return (
    <div className={cx('flex flex-col gap-1 rounded-well p-3', c ? cx(c.bg, c.ink) : 'bg-sunken text-ink-muted', className)}>
      <span className={cx('font-display text-number-tile tabular-nums', c ? c.title : 'text-ink')}>{value}</span>
      <span className="text-xs font-medium">{label}</span>
    </div>
  );
}

/** A big number with an optional unit after it: "12 cards", "1,240 XP". */
export function BigNumber({ value, unit, className }: { value: ReactNode; unit?: ReactNode; className?: string }) {
  return (
    <p className={cx('flex items-baseline gap-2', className)}>
      <span className="font-display text-number-big tabular-nums">{value}</span>
      {unit && <span className="text-[15px] font-semibold">{unit}</span>}
    </p>
  );
}

/** A thin progress bar. The label is its accessible name. */
export function ProgressBar({ value, max = 1, label, className, fill = 'bg-accent', track = 'bg-accent-soft' }: { value: number; max?: number; label: string; className?: string; fill?: string; track?: string }) {
  const share = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className={cx('h-2 overflow-hidden rounded-full', track, className)}
    >
      <div className={cx('h-full rounded-full', fill)} style={{ width: `${share * 100}%` }} />
    </div>
  );
}
