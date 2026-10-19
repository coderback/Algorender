import { defineStructure, type ArgSpec, type OperationSpec } from '@/engine/module';
import { createRng } from '@/engine/random';
import type { Checkpoint, Frame, VarValue } from '@/engine/types';
import {
  advance,
  clientWrite,
  committedLog,
  connected,
  crash,
  createCluster,
  heal,
  lastIndex,
  lastTerm,
  leaderOf,
  leaders,
  majority,
  nextEvent,
  partition,
  restart,
  serverById,
  step,
  type Cluster,
  type Message,
  type RaftEvent,
  type Server,
  type ServerId,
} from '@/systems/raft';
import type { MarkKey } from '@/viz/marks';
import { GridTracer, type Ref } from '@/viz/grid/tracer';
import type { GridState } from '@/viz/grid/types';

// Raft, driven by the learner: let time run, write through the leader, crash
// and restart servers, split and heal the network. The view shows each
// server's role, term, vote, commit index and timer, every server's log side
// by side (committed entries marked), and the messages in flight. The
// simulation itself is src/systems/raft.ts; this module narrates its events,
// folding routine heartbeats into a count so a run stays short.

type Model = Cluster;

export const MAX_LOG = 10;
export const VALUE_MAX_LENGTH = 2;

const SERVERS = 'servers';
const LOG = 'log';
const NET = 'messages';
const [TERM, VOTE, VOTES, COMMIT, TIMER, SIDE] = [0, 1, 2, 3, 4, 5];

/** How far a run goes. */
export const UNTIL = {
  leader: 'a new leader is elected',
  caughtUp: 'every log catches up',
  short: '100 ms pass',
  long: '1 s passes',
} as const;
const UNTIL_OPTIONS = Object.values(UNTIL);
const LIMIT: Record<string, number> = { [UNTIL.leader]: 3000, [UNTIL.caughtUp]: 2000, [UNTIL.short]: 100, [UNTIL.long]: 1000 };
/** Interesting events shown one by one in a run; any more are only counted. */
const MAX_SHOWN = 28;
const WRITE_WINDOW = 200;

const rulesCode = [
  'on election timeout:',
  '  term += 1; vote for self',
  '  ask every server for its vote',
  'on RequestVote(term, last entry):',
  '  grant if no other vote this term',
  '    and its log is as up to date',
  'on votes from a majority:',
  '  become leader; send heartbeats',
  'on AppendEntries(prev, entries):',
  '  no entry matching prev: reject',
  '  else replace conflicts, append',
  '  commit up to leaderCommit',
  'leader, on a reply:',
  '  rejected: back off nextIndex',
  '  majority store a new-term entry:',
  '    commit it (and all before it)',
  'any message with a higher term:',
  '  adopt it, become a follower',
  'leader, every heartbeat interval:',
  '  send AppendEntries to everyone',
];
const L = { election: 1, ask: 3, grant: 4, upToDate: 5, tally: 6, elected: 7, append: 8, mismatch: 9, appended: 10, follow: 11, reply: 12, backOff: 13, commit: 15, newer: 16, heartbeat: 19 };

const writeCode = [
  'client: write(v) to the leader',
  'leader: append (term, v) to its log',
  '  send AppendEntries to followers',
  'follower: append, reply ok',
  'leader: stored on a majority?',
  '  commit; tell followers next time',
];

// Where a rule of Raft shows up in a write's own pseudo-code.
const writeLine = (line: number | null) => (line === L.appended || line === L.follow ? 3 : line === L.commit ? 4 : null);

const crashCode = ['crash(s): the server stops', '  keeps on disk: term, vote, log', '  loses: role, commit index'];
const restartCode = ['restart(s):', '  reload term, vote and log', '  start as a follower, commit 0', '  new random election timeout'];
const partitionCode = ['split the network in two', '  messages between sides are lost', '  only a side with a majority', '    can elect a leader or commit'];
const healCode = ['reconnect every server', '  a stale leader hears a higher term', '    and steps down'];

// ── Words ────────────────────────────────────────────────────────────────────

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const lastOf = (index: number, term: number) => (index === 0 ? 'empty' : `ending at index ${index}, term ${term}`);
const logOf = (s: Server) => lastOf(lastIndex(s), lastTerm(s));
const entryText = (term: number, value: string) => `${term}:${value}`;
const sideOf = (c: Model, id: ServerId) => (c.groups ? String.fromCharCode(65 + c.groups.findIndex((g) => g.includes(id))) : '–');
const groupText = (g: readonly ServerId[]) => g.join(' ');

const kindName: Record<Message['kind'], string> = {
  'request-vote': 'RequestVote',
  vote: 'vote reply',
  append: 'AppendEntries',
  'append-reply': 'AppendEntries reply',
};

function messageText(c: Model, m: Message): string {
  const what =
    m.kind === 'request-vote'
      ? 'vote for me?'
      : m.kind === 'vote'
        ? `vote: ${m.granted ? 'yes' : 'no'}`
        : m.kind === 'append'
          ? m.entries.length > 0
            ? `append ${m.entries.map((e) => entryText(e.term, e.value)).join(' ')}`
            : 'heartbeat'
          : m.success
            ? `ok, up to ${m.matchIndex}`
            : 'rejected';
  return `${m.from}→${m.to} ${what} (t${m.term}) · in ${m.deliverAt - c.time} ms`;
}

/** The largest set of up servers that can all reach each other. */
function largestReachable(c: Model): number {
  const groups = c.groups ?? [c.servers.map((s) => s.id)];
  return Math.max(...groups.map((g) => g.filter((id) => serverById(c, id).up).length));
}

function whyNoProgress(c: Model): string {
  const k = largestReachable(c);
  const n = c.servers.length;
  if (k < majority(c)) return `at most ${k} of ${n} servers are up and can reach each other, and it takes ${majority(c)} to elect a leader or commit anything`;
  return 'the candidates kept splitting the vote';
}

// ── Drawing ──────────────────────────────────────────────────────────────────

type Highlight = { note: string; line?: number | null; arriving?: number; vars?: Record<string, VarValue>; checkpoint?: Checkpoint };

/**
 * One frame of the cluster. `prev` is the cluster before this step: cells whose
 * value changed since then, and new log entries, are marked as just changed.
 */
function render(c: Model, prev: Model | null, h: Highlight): Frame<GridState> {
  const t = new GridTracer(['elections', 'messages', 'lost', 'committed']);
  t.count('elections', c.stats.elections);
  t.count('messages', c.stats.delivered);
  t.count('lost', c.stats.dropped);
  t.count('committed', c.stats.committed);

  t.addTable({
    id: SERVERS,
    label: 'Servers',
    corner: 'Server',
    // Table cells are small squares, so the role sits under the server's name.
    rows: c.servers.map((s) => ({ id: s.id, label: s.id, sub: !s.up ? 'down' : s.role })),
    cols: [{ label: 'Term' }, { label: 'Vote', sub: 'for' }, { label: 'Got', sub: 'votes' }, { label: 'Cmt', sub: 'index' }, { label: 'Timer', sub: 'ms' }, { label: 'Side' }],
    group: 'raft',
  });
  c.servers.forEach((s, row) => {
    t.set([SERVERS, row, TERM], s.term);
    t.set([SERVERS, row, VOTE], s.votedFor ?? '–');
    t.set([SERVERS, row, VOTES], s.up && s.role === 'candidate' ? s.votes.length : '');
    t.set([SERVERS, row, COMMIT], s.up ? s.commitIndex : '–');
    t.set([SERVERS, row, TIMER], !s.up ? '–' : s.role === 'leader' ? `♥${s.deadline - c.time}` : s.deadline - c.time);
    t.set([SERVERS, row, SIDE], sideOf(c, s.id));
  });

  const width = Math.max(1, ...c.servers.map((s) => s.log.length));
  t.addTable({
    id: LOG,
    label: 'Logs: term:value at each index',
    corner: 'Log',
    rows: c.servers.map((s) => ({ id: s.id, label: s.id })),
    cols: Array.from({ length: width }, (_, i) => ({ label: String(i + 1) })),
    group: 'raft',
  });
  c.servers.forEach((s, row) => s.log.forEach((e, i) => t.set([LOG, row, i], entryText(e.term, e.value))));

  t.addList({ id: NET, label: 'Messages in flight, soonest first', empty: 'None' });
  for (const m of [...c.messages].sort((a, b) => a.deliverAt - b.deliverAt || a.id - b.id)) t.addItem(NET, { id: `m${m.id}`, text: messageText(c, m) });

  const marks: Partial<Record<MarkKey, Ref[]>> = {};
  const add = (mark: MarkKey, ref: Ref) => (marks[mark] ??= []).push(ref);
  c.servers.forEach((s, row) => {
    if (!s.up) add('reject', { row, table: SERVERS });
    else if (s.role === 'leader') add('key', { row, table: SERVERS });
    else if (s.role === 'candidate') add('frontier', { row, table: SERVERS });
    s.log.forEach((e, i) => {
      const before = prev?.servers[row].log[i];
      if (prev && (!before || before.term !== e.term || before.value !== e.value)) add('write', [LOG, row, i]);
      else if (s.up && i < s.commitIndex) add('sorted', [LOG, row, i]);
    });
    const was = prev?.servers[row];
    if (was && s.up && was.up) {
      if (was.role === 'candidate' && s.role === 'candidate' && was.votes.length !== s.votes.length) add('write', [SERVERS, row, VOTES]);
      if (was.term !== s.term) add('write', [SERVERS, row, TERM]);
      if (was.votedFor !== s.votedFor && s.votedFor) add('write', [SERVERS, row, VOTE]);
      if (was.commitIndex !== s.commitIndex) add('write', [SERVERS, row, COMMIT]);
    }
  });
  if (h.arriving != null && c.messages.some((m) => m.id === h.arriving)) add('compare', { item: `m${h.arriving}`, list: NET });

  const l = leaderOf(c);
  return t.frame({
    note: h.note,
    line: h.line ?? null,
    marks,
    vars: {
      time: `${c.time} ms`,
      leader: l ? `${l.id} (term ${l.term})` : 'none',
      majority: `${majority(c)} of ${c.servers.length}`,
      ...(c.groups && { network: c.groups.map(groupText).join(' | ') }),
      ...h.vars,
    },
    ...(h.checkpoint && { checkpoint: h.checkpoint }),
  });
}

// ── Narrating one event ──────────────────────────────────────────────────────

type Told = { note: string; line: number | null; shown: boolean };

/** What an event did and why, and whether a run should show it (routine heartbeats and acks are only counted). */
function tell(e: RaftEvent, before: Model, after: Model): Told {
  const n = after.servers.length;
  const maj = majority(after);
  switch (e.kind) {
    case 'idle':
      return { note: 'Nothing is scheduled: every server is down.', line: null, shown: true };
    case 'election': {
      const was = serverById(before, e.server);
      const again = was.role === 'candidate' ? `Its election for term ${was.term} got no majority in time, so it tries again: ` : `It hasn't heard from a leader within its election timeout, so `;
      const reach = after.servers.filter((s) => s.id !== e.server && connected(after, e.server, s.id)).length;
      const cut = reach < n - 1 ? ` (only ${plural(reach, 'server')} on its side of the split will hear it)` : '';
      return {
        note: `${e.server}'s election timer runs out at ${after.time} ms. ${again}it starts term ${e.term}, votes for itself and asks the other servers for their votes${cut}.`,
        line: L.election,
        shown: true,
      };
    }
    case 'heartbeat': {
      const reach = after.servers.filter((s) => s.id !== e.server && s.up && connected(after, e.server, s.id)).length + 1;
      const alone = reach < maj ? ` It can reach only ${plural(reach - 1, 'other server')}, so nothing it takes can commit.` : '';
      return {
        note: `${e.server}, the leader of term ${e.term}, sends AppendEntries to its followers (empty ones are heartbeats). Each one resets a follower's election timer, so no one starts an election while the leader is alive.${alone}`,
        line: L.heartbeat,
        shown: false,
      };
    }
    case 'dropped': {
      const m = e.message;
      const important = m.kind === 'request-vote' || m.kind === 'vote' || (m.kind === 'append' && m.entries.length > 0);
      const why = e.reason === 'down' ? `${m.to} is down` : `the network between ${m.from} and ${m.to} is cut`;
      return { note: `The ${kindName[m.kind]} from ${m.from} to ${m.to} is lost: ${why}.`, line: null, shown: important };
    }
    case 'delivered':
      return delivered(e, before, after);
  }
}

function delivered(e: Extract<RaftEvent, { kind: 'delivered' }>, before: Model, after: Model): Told {
  const m = e.message;
  const n = after.servers.length;
  const maj = majority(after);
  const was = serverById(before, m.to);
  const now = serverById(after, m.to);
  const down = e.steppedDown ? `${m.to} sees term ${m.term}, newer than its own ${was.term}, so it steps down to follower. ` : '';
  const o = e.outcome;

  if (o.kind === 'vote' && m.kind === 'request-vote') {
    const moved = !e.steppedDown && m.term > was.term ? `${m.to} moves up to term ${m.term}, where it hasn't voted yet. ` : down;
    const theirs = lastOf(m.lastLogIndex, m.lastLogTerm);
    switch (o.reason) {
      case 'granted':
        return {
          note: `${moved}${m.to} grants ${m.from} its vote for term ${m.term}: it hasn't voted for anyone else in this term, and ${m.from}'s log (${theirs}) is at least as up to date as its own (${logOf(was)}).`,
          line: L.upToDate,
          shown: true,
        };
      case 'already-voted':
        return {
          note: `${moved}${m.to} refuses ${m.from}: it already voted for ${now.votedFor} in term ${m.term}, and a server votes at most once per term, so two candidates can never both get its vote.`,
          line: L.grant,
          shown: true,
        };
      case 'log-behind':
        return {
          note: `${moved}${m.to} refuses ${m.from}: ${m.from}'s log (${theirs}) is behind ${m.to}'s (${logOf(was)}): ${m.lastLogTerm < lastTerm(was) ? `its last entry has an older term` : `the same last term, but a shorter log`}. A leader must already hold every committed entry, so a candidate whose log is behind can't win.`,
          line: L.upToDate,
          shown: true,
        };
      case 'stale-term':
        return {
          note: `${m.to} refuses ${m.from}: the request is for term ${m.term}, but ${m.to} is already in term ${now.term}. Its reply carries the newer term, which makes ${m.from} step down.`,
          line: L.grant,
          shown: true,
        };
    }
  }

  if (o.kind === 'tally' && m.kind === 'vote') {
    if (!o.counted) {
      const note =
        now.role === 'leader' && now.term === m.term
          ? `${m.from}'s vote reaches ${m.to}, which has already won term ${m.term}, so it changes nothing.`
          : `${down}${m.from}'s vote is for term ${m.term}, but ${m.to} is no longer a candidate in that term, so it is ignored.`;
      return { note, line: e.steppedDown ? L.newer : L.tally, shown: e.steppedDown };
    }
    if (o.elected) {
      return {
        note: `${m.from}'s vote gives ${m.to} ${o.votes} of ${n} votes, a majority: it becomes leader of term ${m.term} and at once sends AppendEntries to everyone, so no other server starts an election.`,
        line: L.elected,
        shown: true,
      };
    }
    return {
      note: m.granted ? `${m.to} now has ${o.votes} of ${n} votes; it needs ${maj}.` : `${m.from} said no, so ${m.to} still has ${o.votes} of ${n} votes; it needs ${maj}.`,
      line: L.tally,
      shown: true,
    };
  }

  if (o.kind === 'append' && m.kind === 'append') {
    if (!o.ok && o.reason === 'stale-term') {
      return {
        note: `${m.to} rejects ${m.from}'s AppendEntries: it is from term ${m.term}, but ${m.to} is in term ${now.term}. The reply tells ${m.from} that it is out of date.`,
        line: L.append,
        shown: true,
      };
    }
    const follows = was.role === 'candidate' ? `${m.to} gives up its candidacy: ${m.from} already leads term ${m.term}. ` : down;
    if (!o.ok) {
      const has = m.prevIndex > was.log.length ? `its log ends at index ${was.log.length}` : `its entry there has term ${was.log[m.prevIndex - 1].term}`;
      return {
        note: `${follows}${m.to} has no entry at index ${m.prevIndex} with term ${m.prevTerm} (${has}), so its log may differ from the leader's before the new entries: it rejects them.`,
        line: L.mismatch,
        shown: true,
      };
    }
    const commit =
      o.commitTo > o.commitFrom ? ` The leader has committed up to ${m.leaderCommit}, so ${m.to} commits up to ${o.commitTo} too.` : '';
    if (o.added > 0 || o.removed > 0) {
      const match = m.prevIndex === 0 ? `Its log agrees with the leader's from the start` : `It has the leader's entry at index ${m.prevIndex} (term ${m.prevTerm}), so its log agrees up to there`;
      const removed = o.removed > 0 ? `removes ${plural(o.removed, 'conflicting entry', 'conflicting entries')} the leader doesn't have, and ` : '';
      return {
        note: `${follows}${m.to} gets ${plural(m.entries.length, 'entry', 'entries')} from ${m.from}. ${match}: it ${removed}appends ${plural(o.added, 'entry', 'entries')} and replies ok.${commit}`,
        line: o.commitTo > o.commitFrom ? L.follow : L.appended,
        shown: true,
      };
    }
    if (commit) {
      return { note: `${follows}${m.to} learns from ${m.from} that entries up to ${m.leaderCommit} are committed, and commits up to ${o.commitTo}.`, line: L.follow, shown: true };
    }
    return {
      note: `${follows}${m.to} hears from its leader ${m.from}: it resets its election timer and replies ok.`,
      line: L.append,
      shown: follows !== '',
    };
  }

  if (o.kind === 'ack' && m.kind === 'append-reply') {
    if (!o.counted) {
      return {
        note: `${down}${m.from}'s reply is for term ${m.term}, but ${m.to} no longer leads that term, so it is ignored.`,
        line: e.steppedDown ? L.newer : L.reply,
        shown: e.steppedDown,
      };
    }
    if (!o.ok) {
      return {
        note: `${m.from} rejected, so ${m.to} steps its nextIndex for ${m.from} back to ${o.nextIndex} and resends from there, one entry further back each time until the logs agree.`,
        line: L.backOff,
        shown: true,
      };
    }
    if (o.commitTo > o.commitFrom) {
      const stored = after.servers.filter((s) => (now.matchIndex[s.id] ?? 0) >= o.commitTo).length;
      const earlier = o.commitTo - o.commitFrom > 1 ? `, and so are entries ${o.commitFrom + 1}–${o.commitTo - 1} before it` : '';
      return {
        note: `${m.from} now stores entries up to ${m.matchIndex}. Entry ${o.commitTo} is on ${stored} of ${n} servers, a majority, and is from ${m.to}'s own term ${now.term}: it is committed${earlier}. Followers learn this from the next AppendEntries.`,
        line: L.commit,
        shown: true,
      };
    }
    // Stored on a majority but from an earlier term: Raft's Figure 8 rule holds it back.
    const pending = now.log.findIndex((x, i) => i >= now.commitIndex && x.term !== now.term);
    const stuck =
      pending >= 0 && after.servers.filter((s) => (now.matchIndex[s.id] ?? 0) > pending).length >= maj && !now.log.slice(now.commitIndex).some((x) => x.term === now.term);
    if (stuck) {
      return {
        note: `Entry ${pending + 1} is now on a majority, but it is from term ${now.log[pending].term}, not ${m.to}'s term ${now.term}. Raft never commits an old-term entry by counting copies (a later leader could still overwrite it); it commits once an entry of the current term reaches a majority.`,
        line: L.commit,
        shown: true,
      };
    }
    return { note: `${m.from} confirms it stores everything up to entry ${m.matchIndex}.`, line: L.reply, shown: false };
  }
  return { note: `${kindName[m.kind]} from ${m.from} reaches ${m.to}.`, line: null, shown: false };
}

const quietNote = (quiet: number) => (quiet > 0 ? ` Meanwhile ${plural(quiet, 'routine message')} (heartbeats and their replies) came and went.` : '');

// ── Runs ─────────────────────────────────────────────────────────────────────

/**
 * Whether every up server the leader can reach holds the leader's log and
 * commit index. A follower may hold extra uncommitted entries past the end of
 * the leader's log (from an old leader): Raft only removes them when the
 * leader writes at those indexes.
 */
/** Followers holding uncommitted entries past the end of the leader's log, in words (or ''). */
function leftovers(c: Model, l: Server): string {
  const extra = c.servers.filter((s) => s.up && s.log.length > l.log.length).map((s) => s.id);
  if (extra.length === 0) return '';
  return ` ${extra.join(' and ')} still ${extra.length === 1 ? 'holds' : 'hold'} uncommitted entries past the end of ${l.id}'s log, from an old leader: Raft leaves them until ${l.id} writes at those indexes, then they are overwritten.`;
}

export function caughtUp(c: Model): boolean {
  const l = leaderOf(c);
  if (!l) return false;
  return c.servers.every(
    (s) =>
      !s.up ||
      !connected(c, l.id, s.id) ||
      (s.id === l.id || s.role === 'follower') && (s.term === l.term && s.commitIndex === l.commitIndex && s.log.length >= l.log.length && l.log.every((e, i) => e.term === s.log[i].term && e.value === s.log[i].value)),
  );
}

type Stop = (event: RaftEvent, state: Model) => boolean;

/**
 * Runs events until `stop` holds or `ms` pass, yielding a frame for each
 * interesting event (routine traffic is counted into the next note). Returns
 * the final state, how many routine messages went unshown, and whether it stopped.
 */
function* runEvents(start: Model, ms: number, stop: Stop, lineOf: (line: number | null) => number | null = (x) => x): Generator<Frame<GridState>, { state: Model; quiet: number; stopped: boolean }> {
  const until = start.time + ms;
  let state = start;
  let quiet = 0;
  let shown = 0;
  for (;;) {
    const next = nextEvent(state);
    if (!next || next.at > until) return { state: { ...state, time: until }, quiet, stopped: false };
    const r = step(state);
    const told = tell(r.event, state, r.state);
    if (told.shown && shown < MAX_SHOWN) {
      yield render(r.state, state, { note: told.note + quietNote(quiet), line: lineOf(told.line) });
      shown++;
      quiet = 0;
    } else quiet++;
    state = r.state;
    if (stop(r.event, state)) return { state, quiet, stopped: true };
  }
}

const elected: Stop = (e) => e.kind === 'delivered' && e.outcome.kind === 'tally' && e.outcome.elected;

/** Who a run would elect first, by running it. */
function firstElected(c: Model, ms: number): ServerId | null {
  const until = c.time + ms;
  let state = c;
  for (;;) {
    const next = nextEvent(state);
    if (!next || next.at > until) return null;
    const r = step(state);
    if (elected(r.event, r.state)) return r.event.kind === 'delivered' ? r.event.message.to : null;
    state = r.state;
  }
}

// ── Operations ───────────────────────────────────────────────────────────────

const nothingScheduled = (m: Model) => (nextEvent(m) ? null : 'Every server is down and nothing is in flight: restart a server first.');

const stepOp: OperationSpec<Model, GridState> = {
  id: 'step',
  label: 'Next event',
  args: [],
  pseudocode: rulesCode,
  disabledReason: nothingScheduled,
  *run(m) {
    const next = nextEvent(m);
    if (!next) return m;
    const r = step(m);
    let note: string;
    let checkpoint: Checkpoint | undefined;
    if ('server' in next) {
      const s = serverById(m, next.server);
      const waiting = m.servers.filter((x) => x.up && x.role !== 'leader').map((x) => x.id);
      if (s.role === 'leader') note = `Next, at ${next.at} ms, a heartbeat timer goes off.`;
      else {
        note = `Next, at ${next.at} ms, an election timer runs out. Compare the timers.`;
        if (waiting.length >= 2) checkpoint = { question: 'Whose election timer runs out first?', choices: waiting, answer: waiting.indexOf(s.id) };
      }
    } else {
      const msg = next.message;
      note = `Next, at ${next.at} ms, the ${kindName[msg.kind]} from ${msg.from} reaches ${msg.to}.`;
      const ev = r.event;
      if (ev.kind === 'delivered' && ev.outcome.kind === 'vote' && msg.kind === 'request-vote') {
        checkpoint = { question: `Does ${msg.to} grant ${msg.from} its vote for term ${msg.term}?`, choices: ['Yes', 'No'], answer: ev.outcome.granted ? 0 : 1 };
      } else if (ev.kind === 'delivered' && ev.outcome.kind === 'tally' && ev.outcome.counted && msg.kind === 'vote' && msg.granted) {
        checkpoint = { question: `Does this vote make ${msg.to} the leader?`, choices: ['Yes', 'No'], answer: ev.outcome.elected ? 0 : 1 };
      }
    }
    yield render(m, null, { note, line: null, arriving: 'message' in next ? next.message.id : undefined, ...(checkpoint && { checkpoint }) });
    const told = tell(r.event, m, r.state);
    yield render(r.state, m, { note: told.note, line: told.line });
    return r.state;
  },
};

const UNTIL_ARG: ArgSpec<Model> = { name: 'until', label: 'Until', type: 'choice', options: () => UNTIL_OPTIONS };

const runOp: OperationSpec<Model, GridState> = {
  id: 'run',
  label: 'Run until',
  args: [UNTIL_ARG],
  pseudocode: rulesCode,
  disabledReason: nothingScheduled,
  *run(m, args) {
    const until = String(args.until);
    const ms = LIMIT[until];
    if (ms == null) return m;
    const lead = leaderOf(m);
    let checkpoint: Checkpoint | undefined;
    if (until === UNTIL.leader && !lead) {
      const ups = m.servers.filter((s) => s.up).map((s) => s.id);
      const choices = [...ups, 'No one'];
      const winner = firstElected(m, ms);
      checkpoint = { question: 'Who becomes leader?', choices, answer: winner ? choices.indexOf(winner) : choices.length - 1 };
    }
    const span = ms >= 1000 ? `${ms / 1000} s` : `${ms} ms`;
    const intro = until === UNTIL.short || until === UNTIL.long ? `Let ${span} pass.` : `Let time run until ${until} (at most ${span}).`;
    yield render(m, null, { note: intro, ...(checkpoint && { checkpoint }) });

    if (until === UNTIL.caughtUp && caughtUp(m)) {
      yield render(m, null, { note: `Already caught up: every server ${lead!.id} can reach holds the same log and has committed up to ${lead!.commitIndex}.${leftovers(m, lead!)}`, line: L.follow });
      return m;
    }
    const stop: Stop = until === UNTIL.leader ? elected : until === UNTIL.caughtUp ? (_, s) => caughtUp(s) : () => false;
    const { state, quiet, stopped } = yield* runEvents(m, ms, stop);

    let note: string;
    const now = leaderOf(state);
    if (until === UNTIL.leader) {
      if (stopped && now) note = `${now.id} leads term ${now.term}.`;
      else if (lead && serverById(state, lead.id).role === 'leader') note = `No election: ${lead.id} still leads term ${serverById(state, lead.id).term}, and its heartbeats keep every follower's election timer from running out.`;
      else note = `No leader after ${ms / 1000} s: ${whyNoProgress(state)}.`;
    } else if (until === UNTIL.caughtUp) {
      const tail = now ? leftovers(state, now) : '';
      note = stopped
        ? `Caught up: every server ${now!.id} can reach holds the same ${plural(now!.log.length, 'entry', 'entries')} and has committed up to ${now!.commitIndex}.${tail}`
        : now
          ? `Not caught up after ${ms / 1000} s${state.servers.some((s) => s.up && !connected(state, now.id, s.id)) ? '; servers on the other side of the split are left behind' : ''}.`
          : `No leader to catch up with: ${whyNoProgress(state)}.`;
    } else {
      const stale = now ? leaders(state).filter((s) => s.id !== now.id).map((s) => ` ${s.id} still thinks it leads term ${s.term}, cut off on the minority side, where it can commit nothing.`).join('') : '';
      note = `${ms >= 1000 ? `${ms / 1000} s` : `${ms} ms`} later, at ${state.time} ms. ${now ? `${now.id} leads term ${now.term}.` : 'There is no leader.'}${stale}`;
    }
    yield render(state, null, { note: note + quietNote(quiet), line: null });
    return state;
  },
};

const VALUE_ARG: ArgSpec<Model> = { name: 'value', label: 'Value', type: 'text', maxLength: VALUE_MAX_LENGTH, placeholder: 'e.g. x' };
const TO_ARG: ArgSpec<Model> = {
  name: 'to',
  label: 'Leader',
  type: 'choice',
  options: (m) => m.servers.filter((s) => s.up && s.role === 'leader').map((s) => s.id),
};

/** Whether the entry at `index` with this term and value is committed anywhere. */
const isCommitted = (c: Model, index: number, term: number, value: string) =>
  c.servers.some((s) => s.commitIndex >= index && s.log[index - 1]?.term === term && s.log[index - 1]?.value === value);

const writeOp: OperationSpec<Model, GridState> = {
  id: 'write',
  label: 'Write',
  args: [VALUE_ARG, TO_ARG],
  pseudocode: writeCode,
  disabledReason: (m, args) => {
    const ls = m.servers.filter((s) => s.up && s.role === 'leader');
    if (ls.length === 0) return 'No server is leader right now: run until a leader is elected.';
    const to = args && ls.find((s) => s.id === args.to);
    if (to && to.log.length >= MAX_LOG) return `This demo keeps logs to ${MAX_LOG} entries.`;
    return null;
  },
  *run(m, args) {
    const value = String(args.value ?? '').trim();
    const to = String(args.to);
    if (value.length === 0 || value.length > VALUE_MAX_LENGTH) return m;
    const target = m.servers.find((s) => s.id === to);
    if (!target || !target.up || target.role !== 'leader') return m;
    yield render(m, null, { note: `A client sends write(${value}) to ${to}, which leads term ${target.term}.`, line: 0, vars: { value } });

    const w = clientWrite(m, value, to);
    if (!w.accepted) return m;
    const index = w.index;
    // Look ahead: does it commit within the window?
    let probe = w.state;
    const end = probe.time + WRITE_WINDOW;
    for (;;) {
      const next = nextEvent(probe);
      if (!next || next.at > end || isCommitted(probe, index, target.term, value)) break;
      probe = step(probe).state;
    }
    const willCommit = isCommitted(probe, index, target.term, value);
    yield render(w.state, m, {
      note: `${to} appends (term ${target.term}, ${value}) at index ${index} of its log and sends it to its followers in AppendEntries. It isn't committed yet: that takes ${majority(m)} of ${m.servers.length} servers storing it.`,
      line: 2,
      vars: { value, index },
      checkpoint: { question: `Is entry ${index} committed within ${WRITE_WINDOW} ms?`, choices: ['Yes', 'No'], answer: willCommit ? 0 : 1 },
    });

    const { state, quiet, stopped } = yield* runEvents(w.state, WRITE_WINDOW, (_, s) => isCommitted(s, index, target.term, value), writeLine);
    let note: string;
    if (stopped) note = `Entry ${index} (${value}) is committed: a majority store it, so it will survive any later election. ${to} answers the client now.`;
    else {
      const l = serverById(state, to);
      note =
        l.role !== 'leader'
          ? `Entry ${index} isn't committed: ${to} lost its leadership before a majority stored it, and a new leader may overwrite it.`
          : `Entry ${index} isn't committed after ${WRITE_WINDOW} ms: ${to} can reach only ${plural(state.servers.filter((s) => s.id !== to && s.up && connected(state, to, s.id)).length, 'other server')} that ${state.servers.filter((s) => s.id !== to && s.up && connected(state, to, s.id)).length === 1 ? 'is' : 'are'} up, so it can't get the entry onto ${majority(state)} of ${state.servers.length}. The client keeps waiting.`;
    }
    yield render(state, null, { note: note + quietNote(quiet), line: stopped ? 5 : 4, vars: { value, index } });
    return state;
  },
};

const crashOp: OperationSpec<Model, GridState> = {
  id: 'crash',
  label: 'Crash',
  args: [{ name: 'server', label: 'Server', type: 'choice', options: (m) => m.servers.filter((s) => s.up).map((s) => s.id) }],
  pseudocode: crashCode,
  disabledReason: (m) => (m.servers.some((s) => s.up) ? null : 'Every server is already down.'),
  *run(m, args) {
    const id = String(args.server);
    const s = m.servers.find((x) => x.id === id);
    if (!s || !s.up) return m;
    const next = crash(m, id);
    const ups = next.servers.filter((x) => x.up).length;
    const leader = s.role === 'leader' ? ` With the leader gone, heartbeats stop: the first follower whose election timer runs out will start an election.` : '';
    const few = ups < majority(m) ? ` Only ${ups} of ${m.servers.length} servers are up now, fewer than ${majority(m)}: no leader can be elected and nothing new can be committed until one comes back.` : '';
    yield render(next, m, {
      note: `${id} crashes. It keeps what Raft writes to disk (term ${s.term}, its vote, its ${plural(s.log.length, 'entry', 'entries')}) and forgets its role and commit index.${leader}${few}`,
      line: 1,
    });
    return next;
  },
};

const restartOp: OperationSpec<Model, GridState> = {
  id: 'restart',
  label: 'Restart',
  args: [{ name: 'server', label: 'Server', type: 'choice', options: (m) => m.servers.filter((s) => !s.up).map((s) => s.id) }],
  pseudocode: restartCode,
  disabledReason: (m) => (m.servers.some((s) => !s.up) ? null : 'No server is down.'),
  *run(m, args) {
    const id = String(args.server);
    const s = m.servers.find((x) => x.id === id);
    if (!s || s.up) return m;
    const next = restart(m, id);
    const back = serverById(next, id);
    yield render(next, m, {
      note: `${id} restarts from its disk: term ${s.term}, vote ${s.votedFor ?? 'none'}, ${plural(s.log.length, 'entry', 'entries')}. It starts as a follower with commit index 0 and a fresh random election timeout (${back.deadline - next.time} ms); a leader's AppendEntries will tell it what is committed.`,
      line: 2,
    });
    return next;
  },
};

/** The splits on offer: each server alone, and for five servers two against three. */
export function splits(m: Model): string[] {
  const ids = m.servers.map((s) => s.id);
  const out = ids.map((id) => `${id} | ${groupText(ids.filter((x) => x !== id))}`);
  if (ids.length === 5) out.push(`${groupText(ids.slice(0, 2))} | ${groupText(ids.slice(2))}`, `${groupText(ids.slice(0, 3))} | ${groupText(ids.slice(3))}`);
  return out;
}

const parseSplit = (text: string) => text.split('|').map((g) => g.trim().split(/\s+/).filter(Boolean));

const partitionOp: OperationSpec<Model, GridState> = {
  id: 'partition',
  label: 'Split network',
  args: [{ name: 'split', label: 'Sides', type: 'choice', options: splits }],
  pseudocode: partitionCode,
  disabledReason: (m) => (m.groups ? 'The network is already split: heal it first.' : null),
  *run(m, args) {
    const groups = parseSplit(String(args.split));
    if (m.groups || groups.flat().length !== m.servers.length) return m;
    const next = partition(m, groups);
    const maj = majority(m);
    const big = groups.find((g) => g.length >= maj);
    const l = leaderOf(m);
    const lside = l ? groups.find((g) => g.includes(l.id))! : null;
    const leaderNote = !l
      ? ''
      : lside === big
        ? ` The leader ${l.id} is on the majority side and carries on.`
        : ` The leader ${l.id} is on the minority side: it still thinks it leads, but it can't commit anything, and the other side will elect a new leader in a higher term.`;
    yield render(next, m, {
      note: `The network splits into ${groups.map((g) => `{${groupText(g)}}`).join(' and ')}: messages between the sides are lost. Only a side with ${maj} of ${m.servers.length} servers can elect a leader or commit, so only {${groupText(big ?? [])}} can.${leaderNote}`,
      line: 3,
    });
    return next;
  },
};

const healOp: OperationSpec<Model, GridState> = {
  id: 'heal',
  label: 'Heal network',
  args: [],
  pseudocode: healCode,
  disabledReason: (m) => (m.groups ? null : 'The network is whole.'),
  *run(m) {
    if (!m.groups) return m;
    const next = heal(m);
    const ls = next.servers.filter((s) => s.up && s.role === 'leader').sort((a, b) => a.term - b.term);
    const stale =
      ls.length > 1
        ? ` ${ls[0].id} still thinks it leads term ${ls[0].term}; the first message it gets from term ${ls[ls.length - 1].term} makes it step down, and its uncommitted entries are overwritten once the new leader writes at those indexes.`
        : ' Servers that were cut off catch up from the leader’s next AppendEntries, and any with an older term adopt the newer one.';
    yield render(next, m, { note: `The network heals: every server can reach every other again.${stale}`, line: 1 });
    return next;
  },
};

// ── Starting states ──────────────────────────────────────────────────────────

// A seed whose first election has a single candidate, and whose lagging server times out first.
const SEED = 40;

function elect(c: Model): Model {
  let state = c;
  for (let i = 0; i < 5000 && !leaderOf(state); i++) {
    if (!nextEvent(state)) break;
    state = step(state).state;
  }
  return state;
}

function writeAll(c: Model, values: readonly string[], settle = 300): Model {
  let state = c;
  for (const v of values) state = clientWrite(state, v).state;
  return advance(state, settle);
}

const steady = () => writeAll(elect(createCluster(5, SEED)), ['a', 'b', 'c']);

function split(): Model {
  let c = steady();
  const l = leaderOf(c)!;
  const buddy = c.servers.find((s) => s.id !== l.id)!.id;
  const minority = [l.id, buddy].sort();
  c = partition(c, [minority, c.servers.map((s) => s.id).filter((id) => !minority.includes(id))]);
  c = clientWrite(c, 'd', l.id).state;
  return advance(c, 800);
}

function lagging(): Model {
  let c = writeAll(elect(createCluster(5, SEED)), ['a']);
  const l = leaderOf(c)!.id;
  const lag = c.servers.find((s) => s.id !== l)!.id;
  c = writeAll(crash(c, lag), ['b', 'c']);
  c = advance(crash(c, l), 30);
  return restart(c, lag);
}

function random(seed: number): Model {
  const rng = createRng(seed);
  let c = elect(createCluster(rng() < 0.5 ? 3 : 5, seed));
  const writes = 1 + Math.floor(rng() * 3);
  c = writeAll(c, ['p', 'q', 'r'].slice(0, writes), 150);
  if (rng() < 0.5) {
    const l = leaderOf(c);
    const victim = c.servers[Math.floor(rng() * c.servers.length)].id;
    if (l && victim !== l.id) c = writeAll(crash(c, victim), ['s'], 150);
  }
  return c;
}

export const raftStructure = defineStructure<Model, GridState>({
  kind: 'structure',
  slug: 'raft',
  view: 'grid',
  initial: [
    { id: 'fresh-5', label: '5 servers, before the first election', make: () => createCluster(5, SEED) },
    { id: 'fresh-3', label: '3 servers, before the first election', make: () => createCluster(3, 5) },
    { id: 'steady', label: 'A leader and 3 committed entries', make: steady },
    { id: 'split', label: 'Split, the old leader on the small side', make: split },
    { id: 'lagging', label: 'No leader, and one server missed writes', make: lagging },
    { id: 'random', label: 'Random', make: random },
  ],
  snapshot: (m) => {
    const l = leaderOf(m);
    return render(m, null, {
      note: `${m.servers.length} servers at ${m.time} ms. ${l ? `${l.id} leads term ${l.term}; ${plural(committedLog(m).length, 'entry is', 'entries are')} committed.` : 'There is no leader yet.'}`,
    }).state;
  },
  operations: [runOp, stepOp, writeOp, crashOp, restartOp, partitionOp, healOp],
  stats: [
    { key: 'elections', label: 'Elections' },
    { key: 'messages', label: 'Messages' },
    { key: 'lost', label: 'Lost' },
    { key: 'committed', label: 'Committed' },
  ],
  legend: [
    { neutral: 'Follower, or an entry not yet committed' },
    { mark: 'key', label: 'Leader' },
    { mark: 'frontier', label: 'Candidate' },
    { mark: 'reject', label: 'Crashed' },
    { mark: 'sorted', label: 'Committed entry' },
    { mark: 'write', label: 'Just changed' },
    { mark: 'compare', label: 'Message arriving next' },
  ],
  content: {
    idea: 'Raft keeps a cluster of servers agreeing on one log of commands while some of them crash or the network splits. The servers elect a leader; it appends each write to its log and copies it to the others, and an entry from the leader’s own term is committed once a majority of servers store it (earlier entries commit along with it).',
    invariant: 'At most one leader per term, and every committed entry is in the log of every later leader: a server votes once per term, only for a candidate whose log is at least as up to date as its own, and any two majorities share a server.',
    whenToUse: 'Whenever several machines must agree on one order of events and survive failures: replicated databases and key-value stores (etcd, Consul, CockroachDB, TiKV), cluster configuration, leader election and locks. With 2f + 1 servers it survives f crashed or cut-off servers. It assumes servers fail by stopping, not by lying.',
    traits: [
      { label: 'Survives f failures with 2f + 1 servers', good: true },
      { label: 'Every write waits for a majority', good: false },
      { label: 'Only a side with a majority makes progress', good: null },
      { label: 'Random timeouts make split votes rare', good: true },
    ],
    experiments: [
      { example: 'fresh-5', prompt: 'Run until a new leader is elected: whose timer runs out first, and how many votes does it need?' },
      { example: 'steady', prompt: 'Crash the leader, then run until a new leader is elected: every committed entry is still there.' },
      { example: 'split', prompt: 'Write to the old leader on the small side: the entry never commits. Write to the new leader, heal the network and run until every log catches up: the old leader steps down and its uncommitted entries are replaced by the new leader’s.' },
      { example: 'lagging', prompt: 'Step through the next events: the server that missed writes can time out, but no one votes for it. Then watch the new leader back up until its log matches.' },
    ],
  },
});
