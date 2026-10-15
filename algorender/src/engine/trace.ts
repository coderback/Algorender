import type { Frame, Trace } from './types';

/** Upper bound on recorded frames, so a pathological input can't exhaust memory. */
export const MAX_FRAMES = 20_000;

/** Runs a frame generator to completion and records every frame. */
export function recordTrace<S>(frames: Iterable<Frame<S>>, maxFrames = MAX_FRAMES): Trace<S> {
  const recorded: Frame<S>[] = [];
  for (const frame of frames) {
    if (recorded.length >= maxFrames) return { frames: recorded, truncated: true };
    recorded.push(frame);
  }
  return { frames: recorded, truncated: false };
}
