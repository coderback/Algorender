// A token-bucket rate limiter: the component the system-design canvas (phase
// 6d) puts in front of a service to protect it from more traffic than it can
// take. The bucket holds up to `capacity` tokens and refills at `refillRate`
// tokens a second; each request spends a token, and a request that finds the
// bucket empty is rejected. So bursts of up to `capacity` requests get through
// at once, but over time no more than `refillRate` a second (plus that first
// burst) ever do.
//
// The state is plain data and every function returns a new one. Times are in
// seconds.

export type BucketConfig = { capacity: number; refillRate: number };

export type BucketState = { tokens: number; time: number };

/** A request's fate: whether it got a token, and the tokens just before and after. */
export type Decision = { time: number; accepted: boolean; before: number; after: number };

/** Floating-point slack, so a bucket refilled to exactly one token isn't refused by rounding. */
const EPS = 1e-9;

/** A full bucket at `time`. */
export const createBucket = ({ capacity }: BucketConfig, time = 0): BucketState => ({ tokens: capacity, time });

/** The bucket at a later time: refilled for the time that passed, never past capacity. */
export function refill(state: BucketState, { capacity, refillRate }: BucketConfig, time: number): BucketState {
  if (time <= state.time) return state;
  return { tokens: Math.min(capacity, state.tokens + (time - state.time) * refillRate), time };
}

/** One request at `time` costing `cost` tokens: accepted if the refilled bucket holds enough. */
export function request(state: BucketState, config: BucketConfig, time: number, cost = 1): { state: BucketState; decision: Decision } {
  const now = refill(state, config, time);
  const accepted = now.tokens >= cost - EPS;
  const tokens = accepted ? Math.max(0, now.tokens - cost) : now.tokens;
  return { state: { tokens, time: now.time }, decision: { time, accepted, before: now.tokens, after: tokens } };
}

/** Every request in time order, starting from a full bucket at time 0. */
export function runBucket(config: BucketConfig, times: readonly number[]): { decisions: Decision[]; final: BucketState } {
  let state = createBucket(config);
  const decisions: Decision[] = [];
  for (const t of [...times].sort((a, b) => a - b)) {
    const r = request(state, config, t);
    state = r.state;
    decisions.push(r.decision);
  }
  return { decisions, final: state };
}

/** The most requests a bucket can ever let through in a window of `seconds`: a full bucket, then the refill. */
export const maxAccepted = ({ capacity, refillRate }: BucketConfig, seconds: number) => Math.floor(capacity + refillRate * seconds + EPS);
