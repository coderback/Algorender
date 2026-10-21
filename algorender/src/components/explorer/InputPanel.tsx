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
    <div className="@container rounded-card bg-surface p-5">
      {/* Lays out by the panel's own width, so it also fits inside a lesson's narrower column. It wraps, so many examples push the custom input onto its own line instead of squeezing it. */}
      <div className="flex flex-col gap-4 @4xl:flex-row @4xl:flex-wrap @4xl:items-end @4xl:gap-6">
      <fieldset className="min-w-0">
        <legend className="mb-2 text-[13px] font-semibold text-ink">Input</legend>
        <div className="flex flex-wrap gap-1.5">
          {spec.examples.map((example) => (
            <button
              key={example.id}
              type="button"
              aria-pressed={activeExample === example.id}
              onClick={() => onChange({ kind: 'example', example: example.id, size, seed: keepSeed() })}
              className={`h-9 rounded-full px-3.5 text-[13px] font-semibold transition-colors duration-150 ease-standard ${
                activeExample === example.id ? 'bg-primary text-on-primary' : 'bg-sunken text-ink hover:bg-line-soft'
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
            className="inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold text-ink ring-[1.5px] ring-line ring-inset transition-shadow duration-150 ease-standard hover:ring-line-strong"
          >
            <FiShuffle aria-hidden /> New values
          </button>
        </div>
      </fieldset>

      {spec.size && showSize && (
        <label className="flex shrink-0 flex-col gap-2 text-[13px] font-semibold text-ink">
          <span>
            {spec.size.label} <span className="font-mono text-ink">{size}</span>
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
            className="w-40 accent-accent"
          />
        </label>
      )}

      {spec.custom && (
        <form onSubmit={apply} className="flex min-w-0 flex-1 flex-col gap-1.5 @4xl:min-w-80">
          <label htmlFor="custom-input" className="text-[13px] font-semibold text-ink">
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
              className="h-11 min-w-0 flex-1 rounded-[16px] bg-sunken px-4 font-mono text-sm text-ink placeholder:text-ink-muted aria-invalid:ring-[1.5px] aria-invalid:ring-bad-ink aria-invalid:ring-inset"
            />
            <button type="submit" className="h-11 shrink-0 rounded-full bg-accent px-[18px] text-sm font-semibold text-on-accent transition-colors duration-150 ease-standard hover:bg-accent-strong">
              Run
            </button>
          </div>
          {error && (
            <p id="custom-input-error" role="alert" className="text-xs text-bad-ink">
              {error}
            </p>
          )}
        </form>
      )}
      </div>
    </div>
  );
}
