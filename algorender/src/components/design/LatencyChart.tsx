'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { Bucket } from '@/systems/design/types';
import { ms } from './format';

const HEIGHT = 220;
const ERR_BAND = 28;
const M = { top: 12, right: 16, bottom: 34, left: 52 };

/** 4–6 round ticks from 0 to just above `max`. */
function niceTicks(max: number): number[] {
  const rough = Math.max(max, 1) / 5;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= rough)!;
  const top = Math.ceil(Math.max(max, 1) / step) * step;
  return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => +(i * step).toFixed(6));
}

/** In words, for screen readers and the image's label. */
export function chartSummary(series: readonly Bucket[]): string {
  if (series.length === 0) return 'No traffic was recorded.';
  const p99s = series.map((b) => b.p99).filter(Number.isFinite);
  const withErrors = series.filter((b) => b.errors > 0).length;
  const range = p99s.length ? `p99 latency ran from ${ms(Math.min(...p99s))} to ${ms(Math.max(...p99s))}` : 'No request succeeded';
  return `${range} over ${series.length} intervals; requests failed in ${withErrors === 0 ? 'none' : withErrors} of them.`;
}

/**
 * p50 and p99 latency over the run, one point per interval, with failed
 * requests as bars in a band underneath. The chart is an image with a
 * summary; the numbers are also in a table for screen readers.
 */
export function LatencyChart({ series, bucketSeconds }: { series: readonly Bucket[]; bucketSeconds: number }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(560);
  const titleId = useId();
  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(260, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const innerW = width - M.left - M.right;
  const innerH = HEIGHT - M.top - M.bottom - ERR_BAND;
  const finite = series.flatMap((b) => [b.p50, b.p99]).filter(Number.isFinite);
  const ticks = niceTicks(Math.max(1, ...finite));
  const yMax = ticks.at(-1)!;
  const tEnd = series.length * bucketSeconds;
  const x = (t: number) => (t / Math.max(tEnd, bucketSeconds)) * innerW;
  const y = (v: number) => innerH - (Math.min(v, yMax) / yMax) * innerH;
  const errMax = Math.max(1, ...series.map((b) => b.errors));
  const line = (key: 'p50' | 'p99') =>
    series
      .map((b, i) => (Number.isFinite(b[key]) ? `${i && Number.isFinite(series[i - 1][key]) ? 'L' : 'M'}${x(b.t + bucketSeconds / 2).toFixed(1)},${y(b[key]).toFixed(1)}` : ''))
      .join('');
  const barW = Math.max(1, x(bucketSeconds) - 2);
  const summary = chartSummary(series);

  return (
    <figure className="space-y-2">
      <figcaption id={titleId} className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-soft">
        <span className="font-medium text-ink">Latency over time</span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-0.5 w-4 rounded-full" style={{ background: 'var(--color-series-1)' }} /> p50
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-0.5 w-4 rounded-full" style={{ background: 'var(--color-series-2)' }} /> p99
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-2.5 rounded-sm bg-bad-ink" /> failed requests
        </span>
      </figcaption>
      <div ref={boxRef}>
        <svg width={width} height={HEIGHT} role="img" aria-labelledby={titleId} aria-describedby={`${titleId}-summary`}>
          <g transform={`translate(${M.left},${M.top})`}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={0} x2={innerW} y1={y(t)} y2={y(t)} className="stroke-line-soft" />
                <text x={-6} y={y(t)} dy="0.32em" textAnchor="end" className="fill-ink-muted text-[11px] tabular-nums">
                  {t >= 1000 ? `${t / 1000}s` : `${t}ms`}
                </text>
              </g>
            ))}
            <path d={line('p50')} fill="none" strokeWidth={2} style={{ stroke: 'var(--color-series-1)' }} />
            <path d={line('p99')} fill="none" strokeWidth={2} style={{ stroke: 'var(--color-series-2)' }} />
            <g transform={`translate(0,${innerH + 6})`}>
              <line x1={0} x2={innerW} y1={ERR_BAND - 6} y2={ERR_BAND - 6} className="stroke-line" />
              {series.map((b) =>
                b.errors > 0 ? (
                  <rect key={b.t} x={x(b.t) + 1} width={barW} y={ERR_BAND - 6 - (b.errors / errMax) * (ERR_BAND - 8)} height={(b.errors / errMax) * (ERR_BAND - 8)} className="fill-bad-ink" />
                ) : null,
              )}
            </g>
            {[0, tEnd / 2, tEnd].map((t) => (
              <text key={t} x={x(t)} y={innerH + ERR_BAND + 16} textAnchor={t === 0 ? 'start' : t === tEnd ? 'end' : 'middle'} className="fill-ink-muted text-[11px] tabular-nums">
                {`${+t.toFixed(1)} s`}
              </text>
            ))}
          </g>
        </svg>
      </div>
      <p id={`${titleId}-summary`} className="sr-only">
        {summary}
      </p>
      <table className="sr-only">
        <caption>Latency and failures per interval</caption>
        <thead>
          <tr>
            <th scope="col">From</th>
            <th scope="col">p50</th>
            <th scope="col">p99</th>
            <th scope="col">Succeeded</th>
            <th scope="col">Failed</th>
          </tr>
        </thead>
        <tbody>
          {series.map((b) => (
            <tr key={b.t}>
              <th scope="row">{`${+b.t.toFixed(2)} s`}</th>
              <td>{ms(b.p50)}</td>
              <td>{ms(b.p99)}</td>
              <td>{b.ok}</td>
              <td>{b.errors}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
