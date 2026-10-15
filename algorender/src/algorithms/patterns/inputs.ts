import type { InputExample, InputSpec } from '@/engine/module';
import { createRng } from '@/engine/random';

type Range = { min: number; max: number; maxSize: number };

function parseInts(text: string, { min, max, maxSize }: Range): { values: number[] } | { error: string } {
  const parts = text.split(/[\s,]+/).filter(Boolean);
  if (parts.length < 2) return { error: 'Enter at least two numbers.' };
  if (parts.length > maxSize) return { error: `Use at most ${maxSize} numbers.` };
  const values: number[] = [];
  for (const p of parts) {
    const n = Number(p);
    if (!Number.isInteger(n)) return { error: `"${p}" is not a whole number.` };
    if (n < min || n > max) return { error: `Numbers must be between ${min} and ${max}.` };
    values.push(n);
  }
  return { values };
}

/**
 * "values | name=number" inputs, e.g. "1, 3, 4, 6, 8 | target=10" or
 * "4, 2, 12, 3 | k=2". `check` adds cross-field validation.
 */
export function valuesWithParam<K extends string>(opts: {
  param: K;
  range: Range;
  paramRange: (values: number[]) => { min: number; max: number };
  sorted?: boolean;
  examples: readonly [InputExample<{ values: number[] } & Record<K, number>>, ...InputExample<{ values: number[] } & Record<K, number>>[]];
  size: { min: number; max: number; default: number };
  placeholder: string;
}): InputSpec<{ values: number[] } & Record<K, number>> {
  const { param, range, paramRange, sorted } = opts;
  return {
    examples: opts.examples,
    size: { label: 'Size', ...opts.size },
    custom: {
      label: `Values (${range.min}–${range.max}${sorted ? ', sorted' : ''}) | ${param}=…`,
      placeholder: opts.placeholder,
      parse: (text) => {
        const [left, right] = text.split('|');
        const parsed = parseInts(left ?? '', range);
        if ('error' in parsed) return parsed;
        if (sorted && parsed.values.some((v, i) => i > 0 && v < parsed.values[i - 1])) {
          return { error: 'This pattern needs the values in ascending order.' };
        }
        const match = (right ?? '').match(new RegExp(`^\\s*${param}\\s*=\\s*(-?\\d+)\\s*$`));
        if (!match) return { error: `Add "| ${param}=…" after the values.` };
        const p = Number(match[1]);
        const pr = paramRange(parsed.values);
        if (p < pr.min || p > pr.max) return { error: `${param} must be between ${pr.min} and ${pr.max}.` };
        return { value: { values: parsed.values, [param]: p } as { values: number[] } & Record<K, number> };
      },
      format: (input) => `${input.values.join(', ')} | ${param}=${input[param]}`,
    },
  };
}

/** Seeded integers in [min, max]. */
export function randomInts(seed: number, size: number, min: number, max: number): number[] {
  const rng = createRng(seed);
  return Array.from({ length: size }, () => min + Math.floor(rng() * (max - min + 1)));
}

/** Seeded strictly increasing integers starting near `min`. */
export function sortedDistinct(seed: number, size: number, min: number, maxGap: number): number[] {
  const rng = createRng(seed);
  const out: number[] = [];
  let v = min + Math.floor(rng() * 3);
  for (let i = 0; i < size; i++) {
    out.push(v);
    v += 1 + Math.floor(rng() * maxGap);
  }
  return out;
}
