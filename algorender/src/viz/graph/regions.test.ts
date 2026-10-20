import { describe, expect, it } from 'vitest';
import { convexHull, regionShape } from './regions';

describe('graph regions', () => {
  it('finds the convex hull, dropping points inside it', () => {
    const hull = convexHull([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
      { x: 50, y: 50 },
    ]);
    expect(hull).toHaveLength(4);
    expect(hull).not.toContainEqual({ x: 50, y: 50 });
  });

  it('wraps a group in one hull when no other node is inside it', () => {
    const shape = regionShape(
      [
        { x: 0, y: 0 },
        { x: 120, y: 0 },
      ],
      [{ x: 60, y: 200 }],
    );
    expect(shape?.kind).toBe('hull');
  });

  it('falls back to a halo per member when the hull would hold another node', () => {
    const members = [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
    ];
    const shape = regionShape(members, [{ x: 100, y: 5 }]);
    expect(shape).toMatchObject({ kind: 'halos', points: members });
  });

  it('labels the region under its lowest member', () => {
    const shape = regionShape(
      [
        { x: 0, y: 0 },
        { x: 50, y: 80 },
      ],
      [],
    )!;
    expect(shape.label.y).toBeGreaterThan(80);
  });

  it('draws nothing for an empty group', () => {
    expect(regionShape([], [{ x: 0, y: 0 }])).toBeNull();
  });
});
