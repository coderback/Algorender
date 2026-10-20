import type { Status } from '@/components/ui/Chip';
import type { TrackColour } from '@/data/tracks';

// Explore's library as pure data: which kind each visualiser is, its tile's
// glyph, and the filter and sort the page applies. The page reads mastery
// from the learner's events and hands each tile's status in.

export type Kind = 'data-structures' | 'algorithms' | 'math' | 'systems';
export type KindFilter = 'all' | Kind;

export const KINDS: readonly { id: KindFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'data-structures', label: 'Data structures' },
  { id: 'algorithms', label: 'Algorithms' },
  { id: 'math', label: 'Math & ML' },
  { id: 'systems', label: 'Systems' },
];

/** The registry's `type` as a kind (and the `?kind=` value old links redirect to). */
export const KIND_OF_TYPE: Record<string, Kind> = {
  'data-structure': 'data-structures',
  algorithm: 'algorithms',
  math: 'math',
  systems: 'systems',
};

export const parseKind = (value: string | null): KindFilter => (KINDS.some((k) => k.id === value) ? (value as KindFilter) : 'all');

/** A tile's little picture: a row of bars whose shape hints at the view. */
export type Glyph = 'bars' | 'sorted' | 'tree' | 'wave' | 'steps' | 'grid';

export const GLYPH_HEIGHTS: Record<Glyph, readonly number[]> = {
  bars: [40, 70, 25, 100, 55, 85, 30],
  sorted: [20, 32, 45, 58, 70, 84, 100],
  tree: [30, 60, 100, 60, 30, 60, 30],
  wave: [20, 45, 80, 100, 80, 45, 20],
  steps: [100, 100, 80, 60, 60, 35, 20],
  grid: [60, 60, 60, 60, 60, 60, 60],
};

/** Picks a glyph from the module's view and the registry category. */
export function glyphFor(view: string, category: string): Glyph {
  if (view === 'array') return /sort/i.test(category) ? 'bars' : 'sorted';
  if (view === 'tree') return 'tree';
  if (view === 'graph' || view === 'plot') return 'wave';
  if (view === 'linear' || view === 'memory') return 'steps';
  return 'grid';
}

export type Tile = {
  slug: string;
  name: string;
  category: string;
  blurb: string;
  /** Average time, when the registry has one. */
  cost: string | null;
  kind: Kind;
  colour: TrackColour;
  /** The concept whose status the tile shows. */
  concept: string | null;
  glyph: Glyph;
};

export type Sort = 'ready' | 'az' | 'track';

export const SORTS: readonly { id: Sort; label: string }[] = [
  { id: 'ready', label: 'Ready for you first' },
  { id: 'az', label: 'A to Z' },
  { id: 'track', label: 'Track' },
];

export type Filters = { kind: KindFilter; colour: TrackColour | 'all'; query: string };

export function matches(tile: Tile, { kind, colour, query }: Filters): boolean {
  const q = query.trim().toLowerCase();
  return (
    (kind === 'all' || tile.kind === kind) &&
    (colour === 'all' || tile.colour === colour) &&
    (!q || tile.name.toLowerCase().includes(q) || tile.category.toLowerCase().includes(q))
  );
}

/** Tiles per kind, before the other filters: the kind tabs' counts. */
export function kindCounts(tiles: readonly Tile[]): Record<KindFilter, number> {
  const counts: Record<KindFilter, number> = { all: tiles.length, 'data-structures': 0, algorithms: 0, math: 0, systems: 0 };
  for (const t of tiles) counts[t.kind]++;
  return counts;
}

/** What to open first: what you're in the middle of, then what's ready, then the rest. */
const READY_ORDER: Record<Status, number> = { learning: 0, ready: 1, practised: 2, mastered: 3, placed: 4, locked: 5 };
const COLOUR_ORDER: Record<TrackColour, number> = { lilac: 0, peach: 1, mint: 2, sky: 3, butter: 4, rose: 5, teal: 6 };

/** Sorts tiles; ties keep the registry's order. Without statuses (before progress loads) "ready" keeps that order too. */
export function sortTiles(tiles: readonly Tile[], sort: Sort, status: (tile: Tile) => Status | null): Tile[] {
  const indexed = tiles.map((tile, i) => ({ tile, i }));
  const key = (t: Tile): number | string => {
    if (sort === 'az') return t.name.toLowerCase();
    if (sort === 'track') return COLOUR_ORDER[t.colour];
    const s = status(t);
    return s ? READY_ORDER[s] : READY_ORDER.locked;
  };
  return indexed
    .sort((a, b) => {
      const ka = key(a.tile);
      const kb = key(b.tile);
      if (ka < kb) return -1;
      if (ka > kb) return 1;
      return a.i - b.i;
    })
    .map((x) => x.tile);
}
