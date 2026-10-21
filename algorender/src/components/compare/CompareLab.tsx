'use client';

import { useMemo, useState } from 'react';
import { FiShuffle } from 'react-icons/fi';
import { sorting } from '@/algorithms/sorting';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card, FeatureCard } from '@/components/ui/Card';
import { cx } from '@/components/ui/cx';
import { Segmented } from '@/components/ui/Segmented';
import { getVisualiserBySlug } from '@/data/visualisers';
import { ARRAY_PRESETS, PRESET_LABELS, generateArray, randomSeed, type ArrayPreset } from '@/engine/random';
import { recordTrace } from '@/engine/trace';
import type { ArrayState } from '@/viz/array/types';
import { GrowthChart, type GrowthSeries } from './GrowthChart';
import { Race } from './Race';
import { MAX_SERIES, SERIES_COLORS, assignSlots, workOf } from './series';

const RANGE = { min: 1, max: 99 };
const NS = Array.from({ length: 16 }, (_, i) => (i + 1) * 4); // 4, 8, …, 64
const DEFAULT = ['bubble-sort', 'insertion-sort', 'merge-sort', 'quick-sort'];
const nameOf = (slug: string) => getVisualiserBySlug(slug)?.name ?? slug;
const costOf = (slug: string): string | undefined => {
  const v = getVisualiserBySlug(slug);
  return v && 'timeComplexity' in v ? v.timeComplexity.average : undefined;
};

type Metric = 'work' | 'comparisons';

/** Races sorting algorithms on one input, and charts how their work grows with n. */
export function CompareLab() {
  const [selected, setSelected] = useState<string[]>(DEFAULT);
  const [slots, setSlots] = useState(() => assignSlots(DEFAULT, new Map()));
  const [preset, setPreset] = useState<ArrayPreset>('random');
  const [size, setSize] = useState(16);
  const [seed, setSeed] = useState(7);
  const [metric, setMetric] = useState<Metric>('work');
  const [cursor, setCursor] = useState<number | null>(null);

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
        .map((a) => ({
          slug: a.slug,
          name: nameOf(a.slug),
          bigO: costOf(a.slug),
          slot: slots.get(a.slug)!,
          trace: recordTrace<ArrayState>(a.run(input)),
        })),
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
    <div className="flex flex-col gap-4">
      {/* One card of controls scoping both the race and the chart. */}
      <Card dense className="gap-5">
        <fieldset>
          <legend className="mb-2.5 text-[13px] font-semibold text-ink">Algorithms (up to {MAX_SERIES})</legend>
          <div className="flex flex-wrap gap-2">
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
                  className={cx(
                    'inline-flex h-10 items-center gap-2 rounded-full px-3.5 text-[13px] font-semibold transition-colors duration-150 ease-standard disabled:opacity-45',
                    on ? 'bg-primary text-on-primary' : 'bg-sunken text-ink-soft hover:text-ink',
                  )}
                >
                  <span
                    aria-hidden
                    className={cx('size-2.5 rounded-full', !on && 'bg-ink-faint')}
                    style={on ? { background: SERIES_COLORS[slots.get(a.slug)!] } : undefined}
                  />
                  {nameOf(a.slug)}
                </button>
              );
            })}
          </div>
        </fieldset>
        <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
          <label className="flex min-w-60 flex-[1_1_260px] flex-col gap-2 text-[13px] font-semibold text-ink">
            Race size
            <span className="flex items-center gap-3">
              <input type="range" min={4} max={40} value={size} onChange={(e) => setSize(Number(e.target.value))} className="h-7 w-full min-w-0 accent-accent" />
              <span className="shrink-0 font-mono text-[15px] text-ink tabular-nums">n = {size}</span>
            </span>
          </label>
          <div className="flex min-w-0 flex-col gap-2">
            <span className="text-[13px] font-semibold text-ink">Input shape</span>
            <Segmented label="Input shape" value={preset} onChange={setPreset} options={ARRAY_PRESETS.map((p) => ({ value: p, label: PRESET_LABELS[p] }))} />
          </div>
          <Button kind="secondary" icon={<FiShuffle aria-hidden />} onClick={() => setSeed(randomSeed())}>
            New input
          </Button>
        </div>
      </Card>

      <section aria-labelledby="race-h" className="flex flex-col gap-3">
        <div className="flex flex-col gap-1 px-1">
          <h2 id="race-h" className="font-display text-title-card">
            The race
          </h2>
          <p className="max-w-3xl text-sm text-ink-muted">
            Every algorithm sorts the same {size} values. The clock counts work (comparisons, swaps and writes), not seconds, so the
            one that needs the fewest operations finishes first.
          </p>
        </div>
        <Race key={runners.map((r) => r.slug).join() + input.join()} runners={runners} />
      </section>

      <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,440px)]">
        <Card className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <h2 className="font-display text-title-card">How the work grows</h2>
              <p className="max-w-2xl text-[13px] text-ink-muted">
                {metric === 'work' ? 'Comparisons + swaps + writes' : 'Comparisons'} for {PRESET_LABELS[preset].toLowerCase()} input as n goes from 4 to 64.
                The thin curves are n²/2 and n·log₂n for reference.
              </p>
            </div>
            <label className="flex items-center gap-2 text-[13px] text-ink-soft">
              Measure
              <select value={metric} onChange={(e) => setMetric(e.target.value as Metric)} className="h-10 rounded-full bg-sunken px-3 text-[13px] font-semibold text-ink">
                <option value="work">All operations</option>
                <option value="comparisons">Comparisons only</option>
              </select>
            </label>
          </div>
          <GrowthChart ns={NS} series={growth} references={references} metric={metric === 'work' ? 'Operations' : 'Comparisons'} onHover={setCursor} />
        </Card>
        <AtCursor series={growth} index={cursor ?? NS.length - 1} unit={metric === 'work' ? 'operations' : 'comparisons'} />
      </div>
    </div>
  );
}

/** Two significant figures, so "about" reads honestly: 1,984 → 2,000. */
function about(v: number): string {
  if (v < 100) return String(Math.round(v));
  const p = 10 ** (Math.floor(Math.log10(v)) - 1);
  return (Math.round(v / p) * p).toLocaleString('en-GB');
}

/** The feature card: what the chart says at the crosshair (or the largest n), from the series themselves. */
function AtCursor({ series, index, unit }: { series: readonly GrowthSeries[]; index: number; unit: string }) {
  const n = NS[index];
  const ranked = [...series].sort((a, b) => b.values[index] - a.values[index]);
  const most = ranked[0];
  const least = ranked.at(-1);
  const half = NS.indexOf(n / 2);
  const growth = (s: GrowthSeries) => (half >= 0 && s.values[half] > 0 ? s.values[index] / s.values[half] : null);
  const gm = most && growth(most);
  const gl = least && growth(least);
  return (
    <FeatureCard aria-live="polite" className="justify-between gap-6">
      <div className="flex flex-col gap-3">
        <span className="text-eyebrow font-semibold text-feature-accent uppercase">At n = {n}</span>
        {most && least && (
          <p className="font-display text-[26px] leading-tight font-semibold">
            {most.name} makes about {about(most.values[index])} {unit}.
            {least !== most && ` ${least.name} makes about ${about(least.values[index])}.`}
          </p>
        )}
        {most && least && least !== most && gm != null && gl != null && (
          <p className="text-sm text-feature-muted">
            Double n from {n / 2} to {n} and {most.name.toLowerCase()}&apos;s work grows ×{gm.toFixed(1)}; {least.name.toLowerCase()}&apos;s grows ×{gl.toFixed(1)}.
          </p>
        )}
      </div>
      <ButtonLink href="/learn#big-o" kind="onFeature" block>
        Why: Big-O and growth
      </ButtonLink>
    </FeatureCard>
  );
}
