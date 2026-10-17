import { describe, expect, it } from 'vitest';
import { ARRAY_PRESETS, generateArray, parseArrayInput } from './random';

const spec = { min: 5, max: 99 };

describe('generateArray', () => {
  it('is reproducible from its seed', () => {
    for (const preset of ARRAY_PRESETS) {
      expect(generateArray(preset, 20, 42, spec)).toEqual(generateArray(preset, 20, 42, spec));
    }
  });

  it('respects size and value bounds', () => {
    for (const preset of ARRAY_PRESETS) {
      const values = generateArray(preset, 17, 3, spec);
      expect(values).toHaveLength(17);
      for (const v of values) expect(v >= spec.min && v <= spec.max).toBe(true);
    }
  });

  it('shapes presets as named', () => {
    const sorted = generateArray('sorted', 30, 9, spec);
    expect(sorted).toEqual([...sorted].sort((a, b) => a - b));
    const reversed = generateArray('reversed', 30, 9, spec);
    expect(reversed).toEqual([...reversed].sort((a, b) => b - a));
    expect(new Set(generateArray('few-unique', 30, 9, spec)).size).toBeLessThanOrEqual(3);
  });
});

describe('parseArrayInput', () => {
  const limits = { ...spec, maxSize: 5 };
  it('accepts commas and spaces', () => {
    expect(parseArrayInput('5, 8  13,21', limits)).toEqual({ values: [5, 8, 13, 21] });
  });
  it('rejects bad input with a reason', () => {
    expect(parseArrayInput('', limits)).toHaveProperty('error');
    expect(parseArrayInput('5, x', limits)).toHaveProperty('error');
    expect(parseArrayInput('5, 2', limits)).toHaveProperty('error');
    expect(parseArrayInput('5 6 7 8 9 10', limits)).toHaveProperty('error');
  });
});
