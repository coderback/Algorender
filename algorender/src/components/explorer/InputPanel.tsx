'use client';

import { useState, type FormEvent } from 'react';
import { FiShuffle } from 'react-icons/fi';
import type { InputSpec } from '@/engine/module';
import { randomSeed } from '@/engine/random';
import type { InputSource } from './source';

export function InputPanel<I>({
  spec,
  source,
  onChange,
}: {
  spec: InputSpec<I>;
  source: InputSource;
  onChange: (next: InputSource) => void;
}) {
  const [text, setText] = useState(source.kind === 'custom' ? source.text : '');
  const [error, setError] = useState<string | null>(null);
  const activeExample = source.kind === 'example' ? source.example : null;
  // Fixed examples (sized: false) ignore the size, so the slider only shows for ones that use it.
  const showSize = spec.size != null && spec.examples.find((e) => e.id === activeExample)?.sized !== false && activeExample != null;
  const size = source.kind === 'example' ? source.size : (spec.size?.default ?? 0);
  // Keep the current values' seed when only the shape or size changes.
  const keepSeed = () => (source.kind === 'example' ? source.seed : randomSeed());

  const apply = (e: FormEvent) => {
    e.preventDefault();
    if (!spec.custom) return;
    const parsed = spec.custom.parse(text);
    if ('error' in parsed) {
      setError(parsed.error);
      return;
    }
    setError(null);
    // Store the canonical form, so the URL and the input box agree.
    const canonical = spec.custom.format(parsed.value);
    setText(canonical);
    onChange({ kind: 'custom', text: canonical });
  };

  return (
    <div className="@container rounded-xl border border-gray-100 bg-white p-4 shadow-xs">
      {/* Lays out by the panel's own width, so it also fits inside a lesson's narrower column. */}
      <div className="flex flex-col gap-4 @4xl:flex-row @4xl:items-end @4xl:gap-6">
      <fieldset className="min-w-0">
        <legend className="mb-1.5 text-xs font-medium text-gray-500">Input</legend>
        <div className="flex flex-wrap gap-1.5">
          {spec.examples.map((example) => (
            <button
              key={example.id}
              type="button"
              aria-pressed={activeExample === example.id}
              onClick={() => onChange({ kind: 'example', example: example.id, size, seed: keepSeed() })}
              className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                activeExample === example.id
                  ? 'border-blue-600 bg-blue-600 text-white'
                  : 'border-gray-200 text-gray-700 hover:border-blue-300 hover:bg-blue-50'
              }`}
            >
              {example.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() =>
              onChange({ kind: 'example', example: activeExample ?? spec.examples[0].id, size, seed: randomSeed() })
            }
            className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1 text-sm text-gray-700 hover:border-blue-300 hover:bg-blue-50"
          >
            <FiShuffle aria-hidden /> New values
          </button>
        </div>
      </fieldset>

      {spec.size && showSize && (
        <label className="flex shrink-0 flex-col gap-1.5 text-xs font-medium text-gray-500">
          <span>
            {spec.size.label} <span className="font-mono text-gray-800">{size}</span>
          </span>
          <input
            type="range"
            min={spec.size.min}
            max={spec.size.max}
            value={size}
            onChange={(e) =>
              onChange({
                kind: 'example',
                example: activeExample ?? spec.examples[0].id,
                size: Number(e.target.value),
                seed: keepSeed(),
              })
            }
            className="w-40 accent-blue-600"
          />
        </label>
      )}

      {spec.custom && (
        <form onSubmit={apply} className="flex min-w-0 flex-1 flex-col gap-1.5">
          <label htmlFor="custom-input" className="text-xs font-medium text-gray-500">
            {spec.custom.label}
          </label>
          <div className="flex gap-2">
            <input
              id="custom-input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={spec.custom.placeholder}
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
      )}
      </div>
    </div>
  );
}
