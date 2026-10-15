'use client';

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';
import { SERIES_COLORS } from './series';

export type GrowthSeries = { slug: string; name: string; slot: number; values: readonly number[] };
export type Reference = { label: string; values: readonly number[] };

const HEIGHT = 320;
const MARGIN = { top: 16, right: 116, bottom: 40, left: 52 };
const LABEL_GAP = 16;

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
}: {
  ns: readonly number[];
  series: readonly GrowthSeries[];
  references: readonly Reference[];
  metric: string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const width = useWidth(boxRef, 640);
  const [hover, setHover] = useState<number | null>(null);
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
      <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-700" aria-label="Legend">
        {series.map((s) => (
          <li key={s.slug} className="flex items-center gap-2">
            <span className="h-0.5 w-4 rounded-full" style={{ background: SERIES_COLORS[s.slot] }} aria-hidden />
            {s.name}
          </li>
        ))}
        {references.map((r) => (
          <li key={r.label} className="flex items-center gap-2 text-gray-500">
            <span className="h-px w-4 bg-gray-400" aria-hidden />
            {r.label} (reference)
          </li>
        ))}
      </ul>

      <div ref={boxRef} className="relative">
        <svg width={width} height={HEIGHT} role="img" aria-label={`${metric} against input size n, for ${series.map((s) => s.name).join(', ')}`}>
          <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={0} x2={innerW} y1={y(t)} y2={y(t)} className="stroke-gray-200" strokeWidth={1} />
                <text x={-8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-gray-500 text-[11px] tabular-nums">
                  {compact(t)}
                </text>
              </g>
            ))}
            {ns.filter((n, i) => i % Math.ceil(ns.length / 8) === 0 || n === nMax).map((n) => (
              <text key={n} x={x(n)} y={innerH + 18} textAnchor="middle" className="fill-gray-500 text-[11px] tabular-nums">
                {n}
              </text>
            ))}
            <text x={innerW / 2} y={innerH + 34} textAnchor="middle" className="fill-gray-500 text-[11px]">
              input size n
            </text>
            <line x1={0} x2={innerW} y1={innerH} y2={innerH} className="stroke-gray-300" strokeWidth={1} />

            {references.map((r) => (
              <path key={r.label} d={path(r.values)} fill="none" className="stroke-gray-400" strokeWidth={1} />
            ))}
            {series.map((s) => (
              <path
                key={s.slug}
                d={path(s.values)}
                fill="none"
                stroke={SERIES_COLORS[s.slot]}
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
                fill={SERIES_COLORS[s.slot]}
                className="stroke-white"
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
                  className={`text-[12px] ${e.muted ? 'fill-gray-500' : 'fill-gray-800'}`}
                >
                  {e.text}
                </text>
              ))}

            {hover != null && (
              <>
                <line x1={x(ns[hover])} x2={x(ns[hover])} y1={0} y2={innerH} className="stroke-gray-400" strokeWidth={1} />
                {series.map((s) => (
                  <circle
                    key={s.slug}
                    cx={x(ns[hover])}
                    cy={y(s.values[hover])}
                    r={4}
                    fill={SERIES_COLORS[s.slot]}
                    className="stroke-white"
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
              aria-label="Chart values: use the left and right arrow keys to read each input size"
              className="cursor-crosshair outline-none focus-visible:outline-2 focus-visible:outline-blue-600"
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
            className="pointer-events-none absolute z-10 min-w-40 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-md"
            style={{ top: MARGIN.top, left: flip ? undefined : tipLeft + 12, right: flip ? width - tipLeft + 12 : undefined }}
            role="status"
          >
            <div className="mb-1 text-xs text-gray-500">n = {ns[hover]}</div>
            {[...series]
              .sort((a, b) => b.values[hover] - a.values[hover])
              .map((s) => (
                <div key={s.slug} className="flex items-center gap-2">
                  <span className="h-0.5 w-3 rounded-full" style={{ background: SERIES_COLORS[s.slot] }} aria-hidden />
                  <span className="font-semibold tabular-nums text-gray-900">{s.values[hover].toLocaleString()}</span>
                  <span className="text-gray-500">{s.name}</span>
                </div>
              ))}
            {references.map((r) => (
              <div key={r.label} className="flex items-center gap-2 text-gray-500">
                <span className="h-px w-3 bg-gray-400" aria-hidden />
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
        className="mt-2 text-xs text-blue-700 hover:text-blue-900"
      >
        {showTable ? 'Hide table' : 'Show as a table'}
      </button>
      {showTable && (
        <div className="mt-2 max-h-80 overflow-auto rounded-lg border border-gray-100">
          <table className="w-full text-right text-sm tabular-nums">
            <caption className="sr-only">{metric} by input size</caption>
            <thead className="sticky top-0 bg-gray-50 text-xs text-gray-500">
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
                <tr key={n} className="border-t border-gray-100">
                  <th scope="row" className="px-3 py-1.5 text-left font-medium text-gray-700">{n}</th>
                  {series.map((s) => (
                    <td key={s.slug} className="px-3 py-1.5 text-gray-900">{s.values[i].toLocaleString()}</td>
                  ))}
                  {references.map((r) => (
                    <td key={r.label} className="px-3 py-1.5 text-gray-500">{Math.round(r.values[i]).toLocaleString()}</td>
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
