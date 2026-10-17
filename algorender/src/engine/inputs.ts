import type { InputSpec } from './module';
import { ARRAY_PRESETS, PRESET_LABELS, generateArray, parseArrayInput } from './random';

/** Input spec for "an array of integers": shaped presets, a size slider and free-form entry. */
export function arrayInput({
  min,
  max,
  defaultSize,
  maxSize,
}: {
  min: number;
  max: number;
  defaultSize: number;
  maxSize: number;
}): InputSpec<number[]> {
  const [first, ...rest] = ARRAY_PRESETS.map((preset) => ({
    id: preset,
    label: PRESET_LABELS[preset],
    make: ({ seed, size }: { seed: number; size: number }) => generateArray(preset, size, seed, { min, max }),
  }));
  return {
    examples: [first, ...rest],
    size: { label: 'Size', min: 2, max: maxSize, default: defaultSize },
    custom: {
      label: `Your own values (${min}–${max}, up to ${maxSize})`,
      placeholder: 'e.g. 42, 7, 19, 3',
      parse: (text) => {
        const parsed = parseArrayInput(text, { min, max, maxSize });
        return 'error' in parsed ? parsed : { value: parsed.values };
      },
      format: (values) => values.join(','),
    },
  };
}
