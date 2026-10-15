import { describe, expect, it } from 'vitest';
import { CONTRACT } from './contract';
import type { RunEvent, RunResult } from './protocol';
import { printed, traceRun } from './trace';

const contract = (name: string) => CONTRACT.find((c) => c.name.startsWith(name))!;

function result(events: RunEvent[], extra: Partial<RunResult> = {}): RunResult {
  return { events, arrays: {}, returned: null, error: null, ms: 1, ...extra };
}

const mainValues = (frame: { state: { lanes: readonly { id: string; slots: readonly (string | null)[] }[]; values: Readonly<Record<string, number>> } }) =>
  frame.state.lanes.find((l) => l.id === 'main')!.slots.map((id) => (id == null ? null : frame.state.values[id]));

describe('traceRun', () => {
  it('replays bubble sort: compares, and write pairs on one line become swaps that keep element identity', () => {
    const c = contract('bubble sort');
    const trace = traceRun(result(c.expect.events!, { arrays: c.expect.arrays! }), { markSortedAtEnd: true })!;
    // Start, 3 compares, 2 swaps, end.
    expect(trace.frames).toHaveLength(7);
    expect(trace.frames.map((f) => f.line)).toEqual([null, 4, 5, 4, 5, 4, null]);
    const end = trace.frames.at(-1)!;
    expect(mainValues(end)).toEqual([1, 2, 3]);
    expect(end.stats).toEqual({ comparisons: 3, swaps: 2, writes: 0 });
    // A swap moves the elements themselves, so the bars slide rather than being redrawn.
    expect(trace.frames[0].state.lanes[0].slots).toEqual(['e0', 'e1', 'e2']);
    expect(trace.frames[2].state.lanes[0].slots).toEqual(['e1', 'e0', 'e2']);
    expect(trace.frames[2].note).toBe('Line 6 swaps arr[0] and arr[1] (3 ⇄ 1).');
    expect(trace.frames[1].note).toBe('Line 5 is arr[0] (3) > arr[1] (1)? Yes.');
    expect(trace.frames[1].vars).toEqual({ n: 3, i: 0, j: 0 });
    expect(Object.values(end.state.marks).every((m) => m === 'sorted')).toBe(true);
  });

  it('keeps insertion sort’s shift-then-insert as two writes, and compares a cell with a variable', () => {
    const c = contract('insertion sort');
    const trace = traceRun(result(c.expect.events!, { arrays: c.expect.arrays! }))!;
    expect(trace.frames.map((f) => f.note)).toEqual([
      'Your function receives arr = [2, 1].',
      'Line 5 is arr[0] (2) > 1? Yes.',
      'Line 6 writes 2 into arr[1] (it held 1).',
      'Line 9 writes 1 into arr[0] (it held 2).',
      'Your function finished. arr is now [1, 2].',
    ]);
    expect(trace.frames.at(-1)!.stats).toEqual({ comparisons: 1, swaps: 0, writes: 2 });
    // Unmarked at the end: sorting marks are opt-in.
    expect(trace.frames.at(-1)!.state.marks).toEqual({});
  });

  it('treats a temp-variable swap on adjacent lines as a swap', () => {
    const events: RunEvent[] = [
      { kind: 'array', array: 'arr', name: 'arr', values: [5, 4], line: null, vars: {} },
      { kind: 'write', array: 'arr', index: 0, value: 4, line: 3, vars: {} },
      { kind: 'write', array: 'arr', index: 1, value: 5, line: 4, vars: {} },
    ];
    const trace = traceRun(result(events))!;
    expect(trace.frames).toHaveLength(3);
    expect(trace.frames[1].stats.swaps).toBe(1);
  });

  it('shows appends, pops, prints and the returned value', () => {
    const c = contract('append, pop');
    const r = result(c.expect.events!, { arrays: c.expect.arrays!, returned: c.expect.returned! });
    const trace = traceRun(r)!;
    expect(trace.frames.map((f) => mainValues(f))).toEqual([[4], [4, 9], [4], [4], [4]]);
    expect(trace.frames[3].note).toBe('Line 4 prints “popped 9”.');
    expect(trace.frames.at(-1)!.note).toBe('Your function finished and returned [9, 1]. arr is now [4].');
    expect(printed(r)).toEqual(['popped 9']);
  });

  it('ends on the error, at its line, and flags limit stops as truncated', () => {
    const events: RunEvent[] = [{ kind: 'array', array: 'arr', name: 'arr', values: [1, 2], line: null, vars: {} }];
    const crashed = traceRun(result(events, { error: { kind: 'runtime', message: 'IndexError: list index out of range', line: 3 } }))!;
    expect(crashed.frames.at(-1)).toMatchObject({ line: 2, note: 'Line 3: IndexError: list index out of range' });
    expect(crashed.truncated).toBe(false);
    const stopped = traceRun(result(events, { error: { kind: 'limit', message: 'Stopped after 50 events.', line: 3 } }))!;
    expect(stopped.truncated).toBe(true);
  });

  it('draws the named index variables as pointers while they hold a valid index', () => {
    const events: RunEvent[] = [
      { kind: 'array', array: 'arr', name: 'arr', values: [1, 3, 5], line: null, vars: {} },
      { kind: 'compare', op: '==', a: { array: 'arr', index: 1, value: 3 }, b: { value: 5 }, result: false, line: 6, vars: { lo: 0, mid: 1, hi: 2, target: 5 } },
      { kind: 'compare', op: '==', a: { array: 'arr', index: 2, value: 5 }, b: { value: 5 }, result: true, line: 6, vars: { lo: 2, mid: 2, hi: 3, target: 5 } },
    ];
    const trace = traceRun(result(events), { pointers: ['lo', 'mid', 'hi'] })!;
    const labels = (i: number) => trace.frames[i].state.pointers.map((p) => `${p.label}@${p.index}`);
    expect(labels(1)).toEqual(['lo@0', 'mid@1', 'hi@2']);
    // hi = 3 is past the end, so it isn't drawn; the start and end frames have none.
    expect(labels(2)).toEqual(['lo@2', 'mid@2']);
    expect(labels(0)).toEqual([]);
    expect(labels(3)).toEqual([]);
  });

  it('returns null when nothing ran', () => {
    expect(traceRun(result([], { error: { kind: 'syntax', message: 'SyntaxError', line: 2 } }))).toBeNull();
  });

  it('cuts long runs at maxFrames but always shows the ending', () => {
    const events: RunEvent[] = [
      { kind: 'array', array: 'arr', name: 'arr', values: [0], line: null, vars: {} },
      ...Array.from({ length: 50 }, (_, i): RunEvent => ({ kind: 'write', array: 'arr', index: 0, value: i + 1, line: 3, vars: {} })),
    ];
    const trace = traceRun(result(events), { maxFrames: 10 })!;
    expect(trace.truncated).toBe(true);
    expect(trace.frames).toHaveLength(11);
    expect(trace.frames.at(-1)!.note).toMatch(/^Your function finished/);
  });
});
