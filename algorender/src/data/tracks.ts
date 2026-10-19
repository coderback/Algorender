/**
 * Track colours: every area of the concept map (src/content/concepts.yaml) has
 * one pastel, used for its cards, chips, path nodes and Explore tiles. Learn,
 * Explore, Today and Play all read this table, so a colour means one place
 * everywhere. The values are theme tokens in globals.css.
 */

export type TrackColour = 'lilac' | 'peach' | 'mint' | 'sky' | 'butter' | 'rose' | 'teal';

/** Concept-map track ids, in the map's order, with their colour. */
export const TRACK_COLOURS = {
  foundations: 'lilac',
  linear: 'lilac',
  'searching-sorting': 'peach',
  hashing: 'mint',
  trees: 'mint',
  patterns: 'butter',
  graphs: 'sky',
  design: 'butter',
  strings: 'sky',
  math: 'rose',
  ml: 'rose',
  systems: 'teal',
} as const satisfies Record<string, TrackColour>;

export type TrackId = keyof typeof TRACK_COLOURS;

export interface TrackClasses {
  /** The pastel fill. */
  bg: string;
  /** Body text on the fill. */
  ink: string;
  /** Display text (titles, big numbers) on the fill. */
  title: string;
  /** The track colour as a dot, bar or node on a neutral surface. */
  fill: string;
}

// Written out in full so Tailwind sees every class.
export const TRACK_CLASSES: Record<TrackColour, TrackClasses> = {
  lilac: { bg: 'bg-track-lilac', ink: 'text-track-lilac-ink', title: 'text-track-lilac-title', fill: 'bg-track-lilac-ink' },
  peach: { bg: 'bg-track-peach', ink: 'text-track-peach-ink', title: 'text-track-peach-title', fill: 'bg-track-peach-ink' },
  mint: { bg: 'bg-track-mint', ink: 'text-track-mint-ink', title: 'text-track-mint-title', fill: 'bg-track-mint-ink' },
  sky: { bg: 'bg-track-sky', ink: 'text-track-sky-ink', title: 'text-track-sky-title', fill: 'bg-track-sky-ink' },
  butter: { bg: 'bg-track-butter', ink: 'text-track-butter-ink', title: 'text-track-butter-title', fill: 'bg-track-butter-ink' },
  rose: { bg: 'bg-track-rose', ink: 'text-track-rose-ink', title: 'text-track-rose-title', fill: 'bg-track-rose-ink' },
  teal: { bg: 'bg-track-teal', ink: 'text-track-teal-ink', title: 'text-track-teal-title', fill: 'bg-track-teal-ink' },
};

/** A track's colour; unknown ids fall back to lilac. */
export function trackColour(track: string): TrackColour {
  return (TRACK_COLOURS as Record<string, TrackColour>)[track] ?? 'lilac';
}

export function trackClasses(track: string): TrackClasses {
  return TRACK_CLASSES[trackColour(track)];
}
