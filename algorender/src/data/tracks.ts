/**
 * Track colours: every track of the concept map (src/content/concepts.yaml) has
 * one pastel, used for its cards, chips, path nodes and Explore tiles. Learn,
 * Explore, Today and Play all read this table, so a colour means one place
 * everywhere. The values are theme tokens in globals.css.
 */

export type TrackColour = 'lilac' | 'peach' | 'mint' | 'sky' | 'butter' | 'rose' | 'lime' | 'teal';

/** Concept-map track ids, in the map's order, with their colour. The math tracks share rose, and the ML tracks lime. */
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
  'math-toolkit': 'rose',
  'linear-algebra': 'rose',
  calculus: 'rose',
  probability: 'rose',
  ml: 'lime',
  'deep-learning': 'lime',
  llms: 'lime',
  interpretability: 'lime',
  systems: 'teal',
} as const satisfies Record<string, TrackColour>;

export type TrackId = keyof typeof TRACK_COLOURS;

/** The broad areas of the map (src/progress/mastery.ts's AREAS). */
export type AreaId = 'dsa' | 'math' | 'ml' | 'systems';

/**
 * Each track's area, as concepts.yaml gives it (content.test.ts checks they
 * agree): client code reads it here, since the YAML is read on the server.
 */
export const TRACK_AREA: Record<TrackId, AreaId> = {
  foundations: 'dsa',
  linear: 'dsa',
  'searching-sorting': 'dsa',
  hashing: 'dsa',
  trees: 'dsa',
  patterns: 'dsa',
  graphs: 'dsa',
  design: 'dsa',
  strings: 'dsa',
  'math-toolkit': 'math',
  'linear-algebra': 'math',
  calculus: 'math',
  probability: 'math',
  ml: 'ml',
  'deep-learning': 'ml',
  llms: 'ml',
  interpretability: 'ml',
  systems: 'systems',
};

/** The area a track belongs to; unknown tracks count as DS&A. */
export const areaOfTrack = (track: string): AreaId => (TRACK_AREA as Record<string, AreaId>)[track] ?? 'dsa';

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
  'math-toolkit': 'Math toolkit',
  'linear-algebra': 'Linear algebra',
  calculus: 'Calculus',
  probability: 'Probability',
  ml: 'Machine learning',
  'deep-learning': 'Deep learning',
  llms: 'Language models',
  interpretability: 'Interpretability',
  systems: 'Systems',
};

export const trackLabel = (track: string): string => (TRACK_LABEL as Record<string, string>)[track] ?? track;

/**
 * The track a visualiser's page and tile take when no available concept
 * teaches it (every visualiser is taught, so this is a fallback), by its
 * `type` in src/data/visualisers.js.
 */
export const typeTrack = (type: string): string => (type === 'systems' ? 'systems' : type === 'math' ? 'linear-algebra' : '');

/** The colours in map order, named for the tracks that share them (Explore's track chips). */
export const COLOURS: readonly TrackColour[] = ['lilac', 'peach', 'mint', 'sky', 'butter', 'rose', 'lime', 'teal'];

export const COLOUR_LABEL: Record<TrackColour, string> = {
  lilac: 'Arrays & lists',
  peach: 'Sorting & searching',
  mint: 'Trees & hashing',
  sky: 'Graphs & strings',
  butter: 'Patterns & design',
  rose: 'Math',
  lime: 'Machine learning',
  teal: 'Systems',
};

/** Phone chips: one word each. */
export const COLOUR_SHORT: Record<TrackColour, string> = {
  lilac: 'Arrays',
  peach: 'Sorting',
  mint: 'Trees',
  sky: 'Graphs',
  butter: 'Patterns',
  rose: 'Math',
  lime: 'ML',
  teal: 'Systems',
};

export interface TrackClasses {
  /** The pastel fill. */
  bg: string;
  /** Body text on the fill. */
  ink: string;
  /** Display text (titles, big numbers) on the fill. */
  title: string;
  /** The track's mid-tone, for a bar or dot on a neutral or pastel surface. */
  fill: string;
  /** A solid fill in the track's ink (a mastered path node), with onSolid text on it. */
  solid: string;
  onSolid: string;
  /** A border in the track's ink (a practised path node, a met connector). */
  edge: string;
}

// Written out in full so Tailwind sees every class.
export const TRACK_CLASSES: Record<TrackColour, TrackClasses> = {
  lilac: { bg: 'bg-track-lilac', ink: 'text-track-lilac-ink', title: 'text-track-lilac-title', fill: 'bg-track-lilac-bar', solid: 'bg-track-lilac-ink', onSolid: 'text-track-lilac', edge: 'border-track-lilac-ink' },
  peach: { bg: 'bg-track-peach', ink: 'text-track-peach-ink', title: 'text-track-peach-title', fill: 'bg-track-peach-bar', solid: 'bg-track-peach-ink', onSolid: 'text-track-peach', edge: 'border-track-peach-ink' },
  mint: { bg: 'bg-track-mint', ink: 'text-track-mint-ink', title: 'text-track-mint-title', fill: 'bg-track-mint-bar', solid: 'bg-track-mint-ink', onSolid: 'text-track-mint', edge: 'border-track-mint-ink' },
  sky: { bg: 'bg-track-sky', ink: 'text-track-sky-ink', title: 'text-track-sky-title', fill: 'bg-track-sky-bar', solid: 'bg-track-sky-ink', onSolid: 'text-track-sky', edge: 'border-track-sky-ink' },
  butter: { bg: 'bg-track-butter', ink: 'text-track-butter-ink', title: 'text-track-butter-title', fill: 'bg-track-butter-bar', solid: 'bg-track-butter-ink', onSolid: 'text-track-butter', edge: 'border-track-butter-ink' },
  rose: { bg: 'bg-track-rose', ink: 'text-track-rose-ink', title: 'text-track-rose-title', fill: 'bg-track-rose-bar', solid: 'bg-track-rose-ink', onSolid: 'text-track-rose', edge: 'border-track-rose-ink' },
  lime: { bg: 'bg-track-lime', ink: 'text-track-lime-ink', title: 'text-track-lime-title', fill: 'bg-track-lime-bar', solid: 'bg-track-lime-ink', onSolid: 'text-track-lime', edge: 'border-track-lime-ink' },
  teal: { bg: 'bg-track-teal', ink: 'text-track-teal-ink', title: 'text-track-teal-title', fill: 'bg-track-teal-bar', solid: 'bg-track-teal-ink', onSolid: 'text-track-teal', edge: 'border-track-teal-ink' },
};

/** A track's colour; unknown ids fall back to lilac. */
export function trackColour(track: string): TrackColour {
  return (TRACK_COLOURS as Record<string, TrackColour>)[track] ?? 'lilac';
}

export function trackClasses(track: string): TrackClasses {
  return TRACK_CLASSES[trackColour(track)];
}
