import { describe, expect, it } from 'vitest';
import { loadConcepts } from '@/content/concepts';
import { TRACK_COLOURS } from './tracks';

describe('track colours', () => {
  it('colour every concept-map track, in the map order', () => {
    const { tracks } = loadConcepts();
    expect(Object.keys(TRACK_COLOURS)).toEqual(tracks.map((t) => t.id));
  });
});
