import type { InputExample, InputSpec } from '@/engine/module';

/**
 * Where an algorithm's input comes from: a named example (with size and seed,
 * so random examples are reproducible) or text the learner typed. Serialised
 * into the URL so any run can be shared.
 */
export type InputSource =
  | { kind: 'example'; example: string; size: number; seed: number }
  | { kind: 'custom'; text: string };

/** Fixed default seed: the first visit is the same for everyone, so links without a seed still agree. */
export const DEFAULT_SEED = 7;

export function defaultSource<I>(spec: InputSpec<I>): InputSource {
  return { kind: 'example', example: spec.examples[0].id, size: spec.size?.default ?? 0, seed: DEFAULT_SEED };
}

export function sourceFromParams<I>(params: URLSearchParams, spec: InputSpec<I>): InputSource {
  const custom = params.get('input');
  if (custom && spec.custom && 'value' in spec.custom.parse(custom)) return { kind: 'custom', text: custom };

  const fallback = defaultSource(spec);
  if (fallback.kind !== 'example') return fallback;
  const example = params.get('preset');
  const size = numberParam(params, 'n');
  const seed = numberParam(params, 'seed');
  return {
    kind: 'example',
    example: spec.examples.some((e) => e.id === example) ? example! : fallback.example,
    size: spec.size && Number.isInteger(size) && size >= spec.size.min && size <= spec.size.max ? size : fallback.size,
    seed: Number.isInteger(seed) && seed >= 0 ? seed : DEFAULT_SEED,
  };
}

export function sourceToParams(source: InputSource): URLSearchParams {
  return new URLSearchParams(
    source.kind === 'custom'
      ? { input: source.text }
      : { preset: source.example, n: String(source.size), seed: String(source.seed) },
  );
}

/** Builds the input. Invalid custom text (only possible via a hand-edited URL) falls back to the default example. */
export function inputFor<I>(source: InputSource, spec: InputSpec<I>): I {
  if (source.kind === 'custom' && spec.custom) {
    const parsed = spec.custom.parse(source.text);
    if ('value' in parsed) return parsed.value;
  }
  const s = source.kind === 'example' ? source : (defaultSource(spec) as Extract<InputSource, { kind: 'example' }>);
  const example = spec.examples.find((e) => e.id === s.example) ?? spec.examples[0];
  return example.make({ seed: s.seed, size: s.size });
}

/** Seeds tried to tell whether an example uses its seed: a random one differs between some two of them. */
const PROBE_SEEDS = [1, 2, 3, 4];
const probed = new WeakMap<object, Map<number, boolean>>();

/**
 * Whether a new seed changes what this example makes at this size. Fixed
 * examples (a hand-placed graph, a lesson's worked numbers) ignore it, so
 * "New values" would do nothing. Found by building the example from a few
 * seeds, once per example and size.
 */
export function usesSeed<I>(example: InputExample<I>, size: number): boolean {
  let bySize = probed.get(example);
  if (!bySize) probed.set(example, (bySize = new Map()));
  let uses = bySize.get(size);
  if (uses === undefined) {
    const [first, ...rest] = PROBE_SEEDS.map((seed) => JSON.stringify(example.make({ seed, size })));
    uses = rest.some((made) => made !== first);
    bySize.set(size, uses);
  }
  return uses;
}

/**
 * Whether "New values" would change the input: it draws the shown example
 * again with a new seed (the first example, when the input is the learner's
 * own), so it only appears when that example uses its seed.
 */
export function canDrawNewValues<I>(source: InputSource, spec: InputSpec<I>): boolean {
  const example = (source.kind === 'example' && spec.examples.find((e) => e.id === source.example)) || spec.examples[0];
  return usesSeed(example, source.kind === 'example' ? source.size : (spec.size?.default ?? 0));
}

/** NaN when absent, so a missing param falls back to the default (Number(null) would be 0). */
function numberParam(params: URLSearchParams, name: string): number {
  const raw = params.get(name);
  return raw == null || raw.trim() === '' ? NaN : Number(raw);
}
