import { describe, expect, it } from 'vitest';
import { isHub, parentOf, placeOf } from './places';

describe('places', () => {
  it('keeps a section active on every page inside it', () => {
    expect(placeOf('/')).toBe('today');
    expect(placeOf('/learn/binary-search')).toBe('learn');
    expect(placeOf('/plan')).toBe('learn');
    expect(placeOf('/visualisers/bubble-sort')).toBe('explore');
    expect(placeOf('/compare')).toBe('explore');
    expect(placeOf('/code/two-sum')).toBe('practice');
    expect(placeOf('/design/url-shortener')).toBe('practice');
    expect(placeOf('/play/break-it')).toBe('play');
    expect(placeOf('/review')).toBe('review');
    expect(placeOf('/account')).toBeNull();
    expect(placeOf('/learning')).toBeNull();
  });

  it('shows the tab bar on hubs only', () => {
    for (const hub of ['/', '/learn', '/plan', '/explore', '/practice', '/design', '/play', '/account']) expect(isHub(hub)).toBe(true);
    for (const page of ['/learn/placement', '/practice/drills', '/code', '/design/sandbox', '/play/break-it', '/visualisers/stack']) expect(isHub(page)).toBe(false);
  });

  it('sends back buttons to the page above', () => {
    expect(parentOf('/learn/placement')).toBe('/learn');
    expect(parentOf('/learn/recursion')).toBe('/learn');
    expect(parentOf('/practice/two-sum')).toBe('/practice');
    expect(parentOf('/code')).toBe('/practice');
    expect(parentOf('/code/bubble-sort')).toBe('/code');
    expect(parentOf('/design/estimate')).toBe('/design');
    expect(parentOf('/play/be-the-algorithm/bubble-sort')).toBe('/play/be-the-algorithm');
    expect(parentOf('/play/break-it')).toBe('/play');
    expect(parentOf('/visualisers/stack')).toBe('/explore');
    expect(parentOf('/review')).toBe('/');
  });
});
