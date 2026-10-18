// Page replacement: k physical frames in front of a stream of page references.
// A reference to a page in a frame is a hit; anything else is a fault, which
// loads the page into a free frame or replaces a victim chosen by the policy:
// - FIFO: the page loaded longest ago.
// - LRU: the page used longest ago.
// - OPT (Bélády's optimal): the page whose next use is furthest ahead, or
//   never. It needs the future, so it is the yardstick, not something an
//   operating system can run.
// - Clock (second chance): a hand sweeps the frames; a page with its use bit
//   set gets the bit cleared and is passed over once, so recently used pages
//   survive without keeping an exact LRU order.
//
// This is the paging component the system-design canvas (phase 6d) reuses:
// `createPaging` and `pagingStep` (pass the references still to come for
// OPT), or `simulatePaging` for a whole string. Steps return new state and
// never change the one they were given.

export type ReplacementPolicy = 'fifo' | 'lru' | 'opt' | 'clock';

export const POLICY_NAMES: Record<ReplacementPolicy, string> = { fifo: 'FIFO', lru: 'LRU', opt: 'OPT', clock: 'Clock' };

export type PagingState = {
  policy: ReplacementPolicy;
  /** The page in each frame, or null while it is free. */
  frames: readonly (number | null)[];
  /** When each frame's page was loaded (FIFO). */
  loadedAt: readonly number[];
  /** When each frame's page was last used (LRU). */
  usedAt: readonly number[];
  /** Each frame's use bit (Clock). */
  useBits: readonly boolean[];
  /** The frame the clock hand points at. */
  hand: number;
  /** References so far. */
  time: number;
  hits: number;
  faults: number;
};

export type PagingStep = {
  page: number;
  hit: boolean;
  /** The frame that held the page (a hit) or now holds it (a fault). */
  frame: number;
  /** The page replaced, or null (a hit, or a fault into a free frame). */
  evicted: number | null;
  /** Clock: frames whose use bit was cleared while the hand looked for a victim, in order. */
  passedOver: readonly number[];
};

export function createPaging(policy: ReplacementPolicy, frames: number): PagingState {
  if (!Number.isInteger(frames) || frames < 1) throw new Error('Paging needs at least one frame');
  return {
    policy,
    frames: Array<number | null>(frames).fill(null),
    loadedAt: Array<number>(frames).fill(-1),
    usedAt: Array<number>(frames).fill(-1),
    useBits: Array<boolean>(frames).fill(false),
    hand: 0,
    time: 0,
    hits: 0,
    faults: 0,
  };
}

/** The index of the smallest value (the first one on a tie). */
const argmin = (xs: readonly number[]) => xs.reduce((best, x, i) => (x < xs[best] ? i : best), 0);

/** The frame OPT replaces: the one whose page is next used furthest ahead (never counts as furthest; ties go to the lowest frame). */
export function optVictim(frames: readonly (number | null)[], future: readonly number[]): number {
  let best = 0;
  let bestNext = -1;
  frames.forEach((page, i) => {
    const at = future.indexOf(page as number);
    const next = at < 0 ? Infinity : at;
    if (next > bestNext) {
      best = i;
      bestNext = next;
    }
  });
  return best;
}

/**
 * One reference. `future` is the references after this one: only OPT reads it.
 */
export function pagingStep(s: PagingState, page: number, future: readonly number[] = []): { state: PagingState; step: PagingStep } {
  const time = s.time + 1;
  const frames = [...s.frames];
  const loadedAt = [...s.loadedAt];
  const usedAt = [...s.usedAt];
  const useBits = [...s.useBits];
  let hand = s.hand;

  const held = frames.indexOf(page);
  if (held >= 0) {
    usedAt[held] = time;
    useBits[held] = true;
    return {
      state: { ...s, frames, loadedAt, usedAt, useBits, time, hits: s.hits + 1 },
      step: { page, hit: true, frame: held, evicted: null, passedOver: [] },
    };
  }

  let frame = frames.indexOf(null);
  const passedOver: number[] = [];
  if (frame < 0) {
    if (s.policy === 'fifo') frame = argmin(loadedAt);
    else if (s.policy === 'lru') frame = argmin(usedAt);
    else if (s.policy === 'opt') frame = optVictim(frames, future);
    else {
      while (useBits[hand]) {
        useBits[hand] = false;
        passedOver.push(hand);
        hand = (hand + 1) % frames.length;
      }
      frame = hand;
    }
  }
  const evicted = frames[frame];
  frames[frame] = page;
  loadedAt[frame] = time;
  usedAt[frame] = time;
  useBits[frame] = true;
  // The hand moves past the frame it just filled, so a new page isn't the first one looked at.
  if (s.policy === 'clock' && frame === hand) hand = (hand + 1) % frames.length;
  return {
    state: { ...s, frames, loadedAt, usedAt, useBits, hand, time, faults: s.faults + 1 },
    step: { page, hit: false, frame, evicted, passedOver },
  };
}

export type PagingRun = { states: PagingState[]; steps: PagingStep[]; faults: number; hits: number };

/** A whole reference string. `states[i]` is the state after reference i. */
export function simulatePaging(refs: readonly number[], frames: number, policy: ReplacementPolicy): PagingRun {
  let state = createPaging(policy, frames);
  const states: PagingState[] = [];
  const steps: PagingStep[] = [];
  refs.forEach((page, i) => {
    const r = pagingStep(state, page, refs.slice(i + 1));
    state = r.state;
    states.push(state);
    steps.push(r.step);
  });
  return { states, steps, faults: state.faults, hits: state.hits };
}

export const faultsOf = (refs: readonly number[], frames: number, policy: ReplacementPolicy) => simulatePaging(refs, frames, policy).faults;

/** The reference string that shows Bélády's anomaly under FIFO. */
export const BELADY_REFS = [1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5] as const;

/**
 * Bélády's anomaly: FIFO faults on `refs` with `frames` frames and with one
 * more. On BELADY_REFS, 3 frames fault 9 times and 4 frames 10 times.
 */
export function beladyAnomaly(refs: readonly number[] = BELADY_REFS, frames = 3): { fewer: number; more: number; anomaly: boolean } {
  const fewer = faultsOf(refs, frames, 'fifo');
  const more = faultsOf(refs, frames + 1, 'fifo');
  return { fewer, more, anomaly: more > fewer };
}
