import { describe, expect, it } from 'vitest';
import { arrayInput } from '@/engine/inputs';
import { inputFor, sourceFromParams, sourceToParams, type InputSource } from './source';

const spec = arrayInput({ min: 5, max: 99, defaultSize: 10, maxSize: 40 });

describe('sourceFromParams', () => {
  it('uses the defaults when params are missing', () => {
    expect(sourceFromParams(new URLSearchParams(''), spec)).toEqual({ kind: 'example', example: 'random', size: 10, seed: 7 });
  });

  it('round-trips through the URL', () => {
    const example: InputSource = { kind: 'example', example: 'reversed', size: 12, seed: 0 };
    expect(sourceFromParams(sourceToParams(example), spec)).toEqual(example);
    const custom: InputSource = { kind: 'custom', text: '42,7,19' };
    expect(sourceFromParams(sourceToParams(custom), spec)).toEqual(custom);
  });

  it('ignores out-of-range or junk values', () => {
    const s = sourceFromParams(new URLSearchParams('preset=bogus&n=999&seed=-3&input=1,x'), spec);
    expect(s).toEqual({ kind: 'example', example: 'random', size: 10, seed: 7 });
  });
});

describe('inputFor', () => {
  it('builds examples reproducibly and parses custom text', () => {
    const example: InputSource = { kind: 'example', example: 'sorted', size: 6, seed: 3 };
    expect(inputFor(example, spec)).toEqual(inputFor(example, spec));
    expect(inputFor(example, spec)).toHaveLength(6);
    expect(inputFor({ kind: 'custom', text: '42, 7' }, spec)).toEqual([42, 7]);
  });
});
