// An array run line by line on the array view (traceArray.ts), from real runs
// of the JS runtime.

import { describe, expect, it } from 'vitest';
import { runJs } from './js/runtime';
import { LINE_LIMITS, type Arg } from './protocol';
import { traceFor } from './trace';

const arr = (values: number[], name = 'nums'): Arg => ({ kind: 'array', name, values });

function trace(code: string, entry: string, args: Arg[]) {
  const result = runJs({ language: 'javascript', code, entry, args, limits: LINE_LIMITS, mode: 'lines' });
  expect(result.error).toBeNull();
  const run = traceFor(result, { view: 'array', pointers: ['i', 'j', 'left', 'right'], code });
  if (run?.view !== 'array') throw new Error(`played on ${run?.view}`);
  return { result, run };
}

describe('an array run, line by line', () => {
  const REVERSE = `function reverse(nums) {
  let left = 0;
  let right = nums.length - 1;
  while (left < right) {
    [nums[left], nums[right]] = [nums[right], nums[left]];
    left++;
    right--;
  }
}
`;

  it('has a frame for every line, plus the end', () => {
    const { result, run } = trace(REVERSE, 'reverse', [arr([1, 2, 3, 4])]);
    const steps = result.events.filter((e) => e.kind === 'step').length;
    expect(run.trace.frames).toHaveLength(steps + 1);
    expect(run.trace.frames.every((f) => f.note.length > 0)).toBe(true);
  });

  it('draws the index variables as pointers while they hold an index', () => {
    const { run } = trace(REVERSE, 'reverse', [arr([1, 2, 3, 4])]);
    const labels = run.trace.frames.map((f) => f.state.pointers.map((p) => `${p.label}=${p.index}`).join(' '));
    expect(labels).toContain('left=0 right=3');
    expect(labels).toContain('left=1 right=2');
    // The loop ends once they cross, both still indices.
    expect(labels.at(-1)).toBe('left=2 right=1');
    // Before `let left` runs there is no pointer.
    expect(labels[0]).toBe('');
  });

  it('marks and names a swap, and the array changes with it', () => {
    const { run } = trace(REVERSE, 'reverse', [arr([1, 2, 3, 4])]);
    const swapped = run.trace.frames.find((f) => Object.values(f.state.marks).includes('swap'))!;
    expect(swapped.note).toContain('swaps nums[0] and nums[3]');
    const end = run.trace.frames.at(-1)!.state;
    expect(end.lanes[0].slots.map((id) => end.values[id!])).toEqual([4, 3, 2, 1]);
  });

  it('marks the cells a line compares, even when it reads others in arithmetic', () => {
    const code = `function f(nums) {
  let best = 0;
  for (let i = 0; i < nums.length; i++) {
    if (nums[i] > best) best = nums[i] + 0;
  }
  return best;
}
`;
    const { run } = trace(code, 'f', [arr([3, 9, 4])]);
    const compared = run.trace.frames.filter((f) => Object.values(f.state.marks).includes('compare'));
    expect(compared.length).toBe(3);
    expect(compared[0].note).toMatch(/checks nums\[0\] \(3\) > 0: yes/);
    expect(run.trace.frames.at(-1)!.stats.comparisons).toBe(3);
  });

  it('plays on the memory view when asked, and without view: array as before', () => {
    const result = runJs({ language: 'javascript', code: REVERSE, entry: 'reverse', args: [arr([1, 2])], limits: LINE_LIMITS, mode: 'lines' });
    expect(traceFor(result, { view: 'memory' })?.view).toBe('memory');
    expect(traceFor(result, {})?.view).toBe('memory');
  });
});
