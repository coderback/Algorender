import Link from 'next/link';
import { cx } from './cx';
import type { ComponentProps, ElementType, ReactNode } from 'react';
import { TRACK_CLASSES, trackColour, type TrackColour } from '@/data/tracks';

type CardTag = 'section' | 'div' | 'article' | 'li' | 'aside';

interface CardProps {
  as?: CardTag;
  /** 20px padding instead of 24px. */
  dense?: boolean;
  className?: string;
  children?: ReactNode;
}

const pad = (dense?: boolean) => (dense ? 'p-5' : 'p-6');

/** A top-level card: a white (or dark-surface) panel on the paper. No border, no shadow. */
export function Card({ as = 'section', dense, className, children, ...rest }: CardProps & Omit<ComponentProps<'section'>, 'ref'>) {
  const Tag = as as ElementType;
  return (
    <Tag className={cx('flex flex-col gap-3.5 rounded-card bg-surface', pad(dense), className)} {...rest}>
      {children}
    </Tag>
  );
}

interface TrackProps extends CardProps {
  /** A concept-map track id (e.g. 'searching-sorting') or a colour key. */
  track: string;
}

function colourOf(track: string): TrackColour {
  return track in TRACK_CLASSES ? (track as TrackColour) : trackColour(track);
}

/** The track's pastel classes: fill and body ink. Titles inside use trackTitle(). */
export function trackSurface(track: string) {
  const c = TRACK_CLASSES[colourOf(track)];
  return cx(c.bg, c.ink);
}

export function trackTitle(track: string) {
  return TRACK_CLASSES[colourOf(track)].title;
}

/** A card in a track's pastel. Titles inside should use trackTitle(track). */
export function TrackCard({ track, as = 'section', dense, className, children, ...rest }: TrackProps & Omit<ComponentProps<'section'>, 'ref'>) {
  const Tag = as as ElementType;
  return (
    <Tag className={cx('flex flex-col gap-3.5 rounded-card', trackSurface(track), pad(dense), className)} {...rest}>
      {children}
    </Tag>
  );
}

/** A whole track card as one link (Explore tiles, "You're ready for", case studies). */
export function TrackCardLink({ track, dense, className, children, ...rest }: Omit<TrackProps, 'as'> & ComponentProps<typeof Link>) {
  return (
    <Link
      className={cx(
        'flex flex-col gap-3.5 rounded-card transition-transform duration-150 ease-standard hover:-translate-y-0.5',
        trackSurface(track),
        pad(dense),
        className,
      )}
      {...rest}
    >
      {children}
    </Link>
  );
}

/** The dark feature card: one emphasis per area. Secondary text uses text-feature-muted. */
export function FeatureCard({ as = 'section', dense, className, children, ...rest }: CardProps & Omit<ComponentProps<'section'>, 'ref'>) {
  const Tag = as as ElementType;
  return (
    <Tag className={cx('flex flex-col gap-3.5 rounded-card bg-feature text-on-feature', pad(dense), className)} {...rest}>
      {children}
    </Tag>
  );
}
