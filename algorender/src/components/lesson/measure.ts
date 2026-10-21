import type { AnyAlgorithm } from '@/engine/module';
import { recordTrace } from '@/engine/trace';
import { getModule } from '@/registry';

// Measured growth for the <Growth> lesson widget: run an algorithm on one of its
// own examples at every size and read a stat off the last frame.

/** Reference curves a chart can draw, by the label it shows. */
export const CURVES = {
  'log₂ n': (n: number) => Math.log2(n),
  n: (n: number) => n,
  'n log₂ n': (n: number) => n * Math.log2(n),
  'n²/2': (n: number) => (n * n) / 2,
} as const;

export type Curve = keyof typeof CURVES;

/** step, 2·step, … up to max. */
export function sizesUpTo(max: number, step: number): number[] {
  return Array.from({ length: Math.floor(max / step) }, (_, i) => (i + 1) * step);
}

export function algorithm(slug: string): AnyAlgorithm {
  const m = getModule(slug);
  if (!m || m.kind !== 'algorithm') throw new Error(`No algorithm "${slug}"`);
  return m;
}

/** The stat `stat` at the end of a run on example `example` (or the first), at each size in `ns`. */
export function measure(slug: string, example: string, stat: string, ns: readonly number[], seed: number): number[] {
  const m = algorithm(slug);
  const make = (m.input.examples.find((e: { id: string }) => e.id === example) ?? m.input.examples[0]).make;
  return ns.map((size) => {
    const { frames } = recordTrace(m.run(make({ seed, size })));
    return frames[frames.length - 1].stats?.[stat] ?? 0;
  });
}
