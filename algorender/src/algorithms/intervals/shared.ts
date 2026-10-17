import type { InputSpec } from '@/engine/module';
import { createRng } from '@/engine/random';

/**
 * A span of time from start to end (start < end). Where two spans only touch
 * (one ends at 4, the next starts at 4), Merge Intervals joins them, and
 * Meeting Rooms lets the second meeting use the room the first one leaves.
 */
export type Interval = { start: number; end: number };

export const MAX_INTERVALS = 12;
export const MAX_TIME = 24;

/** Intervals are named A, B, C… in input order. */
export const letter = (i: number) => String.fromCharCode(65 + i);
export const span = (x: Interval) => `${x.start}–${x.end}`;
export const bracket = (x: Interval) => `[${x.start}, ${x.end}]`;

export const intervalsOf = (pairs: readonly (readonly [number, number])[]): Interval[] => pairs.map(([start, end]) => ({ start, end }));

/** Indices sorted by start, then end, then input order (a stable, fully determined order). */
export const byStart = (xs: readonly Interval[]) => xs.map((_, i) => i).sort((a, b) => xs[a].start - xs[b].start || xs[a].end - xs[b].end || a - b);

/** Custom input "1-3, 2-6, 8-10" (or "[1,3], [2,6]"), shared by the interval patterns. */
export function intervalsCustom(noun: string, placeholder: string): NonNullable<InputSpec<Interval[]>['custom']> {
  return {
    label: `${noun} as start-end (up to ${MAX_INTERVALS}, times 0–${MAX_TIME})`,
    placeholder,
    parse: (text) => {
      const pairs: [part: string, start: string, end: string][] = [];
      if (text.includes('[')) {
        const rest = text.replace(/\[\s*(\d+)\s*,\s*(\d+)\s*\]/g, (whole: string, a: string, b: string) => {
          pairs.push([whole, a, b]);
          return '';
        });
        if (rest.replace(/[\s,]/g, '') !== '') return { error: 'Write each interval as [start, end], e.g. [1, 3], [2, 6].' };
      } else {
        for (const part of text.split(',').map((s) => s.trim()).filter(Boolean)) {
          const m = /^(\d+)\s*[-–]\s*(\d+)$/.exec(part);
          if (!m) return { error: `"${part}" is not start-end, e.g. 2-6.` };
          pairs.push([part, m[1], m[2]]);
        }
      }
      if (pairs.length === 0) return { error: 'Enter at least one interval, e.g. 1-3.' };
      if (pairs.length > MAX_INTERVALS) return { error: `Use at most ${MAX_INTERVALS} intervals.` };
      const out: Interval[] = [];
      for (const [part, a, b] of pairs) {
        const start = Number(a);
        const end = Number(b);
        if (end > MAX_TIME) return { error: `Times must be from 0 to ${MAX_TIME}.` };
        if (start >= end) return { error: `"${part}" must start before it ends.` };
        out.push({ start, end });
      }
      return { value: out };
    },
    format: (xs) => xs.map((x) => `${x.start}-${x.end}`).join(', '),
  };
}

/** Reproducible random intervals starting at 0..maxStart and lasting 1..maxLength. */
export function randomIntervals(seed: number, count: number, maxStart: number, maxLength: number): Interval[] {
  const rng = createRng(seed);
  return Array.from({ length: count }, () => {
    const start = Math.floor(rng() * (Math.min(maxStart, MAX_TIME - 1) + 1));
    return { start, end: Math.min(MAX_TIME, start + 1 + Math.floor(rng() * maxLength)) };
  });
}

/** The moment the most intervals are in progress at once (the earliest such moment), and which ones they are. */
export function busiest(xs: readonly Interval[]): { count: number; at: number; who: number[] } {
  let best = { count: 0, at: 0, who: [] as number[] };
  // The count only rises at a start, so checking every start time is enough.
  for (const x of xs) {
    const who = xs.flatMap((y, i) => (y.start <= x.start && x.start < y.end ? [i] : []));
    if (who.length > best.count || (who.length === best.count && x.start < best.at)) best = { count: who.length, at: x.start, who };
  }
  return best;
}
