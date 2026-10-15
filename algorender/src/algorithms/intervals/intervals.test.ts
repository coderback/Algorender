import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { GridState } from '@/viz/grid/types';
import { answerPositions, expectGoodTrace, expectLegendMatchesMarks, expectShortPseudocode, list, table, traceOf } from '@/viz/grid/testing';
import { intervals } from '.';
import { meetingRooms } from './meeting-rooms';
import { mergeIntervals } from './merge-intervals';
import { busiest, MAX_INTERVALS, MAX_TIME, type Interval } from './shared';

// ───────────────────────────── references ─────────────────────────────

/** The classic merge: sort by start, extend while the next one starts by the current end (touching merges). */
function referenceMerge(xs: Interval[]): Interval[] {
  const out: Interval[] = [];
  for (const x of [...xs].sort((a, b) => a.start - b.start)) {
    const top = out.at(-1);
    if (top && x.start <= top.end) top.end = Math.max(top.end, x.end);
    else out.push({ ...x });
  }
  return out;
}

/** Most meetings in progress at once, by a sweep over start and end events (an end at t frees the room before a start at t). */
function maxOverlap(xs: Interval[]): number {
  const events = xs.flatMap((x) => [
    { t: x.start, d: 1 },
    { t: x.end, d: -1 },
  ]);
  events.sort((a, b) => a.t - b.t || a.d - b.d);
  let now = 0;
  let best = 0;
  for (const e of events) best = Math.max(best, (now += e.d));
  return best;
}

const interval = fc
  .tuple(fc.integer({ min: 0, max: MAX_TIME - 1 }), fc.integer({ min: 1, max: 8 }))
  .map(([start, len]) => ({ start, end: Math.min(MAX_TIME, start + len) }));
const intervalList = fc.array(interval, { minLength: 1, maxLength: MAX_INTERVALS });

const bars = (state: GridState, tableId: string, row: string) => table(state, tableId).bars.filter((b) => b.row === row);

// ───────────────────────────── every module ─────────────────────────────

describe.each(intervals)('$slug', (algo) => {
  it('builds every example and replays it with good frames, under the frame cap', () => {
    for (const example of algo.input.examples) {
      for (const seed of [1, 7, 99, 1234]) {
        const { frames, truncated } = traceOf(algo, example.make({ seed, size: 0 }));
        expect(truncated).toBe(false);
        expectGoodTrace(algo, frames);
      }
    }
  });

  it('keeps pseudo-code short enough for the side panel', () => expectShortPseudocode(algo));

  it('lists exactly the marks it uses in its legend', () => expectLegendMatchesMarks(algo));

  it('has a legend that starts with the neutral state, and experiments that name real examples', () => {
    expect(algo.legend[0]).toHaveProperty('neutral');
    const ids = new Set(algo.input.examples.map((e) => e.id));
    for (const x of algo.content.experiments) expect(ids.has(x.example)).toBe(true);
  });

  it('varies where the right answer sits among the choices', () => {
    const positions = new Set<number>();
    for (const example of algo.input.examples) for (const p of answerPositions(traceOf(algo, example.make({ seed: 3, size: 0 })).frames)) positions.add(p);
    expect(positions.size).toBeGreaterThan(1);
  });

  it('accepts its own formatted custom input', () => {
    for (const example of algo.input.examples) {
      const input = example.make({ seed: 11, size: 0 });
      expect(algo.input.custom!.parse(algo.input.custom!.format(input))).toEqual({ value: input });
    }
  });

  it('narrates random runs properly, including the largest input', () => {
    fc.assert(
      fc.property(intervalList, (xs) => expectGoodTrace(algo, traceOf(algo, xs).frames)),
      { numRuns: 40 },
    );
    const big = Array.from({ length: MAX_INTERVALS }, (_, k) => ({ start: k * 2, end: Math.min(MAX_TIME, k * 2 + 5) }));
    const { frames, truncated } = traceOf(algo, big);
    expect(truncated).toBe(false);
    expectGoodTrace(algo, frames);
  });

  it('rejects malformed custom input', () => {
    const parse = algo.input.custom!.parse;
    expect(parse('')).toHaveProperty('error');
    expect(parse('4-1')).toHaveProperty('error');
    expect(parse('3-3')).toHaveProperty('error');
    expect(parse(`1-${MAX_TIME + 1}`)).toHaveProperty('error');
    expect(parse('1 to 4')).toHaveProperty('error');
    expect(parse('[1, 3], 4')).toHaveProperty('error');
    expect(parse(Array(MAX_INTERVALS + 1).fill('1-2').join(','))).toHaveProperty('error');
    expect(parse('1-4,  3 – 5')).toEqual({ value: [{ start: 1, end: 4 }, { start: 3, end: 5 }] });
    expect(parse('[1,3], [2, 6]')).toEqual({ value: [{ start: 1, end: 3 }, { start: 2, end: 6 }] });
  });
});

// ───────────────────────────── correctness ─────────────────────────────

describe('merge-intervals', () => {
  it('merges overlapping and touching intervals exactly like the classic sweep', () => {
    fc.assert(
      fc.property(intervalList, (xs) => {
        const { frames, truncated } = traceOf(mergeIntervals, xs);
        expect(truncated).toBe(false);
        const state = frames.at(-1)!.state;
        const ref = referenceMerge(xs);
        expect(list(state, 'result').items.map((it) => it.text)).toEqual(ref.map((x) => `[${x.start}, ${x.end}]`));
        expect(bars(state, 'main', 'merged').map((b) => ({ start: b.from, end: b.to }))).toEqual(ref);
        expect(frames.at(-1)!.stats.checked).toBe(xs.length - 1);
        expect(frames.at(-1)!.stats.merged).toBe(xs.length - ref.length);
      }),
      { numRuns: 150 },
    );
  });

  it('sorts the rows by start, keeping the merged row last', () => {
    const input = mergeIntervals.input.examples.find((e) => e.id === 'touching')!.make({ seed: 1, size: 0 });
    const rows = table(traceOf(mergeIntervals, input).frames[1].state).rows.map((r) => r.id);
    expect(rows.at(-1)).toBe('merged');
    const starts = rows.slice(0, -1).map((id) => input[Number(id.slice(1))].start);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });

  it('asks the three-way question with the right answer', () => {
    const answers = traceOf(mergeIntervals, [{ start: 1, end: 10 }, { start: 2, end: 3 }, { start: 3, end: 12 }, { start: 12, end: 13 }, { start: 14, end: 15 }])
      .frames.flatMap((f) => (f.checkpoint ? [f.checkpoint.answer] : []));
    // [2,3] lies inside [1,10]; [3,12] extends it; [12,13] touches and extends; [14,15] starts a new one.
    expect(answers).toEqual([1, 0, 0, 2]);
  });
});

describe('meeting-rooms', () => {
  it('opens as many rooms as the most meetings at once, and no room ever holds two at once', () => {
    fc.assert(
      fc.property(intervalList, (xs) => {
        const { frames, truncated } = traceOf(meetingRooms, xs);
        expect(truncated).toBe(false);
        const state = frames.at(-1)!.state;
        const rooms = table(state, 'rooms');
        expect(rooms.rows).toHaveLength(maxOverlap(xs));
        expect(frames.at(-1)!.stats.rooms).toBe(maxOverlap(xs));
        expect(busiest(xs).count).toBe(maxOverlap(xs));
        // Every meeting is placed exactly once, at its own times.
        expect(rooms.bars.map((b) => b.id).sort()).toEqual(xs.map((_, i) => `m${i}`).sort());
        for (const b of rooms.bars) expect({ start: b.from, end: b.to }).toEqual(xs[Number(b.id.slice(1))]);
        for (const r of rooms.rows) {
          const inRoom = bars(state, 'rooms', r.id).sort((a, b) => a.from - b.from);
          inRoom.forEach((b, k) => k > 0 && expect(b.from).toBeGreaterThanOrEqual(inRoom[k - 1].to));
        }
        // The heap ends with one entry per room, earliest end first.
        const ends = list(state, 'heap').items.map((it) => Number(it.text.split(' ').at(-1)));
        expect(ends).toHaveLength(rooms.rows.length);
        expect(ends).toEqual([...ends].sort((a, b) => a - b));
      }),
      { numRuns: 150 },
    );
  });

  it('counts heap work: one push per meeting, plus a pop for each reuse', () => {
    fc.assert(
      fc.property(intervalList, (xs) => {
        const { placed, heap, rooms } = traceOf(meetingRooms, xs).frames.at(-1)!.stats;
        expect(placed).toBe(xs.length);
        expect(heap).toBe(xs.length + (xs.length - rooms));
      }),
      { numRuns: 60 },
    );
  });

  it('lets back-to-back meetings share one room', () => {
    const input = meetingRooms.input.examples.find((e) => e.id === 'back-to-back')!.make({ seed: 1, size: 0 });
    expect(table(traceOf(meetingRooms, input).frames.at(-1)!.state, 'rooms').rows).toHaveLength(1);
  });

  it('lines the rooms up under the meetings on one time axis', () => {
    const state = traceOf(meetingRooms, meetingRooms.input.examples[0].make({ seed: 1, size: 0 })).frames[0].state;
    expect(table(state, 'main').group).toBe('time');
    expect(table(state, 'rooms').group).toBe('time');
    expect(table(state, 'rooms').cols).toHaveLength(table(state, 'main').cols.length);
  });
});
