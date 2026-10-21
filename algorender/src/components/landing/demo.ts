import { bubbleSort } from '@/algorithms/sorting/bubble-sort';
import type { Checkpoint } from '@/engine/types';
import { recordTrace } from '@/engine/trace';
import type { MarkKey } from '@/viz/marks';

// The landing page's hero: a real bubble sort trace, cut down to what a few
// bars need, so a visitor can answer a Predict question without opening a page.

export type DemoBar = { id: string; value: number; mark: MarkKey | null };
export type DemoFrame = { bars: DemoBar[]; note: string; checkpoint?: Checkpoint };
export type Demo = { frames: DemoFrame[]; start: number };

/** Seven values whose second pass swaps mid-array, with the largest already in place. */
export const DEMO_INPUT = [2, 1, 6, 4, 3, 9, 8] as const;

export function bubbleDemo(input: readonly number[] = DEMO_INPUT): Demo {
  const { frames } = recordTrace(bubbleSort.run([...input]));
  const out: DemoFrame[] = frames.map((f) => {
    const lane = f.state.lanes[0];
    return {
      bars: lane.slots.filter((id): id is string => id !== null).map((id) => ({ id, value: f.state.values[id], mark: f.state.marks[id] ?? null })),
      note: f.note,
      ...(f.checkpoint && { checkpoint: f.checkpoint }),
    };
  });
  // Open on a question whose answer is a swap, once something is in its final place.
  const start = out.findIndex((f) => f.checkpoint?.answer === 0 && f.bars.some((b) => b.mark === 'sorted'));
  return { frames: out, start: Math.max(0, start) };
}
