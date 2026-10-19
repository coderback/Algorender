import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  advance,
  clientWrite,
  committedLog,
  crash,
  createCluster,
  heal,
  leaderOf,
  leaders,
  partition,
  restart,
  serverById,
  step,
  type Cluster,
  type Entry,
  type Server,
} from './raft';

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

/** Steps until a predicate holds or `ms` of simulated time pass. */
function runUntil(c: Cluster, done: (c: Cluster) => boolean, ms: number): Cluster {
  const until = c.time + ms;
  let state = c;
  while (!done(state) && state.time <= until) {
    const r = step(state);
    if (r.event.kind === 'idle') break;
    state = r.state;
  }
  return state;
}

const elect = (c: Cluster) => runUntil(c, (s) => leaderOf(s) !== null, 5000);

/**
 * Checks Raft's safety properties as a run goes on: it keeps what it has seen
 * (the leader of each term, the entry committed at each index) and checks
 * every new state against it.
 */
class SafetyMonitor {
  leaderOfTerm = new Map<number, string>();
  committed = new Map<number, Entry>();
  problems: string[] = [];

  observe(c: Cluster) {
    for (const s of c.servers) {
      if (s.role === 'leader') {
        const known = this.leaderOfTerm.get(s.term);
        if (known && known !== s.id) this.problems.push(`election safety: ${known} and ${s.id} both lead term ${s.term}`);
        if (!known) {
          this.leaderOfTerm.set(s.term, s.id);
          // Leader completeness: a new leader holds every entry committed so far.
          for (const [index, entry] of this.committed) {
            const mine = s.log[index - 1];
            if (!mine || mine.term !== entry.term || mine.value !== entry.value) this.problems.push(`leader completeness: ${s.id} (term ${s.term}) lacks committed entry ${index}`);
          }
        }
      }
      // State machine safety: one value per committed index, ever.
      for (let i = 1; i <= s.commitIndex; i++) {
        const e = s.log[i - 1];
        if (!e) {
          this.problems.push(`${s.id} commits past its log`);
          break;
        }
        const known = this.committed.get(i);
        if (known && (known.term !== e.term || known.value !== e.value)) this.problems.push(`state machine safety: index ${i} committed as two values`);
        if (!known) this.committed.set(i, e);
      }
    }
    // Log matching: same index and term means identical logs up to there.
    for (const a of c.servers) {
      for (const b of c.servers) {
        if (a.id >= b.id) continue;
        const n = Math.min(a.log.length, b.log.length);
        for (let i = n; i >= 1; i--) {
          if (a.log[i - 1].term === b.log[i - 1].term) {
            for (let j = 1; j <= i; j++) {
              if (a.log[j - 1].term !== b.log[j - 1].term || a.log[j - 1].value !== b.log[j - 1].value) {
                this.problems.push(`log matching: ${a.id} and ${b.id} agree at ${i} but differ at ${j}`);
              }
            }
            break;
          }
        }
      }
    }
  }
}

type Action =
  | { kind: 'run'; ms: number }
  | { kind: 'write'; value: string }
  | { kind: 'crash'; who: number }
  | { kind: 'restart'; who: number }
  | { kind: 'partition'; cut: number }
  | { kind: 'heal' };

const action: fc.Arbitrary<Action> = fc.oneof(
  { weight: 5, arbitrary: fc.integer({ min: 10, max: 400 }).map((ms): Action => ({ kind: 'run', ms })) },
  { weight: 3, arbitrary: fc.constantFrom('a', 'b', 'c', 'd').map((value): Action => ({ kind: 'write', value })) },
  { weight: 1, arbitrary: fc.nat(4).map((who): Action => ({ kind: 'crash', who })) },
  { weight: 1, arbitrary: fc.nat(4).map((who): Action => ({ kind: 'restart', who })) },
  { weight: 1, arbitrary: fc.integer({ min: 1, max: 15 }).map((cut): Action => ({ kind: 'partition', cut })) },
  { weight: 1, arbitrary: fc.constant<Action>({ kind: 'heal' }) },
);

/** Applies an action, stepping one event at a time through runs so every state is observed. */
function apply(c: Cluster, a: Action, watch: (c: Cluster) => void): Cluster {
  const id = (n: number) => c.servers[n % c.servers.length].id;
  switch (a.kind) {
    case 'run': {
      const until = c.time + a.ms;
      let state = c;
      for (;;) {
        const r = step(state);
        if (r.event.kind === 'idle' || r.state.time > until) return state;
        state = r.state;
        watch(state);
      }
    }
    case 'write':
      return clientWrite(c, a.value).state;
    case 'crash':
      return serverById(c, id(a.who)).up ? crash(c, id(a.who)) : c;
    case 'restart':
      return serverById(c, id(a.who)).up ? c : restart(c, id(a.who));
    case 'partition': {
      // A bitmask over the servers picks one side; never an empty side.
      const side = c.servers.filter((_, i) => (a.cut >> i) & 1).map((s) => s.id);
      const other = c.servers.map((s) => s.id).filter((s) => !side.includes(s));
      return side.length && other.length ? partition(c, [side, other]) : c;
    }
    case 'heal':
      return heal(c);
  }
}

describe('raft', () => {
  it('elects one leader in a fresh cluster, which then commits writes on every server', () => {
    for (const size of [3, 5]) {
      for (const seed of [1, 2, 3, 42]) {
        let c = elect(createCluster(size, seed));
        const l = leaderOf(c)!;
        expect(l).not.toBeNull();
        expect(leaders(c)).toHaveLength(1);
        expect(l.term).toBeGreaterThanOrEqual(1);
        for (const v of ['x', 'y']) c = clientWrite(c, v).state;
        c = advance(c, 300);
        for (const s of c.servers) {
          expect(s.log.map((e) => e.value)).toEqual(['x', 'y']);
          expect(s.commitIndex).toBe(2);
        }
        expect(committedLog(c).map((e) => e.value)).toEqual(['x', 'y']);
        expect(c.stats.committed).toBe(2);
      }
    }
  });

  it('is deterministic for a seed and never changes the state it is given', () => {
    const run = () => {
      let c = elect(createCluster(5, 9));
      c = clientWrite(c, 'x').state;
      return advance(crash(c, leaderOf(c)!.id), 600);
    };
    expect(run()).toEqual(run());
    const c = deepFreeze(elect(createCluster(5, 9)));
    expect(() => advance(clientWrite(crash(partition(c, [['S1', 'S2'], ['S3', 'S4', 'S5']]), 'S3'), 'v').state, 800)).not.toThrow();
  });

  it('only lets a leader take writes, and refuses unknown targets', () => {
    const c = elect(createCluster(3, 5));
    const follower = c.servers.find((s) => s.role === 'follower')!;
    expect(clientWrite(c, 'x', follower.id).accepted).toBe(false);
    const r = clientWrite(c, 'x');
    expect(r.accepted).toBe(true);
    expect(r.index).toBe(1);
    expect(clientWrite(createCluster(3, 5), 'x').accepted).toBe(false);
  });

  it('keeps a minority side from electing or committing, and makes a stale leader step down on heal', () => {
    let c = elect(createCluster(5, 4));
    const old = leaderOf(c)!;
    const buddy = c.servers.find((s) => s.id !== old.id)!.id;
    const minority = [old.id, buddy];
    c = partition(c, [minority, c.servers.map((s) => s.id).filter((id) => !minority.includes(id))]);
    // The old leader still takes a write but can't commit it.
    c = clientWrite(c, 'lost', old.id).state;
    c = advance(c, 1500);
    const now = leaders(c);
    expect(now).toHaveLength(2);
    const fresh = now.find((s) => s.id !== old.id)!;
    expect(fresh.term).toBeGreaterThan(old.term);
    expect(serverById(c, old.id).commitIndex).toBe(0);
    c = clientWrite(c, 'kept', fresh.id).state;
    c = advance(c, 300);
    c = advance(heal(c), 600);
    expect(leaders(c).map((s) => s.id)).toEqual([fresh.id]);
    for (const s of c.servers) expect(s.log.map((e) => e.value)).toEqual(['kept']);
  });

  it('refuses a vote to a candidate whose log is behind', () => {
    let c = elect(createCluster(5, 6));
    const l = leaderOf(c)!.id;
    const lag = c.servers.find((s) => s.id !== l)!.id;
    c = crash(c, lag);
    c = clientWrite(c, 'x').state;
    c = advance(c, 300);
    c = restart(crash(c, l), lag);
    // Make the lagging server time out first.
    c = { ...c, messages: [], servers: c.servers.map((s) => (s.id === lag ? { ...s, deadline: c.time + 1 } : s)) };
    const r = step(c);
    expect(r.event).toMatchObject({ kind: 'election', server: lag });
    let state = r.state;
    const reasons: string[] = [];
    for (let i = 0; i < 12; i++) {
      const e = step(state);
      state = e.state;
      if (e.event.kind === 'delivered' && e.event.message.kind === 'request-vote' && e.event.message.from === lag) {
        expect(e.event.outcome.kind).toBe('vote');
        if (e.event.outcome.kind === 'vote') reasons.push(e.event.outcome.reason);
      }
    }
    expect(reasons).toContain('log-behind');
    expect(reasons).not.toContain('granted');
  });

  it('never commits an entry from an earlier term by counting replicas (Figure 8)', () => {
    // S1 leads term 3 with entries from terms 1 and 2 that a majority store, but none of its own.
    const base = createCluster(3, 1);
    const log: Entry[] = [
      { term: 1, value: 'a' },
      { term: 2, value: 'b' },
    ];
    const s = (id: string, patch: Partial<Server>): Server => ({ ...serverById(base, id), term: 3, log, deadline: 10_000, ...patch });
    let c: Cluster = {
      ...base,
      servers: [
        s('S1', { role: 'leader', votedFor: 'S1', nextIndex: { S2: 3, S3: 3 }, matchIndex: { S1: 2, S2: 0, S3: 0 }, deadline: 10_000 }),
        s('S2', { votedFor: 'S1' }),
        s('S3', {}),
      ],
      messages: [{ id: 1, kind: 'append-reply', from: 'S2', to: 'S1', term: 3, success: true, matchIndex: 2, sentAt: 0, deliverAt: 1 }],
      nextMessage: 2,
    };
    c = step(c).state;
    expect(serverById(c, 'S1').matchIndex.S2).toBe(2);
    expect(serverById(c, 'S1').commitIndex).toBe(0);
    // Once an entry of term 3 is stored on a majority, everything before it commits too.
    c = clientWrite(c, 'c').state;
    c = runUntil(c, (x) => serverById(x, 'S1').commitIndex === 3, 200);
    expect(serverById(c, 'S1').commitIndex).toBe(3);
  });

  it('backs nextIndex off until the logs match, then repairs the follower', () => {
    let c = elect(createCluster(3, 8));
    const l = leaderOf(c)!.id;
    const f = c.servers.find((s) => s.id !== l)!.id;
    c = advance(clientWrite(c, 'x').state, 200);
    c = crash(c, f);
    for (const v of ['y', 'z']) c = clientWrite(c, v).state;
    c = advance(c, 200);
    // Let the old leader's last messages arrive (or be lost) before the follower is back.
    c = restart(advance(crash(c, l), 100), f);
    c = elect(c);
    expect(leaderOf(c)!.id).not.toBe(f);
    c = advance(c, 400);
    expect(serverById(c, f).log.map((e) => e.value)).toEqual(['x', 'y', 'z']);
  });

  it('keeps every safety property under random crashes, partitions and writes, and recovers once healed', () => {
    fc.assert(
      fc.property(fc.constantFrom(3, 5), fc.integer({ min: 0, max: 10_000 }), fc.array(action, { minLength: 1, maxLength: 30 }), (size, seed, actions) => {
        const monitor = new SafetyMonitor();
        let c = createCluster(size, seed);
        for (const a of actions) {
          c = apply(c, a, (x) => monitor.observe(x));
          monitor.observe(c);
        }
        expect(monitor.problems.slice(0, 5)).toEqual([]);

        // Liveness: heal, restart everyone, and a leader appears and commits a write.
        c = heal(c);
        for (const s of c.servers) if (!s.up) c = restart(c, s.id);
        c = runUntil(c, (x) => leaderOf(x) !== null, 5000);
        const l = leaderOf(c);
        expect(l).not.toBeNull();
        // A client retries a write that times out (a leader deposed just after taking it may leave it
        // uncommitted, since a new leader only commits entries from its own term).
        let done = false;
        for (let attempt = 0; attempt < 4 && !done; attempt++) {
          c = runUntil(c, (x) => leaderOf(x) !== null, 5000);
          const w = clientWrite(c, `final${attempt}`);
          expect(w.accepted).toBe(true);
          c = runUntil(w.state, (x) => committedLog(x).some((e) => e.value === `final${attempt}`), 1000);
          monitor.observe(c);
          done = committedLog(c).some((e) => e.value === `final${attempt}`);
        }
        expect(done).toBe(true);
        expect(monitor.problems.slice(0, 5)).toEqual([]);
      }),
      { numRuns: 150 },
    );
  });
});
