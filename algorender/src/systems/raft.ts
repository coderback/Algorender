// Raft consensus (Ongaro & Ousterhout, "In Search of an Understandable
// Consensus Algorithm", 2014), as a deterministic discrete-event simulation.
//
// A cluster of 3 or 5 servers elects a leader with randomised election
// timeouts and RequestVote (granted at most once per term, and only to a
// candidate whose log is at least as up to date), then replicates a log with
// AppendEntries (each carrying the index and term of the entry before the new
// ones, so a follower only appends where its log matches the leader's; on a
// mismatch the leader steps back one entry and retries). A leader commits an
// entry once it is stored on a majority, but only entries from its own term
// (Figure 8 of the paper): earlier entries then commit with it.
//
// Messages take a random few milliseconds to arrive. The network can be split
// into groups (a partition) and servers can crash and restart: a restarted
// server keeps what Raft keeps on disk (its term, its vote and its log) and
// loses the rest (its role and commit index).
//
// The state is plain immutable data. `step` handles exactly one event (a timer
// firing or a message arriving) and says what happened, so a visualiser can
// narrate it and the system-design canvas (phase 6d) can drive a replicated
// store with `clientWrite`, `crash`, `restart`, `partition` and `heal`, and
// read `leaderOf` and `committedLog`. Randomness comes from a seed kept in the
// state, so a run replays exactly.

export type ServerId = string;
export type Role = 'follower' | 'candidate' | 'leader';
export type Entry = { readonly term: number; readonly value: string };

export type Server = {
  readonly id: ServerId;
  readonly up: boolean;
  readonly role: Role;
  /** Persistent: the latest term this server has seen. */
  readonly term: number;
  /** Persistent: who it voted for in `term`, if anyone. */
  readonly votedFor: ServerId | null;
  /** Persistent: entry i (1-based) is log[i − 1]. */
  readonly log: readonly Entry[];
  /** Volatile: the highest index known to be committed. */
  readonly commitIndex: number;
  /** Followers and candidates: when the election timer fires. Leaders: when the next heartbeat goes out. */
  readonly deadline: number;
  /** A candidate's votes in this term, itself included. */
  readonly votes: readonly ServerId[];
  /** The leader it last heard from in this term. */
  readonly leader: ServerId | null;
  /** Leaders only: the next index to send each follower, and the highest index known to be stored there. */
  readonly nextIndex: Readonly<Record<ServerId, number>>;
  readonly matchIndex: Readonly<Record<ServerId, number>>;
};

type Envelope = { readonly id: number; readonly from: ServerId; readonly to: ServerId; readonly term: number; readonly sentAt: number; readonly deliverAt: number };

export type Message = Envelope &
  (
    | { readonly kind: 'request-vote'; readonly lastLogIndex: number; readonly lastLogTerm: number }
    | { readonly kind: 'vote'; readonly granted: boolean }
    | { readonly kind: 'append'; readonly prevIndex: number; readonly prevTerm: number; readonly entries: readonly Entry[]; readonly leaderCommit: number }
    | { readonly kind: 'append-reply'; readonly success: boolean; readonly matchIndex: number }
  );

/** All times in milliseconds of simulated time. */
export type Timing = {
  readonly electionMin: number;
  readonly electionMax: number;
  readonly heartbeat: number;
  readonly latencyMin: number;
  readonly latencyMax: number;
};

export const DEFAULT_TIMING: Timing = { electionMin: 150, electionMax: 300, heartbeat: 50, latencyMin: 8, latencyMax: 16 };

export type Cluster = {
  readonly servers: readonly Server[];
  /** Messages in flight, in the order they were sent. */
  readonly messages: readonly Message[];
  readonly time: number;
  /** The random generator's state (mulberry32). */
  readonly rng: number;
  readonly nextMessage: number;
  /** The network's sides when partitioned: servers only reach servers in their own group. */
  readonly groups: readonly (readonly ServerId[])[] | null;
  readonly timing: Timing;
  readonly stats: {
    readonly elections: number;
    readonly delivered: number;
    readonly dropped: number;
    /** The most entries ever known committed. Committed entries are never lost, so this never goes down. */
    readonly committed: number;
  };
};

export type VoteReason = 'granted' | 'stale-term' | 'already-voted' | 'log-behind';

/** What handling a delivered message did. */
export type Outcome =
  | { readonly kind: 'vote'; readonly granted: boolean; readonly reason: VoteReason }
  | { readonly kind: 'tally'; readonly counted: boolean; readonly votes: number; readonly elected: boolean }
  | {
      readonly kind: 'append';
      readonly ok: boolean;
      readonly reason: 'ok' | 'stale-term' | 'mismatch';
      readonly added: number;
      readonly removed: number;
      readonly commitFrom: number;
      readonly commitTo: number;
    }
  | { readonly kind: 'ack'; readonly counted: boolean; readonly ok: boolean; readonly nextIndex: number; readonly commitFrom: number; readonly commitTo: number };

export type RaftEvent =
  | { readonly kind: 'idle' }
  | { readonly kind: 'election'; readonly server: ServerId; readonly term: number }
  | { readonly kind: 'heartbeat'; readonly server: ServerId; readonly term: number; readonly sent: number }
  | { readonly kind: 'dropped'; readonly message: Message; readonly reason: 'down' | 'cut off' }
  | { readonly kind: 'delivered'; readonly message: Message; readonly steppedDown: boolean; readonly outcome: Outcome };

// ── Readers ──────────────────────────────────────────────────────────────────

export const majority = (c: Cluster) => Math.floor(c.servers.length / 2) + 1;
export const lastIndex = (s: Server) => s.log.length;
export const lastTerm = (s: Server) => s.log[s.log.length - 1]?.term ?? 0;
export const serverById = (c: Cluster, id: ServerId) => {
  const s = c.servers.find((x) => x.id === id);
  if (!s) throw new Error(`No server ${id}`);
  return s;
};

/** Whether a message can get from a to b right now (the network, not whether b is up). */
export function connected(c: Pick<Cluster, 'groups'>, a: ServerId, b: ServerId): boolean {
  if (!c.groups) return true;
  return c.groups.some((g) => g.includes(a) && g.includes(b));
}

/** Raft's "at least as up to date": a later last term wins; with equal last terms, the longer log. */
export function upToDate(candidate: { lastLogIndex: number; lastLogTerm: number }, voter: Server): boolean {
  if (candidate.lastLogTerm !== lastTerm(voter)) return candidate.lastLogTerm > lastTerm(voter);
  return candidate.lastLogIndex >= lastIndex(voter);
}

/** Servers that are up and believe they lead (two at once only across a partition, in different terms). */
export const leaders = (c: Cluster) => c.servers.filter((s) => s.up && s.role === 'leader');

/** The up leader with the newest term, or null. */
export function leaderOf(c: Cluster): Server | null {
  return leaders(c).reduce<Server | null>((best, s) => (best && best.term >= s.term ? best : s), null);
}

/** The committed prefix of the log, from the server that knows the most of it. */
export function committedLog(c: Cluster): readonly Entry[] {
  const best = c.servers.reduce((a, b) => (b.commitIndex > a.commitIndex ? b : a));
  return best.log.slice(0, best.commitIndex);
}

/** The next event and when it happens, without handling it: messages first on a tie, then timers in server order. */
export function nextEvent(c: Cluster): { at: number; message: Message } | { at: number; server: ServerId } | null {
  let best: { at: number; message: Message } | { at: number; server: ServerId } | null = null;
  for (const m of c.messages) if (!best || m.deliverAt < best.at) best = { at: m.deliverAt, message: m };
  for (const s of c.servers) if (s.up && (!best || s.deadline < best.at)) best = { at: s.deadline, server: s.id };
  return best;
}

// ── Building and changing a cluster ──────────────────────────────────────────

/** One mulberry32 draw from a stored state: [a number in [0, 1), the next state]. */
function draw(state: number): [number, number] {
  const a = (state + 0x6d2b79f5) >>> 0;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, a];
}

export function createCluster(size: number, seed: number, timing: Timing = DEFAULT_TIMING): Cluster {
  if (size !== 3 && size !== 5) throw new Error('A cluster has 3 or 5 servers');
  const d = new Draft({
    servers: [],
    messages: [],
    time: 0,
    rng: seed >>> 0,
    nextMessage: 1,
    groups: null,
    timing,
    stats: { elections: 0, delivered: 0, dropped: 0, committed: 0 },
  });
  for (let i = 1; i <= size; i++) {
    d.servers.push({
      id: `S${i}`,
      up: true,
      role: 'follower',
      term: 0,
      votedFor: null,
      log: [],
      commitIndex: 0,
      deadline: d.electionTimeout(),
      votes: [],
      leader: null,
      nextIndex: {},
      matchIndex: {},
    });
  }
  return d.done();
}

/**
 * A client write, sent to `to` (default: the up leader with the newest term).
 * Only a leader accepts it: it appends the entry and sends it to every
 * follower at once. It is committed later, once a majority store it.
 */
export function clientWrite(c: Cluster, value: string, to?: ServerId): { state: Cluster; accepted: boolean; server: ServerId | null; index: number } {
  const target = to ? c.servers.find((s) => s.id === to) : leaderOf(c);
  if (!target || !target.up || target.role !== 'leader') return { state: c, accepted: false, server: target?.id ?? null, index: 0 };
  const d = new Draft(c);
  const s = d.server(target.id);
  d.set(s.id, { log: [...s.log, { term: s.term, value }], matchIndex: { ...s.matchIndex, [s.id]: s.log.length + 1 } });
  for (const peer of d.servers) if (peer.id !== s.id) d.sendAppend(s.id, peer.id);
  return { state: d.done(), accepted: true, server: s.id, index: s.log.length + 1 };
}

/** The server stops. Its disk (term, vote, log) survives; its role and commit index don't. */
export function crash(c: Cluster, id: ServerId): Cluster {
  const d = new Draft(c);
  d.set(id, { up: false, role: 'follower', commitIndex: 0, votes: [], leader: null, nextIndex: {}, matchIndex: {} });
  return d.done();
}

/** The server comes back as a follower with a fresh election timeout, its disk as it was. */
export function restart(c: Cluster, id: ServerId): Cluster {
  const d = new Draft(c);
  d.set(id, { up: true, role: 'follower', commitIndex: 0, votes: [], leader: null, nextIndex: {}, matchIndex: {}, deadline: d.time + d.electionTimeout() });
  return d.done();
}

/** Splits the network: every server in exactly one group. Messages already in flight across the split are lost. */
export function partition(c: Cluster, groups: readonly (readonly ServerId[])[]): Cluster {
  const all = groups.flat();
  if (all.length !== c.servers.length || new Set(all).size !== all.length || c.servers.some((s) => !all.includes(s.id))) {
    throw new Error('A partition puts every server in exactly one group');
  }
  return { ...c, groups: groups.map((g) => [...g]) };
}

export const heal = (c: Cluster): Cluster => ({ ...c, groups: null });

/** Lets `ms` pass, handling every event due by then. */
export function advance(c: Cluster, ms: number): Cluster {
  const until = c.time + ms;
  let state = c;
  for (;;) {
    const next = nextEvent(state);
    if (!next || next.at > until) return { ...state, time: until };
    state = step(state).state;
  }
}

/** Handles the next event: a timer firing (an election or a heartbeat) or a message arriving. */
export function step(c: Cluster): { state: Cluster; event: RaftEvent } {
  const next = nextEvent(c);
  if (!next) return { state: c, event: { kind: 'idle' } };
  const d = new Draft(c);
  d.time = next.at;

  if ('server' in next) {
    const s = d.server(next.server);
    if (s.role === 'leader') {
      let sent = 0;
      for (const peer of d.servers) if (peer.id !== s.id && d.sendAppend(s.id, peer.id)) sent++;
      d.set(s.id, { deadline: d.time + d.timing.heartbeat });
      return { state: d.done(), event: { kind: 'heartbeat', server: s.id, term: s.term, sent } };
    }
    const term = s.term + 1;
    d.set(s.id, { role: 'candidate', term, votedFor: s.id, votes: [s.id], leader: null, deadline: d.time + d.electionTimeout() });
    d.stats = { ...d.stats, elections: d.stats.elections + 1 };
    for (const peer of d.servers) {
      if (peer.id !== s.id) d.send({ kind: 'request-vote', from: s.id, to: peer.id, term, lastLogIndex: lastIndex(s), lastLogTerm: lastTerm(s) });
    }
    return { state: d.done(), event: { kind: 'election', server: s.id, term } };
  }

  const m = next.message;
  d.messages = d.messages.filter((x) => x.id !== m.id);
  const to = d.server(m.to);
  if (!to.up || !connected(d, m.from, m.to)) {
    d.stats = { ...d.stats, dropped: d.stats.dropped + 1 };
    return { state: d.done(), event: { kind: 'dropped', message: m, reason: to.up ? 'cut off' : 'down' } };
  }
  d.stats = { ...d.stats, delivered: d.stats.delivered + 1 };

  // Any message from a newer term: adopt the term and become a follower.
  let steppedDown = false;
  if (m.term > to.term) {
    steppedDown = to.role !== 'follower';
    d.set(to.id, {
      term: m.term,
      votedFor: null,
      role: 'follower',
      votes: [],
      leader: null,
      nextIndex: {},
      matchIndex: {},
      ...(to.role === 'leader' && { deadline: d.time + d.electionTimeout() }),
    });
  }
  const outcome = d.handle(m);
  return { state: d.done(), event: { kind: 'delivered', message: m, steppedDown, outcome } };
}

// ── The draft: a private, mutable copy for building the next state ───────────

type Body =
  | { kind: 'request-vote'; from: ServerId; to: ServerId; term: number; lastLogIndex: number; lastLogTerm: number }
  | { kind: 'vote'; from: ServerId; to: ServerId; term: number; granted: boolean }
  | { kind: 'append'; from: ServerId; to: ServerId; term: number; prevIndex: number; prevTerm: number; entries: readonly Entry[]; leaderCommit: number }
  | { kind: 'append-reply'; from: ServerId; to: ServerId; term: number; success: boolean; matchIndex: number };

class Draft {
  servers: Server[];
  messages: Message[];
  time: number;
  rng: number;
  nextMessage: number;
  groups: Cluster['groups'];
  timing: Timing;
  stats: Cluster['stats'];

  constructor(c: Cluster) {
    this.servers = [...c.servers];
    this.messages = [...c.messages];
    this.time = c.time;
    this.rng = c.rng;
    this.nextMessage = c.nextMessage;
    this.groups = c.groups;
    this.timing = c.timing;
    this.stats = c.stats;
  }

  done(): Cluster {
    const committed = Math.max(this.stats.committed, ...this.servers.map((s) => s.commitIndex));
    return {
      servers: this.servers,
      messages: this.messages,
      time: this.time,
      rng: this.rng,
      nextMessage: this.nextMessage,
      groups: this.groups,
      timing: this.timing,
      stats: committed === this.stats.committed ? this.stats : { ...this.stats, committed },
    };
  }

  server(id: ServerId): Server {
    const s = this.servers.find((x) => x.id === id);
    if (!s) throw new Error(`No server ${id}`);
    return s;
  }

  set(id: ServerId, patch: Partial<Server>) {
    this.servers = this.servers.map((s) => (s.id === id ? { ...s, ...patch } : s));
  }

  /** A whole number in [min, max]. */
  random(min: number, max: number): number {
    const [x, next] = draw(this.rng);
    this.rng = next;
    return min + Math.floor(x * (max - min + 1));
  }

  electionTimeout(): number {
    return this.random(this.timing.electionMin, this.timing.electionMax);
  }

  /** Sends a message, unless the network already separates the two servers (then it is lost at once). */
  send(body: Body): boolean {
    if (!connected(this, body.from, body.to)) {
      this.stats = { ...this.stats, dropped: this.stats.dropped + 1 };
      return false;
    }
    const message = { ...body, id: this.nextMessage, sentAt: this.time, deliverAt: this.time + this.random(this.timing.latencyMin, this.timing.latencyMax) } as Message;
    this.nextMessage++;
    this.messages.push(message);
    return true;
  }

  /** The leader's AppendEntries to one follower: every entry from its nextIndex on (none makes it a heartbeat). */
  sendAppend(leaderId: ServerId, to: ServerId): boolean {
    const l = this.server(leaderId);
    const next = l.nextIndex[to] ?? l.log.length + 1;
    const prevIndex = next - 1;
    return this.send({
      kind: 'append',
      from: l.id,
      to,
      term: l.term,
      prevIndex,
      prevTerm: prevIndex > 0 ? l.log[prevIndex - 1].term : 0,
      entries: l.log.slice(prevIndex),
      leaderCommit: l.commitIndex,
    });
  }

  handle(m: Message): Outcome {
    const s = this.server(m.to);
    switch (m.kind) {
      case 'request-vote': {
        let reason: VoteReason = 'granted';
        if (m.term < s.term) reason = 'stale-term';
        else if (s.votedFor !== null && s.votedFor !== m.from) reason = 'already-voted';
        else if (!upToDate(m, s)) reason = 'log-behind';
        const granted = reason === 'granted';
        if (granted) this.set(s.id, { votedFor: m.from, deadline: this.time + this.electionTimeout() });
        this.send({ kind: 'vote', from: s.id, to: m.from, term: this.server(s.id).term, granted });
        return { kind: 'vote', granted, reason };
      }
      case 'vote': {
        if (s.role !== 'candidate' || m.term !== s.term) return { kind: 'tally', counted: false, votes: s.votes.length, elected: false };
        const votes = m.granted && !s.votes.includes(m.from) ? [...s.votes, m.from] : s.votes;
        this.set(s.id, { votes });
        const elected = votes.length >= Math.floor(this.servers.length / 2) + 1;
        if (elected) this.becomeLeader(s.id);
        return { kind: 'tally', counted: true, votes: votes.length, elected };
      }
      case 'append': {
        const none = { added: 0, removed: 0, commitFrom: s.commitIndex, commitTo: s.commitIndex };
        if (m.term < s.term) {
          this.send({ kind: 'append-reply', from: s.id, to: m.from, term: s.term, success: false, matchIndex: 0 });
          return { kind: 'append', ok: false, reason: 'stale-term', ...none };
        }
        // A current leader: follow it, and put off any election.
        this.set(s.id, { role: 'follower', votes: [], leader: m.from, deadline: this.time + this.electionTimeout() });
        if (m.prevIndex > s.log.length || (m.prevIndex > 0 && s.log[m.prevIndex - 1].term !== m.prevTerm)) {
          this.send({ kind: 'append-reply', from: s.id, to: m.from, term: s.term, success: false, matchIndex: 0 });
          return { kind: 'append', ok: false, reason: 'mismatch', ...none };
        }
        let log = s.log;
        let added = 0;
        let removed = 0;
        m.entries.forEach((e, i) => {
          const index = m.prevIndex + 1 + i;
          if (index <= log.length && log[index - 1].term === e.term) return; // already there
          if (index <= log.length) {
            removed += log.length - (index - 1);
            log = log.slice(0, index - 1);
          }
          log = [...log, e];
          added++;
        });
        const lastNew = m.prevIndex + m.entries.length;
        const commitIndex = m.leaderCommit > s.commitIndex ? Math.max(s.commitIndex, Math.min(m.leaderCommit, lastNew)) : s.commitIndex;
        this.set(s.id, { log, commitIndex });
        this.send({ kind: 'append-reply', from: s.id, to: m.from, term: s.term, success: true, matchIndex: lastNew });
        return { kind: 'append', ok: true, reason: 'ok', added, removed, commitFrom: s.commitIndex, commitTo: commitIndex };
      }
      case 'append-reply': {
        const next = s.nextIndex[m.from] ?? s.log.length + 1;
        if (s.role !== 'leader' || m.term !== s.term) return { kind: 'ack', counted: false, ok: m.success, nextIndex: next, commitFrom: s.commitIndex, commitTo: s.commitIndex };
        if (!m.success) {
          const back = Math.max((s.matchIndex[m.from] ?? 0) + 1, next - 1);
          this.set(s.id, { nextIndex: { ...s.nextIndex, [m.from]: back } });
          this.sendAppend(s.id, m.from);
          return { kind: 'ack', counted: true, ok: false, nextIndex: back, commitFrom: s.commitIndex, commitTo: s.commitIndex };
        }
        const match = Math.max(s.matchIndex[m.from] ?? 0, m.matchIndex);
        const matchIndex = { ...s.matchIndex, [m.from]: match, [s.id]: s.log.length };
        // Commit the highest entry of this term that a majority store (earlier entries come with it).
        let commitIndex = s.commitIndex;
        for (let n = s.log.length; n > s.commitIndex; n--) {
          if (s.log[n - 1].term !== s.term) break;
          const stored = this.servers.filter((x) => (matchIndex[x.id] ?? 0) >= n).length;
          if (stored >= Math.floor(this.servers.length / 2) + 1) {
            commitIndex = n;
            break;
          }
        }
        this.set(s.id, { matchIndex, nextIndex: { ...s.nextIndex, [m.from]: match + 1 }, commitIndex });
        return { kind: 'ack', counted: true, ok: true, nextIndex: match + 1, commitFrom: s.commitIndex, commitTo: commitIndex };
      }
    }
  }

  becomeLeader(id: ServerId) {
    const s = this.server(id);
    const nextIndex: Record<ServerId, number> = {};
    const matchIndex: Record<ServerId, number> = { [id]: s.log.length };
    for (const peer of this.servers) {
      if (peer.id === id) continue;
      nextIndex[peer.id] = s.log.length + 1;
      matchIndex[peer.id] = 0;
    }
    this.set(id, { role: 'leader', leader: id, votes: [], nextIndex, matchIndex, deadline: this.time + this.timing.heartbeat });
    for (const peer of this.servers) if (peer.id !== id) this.sendAppend(id, peer.id);
  }
}
