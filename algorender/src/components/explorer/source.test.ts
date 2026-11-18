import { describe, expect, it } from 'vitest';
import { arrayInput } from '@/engine/inputs';
import type { InputSpec } from '@/engine/module';
import { createRng } from '@/engine/random';
import { canDrawNewValues, inputFor, sourceFromParams, sourceToParams, usesSeed, type InputSource } from './source';

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

describe('New values', () => {
  const mixed: InputSpec<number[]> = {
    examples: [
      { id: 'worked', label: 'Worked example', make: () => [3, 1, 2] },
      { id: 'random', label: 'Random', make: ({ seed, size }) => Array.from({ length: size }, createRng(seed)) },
      { id: 'counting', label: 'Counting', make: ({ size }) => Array.from({ length: size }, (_, i) => i) },
    ],
    size: { label: 'Size', min: 2, max: 9, default: 5 },
    custom: { label: 'Numbers', placeholder: '1,2', parse: (t) => ({ value: t.split(',').map(Number) }), format: (v) => v.join(',') },
  };
  const at = (example: string): InputSource => ({ kind: 'example', example, size: 5, seed: 7 });

  it('tells examples that use their seed from fixed ones, whatever the size', () => {
    expect(usesSeed(mixed.examples[0], 5)).toBe(false);
    expect(usesSeed(mixed.examples[1], 5)).toBe(true);
    expect(usesSeed(mixed.examples[2], 5)).toBe(false);
    expect(usesSeed(mixed.examples[2], 8)).toBe(false);
  });

  it('is offered only where a new seed changes the input', () => {
    expect(canDrawNewValues(at('random'), mixed)).toBe(true);
    expect(canDrawNewValues(at('worked'), mixed)).toBe(false);
    expect(canDrawNewValues(at('counting'), mixed)).toBe(false);
  });

  it('on the learner’s own input, follows the first example, which it would draw', () => {
    expect(canDrawNewValues({ kind: 'custom', text: '4,5' }, mixed)).toBe(false);
    const randomFirst = { ...mixed, examples: [mixed.examples[1], mixed.examples[0]] as const };
    expect(canDrawNewValues({ kind: 'custom', text: '4,5' }, randomFirst)).toBe(true);
  });
});
