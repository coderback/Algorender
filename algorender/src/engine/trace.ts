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

/**
 * Runs a data-structure operation: records its frames and captures the
 * generator's return value, the structure's state after the operation.
 */
export function recordOperation<S, M>(
  op: Generator<Frame<S>, M>,
  maxFrames = MAX_FRAMES,
): Trace<S> & { result: M } {
  const frames: Frame<S>[] = [];
  for (;;) {
    const next = op.next();
    if (next.done) return { frames, truncated: false, result: next.value };
    if (frames.length >= maxFrames) throw new Error('Operation produced too many frames');
    frames.push(next.value);
  }
}
