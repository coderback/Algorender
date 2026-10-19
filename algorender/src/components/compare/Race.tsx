'use client';

import { MotionConfig } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FiPause, FiPlay, FiRotateCcw } from 'react-icons/fi';
import type { Trace } from '@/engine/types';
import { ArrayView } from '@/viz/array/ArrayView';
import type { ArrayState } from '@/viz/array/types';
import { SERIES_COLORS, workOf } from './series';

/** Work units (comparisons + swaps + writes) per second. */
const RATES = [5, 10, 25, 50, 100, 250] as const;

export type Runner = { slug: string; name: string; slot: number; trace: Trace<ArrayState> };

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
    <section className="rounded-xl border border-line-soft bg-surface p-4 shadow-xs" aria-label="Race">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => {
            if (done) {
              workRef.current = 0;
              setWork(0);
            }
            setPlaying((p) => !p);
          }}
          className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent-strong"
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
          className="rounded-full px-3 py-2 text-sm text-ink-soft hover:bg-sunken disabled:opacity-40"
        >
          Reset
        </button>
        <label className="flex items-center gap-2 text-xs text-ink-muted">
          Speed
          <select
            value={rate}
            onChange={(e) => setRate(Number(e.target.value))}
            className="rounded-md border border-line bg-surface px-2 py-1 text-ink-soft"
          >
            {RATES.map((r) => (
              <option key={r} value={r}>
                {r} operations/s
              </option>
            ))}
          </select>
        </label>
        <span className="ml-auto font-mono text-sm tabular-nums text-ink-soft">{Math.floor(work)} operations</span>
      </div>

      <MotionConfig transition={{ duration: tween }} reducedMotion="user">
        <div className="grid gap-4 md:grid-cols-2">
          {lanes.map((lane) => {
            const index = lastAtMost(lane.cost, work);
            const finished = work >= lane.total;
            const place = order.indexOf(lane.slug) + 1;
            return (
              <div key={lane.slug} className="min-w-0 rounded-lg border border-line-soft p-3">
                <div className="mb-2 flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-2 font-medium text-ink">
                    <span className="h-0.5 w-4 rounded-full" style={{ background: SERIES_COLORS[lane.slot] }} aria-hidden />
                    {lane.name}
                  </span>
                  <span className="font-mono text-xs tabular-nums text-ink-soft">
                    {finished ? `${ordinal(place)} · ${lane.total} ops` : `${lane.cost[index]} / ${lane.total} ops`}
                  </span>
                </div>
                <ArrayView state={lane.trace.frames[index].state} compact />
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-sunken" aria-hidden>
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.min(100, (work / Math.max(1, lane.total)) * 100)}%`, background: SERIES_COLORS[lane.slot] }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </MotionConfig>
      {done && (
        <p className="mt-4 text-sm text-ink-soft" aria-live="polite">
          {lanes.find((l) => l.slug === order[0])?.name} finished first with {lanes.find((l) => l.slug === order[0])?.total} operations.
          {lanes.length > 1 &&
            ` ${lanes.find((l) => l.slug === order.at(-1))?.name} needed ${lanes.find((l) => l.slug === order.at(-1))?.total}.`}
        </p>
      )}
    </section>
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
