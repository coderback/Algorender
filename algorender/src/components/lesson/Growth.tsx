'use client';

import { useMemo, useState } from 'react';
import { GrowthChart } from '@/components/compare/GrowthChart';
import { about } from '@/components/compare/series';
import { getVisualiserBySlug } from '@/data/visualisers';
import { CURVES, measure, sizesUpTo, type Curve } from './measure';

/**
 * How work grows with n, measured rather than claimed: each algorithm runs on
 * one of its own examples at every size, and the chart plots a stat from the
 * end of the run against reference curves. Under it, what the chart says at
 * the crosshair (or the largest n), with the doubling test.
 */
export function Growth({
  algorithms,
  example,
  stat,
  label,
  max,
  step,
  curves = [],
  seed = 7,
  caption,
}: {
  /** Up to four algorithm slugs. */
  algorithms: string[];
  /** The example each one runs on, by id (e.g. "random", "absent"). */
  example: string;
  /** The stat to plot, by key (e.g. "comparisons", "probes"). */
  stat: string;
  /** The stat's name in the chart and the readout, plural (e.g. "Comparisons"). */
  label: string;
  max: number;
  step: number;
  curves?: Curve[];
  seed?: number;
  caption?: string;
}) {
  const ns = useMemo(() => sizesUpTo(max, step), [max, step]);
  // MDX passes a new array every render, so measure by the slugs, not the array.
  const slugs = algorithms.join(',');
  const series = useMemo(
    () =>
      slugs.split(',').map((slug, slot) => ({
        slug,
        slot,
        name: getVisualiserBySlug(slug)?.name ?? slug,
        values: measure(slug, example, stat, ns, seed),
      })),
    [slugs, example, stat, ns, seed],
  );
  const references = curves.map((c) => ({ label: c, values: ns.map(CURVES[c]) }));
  const [cursor, setCursor] = useState<number | null>(null);
  const index = cursor ?? ns.length - 1;
  const n = ns[index];
  const half = ns.indexOf(n / 2);
  const unit = label.toLowerCase();

  return (
    <figure className="not-prose flex flex-col gap-3 rounded-card bg-surface p-4 sm:p-5">
      <GrowthChart ns={ns} series={series} references={references} metric={label} onHover={setCursor} />
      <div aria-live="polite" className="flex flex-col gap-1 rounded-well bg-subtle px-4 py-3 text-sm text-ink-soft">
        <span className="font-semibold text-ink">At n = {n}</span>
        {series.map((s) => {
          const ratio = half >= 0 && s.values[half] > 0 ? s.values[index] / s.values[half] : null;
          return (
            <span key={s.slug}>
              {s.name}: about {about(s.values[index])} {unit}
              {ratio != null && `, ×${ratio.toFixed(1)} from n = ${n / 2}`}
            </span>
          );
        })}
      </div>
      {caption && <figcaption className="px-1 text-[13px] text-ink-muted">{caption}</figcaption>}
    </figure>
  );
}
