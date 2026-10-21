'use client';

import { useState } from 'react';
import { FiCheckCircle, FiXCircle } from 'react-icons/fi';
import { KIND_INFO } from '@/systems/design';
import type { Check, Design, SimResult } from '@/systems/design/types';
import { hasWorkers, SATURATED } from './Diagram';
import { compact, dollars, ms, pct } from './format';
import { LatencyChart } from './LatencyChart';

/**
 * What a run found: the headline numbers, a case's checks, the findings, the
 * latency chart and a table per component. With a fault run as well (a case
 * that must survive a crash), a switch shows either run.
 */
export function Results({
  design,
  result,
  faultResult,
  faultLabel,
  checks,
  passed,
  stale,
  idPrefix = '',
}: {
  design: Design;
  result: SimResult;
  faultResult: SimResult | null;
  faultLabel: string | null;
  checks: readonly Check[] | null;
  passed: boolean | null;
  /** The design changed since this run. */
  stale: boolean;
  /** Prepended to element ids, so several canvases can share a page (a lesson). */
  idPrefix?: string;
}) {
  const [showFault, setShowFault] = useState(false);
  const shown = showFault && faultResult ? faultResult : result;

  return (
    <div role="group" aria-labelledby={`${idPrefix}results-title`} className="flex flex-col gap-5 rounded-card bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={`${idPrefix}results-title`} className="font-display text-title-card">
          Results
        </h2>
        {stale && <p className="text-sm text-warn-ink">The design has changed since this run. Run again to update.</p>}
      </div>

      {checks && (
        <div role="group" aria-labelledby={`${idPrefix}checks-title`} className={`rounded-well p-4 ${passed ? 'bg-good-soft' : 'bg-bad-soft'}`}>
          <h3 id={`${idPrefix}checks-title`} className="font-semibold text-ink">
            {passed ? 'Every target is met.' : `${checks.filter((c) => !c.ok).length} of ${checks.length} targets missed.`}
          </h3>
          <ul className="mt-2 space-y-1.5">
            {checks.map((c) => (
              <li key={c.id} className="flex items-start gap-2 text-sm">
                {c.ok ? <FiCheckCircle aria-hidden className="mt-0.5 shrink-0 text-good-ink" /> : <FiXCircle aria-hidden className="mt-0.5 shrink-0 text-bad-ink" />}
                <span className="text-ink">
                  <span className="sr-only">{c.ok ? 'Met: ' : 'Missed: '}</span>
                  {c.label}: <span className="font-medium tabular-nums">{c.actual}</span> <span className="text-ink-soft">(want {c.want})</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {faultResult && (
        <div role="radiogroup" aria-label="Which run to show" className="inline-flex gap-0.5 rounded-full bg-sunken p-[3px] text-[13px]">
          {[
            [false, 'Normal traffic'],
            [true, faultLabel ?? 'With faults'],
          ].map(([fault, label]) => (
            <button
              key={String(fault)}
              type="button"
              role="radio"
              aria-checked={showFault === fault}
              onClick={() => setShowFault(fault as boolean)}
              className={`rounded-full px-3 py-1.5 ${showFault === fault ? 'bg-segment font-semibold text-ink shadow-segment' : 'font-medium text-ink-soft hover:text-ink'}`}
            >
              {label as string}
            </button>
          ))}
        </div>
      )}

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Throughput" value={`${compact(shown.throughput)}/s`} sub={`${compact(shown.ok)} of ${compact(shown.offered)} ok`} />
        <Stat label="p50 latency" value={ms(shown.latency.p50)} />
        <Stat label="p99 latency" value={ms(shown.latency.p99)} />
        <Stat
          label="Errors"
          value={pct(shown.errorRate)}
          sub={[shown.rejected && `${compact(shown.rejected)} rejected`, shown.failed && `${compact(shown.failed)} failed`, shown.timedOut && `${compact(shown.timedOut)} timed out`].filter(Boolean).join(', ') || 'none'}
          bad={shown.errorRate > 0.01}
        />
        <Stat
          label="Stale reads"
          value={compact(shown.staleReads)}
          sub={shown.okReads ? `${pct(shown.staleReads / shown.okReads)} of reads` : undefined}
          bad={shown.staleReads > 0}
        />
        <Stat label="Cost" value={`${dollars(shown.costPerMonth)}/mo`} />
      </dl>

      {shown.findings.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-ink">What stands out</h3>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-ink-soft">
            {shown.findings.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </div>
      )}

      <LatencyChart series={shown.series} bucketSeconds={shown.bucketSeconds} />

      {/* Focusable so the table can be scrolled sideways from the keyboard on a phone. */}
      <div className="overflow-x-auto rounded focus-visible:ring-2 focus-visible:ring-accent-line focus-visible:outline-none" tabIndex={0} role="group" aria-label="Each component (scrolls sideways on narrow screens)">
        <table className="w-full min-w-[36rem] text-left text-sm">
          <caption className="mb-1 text-left text-sm font-semibold text-ink">Each component</caption>
          <thead className="text-xs text-ink-muted">
            <tr className="border-b border-line">
              <th scope="col" className="py-1.5 pr-3 font-medium">Component</th>
              <th scope="col" className="py-1.5 pr-3 font-medium">Busy</th>
              <th scope="col" className="py-1.5 pr-3 font-medium">Handled</th>
              <th scope="col" className="py-1.5 pr-3 font-medium">Longest queue</th>
              <th scope="col" className="py-1.5 pr-3 font-medium">Lost</th>
              <th scope="col" className="py-1.5 font-medium">Other</th>
            </tr>
          </thead>
          <tbody>
            {design.components.map((c) => {
              const s = shown.components[c.id];
              if (!s) return null;
              const other = [
                s.hitRate != null && `hit rate ${pct(s.hitRate)}`,
                s.backlog != null && `backlog ${compact(s.backlog)}`,
                s.applyDelayMs != null && `applied after ${ms(s.applyDelayMs)}`,
              ].filter(Boolean);
              return (
                <tr key={c.id} className="border-b border-line-soft last:border-0">
                  <th scope="row" className="py-1.5 pr-3 font-medium text-ink">
                    {c.label} <span className="font-normal text-ink-muted">({KIND_INFO[c.kind].name})</span>
                  </th>
                  <td className={`py-1.5 pr-3 tabular-nums ${hasWorkers(s) && s.utilisation >= SATURATED ? 'font-semibold text-bad-ink' : 'text-ink-soft'}`}>
                    {hasWorkers(s) ? `${pct(s.utilisation)}${s.utilisation >= SATURATED ? ' (saturated)' : ''}` : '–'}
                  </td>
                  <td className="py-1.5 pr-3 text-ink-soft tabular-nums">{compact(s.served)}</td>
                  <td className="py-1.5 pr-3 text-ink-soft tabular-nums">{compact(s.peakQueue)}</td>
                  <td className={`py-1.5 pr-3 tabular-nums ${s.dropped > 0 ? 'text-bad-ink' : 'text-ink-soft'}`}>{compact(s.dropped)}</td>
                  <td className="py-1.5 text-ink-soft">{other.join(', ') || '–'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, bad = false }: { label: string; value: string; sub?: string; bad?: boolean }) {
  return (
    <div className="rounded-well bg-sunken px-3.5 py-3">
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className={`font-display text-[22px] font-bold tabular-nums ${bad ? 'text-bad-ink' : 'text-ink'}`}>{value}</dd>
      {sub && <dd className="text-xs text-ink-muted">{sub}</dd>}
    </div>
  );
}
