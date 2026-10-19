import { describe, expect, it } from 'vitest';
import type { PaletteEntry } from '@/content/palette';
import { score, search } from './search';

const entry = (title: string, rest: Partial<PaletteEntry> = {}): PaletteEntry => ({
  kind: 'visualiser',
  id: `visualiser:${title}`,
  title,
  subtitle: '',
  description: '',
  href: '/',
  track: 'graphs',
  trackTitle: 'Graphs',
  keywords: '',
  ...rest,
});

describe('palette search', () => {
  it('needs every word somewhere', () => {
    expect(score(entry("Dijkstra's Algorithm", { subtitle: 'Graph' }), 'dijkstra graph')).toBeGreaterThan(0);
    expect(score(entry("Dijkstra's Algorithm"), 'dijkstra tree')).toBe(0);
    expect(score(entry('Anything'), '  ')).toBe(0);
  });

  it('ranks title starts above words in the description', () => {
    const shortest = entry('Shortest paths', { kind: 'concept' });
    const mentions = entry('Bellman-Ford', { kind: 'concept', description: 'Shortest paths with negative edges' });
    expect(search([mentions, shortest], 'concept', 'shortest', 5).map((e) => e.title)).toEqual(['Shortest paths', 'Bellman-Ford']);
  });

  it('treats regex characters in the query as text', () => {
    expect(score(entry('C++ basics'), 'c++')).toBeGreaterThan(0);
    expect(score(entry('O(n log n) sorts'), 'o(n')).toBeGreaterThan(0);
  });

  it('keeps to one kind and the limit', () => {
    const many = Array.from({ length: 10 }, (_, i) => entry(`Sort ${i}`));
    expect(search([...many, entry('Sort lesson', { kind: 'lesson' })], 'visualiser', 'sort', 3)).toHaveLength(3);
  });
});
