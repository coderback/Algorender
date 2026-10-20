import { describe, expect, it } from 'vitest';
import { masteryGraph } from '@/content/mastery';
import { visualisers } from '@/data/visualisers';
import { glyphFor, kindCounts, matches, parseKind, sortTiles, type Tile } from './tiles';

const tile = (over: Partial<Tile>): Tile => ({
  slug: 'x',
  name: 'X',
  category: 'Sorting',
  blurb: '',
  cost: null,
  kind: 'algorithms',
  colour: 'peach',
  concept: null,
  glyph: 'bars',
  ...over,
});

describe('Explore library', () => {
  it('reads old and new kind values, defaulting to all', () => {
    expect(parseKind('algorithms')).toBe('algorithms');
    expect(parseKind('data-structures')).toBe('data-structures');
    expect(parseKind('nonsense')).toBe('all');
    expect(parseKind(null)).toBe('all');
  });

  it('filters by kind, track colour and name or category', () => {
    const t = tile({ name: 'Bubble Sort', category: 'Sorting' });
    expect(matches(t, { kind: 'all', colour: 'all', query: '' })).toBe(true);
    expect(matches(t, { kind: 'math', colour: 'all', query: '' })).toBe(false);
    expect(matches(t, { kind: 'all', colour: 'teal', query: '' })).toBe(false);
    expect(matches(t, { kind: 'all', colour: 'peach', query: ' bubble ' })).toBe(true);
    expect(matches(t, { kind: 'all', colour: 'all', query: 'sort' })).toBe(true);
    expect(matches(t, { kind: 'all', colour: 'all', query: 'heap' })).toBe(false);
  });

  it('counts every kind', () => {
    const counts = kindCounts([tile({}), tile({ kind: 'math' }), tile({ kind: 'math' })]);
    expect(counts).toEqual({ all: 3, 'data-structures': 0, algorithms: 1, math: 2, systems: 0 });
  });

  it('puts what you are learning, then what is ready, first; ties keep registry order', () => {
    const a = tile({ slug: 'a', name: 'B' });
    const b = tile({ slug: 'b', name: 'A' });
    const c = tile({ slug: 'c', name: 'C', colour: 'lilac' });
    const status = { a: 'mastered', b: 'ready', c: 'learning' } as const;
    expect(sortTiles([a, b, c], 'ready', (t) => status[t.slug as 'a']).map((t) => t.slug)).toEqual(['c', 'b', 'a']);
    expect(sortTiles([a, b, c], 'ready', () => null).map((t) => t.slug)).toEqual(['a', 'b', 'c']);
    expect(sortTiles([a, b, c], 'az', () => null).map((t) => t.slug)).toEqual(['b', 'a', 'c']);
    expect(sortTiles([a, b, c], 'track', () => null).map((t) => t.slug)).toEqual(['c', 'a', 'b']);
  });

  it('draws sorting as jumbled bars and other arrays as sorted ones', () => {
    expect(glyphFor('array', 'Sorting')).toBe('bars');
    expect(glyphFor('array', 'Searching')).toBe('sorted');
    expect(glyphFor('tree', 'Hierarchical')).toBe('tree');
    expect(glyphFor('hash', 'Hash-Based')).toBe('grid');
  });

  it('every listed visualiser is taught by a concept, so every tile has a track and a status', () => {
    const taught = new Set(masteryGraph().concepts.filter((c) => !c.planned).flatMap((c) => c.visualisers));
    expect(visualisers.filter((v) => !v.hidden && !taught.has(v.slug)).map((v) => v.slug)).toEqual([]);
  });
});
