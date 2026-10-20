import { cx } from '@/components/ui/cx';
import type { TrackColour } from '@/data/tracks';
import { GLYPH_HEIGHTS, type Glyph } from './tiles';

// Written out in full so Tailwind sees every class: the track's mid-tone for
// the two marked bars, a wash of it for the rest.
const BAR: Record<TrackColour, { on: string; off: string }> = {
  lilac: { on: 'bg-track-lilac-bar', off: 'bg-track-lilac-bar/45' },
  peach: { on: 'bg-track-peach-bar', off: 'bg-track-peach-bar/45' },
  mint: { on: 'bg-track-mint-bar', off: 'bg-track-mint-bar/45' },
  sky: { on: 'bg-track-sky-bar', off: 'bg-track-sky-bar/45' },
  butter: { on: 'bg-track-butter-bar', off: 'bg-track-butter-bar/45' },
  rose: { on: 'bg-track-rose-bar', off: 'bg-track-rose-bar/45' },
  teal: { on: 'bg-track-teal-bar', off: 'bg-track-teal-bar/45' },
};

/** A tile's decorative picture: seven bars shaped like the view, two of them marked. */
export function TileGlyph({ glyph, colour, className }: { glyph: Glyph; colour: TrackColour; className?: string }) {
  const grid = glyph === 'grid';
  return (
    <span aria-hidden className={cx('flex h-16 items-end gap-[5px]', className)}>
      {GLYPH_HEIGHTS[glyph].map((h, i) => (
        <span
          key={i}
          className={cx('max-w-[18px] flex-1', grid ? 'rounded-md' : 'rounded-t-[5px] rounded-b-[3px]', !grid && (i === 2 || i === 3) ? BAR[colour].on : BAR[colour].off)}
          style={{ height: `${h}%` }}
        />
      ))}
    </span>
  );
}
