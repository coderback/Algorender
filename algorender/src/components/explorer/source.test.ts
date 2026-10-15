import { describe, expect, it } from 'vitest';
import { sourceFromParams, sourceToParams, type InputSource } from './source';

const spec = { min: 5, max: 99, defaultSize: 10, maxSize: 40 };

describe('sourceFromParams', () => {
  it('uses the defaults when params are missing', () => {
    expect(sourceFromParams(new URLSearchParams(''), spec)).toEqual({ kind: 'preset', preset: 'random', size: 10, seed: 7 });
  });

  it('round-trips through the URL', () => {
    const preset: InputSource = { kind: 'preset', preset: 'reversed', size: 12, seed: 0 };
    expect(sourceFromParams(sourceToParams(preset), spec)).toEqual(preset);
    const custom: InputSource = { kind: 'custom', values: [42, 7, 19] };
    expect(sourceFromParams(sourceToParams(custom), spec)).toEqual(custom);
  });

  it('ignores out-of-range or junk values', () => {
    const s = sourceFromParams(new URLSearchParams('preset=bogus&n=999&seed=-3&input=1,x'), spec);
    expect(s).toEqual({ kind: 'preset', preset: 'random', size: 10, seed: 7 });
  });
});
