'use client';

import { useMemo, useState } from 'react';
import { FiShuffle } from 'react-icons/fi';
import { sorting } from '@/algorithms/sorting';
import { getVisualiserBySlug } from '@/data/visualisers';
import { ARRAY_PRESETS, PRESET_LABELS, generateArray, randomSeed, type ArrayPreset } from '@/engine/random';
import { recordTrace } from '@/engine/trace';
import type { ArrayState } from '@/viz/array/types';
import { GrowthChart } from './GrowthChart';
import { Race } from './Race';
import { MAX_SERIES, SERIES_COLORS, assignSlots, workOf } from './series';

const RANGE = { min: 1, max: 99 };
const NS = Array.from({ length: 16 }, (_, i) => (i + 1) * 4); // 4, 8, …, 64
const DEFAULT = ['bubble-sort', 'insertion-sort', 'merge-sort', 'quick-sort'];
const nameOf = (slug: string) => getVisualiserBySlug(slug)?.name ?? slug;

type Metric = 'work' | 'comparisons';

/** Races sorting algorithms on one input, and charts how their work grows with n. */
export function CompareLab() {
  const [selected, setSelected] = useState<string[]>(DEFAULT);
  const [slots, setSlots] = useState(() => assignSlots(DEFAULT, new Map()));
  const [preset, setPreset] = useState<ArrayPreset>('random');
  const [size, setSize] = useState(16);
  const [seed, setSeed] = useState(7);
  const [metric, setMetric] = useState<Metric>('work');

  const toggle = (slug: string) => {
    const next = selected.includes(slug) ? selected.filter((s) => s !== slug) : [...selected, slug];
    if (next.length === 0 || next.length > MAX_SERIES) return;
    // Keep the registry's order, so lanes don't jump around as you toggle.
    const ordered = sorting.map((a) => a.slug).filter((s) => next.includes(s));
    setSelected(ordered);
    setSlots(assignSlots(ordered, slots));
  };

  const input = useMemo(() => generateArray(preset, size, seed, RANGE), [preset, size, seed]);
  const runners = useMemo(
    () =>
      sorting
        .filter((a) => selected.includes(a.slug))
        .map((a) => ({ slug: a.slug, name: nameOf(a.slug), slot: slots.get(a.slug)!, trace: recordTrace<ArrayState>(a.run(input)) })),
    [selected, slots, input],
  );

  const growth = useMemo(
    () =>
      sorting
        .filter((a) => selected.includes(a.slug))
        .map((a) => ({
          slug: a.slug,
          name: nameOf(a.slug),
          slot: slots.get(a.slug)!,
          values: NS.map((n) => {
            const frames = recordTrace<ArrayState>(a.run(generateArray(preset, n, seed, RANGE))).frames;
            const stats = frames[frames.length - 1].stats;
            return metric === 'work' ? workOf(stats) : (stats.comparisons ?? 0);
          }),
        })),
    [selected, slots, preset, seed, metric],
  );
  const references = [
    { label: 'n²/2', values: NS.map((n) => (n * n) / 2) },
    { label: 'n log₂ n', values: NS.map((n) => n * Math.log2(n)) },
  ];

  return (
    <div className="space-y-6">
      {/* One row of controls scoping both the race and the chart. */}
      <div className="flex flex-col gap-4 rounded-xl border border-line-soft bg-surface p-4 shadow-xs">
        <fieldset>
          <legend className="mb-1.5 text-xs font-medium text-ink-muted">Algorithms (up to {MAX_SERIES})</legend>
          <div className="flex flex-wrap gap-1.5">
            {sorting.map((a) => {
              const on = selected.includes(a.slug);
              const full = !on && selected.length >= MAX_SERIES;
              return (
                <button
                  key={a.slug}
                  type="button"
                  aria-pressed={on}
                  disabled={full}
                  title={full ? `Remove one first: up to ${MAX_SERIES} at a time` : undefined}
                  onClick={() => toggle(a.slug)}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm transition-colors disabled:opacity-40 ${
                    on ? 'border-ink bg-ink text-surface' : 'border-line text-ink-soft hover:border-accent-line hover:bg-accent-soft'
                  }`}
                >
                  {on && <span className="h-0.5 w-3 rounded-full" style={{ background: SERIES_COLORS[slots.get(a.slug)!] }} aria-hidden />}
                  {nameOf(a.slug)}
                </button>
              );
            })}
          </div>
        </fieldset>
        <div className="flex flex-wrap items-end gap-6">
          <fieldset>
            <legend className="mb-1.5 text-xs font-medium text-ink-muted">Input shape</legend>
            <div className="flex flex-wrap gap-1.5">
              {ARRAY_PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-pressed={preset === p}
                  onClick={() => setPreset(p)}
                  className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                    preset === p ? 'border-accent bg-accent text-on-accent' : 'border-line text-ink-soft hover:border-accent-line hover:bg-accent-soft'
                  }`}
                >
                  {PRESET_LABELS[p]}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setSeed(randomSeed())}
                className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-sm text-ink-soft hover:border-accent-line hover:bg-accent-soft"
              >
                <FiShuffle aria-hidden /> New values
              </button>
            </div>
          </fieldset>
          <label className="flex flex-col gap-1.5 text-xs font-medium text-ink-muted">
            <span>
              Race size <span className="font-mono text-ink">{size}</span>
            </span>
            <input type="range" min={4} max={40} value={size} onChange={(e) => setSize(Number(e.target.value))} className="w-40 accent-accent" />
          </label>
        </div>
      </div>

      <section>
        <h2 className="mb-1 text-xl font-semibold text-ink">The race</h2>
        <p className="mb-3 max-w-3xl text-sm text-ink-soft">
          Every algorithm sorts the same {size} values. The clock counts work (comparisons, swaps and writes), not seconds, so
          each algorithm moves at the same rate of work and the one that needs the fewest operations finishes first.
        </p>
        <Race key={runners.map((r) => r.slug).join() + input.join()} runners={runners} />
      </section>

      <section className="rounded-xl border border-line-soft bg-surface p-4 shadow-xs">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-ink">How the work grows</h2>
            <p className="max-w-3xl text-sm text-ink-soft">
              {metric === 'work' ? 'Comparisons + swaps + writes' : 'Comparisons'} for {PRESET_LABELS[preset].toLowerCase()} input as n goes from 4 to 64.
              The grey curves are the exact functions n²/2 and n·log₂n for reference.
            </p>
          </div>
          <label className="flex items-center gap-2 text-xs text-ink-muted">
            Measure
            <select
              value={metric}
              onChange={(e) => setMetric(e.target.value as Metric)}
              className="rounded-md border border-line bg-surface px-2 py-1 text-ink-soft"
            >
              <option value="work">All operations</option>
              <option value="comparisons">Comparisons only</option>
            </select>
          </label>
        </div>
        <GrowthChart ns={NS} series={growth} references={references} metric={metric === 'work' ? 'Operations' : 'Comparisons'} />
      </section>
    </div>
  );
}
