import { describe, expect, it } from 'vitest';
import { bubbleDemo } from './demo';

describe('the landing demo', () => {
  const { frames, start } = bubbleDemo();

  it('opens on a Predict question whose answer is a swap, with a value already in place', () => {
    const f = frames[start];
    expect(f.checkpoint?.answer).toBe(0);
    expect(f.bars.some((b) => b.mark === 'sorted')).toBe(true);
    expect(f.checkpoint?.question).toBe('Are 4 and 3 out of order?');
  });

  it('keeps every bar on every frame, ending sorted', () => {
    for (const f of frames) expect(f.bars).toHaveLength(7);
    expect(frames.at(-1)!.bars.map((b) => b.value)).toEqual([1, 2, 3, 4, 6, 8, 9]);
  });

  it('swaps the two compared bars right after the question', () => {
    const before = frames[start].bars.map((b) => b.id);
    const after = frames[start + 1].bars.map((b) => b.id);
    const changed = before.flatMap((id, i) => (after[i] !== id ? [i] : []));
    expect(changed).toHaveLength(2);
  });
});
