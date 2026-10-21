'use client';

import { MotionConfig } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FiPause, FiPlay, FiRotateCcw } from 'react-icons/fi';
import type { Trace } from '@/engine/types';
import { ArrayView } from '@/viz/array/ArrayView';
import type { ArrayState } from '@/viz/array/types';
import { cx } from '@/components/ui/cx';
import { SERIES_COLORS, workOf } from './series';

/** Work units (comparisons + swaps + writes) per second. */
const RATES = [5, 10, 25, 50, 100, 250] as const;

export type Runner = { slug: string; name: string; slot: number; trace: Trace<ArrayState>; bigO?: string };

/**
 * Runs several sorts on the same input on one shared clock measured in work,
 * not steps: each lane shows the last frame its algorithm reaches within the
 * work done so far, so the algorithm that needs fewer operations finishes first.
 */
export function Race({ runners }: { runners: readonly Runner[] }) {
  const lanes = useMemo(
    () =>
      runners.map((r) => {
        const cost = r.trace.frames.map((f) => workOf(f.stats));
        return { ...r, cost, total: cost[cost.length - 1] ?? 0 };
      }),
    [runners],
  );
  const finish = Math.max(1, ...lanes.map((l) => l.total));
  const [work, setWork] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState<number>(25);

  const workRef = useRef(work);
  useEffect(() => {
    workRef.current = work;
  }, [work]);

  useEffect(() => {
    if (!playing) return;
    let prev: number | null = null;
    let raf = 0;
    const tick = (now: number) => {
      const dt = prev === null ? 0 : (now - prev) / 1000;
      prev = now;
      const next = Math.min(finish, workRef.current + dt * rate);
      workRef.current = next;
      setWork(next);
      if (next >= finish) {
        setPlaying(false);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, rate, finish]);

  const done = work >= finish;
  const order = [...lanes].sort((a, b) => a.total - b.total).map((l) => l.slug);
  const tween = Math.min(0.25, 2 / rate);

  return (
    <div className="flex flex-col gap-4" role="group" aria-label="Race">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => {
            if (done) {
              workRef.current = 0;
              setWork(0);
            }
            setPlaying((p) => !p);
          }}
          className="inline-flex h-12 items-center gap-2 rounded-full bg-accent px-[22px] text-[15px] font-semibold text-on-accent transition-colors duration-150 ease-standard hover:bg-accent-strong"
        >
          {playing ? <FiPause aria-hidden /> : done ? <FiRotateCcw aria-hidden /> : <FiPlay aria-hidden />}
          {playing ? 'Pause' : done ? 'Race again' : work > 0 ? 'Resume' : 'Start the race'}
        </button>
        <button
          type="button"
          onClick={() => {
            setPlaying(false);
            workRef.current = 0;
            setWork(0);
          }}
          disabled={work === 0}
          className="inline-flex h-12 items-center rounded-full bg-surface px-[18px] text-sm font-semibold text-ink transition-colors duration-150 ease-standard hover:bg-subtle disabled:opacity-45"
        >
          Reset
        </button>
        <label className="flex items-center gap-2 text-[13px] text-ink-soft">
          Speed
          <select value={rate} onChange={(e) => setRate(Number(e.target.value))} className="h-10 rounded-full bg-surface px-3 text-[13px] font-semibold text-ink">
            {RATES.map((r) => (
              <option key={r} value={r}>
                {r} operations/s
              </option>
            ))}
          </select>
        </label>
        <span className="ml-auto font-mono text-sm text-ink-soft tabular-nums">{Math.floor(work)} operations</span>
      </div>

      <MotionConfig transition={{ duration: tween }} reducedMotion="user">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {lanes.map((lane) => {
            const index = lastAtMost(lane.cost, work);
            const finished = work >= lane.total;
            const place = order.indexOf(lane.slug) + 1;
            return (
              <div key={lane.slug} className="flex min-w-0 flex-col gap-3 rounded-card bg-surface p-4 sm:p-5">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span aria-hidden className="size-3 shrink-0 rounded-full" style={{ background: SERIES_COLORS[lane.slot] }} />
                  <span className="font-semibold text-ink">{lane.name}</span>
                  {lane.bigO && <span className="rounded-lg bg-sunken px-2 py-0.5 font-mono text-xs text-ink">{lane.bigO}</span>}
                  <span
                    className={cx(
                      'ml-auto rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap',
                      !finished ? 'bg-sunken text-ink-soft' : place === 1 ? 'bg-good-soft text-good-ink' : place === 2 ? 'bg-warn-soft text-warn-ink' : 'bg-sunken text-ink-soft',
                    )}
                  >
                    {finished ? `${ordinal(place)} · ${lane.total} ops` : 'Running'}
                  </span>
                </div>
                <div className="rounded-tile bg-subtle p-3">
                  <ArrayView state={lane.trace.frames[index].state} compact />
                </div>
                <div className="mt-auto flex items-center gap-3">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-sunken" aria-hidden>
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.min(100, (work / Math.max(1, lane.total)) * 100)}%`, background: SERIES_COLORS[lane.slot] }}
                    />
                  </div>
                  <span className="shrink-0 font-mono text-[13px] text-ink-soft tabular-nums">
                    {lane.cost[index]} / {lane.total} ops
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </MotionConfig>
      {done && (
        <p className="px-1 text-sm text-ink-soft" aria-live="polite">
          {lanes.find((l) => l.slug === order[0])?.name} finished first with {lanes.find((l) => l.slug === order[0])?.total} operations.
          {lanes.length > 1 &&
            ` ${lanes.find((l) => l.slug === order.at(-1))?.name} needed ${lanes.find((l) => l.slug === order.at(-1))?.total}.`}
        </p>
      )}
    </div>
  );
}

/** Index of the last frame whose cumulative work is ≤ `work` (costs are nondecreasing). */
function lastAtMost(cost: readonly number[], work: number): number {
  let lo = 0;
  let hi = cost.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (cost[mid] <= work) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

function ordinal(n: number) {
  return n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`;
}
