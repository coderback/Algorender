import { defineStructure, type Args, type OperationSpec } from '@/engine/module';
import { createRng } from '@/engine/random';
import type { Frame } from '@/engine/types';
import type { MarkKey, Tone } from '@/viz/marks';
import { askInOrder, plotFrame } from '@/viz/plot/frame';
import { round } from '@/viz/plot/geometry';
import type { PlotPart, PlotState, Shape, Token, Vec } from '@/viz/plot/types';
import {
  addServer,
  arcs,
  createRing,
  fraction,
  hash32,
  loads,
  modMoved,
  movedKeys,
  ownerNode,
  ownership,
  placement,
  removeServer,
  RING_SIZE,
  spread,
  successorIndex,
  type Ring,
  type VNode,
} from '@/systems/ring';

// Consistent hashing on a ring (the model is src/systems/ring.ts): servers
// sit on a circle at the hashes of their virtual nodes, keys at the hashes of
// their names, and a key belongs to the first node clockwise. Adding or
// removing a server only moves the keys next to its nodes; the readouts
// compare that with plain hash mod N.

/** Server names, one series colour each. */
export const SERVERS = ['A', 'B', 'C', 'D'] as const;
const TONE: Record<string, Tone> = { A: 1, B: 2, C: 3, D: 4 };
export const MAX_KEYS = 16;
const WORDS = ['apple', 'banana', 'cherry', 'date', 'elder', 'fig', 'grape', 'kiwi', 'lemon', 'lime', 'mango', 'melon', 'olive', 'peach', 'pear', 'plum', 'quince', 'berry'];
const KEYS = WORDS.slice(0, 12);

/** The change the last add or remove made, for the readouts. */
export type Change = { moved: number; total: number; mod: number };
export type HashRingModel = { ring: Ring; keys: readonly string[]; last: Change | null };

type Stats = { hashed: number; moved: number };

// ───────────────────────────── drawing ─────────────────────────────

const RING_R = 1;
const KEY_R = 1.2;

/** Clockwise from the top: position 0 is 12 o'clock. */
const angle = (position: number) => Math.PI / 2 - 2 * Math.PI * fraction(position);
const at = (r: number, position: number): Vec => [round(r * Math.cos(angle(position))), round(r * Math.sin(angle(position)))];

/** Points along the circle of radius r, clockwise from `from` for `length` positions. */
function arcPoints(r: number, from: number, length: number): Vec[] {
  const n = Math.max(2, Math.ceil((64 * length) / RING_SIZE));
  return Array.from({ length: n + 1 }, (_, i) => at(r, from + (length * i) / n));
}

const pct = (x: number) => `${Math.round(100 * x)}%`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

type Look = {
  /** The ring whose arcs are tinted (before a change takes effect, the old one). */
  ring: Ring;
  /** Nodes drawn on top of it (a joining server's, before they own anything). */
  extra?: readonly VNode[];
  keys: readonly string[];
  /** Which server each key is shown on. */
  owner: ReadonlyMap<string, string>;
  keyMarks?: Readonly<Record<string, MarkKey>>;
  nodeMarks?: Readonly<Record<string, MarkKey>>;
  /** A key drawn and labelled even if it isn't stored (one being added or looked up). */
  focus?: string;
  /** A lookup's walk, clockwise from a key to the node that owns it. */
  walk?: { key: string; node: VNode };
  last: Change | null;
};

function parts(look: Look): PlotPart[] {
  const shapes: Shape[] = [{ kind: 'path', id: 'ring', points: arcPoints(RING_R, 0, RING_SIZE), closed: true, faint: true }];
  // Each node owns the wedge from the node before it up to itself.
  for (const a of arcs(look.ring)) {
    shapes.push({ kind: 'path', id: `arc-${a.node.id}`, points: [[0, 0], ...arcPoints(RING_R, a.from, a.length)], closed: true, fill: true, fillOpacity: 0.14, tone: TONE[a.node.server] });
  }
  const label = look.ring.replicas <= 3;
  for (const n of [...look.ring.nodes, ...(look.extra ?? [])]) {
    const mark = look.nodeMarks?.[n.id];
    shapes.push({ kind: 'point', id: `node-${n.id}`, at: at(RING_R, n.position), size: 'md', ...(mark ? { mark } : { tone: TONE[n.server] }), ...(label && { label: n.server }) });
  }
  const shown = look.focus && !look.keys.includes(look.focus) ? [...look.keys, look.focus] : look.keys;
  for (const k of shown) {
    const mark = look.keyMarks?.[k];
    shapes.push({ kind: 'point', id: `key-${k}`, at: at(KEY_R, hash32(k)), size: k === look.focus ? 'md' : 'sm', mark: mark ?? null, ...(k === look.focus && { label: `"${k}"` }) });
  }
  if (look.walk) {
    const from = hash32(look.walk.key);
    const length = (look.walk.node.position - from + RING_SIZE) % RING_SIZE;
    shapes.push({ kind: 'path', id: 'walk', points: arcPoints(KEY_R, from, length), mark: 'path', dashed: true });
    shapes.push({ kind: 'vector', id: 'walk-arrow', from: at(KEY_R, look.walk.node.position), to: at(RING_R + 0.06, look.walk.node.position), mark: 'path' });
  }

  const load = loads(look.ring, look.keys);
  const share = ownership(look.ring);
  const tokens: Token[] = look.keys.map((k) => {
    const mark = look.keyMarks?.[k];
    const s = look.owner.get(k) ?? '?';
    return { id: `k-${k}`, text: k, sub: `→ ${s}`, ...(mark ? { mark } : { tone: TONE[s] }) };
  });
  return [
    { kind: 'tokens', id: 'keys', label: 'Keys and the server each is stored on', tokens },
    {
      kind: 'plane',
      id: 'plane',
      label: 'The hash ring: each key belongs to the first server node clockwise from it',
      x: { min: -1.5, max: 1.5, ticks: [] },
      y: { min: -1.5, max: 1.5, ticks: [] },
      equal: true,
      shapes,
      handles: [],
    },
    {
      kind: 'readouts',
      id: 'load',
      label: 'Load',
      items: [
        ...look.ring.servers.map((s) => ({ id: `load-${s}`, label: `Server ${s}`, value: `${plural(load[s] ?? 0, 'key')} · ${pct(share[s] ?? 0)} of ring`, tone: TONE[s] })),
        { id: 'spread', label: 'Busiest ÷ average', value: spread(load).toFixed(2) },
        { id: 'last', label: 'Last change', value: look.last ? `${look.last.moved} of ${look.last.total} keys moved (mod N: ${look.last.mod})` : 'none yet' },
      ],
    },
  ];
}

const plainLook = (m: HashRingModel): Look => ({ ring: m.ring, keys: m.keys, owner: placement(m.ring, m.keys), last: m.last });

const frame = (look: Look, o: { note: string; line?: number | null; stats: Stats; checkpoint?: Frame<PlotState>['checkpoint'] }): Frame<PlotState> =>
  plotFrame(parts(look), { note: o.note, line: o.line, stats: { ...o.stats }, checkpoint: o.checkpoint });

/** "2 to C and 1 to A". */
function destinations(keys: readonly string[], after: ReadonlyMap<string, string>): string {
  const counts = new Map<string, number>();
  for (const k of keys) counts.set(after.get(k)!, (counts.get(after.get(k)!) ?? 0) + 1);
  const parts = [...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([s, n]) => `${n} to ${s}`);
  return parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
}

const markAll = (ids: readonly string[], mark: MarkKey) => Object.fromEntries(ids.map((id) => [id, mark])) as Record<string, MarkKey>;
/** A count question with up to four distinct choices in numeric order, or undefined when there's nothing to choose between. */
function howMany(question: string, answer: number, wrong: number[]) {
  const set = new Set([answer]);
  for (const w of wrong) if (w >= 0 && set.size < 4) set.add(w);
  if (set.size < 2) return undefined;
  const sorted = [...set].sort((a, b) => a - b).map(String);
  return askInOrder(question, sorted, String(answer));
}

// ───────────────────────────── operations ─────────────────────────────

const addServerCode = ['addServer(s):', '  for i ← 0 to v − 1:', '    place node s#i at hash(s#i)', '  for each arc ending at a node of s:', '    its keys move to s from the next node'];
const removeServerCode = ['removeServer(s):', '  for each node s#i on the ring:', '    remove s#i', '    its keys go to the next node clockwise'];
const addKeyCode = ['addKey(k):', '  p ← hash(k)', '  n ← first node at or after p', '  if none: n ← first node (wrap round)', '  store k on the server of n'];
const lookupCode = ['lookup(k):', '  p ← hash(k)', '  n ← first node at or after p', '  if none: n ← first node (wrap round)', '  return the server of n'];

function* changeServers(m: HashRingModel, s: string, joining: boolean): Generator<Frame<PlotState>, HashRingModel> {
  const before = m.ring;
  const after = joining ? addServer(before, s) : removeServer(before, s);
  const owner = placement(before, m.keys);
  const ownerAfter = placement(after, m.keys);
  const moved = movedKeys(before, after, m.keys);
  const mod = modMoved(before.servers, after.servers, m.keys).length;
  const n = before.servers.length;
  const v = before.replicas;
  const stats: Stats = { hashed: 0, moved: 0 };
  const last: Change = { moved: moved.length, total: m.keys.length, mod };

  if (joining) {
    const fresh = after.nodes.filter((x) => x.server === s);
    stats.hashed = v;
    yield frame(
      { ring: before, extra: fresh, keys: m.keys, owner, nodeMarks: markAll(fresh.map((x) => x.id), 'write'), last: m.last },
      {
        note: `Add server ${s}: hash its ${plural(v, 'virtual node')} (${s}#0${v > 1 ? '…' : ''}) onto the ring. Each one will take over the arc just before it.`,
        line: 2,
        stats,
        checkpoint: m.keys.length ? howMany(`How many of the ${m.keys.length} keys move?`, moved.length, [m.keys.length, mod, moved.length + 1, moved.length - 1]) : undefined,
      },
    );
    stats.moved = moved.length;
    const from = [...new Set(moved.map((k) => owner.get(k)!))].sort();
    yield frame(
      { ring: after, keys: m.keys, owner: ownerAfter, keyMarks: markAll(moved, 'write'), last: m.last },
      {
        note:
          moved.length === 0
            ? `None of the keys sat in the arcs ${s} took over, so nothing moves.`
            : `Only the keys in the arcs ${s} took over move: ${moved.length} of ${m.keys.length}, from ${from.join(' and ')} to ${s}. Every other key stays where it was.`,
        line: 4,
        stats,
      },
    );
  } else {
    const leaving = before.nodes.filter((x) => x.server === s);
    const held = m.keys.filter((k) => owner.get(k) === s);
    const remaining = after.servers.slice().sort();
    const successor = held.length && after.nodes.length ? ownerAfter.get(held[0])! : null;
    const sameHome = held.every((k) => ownerAfter.get(k) === successor);
    yield frame(
      { ring: before, keys: m.keys, owner, nodeMarks: markAll(leaving.map((x) => x.id), 'reject'), keyMarks: markAll(held, 'key'), last: m.last },
      {
        note: `Remove server ${s}: its ${plural(v, 'node')} leave the ring, and the ${plural(held.length, 'key')} stored on it need a new home.`,
        line: 2,
        stats,
        checkpoint:
          held.length === 0
            ? undefined
            : v === 1 && sameHome && remaining.length > 1
              ? askInOrder(`Where do ${s}'s keys go?`, remaining, successor!)
              : howMany(`How many of the ${m.keys.length} keys move?`, held.length, [m.keys.length, mod, held.length + 1]),
      },
    );
    stats.moved = moved.length;
    yield frame(
      { ring: after, keys: m.keys, owner: ownerAfter, keyMarks: markAll(moved, 'write'), last: m.last },
      {
        note:
          held.length === 0
            ? `${s} held no keys, so nothing moves.`
            : `Each of ${s}'s arcs joins the next node clockwise, so only its keys move: ${destinations(moved, ownerAfter)}. Every other key stays where it was.`,
        line: 3,
        stats,
      },
    );
  }

  const next: HashRingModel = { ring: after, keys: m.keys, last };
  yield frame(plainLook(next), {
    note: `With hash mod N instead, going from ${n} to ${after.servers.length} servers would move ${mod} of the ${m.keys.length} keys: a key stays only if its hash leaves the same remainder for both.`,
    line: null,
    stats,
  });
  return next;
}

function* walk(m: HashRingModel, key: string, store: boolean): Generator<Frame<PlotState>, HashRingModel> {
  const node = ownerNode(m.ring, key)!;
  const h = hash32(key);
  const wrapped = successorIndex(m.ring, h) === 0 && h > m.ring.nodes[0].position;
  const owner = placement(m.ring, m.keys);
  const stats: Stats = { hashed: 1, moved: 0 };
  const servers = m.ring.servers.slice().sort();
  yield frame(
    { ...plainLook(m), owner, focus: key, keyMarks: { [key]: 'key' } },
    {
      note: `Hash "${key}": it lands ${pct(fraction(h))} of the way round the ring, clockwise from the top.`,
      line: 1,
      stats,
      checkpoint: servers.length > 1 ? askInOrder(`Which server ${store ? 'stores' : 'serves'} "${key}"?`, servers, node.server) : undefined,
    },
  );
  yield frame(
    { ...plainLook(m), owner, focus: key, keyMarks: { [key]: 'key' }, nodeMarks: { [node.id]: 'found' }, walk: { key, node } },
    {
      note: `Walk clockwise from it to the first node${wrapped ? ', wrapping round past the top' : ''}: ${node.id}, which belongs to server ${node.server}.`,
      line: wrapped ? 3 : 2,
      stats,
    },
  );
  if (!store) {
    yield frame(
      { ...plainLook(m), owner, focus: key, keyMarks: { [key]: 'found' } },
      { note: `${node.server} serves "${key}". Every client that hashes the same key walks to the same server, with no table of who has what.`, line: 4, stats },
    );
    return m;
  }
  const next: HashRingModel = { ...m, keys: [...m.keys, key] };
  const count = loads(next.ring, next.keys)[node.server];
  yield frame({ ...plainLook(next), keyMarks: { [key]: 'write' } }, { note: `Store "${key}" on ${node.server}, which now holds ${plural(count, 'key')}.`, line: 4, stats });
  return next;
}

const keyArg = (args: Args) => String(args.key ?? '').trim();

const addServerOp: OperationSpec<HashRingModel, PlotState> = {
  id: 'add-server',
  label: 'Add server',
  args: [{ name: 'server', label: 'Server', type: 'choice', options: (m) => SERVERS.filter((s) => !m.ring.servers.includes(s)) }],
  pseudocode: addServerCode,
  disabledReason: (m) => (m.ring.servers.length >= SERVERS.length ? `This demo has room for ${SERVERS.length} servers, one colour each` : null),
  run: (m, args) => changeServers(m, String(args.server), true),
};

const removeServerOp: OperationSpec<HashRingModel, PlotState> = {
  id: 'remove-server',
  label: 'Remove server',
  args: [{ name: 'server', label: 'Server', type: 'choice', options: (m) => m.ring.servers }],
  pseudocode: removeServerCode,
  disabledReason: (m) => (m.ring.servers.length <= 1 ? 'Keep at least one server on the ring' : null),
  run: (m, args) => changeServers(m, String(args.server), false),
};

const addKeyOp: OperationSpec<HashRingModel, PlotState> = {
  id: 'add-key',
  label: 'Add key',
  args: [{ name: 'key', label: 'Key', type: 'text', maxLength: 12, placeholder: 'e.g. walnut' }],
  pseudocode: addKeyCode,
  disabledReason: (m, args) => {
    if (m.keys.length >= MAX_KEYS) return `This demo holds at most ${MAX_KEYS} keys`;
    const k = args ? keyArg(args) : '';
    return k && m.keys.includes(k) ? `"${k}" is already stored: look it up instead` : null;
  },
  run: (m, args) => walk(m, keyArg(args), true),
};

const lookupOp: OperationSpec<HashRingModel, PlotState> = {
  id: 'lookup',
  label: 'Look up',
  args: [{ name: 'key', label: 'Key', type: 'choice', options: (m) => m.keys }],
  pseudocode: lookupCode,
  run: (m, args) => walk(m, keyArg(args), false),
};

const start = (servers: readonly string[], replicas: number, keys: readonly string[]): HashRingModel => ({ ring: createRing(servers, replicas), keys: [...keys], last: null });

export const consistentHashingStructure = defineStructure<HashRingModel, PlotState>({
  kind: 'structure',
  slug: 'consistent-hashing',
  view: 'plot',
  initial: [
    { id: 'vnodes-1', label: 'One node per server', make: () => start(['A', 'B', 'C'], 1, KEYS) },
    { id: 'vnodes-3', label: 'Three virtual nodes each', make: () => start(['A', 'B', 'C'], 3, KEYS) },
    { id: 'vnodes-10', label: 'Ten virtual nodes each', make: () => start(['A', 'B', 'C'], 10, KEYS) },
    { id: 'one-server', label: 'One server, no keys', make: () => start(['A'], 3, []) },
    {
      id: 'random',
      label: 'Random',
      make: (seed) => {
        const rng = createRng(seed);
        const servers = SERVERS.slice(0, 2 + Math.floor(rng() * 3));
        const replicas = [1, 3, 10][Math.floor(rng() * 3)];
        const pool = [...WORDS];
        const keys = Array.from({ length: 8 + Math.floor(rng() * 7) }, () => pool.splice(Math.floor(rng() * pool.length), 1)[0]);
        return start(servers, replicas, keys);
      },
    },
  ],
  snapshot: (m) => ({ parts: parts(plainLook(m)) }),
  operations: [addServerOp, removeServerOp, addKeyOp, lookupOp],
  stats: [
    { key: 'hashed', label: 'Hashes computed' },
    { key: 'moved', label: 'Keys moved' },
  ],
  legend: [
    { neutral: 'A key, by where its name hashes' },
    { tone: 1, label: 'Server A and the arcs it owns' },
    { tone: 2, label: 'Server B' },
    { tone: 3, label: 'Server C' },
    { tone: 4, label: 'Server D' },
    { mark: 'key', label: 'Key being placed, or needing a new home' },
    { mark: 'path', label: 'The walk clockwise' },
    { mark: 'found', label: 'The node that owns it' },
    { mark: 'write', label: 'Just placed or moved' },
    { mark: 'reject', label: 'Leaving the ring' },
  ],
  content: {
    idea: 'Spread keys over servers by hashing both onto a ring: each key belongs to the first server clockwise from it, so adding or removing a server only moves the keys beside it.',
    invariant: 'Every key is stored on the server that owns the first node at or after hash(key), wrapping round past the top; a change of servers moves only keys whose first node changed.',
    whenToUse:
      'Spreading a cache or a database over machines that come and go: memcached clients, Dynamo-style stores such as Cassandra and Riak, CDNs and load balancers that want the same key to keep reaching the same server.',
    traits: [
      { label: 'About 1/N of the keys move when a server joins or leaves', good: true },
      { label: 'O(log n) lookup on a sorted ring', good: true },
      { label: 'Lopsided load without virtual nodes', good: false },
      { label: 'Copies go on the next servers clockwise', good: null },
    ],
    experiments: [
      { example: 'vnodes-1', prompt: 'Add server D and count the keys that move, then read what hash mod N would have moved.' },
      { example: 'vnodes-1', prompt: 'Read the load: with one node per server, how far is the busiest server above average? Then start from Ten virtual nodes each.' },
      { example: 'vnodes-10', prompt: 'Remove a server: its keys spread over all the others instead of piling onto one neighbour.' },
    ],
  },
});
