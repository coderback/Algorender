import { describe, expect, it } from 'vitest';
import { loadConcepts } from '@/content/concepts';
import { AREAS, areaOf } from '@/progress/mastery';
import { COLOURS, TRACK_AREA, TRACK_COLOURS, TRACK_LABEL } from './tracks';

describe('track colours', () => {
  it('colour every concept-map track, in the map order', () => {
    const { tracks } = loadConcepts();
    expect(Object.keys(TRACK_COLOURS)).toEqual(tracks.map((t) => t.id));
    expect(Object.keys(TRACK_LABEL)).toEqual(tracks.map((t) => t.id));
  });

  it('give each track the area concepts.yaml gives it', () => {
    for (const t of loadConcepts().tracks) {
      expect(TRACK_AREA[t.id as keyof typeof TRACK_AREA], t.id).toBe(t.area);
      expect(areaOf(t.id)).toBe(t.area);
    }
    expect(areaOf('not-a-track')).toBe('dsa');
    expect(new Set(Object.values(TRACK_AREA))).toEqual(new Set(AREAS.map((a) => a.id)));
  });

  it('keep one colour family per area outside DS&A: math rose, ML lime, systems teal', () => {
    const family = (area: string) => new Set(loadConcepts().tracks.filter((t) => t.area === area).map((t) => TRACK_COLOURS[t.id as keyof typeof TRACK_COLOURS]));
    expect(family('math')).toEqual(new Set(['rose']));
    expect(family('ml')).toEqual(new Set(['lime']));
    expect(family('systems')).toEqual(new Set(['teal']));
    // Every colour is used, and listed once.
    expect(new Set(Object.values(TRACK_COLOURS))).toEqual(new Set(COLOURS));
    expect(new Set(COLOURS).size).toBe(COLOURS.length);
  });
});
