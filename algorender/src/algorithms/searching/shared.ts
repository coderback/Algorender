import type { InputExample, InputSpec, StatSpec } from '@/engine/module';
import { createRng, parseArrayInput } from '@/engine/random';
import type { Frame } from '@/engine/types';
import { ArrayTracer, MAIN, type FrameOptions } from '@/viz/array/tracer';
import type { ArrayState, LogEntry, Mark, Range } from '@/viz/array/types';

export type SearchInput = { values: number[]; target: number };

const MIN = 0;
const MAX = 99;
const MAX_SIZE = 24;

export const PROBES: StatSpec = { key: 'probes', label: 'Elements probed' };

// ───────────────────────────── inputs ─────────────────────────────

type Rng = () => number;
const randInt = (rng: Rng, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));

/** `size` distinct values from 1–99 in random order. */
function distinct(rng: Rng, size: number): number[] {
  const pool = Array.from({ length: MAX }, (_, i) => i + 1);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = randInt(rng, 0, i);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, size);
}

/** A value that is not in `values`, preferably strictly between two of them. */
function missing(rng: Rng, values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    for (let v = sorted[i - 1] + 1; v < sorted[i]; v++) gaps.push(v);
  }
  if (gaps.length > 0) return gaps[randInt(rng, 0, gaps.length - 1)];
  const present = new Set(values);
  for (let v = MIN; v <= MAX; v++) if (!present.has(v)) return v;
  return MAX;
}

/** Index strictly inside the array when possible, so "present" differs from "first" and "last". */
const inner = (rng: Rng, n: number) => (n < 3 ? randInt(rng, 0, n - 1) : randInt(rng, 1, n - 2));

type Make = (rng: Rng, size: number) => SearchInput;

const sortedExamples: Record<string, { label: string; make: Make }> = {
  present: {
    label: 'Target present',
    make: (rng, size) => {
      const values = distinct(rng, size).sort((a, b) => a - b);
      return { values, target: values[inner(rng, size)] };
    },
  },
  absent: {
    label: 'Target absent',
    make: (rng, size) => {
      const values = distinct(rng, size).sort((a, b) => a - b);
      return { values, target: missing(rng, values) };
    },
  },
  first: {
    label: 'Target first',
    make: (rng, size) => {
      const values = distinct(rng, size).sort((a, b) => a - b);
      return { values, target: values[0] };
    },
  },
  last: {
    label: 'Target last',
    make: (rng, size) => {
      const values = distinct(rng, size).sort((a, b) => a - b);
      return { values, target: values[size - 1] };
    },
  },
  uneven: {
    // Small steps, then one huge value: estimates based on an even spread go badly wrong.
    label: 'Uneven gaps',
    make: (rng, size) => {
      const values = [randInt(rng, 1, 3)];
      while (values.length < size - 1) values.push(values.at(-1)! + randInt(rng, 1, 3));
      if (size > 1) values.push(randInt(rng, 90, MAX));
      const back = Math.min(2, Math.max(0, size - 2));
      return { values, target: values[Math.max(0, size - 2 - randInt(rng, 0, back))] };
    },
  },
};

const unsortedExamples: Record<string, { label: string; make: Make }> = {
  present: {
    label: 'Target present',
    make: (rng, size) => {
      const values = distinct(rng, size);
      return { values, target: values[inner(rng, size)] };
    },
  },
  absent: {
    label: 'Target absent',
    make: (rng, size) => {
      const values = distinct(rng, size);
      return { values, target: missing(rng, values) };
    },
  },
  first: {
    label: 'Target first',
    make: (rng, size) => {
      const values = distinct(rng, size);
      return { values, target: values[0] };
    },
  },
  last: {
    label: 'Target last',
    make: (rng, size) => {
      const values = distinct(rng, size);
      return { values, target: values[size - 1] };
    },
  },
  duplicates: {
    // The target appears two or three times; linear search stops at the first.
    label: 'Repeated target',
    make: (rng, size) => {
      const values = distinct(rng, size);
      const target = values[0];
      const copies = Math.min(size - 1, randInt(rng, 1, 2));
      const spots = Array.from({ length: size - 1 }, (_, i) => i + 1);
      for (let c = 0; c < copies; c++) {
        const k = randInt(rng, c, spots.length - 1);
        [spots[c], spots[k]] = [spots[k], spots[c]];
        values[spots[c]] = target;
      }
      // Move the original away from the front so the first copy isn't always position 0.
      const swapWith = randInt(rng, 0, size - 1);
      [values[0], values[swapWith]] = [values[swapWith], values[0]];
      return { values, target };
    },
  },
};

/**
 * Input spec for "an array plus a target": named examples (all honour size
 * and seed), a size slider, and custom text such as `2, 5, 8, 12, 16 → 12`.
 * With `sorted`, custom arrays must be in ascending order.
 */
export function searchInput({
  sorted,
  examples,
  defaultSize,
}: {
  sorted: boolean;
  examples: readonly string[];
  defaultSize: number;
}): InputSpec<SearchInput> {
  const table = sorted ? sortedExamples : unsortedExamples;
  const built = examples.map(
    (id): InputExample<SearchInput> => {
      const ex = table[id];
      if (!ex) throw new Error(`Unknown search example "${id}"`);
      return { id, label: ex.label, make: ({ seed, size }) => ex.make(createRng(seed), Math.max(1, size)) };
    },
  );
  const [first, ...rest] = built;
  if (!first) throw new Error('searchInput needs at least one example');
  return {
    examples: [first, ...rest],
    size: { label: 'Size', min: 4, max: MAX_SIZE, default: defaultSize },
    custom: {
      label: `Your own ${sorted ? 'sorted ' : ''}array and target (${MIN}–${MAX}, up to ${MAX_SIZE} numbers)`,
      placeholder: sorted ? 'e.g. 2, 5, 8, 12, 16 → 12' : 'e.g. 9, 4, 17, 2 → 17',
      parse: (text) => parseSearch(text, sorted),
      format: ({ values, target }) => `${values.join(', ')} → ${target}`,
    },
  };
}

export function parseSearch(text: string, sorted: boolean): { value: SearchInput } | { error: string } {
  const parts = text.split(/→|->/);
  if (parts.length !== 2) {
    return { error: `Write the numbers, then → (or ->), then the target, e.g. ${sorted ? '2, 5, 8 → 5' : '9, 4, 17 → 4'}.` };
  }
  const parsed = parseArrayInput(parts[0], { min: MIN, max: MAX, maxSize: MAX_SIZE });
  if ('error' in parsed) return parsed;
  const raw = parts[1].trim();
  const target = Number(raw);
  if (raw === '' || !Number.isInteger(target)) return { error: `The target "${raw}" is not a whole number.` };
  if (target < MIN || target > MAX) return { error: `The target must be between ${MIN} and ${MAX}.` };
  const { values } = parsed;
  if (sorted) {
    for (let i = 1; i < values.length; i++) {
      if (values[i] < values[i - 1]) {
        return { error: `The array must be sorted in ascending order, but ${values[i]} comes after ${values[i - 1]}.` };
      }
    }
  }
  return { value: { values, target } };
}

// ───────────────────────────── tracing ─────────────────────────────

export const TARGET = 'target';

export type SearchFrameOptions = Omit<FrameOptions, 'marks'> & {
  /** Positions that could still hold the target, inclusive. Drawn as the candidate window. */
  window?: readonly [number, number] | null;
  /** The element being compared with the target. */
  probe?: number | null;
  /** Where the target was found. */
  found?: number | null;
  /** Extra marks, e.g. the end of a jump-search block. */
  marks?: Partial<Record<Mark, readonly number[]>>;
};

/**
 * ArrayTracer plus the target: a bar in its own lane above the array that
 * sits over the element being probed, so the comparison is visible as two
 * heights. Candidates (positions that could still hold the target) are
 * marked as the frontier; everything else has been ruled out.
 */
export class SearchTracer {
  readonly t: ArrayTracer;
  readonly n: number;
  readonly x: number;
  private at = 0;
  private values: Record<string, number> | null = null;

  /** Every probe so far, in order, for the history beside the array. */
  private probed: { i: number; v: number }[] = [];

  constructor({ values, target }: SearchInput, stats: readonly string[], laneLabel: string) {
    this.t = new ArrayTracer(values, stats);
    this.t.setLaneLabel(MAIN, laneLabel);
    // Position matters in a search, not size: values sit in cells (V1).
    this.t.setLook('cells');
    this.n = values.length;
    this.x = target;
  }

  get probes(): number {
    return this.t.stats.probes ?? 0;
  }

  /** Reads A[i] without counting a probe (e.g. interpolation's range check, which narration explains separately). */
  value(i: number): number {
    return this.t.value(i);
  }

  /** Reads A[i] to compare it with the target: counts a probe and moves the target bar over i. */
  probe(i: number): number {
    this.t.count('probes');
    this.at = i;
    const v = this.t.value(i);
    this.probed.push({ i, v });
    return v;
  }

  /**
   * The probe history: each probe and how it compared with the target. The
   * probe being made in this frame shows its value only, since the frame may
   * ask where the target can be.
   */
  private log(probe: number | null | undefined, found: number | null | undefined): ArrayState['log'] {
    if (this.probed.length === 0) return undefined;
    const last = this.probed.length - 1;
    const entries = this.probed.map(({ i, v }, k): LogEntry => {
      const base = { id: `probe-${k}`, text: `A[${i}] = ${v}` };
      if (v === this.x && found === i) return { ...base, note: 'found', mark: 'found' };
      if (k === last && probe === i) return { ...base, mark: 'compare' };
      return { ...base, note: v < this.x ? `< ${this.x}` : v > this.x ? `> ${this.x}` : `= ${this.x}` };
    });
    return { title: 'Probes', entries };
  }

  /** Moves the target bar without probing (e.g. to where the first probe will be). */
  hover(i: number) {
    this.at = Math.max(0, Math.min(this.n - 1, i));
  }

  frame(opts: SearchFrameOptions): Frame<ArrayState> {
    const { window, probe, found, marks = {}, ranges, ...rest } = opts;
    const special = new Set([probe, found].filter((i): i is number => i != null));
    const frontier: number[] = [];
    if (window) for (let i = window[0]; i <= window[1]; i++) if (!special.has(i)) frontier.push(i);

    const defaultRanges: { from: number; to: number; tone: Range['tone']; label?: string }[] = [];
    if (found != null) defaultRanges.push({ from: found, to: found, tone: 'done', label: 'found' });
    else if (window) defaultRanges.push({ from: window[0], to: window[1], tone: 'active', label: `could hold ${this.x}` });

    const base = this.t.frame({
      ...rest,
      ranges: ranges ?? defaultRanges,
      marks: {
        frontier,
        ...marks,
        ...(probe != null && { compare: [probe] }),
        ...(found != null && { found: [found] }),
      },
    });
    if (this.n === 0) return base;

    // The tracer's value table never changes, so the extended copy can be shared by every frame.
    this.values ??= { ...base.state.values, [TARGET]: this.x };
    const slots: (string | null)[] = Array(this.n).fill(null);
    slots[this.at] = TARGET;
    return {
      ...base,
      state: {
        ...base.state,
        values: this.values,
        lanes: [{ id: TARGET, label: `Target ${this.x}`, slots }, ...base.state.lanes],
        marks: { ...base.state.marks, [TARGET]: found != null ? 'found' : 'key' },
        ...(this.probed.length > 0 && { log: this.log(probe, found) }),
      },
    };
  }
}

/** A number for narration, with a true minus sign. */
export const num = (n: number) => (n < 0 ? `−${-n}` : String(n));

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
export const probesText = (n: number) => plural(n, 'probe');

/** Closing narration: the result, and what a plain left-to-right scan would have cost. */
export function foundNote(s: SearchTracer, index: number): string {
  return `Found ${s.x} at position ${index} after ${probesText(s.probes)}. A left-to-right scan would have needed ${plural(index + 1, 'probe')}.`;
}

export function absentNote(s: SearchTracer, why: string): string {
  return `${why} So ${s.x} is not in the array: ${probesText(s.probes)} ruled out all ${s.n} positions, where a scan would have checked every one.`;
}

/** The three outcomes of comparing a probe with the target, in a fixed left-to-right order. */
export const SIDES = ['In the part to its left', 'Right here: found it', 'In the part to its right'] as const;
export const side = (value: number, target: number) => (value > target ? 0 : value === target ? 1 : 2);
