import { ARRAY_PRESETS, generateArray, parseArrayInput, type ArrayInputSpec, type ArrayPreset } from '@/engine/random';

/** Where the visualiser's input comes from. Serialised into the URL so any run can be shared. */
export type InputSource =
  | { kind: 'preset'; preset: ArrayPreset; size: number; seed: number }
  | { kind: 'custom'; values: number[] };

/** Fixed default seed: the first visit is the same for everyone, so links without a seed still agree. */
const DEFAULT_SEED = 7;

export function sourceFromParams(params: URLSearchParams, spec: ArrayInputSpec): InputSource {
  const custom = params.get('input');
  if (custom) {
    const parsed = parseArrayInput(custom, spec);
    if ('values' in parsed) return { kind: 'custom', values: parsed.values };
  }
  const preset = params.get('preset');
  const size = numberParam(params, 'n');
  const seed = numberParam(params, 'seed');
  return {
    kind: 'preset',
    preset: ARRAY_PRESETS.includes(preset as ArrayPreset) ? (preset as ArrayPreset) : 'random',
    size: Number.isInteger(size) && size >= 2 && size <= spec.maxSize ? size : spec.defaultSize,
    seed: Number.isInteger(seed) && seed >= 0 ? seed : DEFAULT_SEED,
  };
}

/** NaN when absent, so a missing param falls back to the default (Number(null) would be 0). */
function numberParam(params: URLSearchParams, name: string): number {
  const raw = params.get(name);
  return raw == null || raw.trim() === '' ? NaN : Number(raw);
}

export function sourceToParams(source: InputSource): URLSearchParams {
  return new URLSearchParams(
    source.kind === 'custom'
      ? { input: source.values.join(',') }
      : { preset: source.preset, n: String(source.size), seed: String(source.seed) },
  );
}

export function inputFor(source: InputSource, spec: ArrayInputSpec): number[] {
  return source.kind === 'custom' ? source.values : generateArray(source.preset, source.size, source.seed, spec);
}
