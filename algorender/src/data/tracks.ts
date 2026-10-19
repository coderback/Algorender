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

/** Short track names for chips on track cards ("Patterns", not "Problem-solving patterns"). */
export const TRACK_LABEL: Record<TrackId, string> = {
  foundations: 'Foundations',
  linear: 'Arrays & lists',
  'searching-sorting': 'Searching & sorting',
  hashing: 'Hashing',
  trees: 'Trees & heaps',
  patterns: 'Patterns',
  graphs: 'Graphs',
  design: 'Algorithm design',
  strings: 'Strings',
  math: 'Math',
  ml: 'Machine learning',
  systems: 'Systems',
};

export const trackLabel = (track: string): string => (TRACK_LABEL as Record<string, string>)[track] ?? track;

export interface TrackClasses {
  /** The pastel fill. */
  bg: string;
  /** Body text on the fill. */
  ink: string;
  /** Display text (titles, big numbers) on the fill. */
  title: string;
  /** The track's mid-tone, for a bar or dot on a neutral or pastel surface. */
  fill: string;
}

// Written out in full so Tailwind sees every class.
export const TRACK_CLASSES: Record<TrackColour, TrackClasses> = {
  lilac: { bg: 'bg-track-lilac', ink: 'text-track-lilac-ink', title: 'text-track-lilac-title', fill: 'bg-track-lilac-bar' },
  peach: { bg: 'bg-track-peach', ink: 'text-track-peach-ink', title: 'text-track-peach-title', fill: 'bg-track-peach-bar' },
  mint: { bg: 'bg-track-mint', ink: 'text-track-mint-ink', title: 'text-track-mint-title', fill: 'bg-track-mint-bar' },
  sky: { bg: 'bg-track-sky', ink: 'text-track-sky-ink', title: 'text-track-sky-title', fill: 'bg-track-sky-bar' },
  butter: { bg: 'bg-track-butter', ink: 'text-track-butter-ink', title: 'text-track-butter-title', fill: 'bg-track-butter-bar' },
  rose: { bg: 'bg-track-rose', ink: 'text-track-rose-ink', title: 'text-track-rose-title', fill: 'bg-track-rose-bar' },
  teal: { bg: 'bg-track-teal', ink: 'text-track-teal-ink', title: 'text-track-teal-title', fill: 'bg-track-teal-bar' },
};

/** A track's colour; unknown ids fall back to lilac. */
export function trackColour(track: string): TrackColour {
  return (TRACK_COLOURS as Record<string, TrackColour>)[track] ?? 'lilac';
}

export function trackClasses(track: string): TrackClasses {
  return TRACK_CLASSES[trackColour(track)];
}
