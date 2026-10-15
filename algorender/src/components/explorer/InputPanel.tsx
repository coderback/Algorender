'use client';

import { useState, type FormEvent } from 'react';
import { FiShuffle } from 'react-icons/fi';
import { ARRAY_PRESETS, PRESET_LABELS, parseArrayInput, randomSeed, type ArrayInputSpec } from '@/engine/random';
import type { InputSource } from './source';

export function InputPanel({
  spec,
  source,
  onChange,
}: {
  spec: ArrayInputSpec;
  source: InputSource;
  onChange: (next: InputSource) => void;
}) {
  const [text, setText] = useState(source.kind === 'custom' ? source.values.join(', ') : '');
  const [error, setError] = useState<string | null>(null);
  const size = source.kind === 'preset' ? source.size : source.values.length;
  const activePreset = source.kind === 'preset' ? source.preset : null;
  // Keep the current values' seed when only the shape or size changes.
  const keepSeed = () => (source.kind === 'preset' ? source.seed : randomSeed());

  const apply = (e: FormEvent) => {
    e.preventDefault();
    const parsed = parseArrayInput(text, spec);
    if ('error' in parsed) {
      setError(parsed.error);
      return;
    }
    setError(null);
    onChange({ kind: 'custom', values: parsed.values });
  };

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-gray-100 bg-white p-4 shadow-xs lg:flex-row lg:items-end lg:gap-6">
      <fieldset className="min-w-0">
        <legend className="mb-1.5 text-xs font-medium text-gray-500">Input</legend>
        <div className="flex flex-wrap gap-1.5">
          {ARRAY_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              aria-pressed={activePreset === preset}
              onClick={() => onChange({ kind: 'preset', preset, size, seed: keepSeed() })}
              className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                activePreset === preset
                  ? 'border-blue-600 bg-blue-600 text-white'
                  : 'border-gray-200 text-gray-700 hover:border-blue-300 hover:bg-blue-50'
              }`}
            >
              {PRESET_LABELS[preset]}
            </button>
          ))}
          <button
            type="button"
            onClick={() => onChange({ kind: 'preset', preset: activePreset ?? 'random', size, seed: randomSeed() })}
            className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1 text-sm text-gray-700 hover:border-blue-300 hover:bg-blue-50"
          >
            <FiShuffle aria-hidden /> New values
          </button>
        </div>
      </fieldset>

      <label className="flex shrink-0 flex-col gap-1.5 text-xs font-medium text-gray-500">
        <span>
          Size <span className="font-mono text-gray-800">{size}</span>
        </span>
        <input
          type="range"
          min={2}
          max={spec.maxSize}
          value={size}
          onChange={(e) =>
            onChange({
              kind: 'preset',
              preset: activePreset ?? 'random',
              size: Number(e.target.value),
              seed: keepSeed(),
            })
          }
          className="w-40 accent-blue-600"
        />
      </label>

      <form onSubmit={apply} className="flex min-w-0 flex-1 flex-col gap-1.5">
        <label htmlFor="custom-input" className="text-xs font-medium text-gray-500">
          Your own values ({spec.min}–{spec.max}, up to {spec.maxSize})
        </label>
        <div className="flex gap-2">
          <input
            id="custom-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. 42, 7, 19, 3"
            aria-invalid={error != null}
            aria-describedby={error ? 'custom-input-error' : undefined}
            className="min-w-0 flex-1 rounded-md border border-gray-200 px-3 py-1.5 font-mono text-sm focus:border-blue-500 focus:outline-none"
          />
          <button type="submit" className="rounded-md bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-700">
            Run
          </button>
        </div>
        {error && (
          <p id="custom-input-error" role="alert" className="text-xs text-red-600">
            {error}
          </p>
        )}
      </form>
    </div>
  );
}
