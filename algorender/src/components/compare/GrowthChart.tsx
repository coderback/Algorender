'use client';

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';
import { SERIES_COLORS } from './series';

export type GrowthSeries = { slug: string; name: string; slot: number; values: readonly number[] };
export type Reference = { label: string; values: readonly number[] };

const HEIGHT = 320;
const MARGIN = { top: 16, right: 116, bottom: 40, left: 52 };
const LABEL_GAP = 16;
/** Pixels between x-axis labels' centres, so two- and three-digit sizes never touch. */
const MIN_LABEL_SPACE = 28;

/**
 * Operations vs input size, one 2px line per algorithm plus exact reference
 * curves (thin, muted). Legend above, direct labels at line ends when they
 * don't collide, a crosshair tooltip (pointer and arrow keys), and a table view,
 * so no value is reachable only by hovering.
 */
export function GrowthChart({
  ns,
  series,
  references,
  metric,
  onHover,
}: {
  ns: readonly number[];
  series: readonly GrowthSeries[];
  references: readonly Reference[];
  metric: string;
  /** Called with the index of n under the crosshair, or null when it leaves. */
  onHover?: (index: number | null) => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const width = useWidth(boxRef, 640);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    onHover?.(hover);
  }, [hover, onHover]);
  const [showTable, setShowTable] = useState(false);

  const innerW = Math.max(120, width - MARGIN.left - MARGIN.right);
  const innerH = HEIGHT - MARGIN.top - MARGIN.bottom;
  const allValues = [...series.flatMap((s) => s.values), ...references.flatMap((r) => r.values)];
  const ticks = niceTicks(Math.max(1, ...allValues));
  const yMax = ticks[ticks.length - 1];
  const nMin = ns[0];
  const nMax = ns[ns.length - 1];
  const x = (n: number) => ((n - nMin) / Math.max(1, nMax - nMin)) * innerW;
  const y = (v: number) => innerH - (v / yMax) * innerH;
  const path = (values: readonly number[]) => values.map((v, i) => `${i ? 'L' : 'M'}${x(ns[i]).toFixed(1)},${y(v).toFixed(1)}`).join('');

  // Direct labels at line ends, skipping any that would collide (the legend and tooltip cover those).
  const ends = [
    ...series.map((s) => ({ key: s.slug, text: s.name, y: y(s.values.at(-1) ?? 0), muted: false })),
    ...references.map((r) => ({ key: r.label, text: r.label, y: y(r.values.at(-1) ?? 0), muted: true })),
  ].sort((a, b) => a.y - b.y);
  const labelled = new Set<string>();
  let lastY = -Infinity;
  for (const e of ends) {
    if (e.y - lastY >= LABEL_GAP) {
      labelled.add(e.key);
      lastY = e.y;
    }
  }

  const nearest = (clientX: number, rect: DOMRect) => {
    const px = clientX - rect.left - MARGIN.left;
    let best = 0;
    ns.forEach((n, i) => {
      if (Math.abs(x(n) - px) < Math.abs(x(ns[best]) - px)) best = i;
    });
    return best;
  };
  const onPointer = (e: PointerEvent<SVGRectElement>) => setHover(nearest(e.clientX, e.currentTarget.ownerSVGElement!.getBoundingClientRect()));
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') setHover((h) => Math.min(ns.length - 1, (h ?? -1) + 1));
    else if (e.key === 'ArrowLeft') setHover((h) => Math.max(0, (h ?? ns.length) - 1));
    else if (e.key === 'Escape') setHover(null);
    else return;
    e.preventDefault();
  };

  const tipLeft = hover == null ? 0 : MARGIN.left + x(ns[hover]);
  const flip = tipLeft > width - 200;

  return (
    <div>
      <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-soft" aria-label="Legend">
        {series.map((s) => (
          <li key={s.slug} className="flex items-center gap-2">
            <span className="h-0.5 w-4 rounded-full" style={{ background: SERIES_COLORS[s.slot] }} aria-hidden />
            {s.name}
          </li>
        ))}
        {references.map((r) => (
          <li key={r.label} className="flex items-center gap-2 text-ink-muted">
            <span className="h-px w-4 bg-ink-faint" aria-hidden />
            {r.label} (reference)
          </li>
        ))}
      </ul>

      <div ref={boxRef} className="relative">
        <svg width={width} height={HEIGHT} className="block max-w-full" role="group" aria-label={`${metric} against input size n, for ${series.map((s) => s.name).join(', ')}`}>
          <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={0} x2={innerW} y1={y(t)} y2={y(t)} className="stroke-line" strokeWidth={1} />
                <text x={-8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-ink-muted text-[11px] tabular-nums">
                  {compact(t)}
                </text>
              </g>
            ))}
            {/* Every few sizes and the last, leaving out one that would crowd the last on a narrow chart. */}
            {ns.filter((n, i) => n === nMax || (i % Math.ceil(ns.length / 8) === 0 && x(nMax) - x(n) >= MIN_LABEL_SPACE)).map((n) => (
              <text key={n} x={x(n)} y={innerH + 18} textAnchor="middle" className="fill-ink-muted text-[11px] tabular-nums">
                {n}
              </text>
            ))}
            <text x={innerW / 2} y={innerH + 34} textAnchor="middle" className="fill-ink-muted text-[11px]">
              input size n
            </text>
            <line x1={0} x2={innerW} y1={innerH} y2={innerH} className="stroke-line-strong" strokeWidth={1} />

            {references.map((r) => (
              <path key={r.label} d={path(r.values)} fill="none" className="stroke-ink-faint" strokeWidth={1} />
            ))}
            {series.map((s) => (
              <path
                key={s.slug}
                d={path(s.values)}
                fill="none"
                style={{ stroke: SERIES_COLORS[s.slot] }}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))}
            {series.map((s) => (
              <circle
                key={s.slug}
                cx={x(nMax)}
                cy={y(s.values.at(-1) ?? 0)}
                r={4}
                style={{ fill: SERIES_COLORS[s.slot] }}
                className="stroke-surface"
                strokeWidth={2}
              />
            ))}
            {ends
              .filter((e) => labelled.has(e.key))
              .map((e) => (
                <text
                  key={e.key}
                  x={innerW + 10}
                  y={e.y}
                  dy="0.32em"
                  className={`text-[12px] ${e.muted ? 'fill-ink-muted' : 'fill-ink'}`}
                >
                  {e.text}
                </text>
              ))}

            {hover != null && (
              <>
                <line x1={x(ns[hover])} x2={x(ns[hover])} y1={0} y2={innerH} className="stroke-ink-faint" strokeWidth={1} />
                {series.map((s) => (
                  <circle
                    key={s.slug}
                    cx={x(ns[hover])}
                    cy={y(s.values[hover])}
                    r={4}
                    style={{ fill: SERIES_COLORS[s.slot] }}
                    className="stroke-surface"
                    strokeWidth={2}
                  />
                ))}
              </>
            )}
            <rect
              width={innerW}
              height={innerH}
              fill="transparent"
              tabIndex={0}
              role="slider"
              aria-label="Input size: use the left and right arrow keys to read each value"
              aria-valuemin={nMin}
              aria-valuemax={nMax}
              aria-valuenow={ns[hover ?? ns.length - 1]}
              aria-valuetext={`n = ${ns[hover ?? ns.length - 1]}`}
              className="cursor-crosshair outline-none focus-visible:outline-2 focus-visible:outline-accent"
              onPointerMove={onPointer}
              onPointerLeave={() => setHover(null)}
              onFocus={() => setHover((h) => h ?? ns.length - 1)}
              onBlur={() => setHover(null)}
              onKeyDown={onKey}
            />
          </g>
        </svg>

        {hover != null && (
          <div
            className="pointer-events-none absolute z-10 min-w-40 rounded-well bg-surface px-3 py-2 text-sm shadow-segment ring-1 ring-line"
            style={{ top: MARGIN.top, left: flip ? undefined : tipLeft + 12, right: flip ? width - tipLeft + 12 : undefined }}
            role="status"
          >
            <div className="mb-1 text-xs text-ink-muted">n = {ns[hover]}</div>
            {[...series]
              .sort((a, b) => b.values[hover] - a.values[hover])
              .map((s) => (
                <div key={s.slug} className="flex items-center gap-2">
                  <span className="h-0.5 w-3 rounded-full" style={{ background: SERIES_COLORS[s.slot] }} aria-hidden />
                  <span className="font-semibold tabular-nums text-ink">{s.values[hover].toLocaleString()}</span>
                  <span className="text-ink-muted">{s.name}</span>
                </div>
              ))}
            {references.map((r) => (
              <div key={r.label} className="flex items-center gap-2 text-ink-muted">
                <span className="h-px w-3 bg-ink-faint" aria-hidden />
                <span className="tabular-nums">{Math.round(r.values[hover]).toLocaleString()}</span>
                <span>{r.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => setShowTable((v) => !v)}
        aria-expanded={showTable}
        className="mt-2 text-xs font-semibold text-accent-ink hover:underline"
      >
        {showTable ? 'Hide table' : 'Show as a table'}
      </button>
      {showTable && (
        <div className="mt-2 max-h-80 overflow-auto rounded-well bg-subtle">
          <table className="w-full text-right text-sm tabular-nums">
            <caption className="sr-only">{metric} by input size</caption>
            <thead className="sticky top-0 bg-sunken text-xs text-ink-muted">
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-medium">n</th>
                {series.map((s) => (
                  <th key={s.slug} scope="col" className="px-3 py-2 font-medium">{s.name}</th>
                ))}
                {references.map((r) => (
                  <th key={r.label} scope="col" className="px-3 py-2 font-medium">{r.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ns.map((n, i) => (
                <tr key={n} className="border-t border-line-soft">
                  <th scope="row" className="px-3 py-1.5 text-left font-medium text-ink-soft">{n}</th>
                  {series.map((s) => (
                    <td key={s.slug} className="px-3 py-1.5 text-ink">{s.values[i].toLocaleString()}</td>
                  ))}
                  {references.map((r) => (
                    <td key={r.label} className="px-3 py-1.5 text-ink-muted">{Math.round(r.values[i]).toLocaleString()}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function useWidth(ref: RefObject<HTMLDivElement | null>, fallback: number) {
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}

/** 4–6 round ticks from 0 to just above `max`. */
function niceTicks(max: number): number[] {
  const rough = max / 5;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= rough)!;
  const top = Math.ceil(max / step) * step;
  return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
}

function compact(v: number): string {
  return v >= 1000 ? `${+(v / 1000).toFixed(1)}K` : String(v);
}
