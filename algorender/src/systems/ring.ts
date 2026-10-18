// Consistent hashing: a hash ring that spreads keys over servers.
//
// This is a component the system-design canvas (REVAMP_PLAN.md, phase 6d)
// reuses as is: a sharded cache or store asks `serverFor(ring, key)`, and a
// node joining or leaving is `addServer`/`removeServer` plus `movedKeys` to see
// what has to be copied. Pure TypeScript, no engine or React: every function
// returns a new ring and never mutates its input.
//
// Servers and keys are hashed to positions on a ring of 2³² slots. Each server
// is placed `replicas` times (its virtual nodes, "A#0", "A#1", …), and a key
// belongs to the server owning the first virtual node at or after its
// position, wrapping round past the top. Adding a server only takes over the
// arcs just before its new nodes; removing one only hands its arcs to the
// next nodes clockwise. Plain `hash(key) mod N`, for comparison, moves almost
// every key when N changes.

/** Positions run from 0 to RING_SIZE − 1. */
export const RING_SIZE = 2 ** 32;

/**
 * A deterministic 32-bit hash of a string: FNV-1a over its UTF-16 code units,
 * then MurmurHash3's finaliser, which spreads short, similar strings ("A#1",
 * "A#2") over the whole ring instead of clustering them.
 */
export function hash32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** How far round the ring a position is, from 0 (the top) to just under 1. */
export const fraction = (position: number) => position / RING_SIZE;

/** One of a server's places on the ring. */
export type VNode = { id: string; server: string; replica: number; position: number };

export type Ring = {
  /** Virtual nodes per server. */
  replicas: number;
  /** Servers in the order they joined. */
  servers: readonly string[];
  /** Every virtual node, sorted by position (ties by id, so the order is total). */
  nodes: readonly VNode[];
};

export const vnodeId = (server: string, replica: number) => `${server}#${replica}`;

const byPosition = (a: VNode, b: VNode) => a.position - b.position || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

function nodesOf(server: string, replicas: number): VNode[] {
  return Array.from({ length: replicas }, (_, replica) => {
    const id = vnodeId(server, replica);
    return { id, server, replica, position: hash32(id) };
  });
}

export function createRing(servers: readonly string[], replicas: number): Ring {
  if (!(Number.isInteger(replicas) && replicas >= 1)) throw new Error('A server needs at least one virtual node');
  if (new Set(servers).size !== servers.length) throw new Error('Server names must be distinct');
  return { replicas, servers: [...servers], nodes: servers.flatMap((s) => nodesOf(s, replicas)).sort(byPosition) };
}

export function addServer(ring: Ring, server: string): Ring {
  if (ring.servers.includes(server)) throw new Error(`${server} is already on the ring`);
  return { ...ring, servers: [...ring.servers, server], nodes: [...ring.nodes, ...nodesOf(server, ring.replicas)].sort(byPosition) };
}

export function removeServer(ring: Ring, server: string): Ring {
  if (!ring.servers.includes(server)) throw new Error(`${server} is not on the ring`);
  return { ...ring, servers: ring.servers.filter((s) => s !== server), nodes: ring.nodes.filter((n) => n.server !== server) };
}

/** Index of the first node at or after `position`, wrapping to 0; -1 on an empty ring. Binary search: O(log V). */
export function successorIndex(ring: Ring, position: number): number {
  const { nodes } = ring;
  if (nodes.length === 0) return -1;
  let lo = 0;
  let hi = nodes.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (nodes[mid].position < position) lo = mid + 1;
    else hi = mid;
  }
  return lo === nodes.length ? 0 : lo;
}

/** The virtual node that owns `key`, or null on an empty ring. */
export function ownerNode(ring: Ring, key: string): VNode | null {
  const i = successorIndex(ring, hash32(key));
  return i < 0 ? null : ring.nodes[i];
}

/** The server that stores `key`, or null when there are no servers. */
export const serverFor = (ring: Ring, key: string) => ownerNode(ring, key)?.server ?? null;

/**
 * The first `n` distinct servers clockwise from `key`: where a store that
 * keeps n copies puts them (Dynamo's preference list). Fewer when the ring
 * has fewer servers.
 */
export function preferenceList(ring: Ring, key: string, n: number): string[] {
  const start = successorIndex(ring, hash32(key));
  const out: string[] = [];
  for (let k = 0; start >= 0 && k < ring.nodes.length && out.length < n; k++) {
    const server = ring.nodes[(start + k) % ring.nodes.length].server;
    if (!out.includes(server)) out.push(server);
  }
  return out;
}

/** Each key's server. */
export function placement(ring: Ring, keys: readonly string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const k of keys) {
    const s = serverFor(ring, k);
    if (s !== null) out.set(k, s);
  }
  return out;
}

/** Keys whose server differs between two rings (in `keys` order). */
export function movedKeys(before: Ring, after: Ring, keys: readonly string[]): string[] {
  return keys.filter((k) => serverFor(before, k) !== serverFor(after, k));
}

/** Keys per server, including servers that hold none. */
export function loads(ring: Ring, keys: readonly string[]): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(ring.servers.map((s) => [s, 0]));
  for (const s of placement(ring, keys).values()) out[s]++;
  return out;
}

/** The busiest server's load divided by the mean: 1 is perfectly even. 1 when there is nothing to spread. */
export function spread(load: Record<string, number>): number {
  const values = Object.values(load);
  const total = values.reduce((a, b) => a + b, 0);
  if (values.length === 0 || total === 0) return 1;
  return Math.max(...values) / (total / values.length);
}

/** One node's arc: the positions after the previous node up to and including its own. */
export type Arc = { node: VNode; from: number; to: number; length: number };

/** Every node's arc, in ring order. A lone node owns the whole ring. */
export function arcs(ring: Ring): Arc[] {
  const { nodes } = ring;
  return nodes.map((node, i) => {
    const prev = nodes[(i - 1 + nodes.length) % nodes.length];
    const length = nodes.length === 1 ? RING_SIZE : (node.position - prev.position + RING_SIZE) % RING_SIZE;
    return { node, from: prev.position, to: node.position, length };
  });
}

/** The share of the ring each server owns (sums to 1 when there are servers). */
export function ownership(ring: Ring): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(ring.servers.map((s) => [s, 0]));
  for (const a of arcs(ring)) out[a.node.server] += a.length / RING_SIZE;
  return out;
}

// ── For comparison: plain modular hashing ────────────────────────────────────

/** `servers[hash(key) mod N]`: simple, and fine until N changes. */
export function modServer(servers: readonly string[], key: string): string | null {
  return servers.length === 0 ? null : servers[hash32(key) % servers.length];
}

/** Keys whose `mod N` server differs between two server lists. */
export function modMoved(before: readonly string[], after: readonly string[], keys: readonly string[]): string[] {
  return keys.filter((k) => modServer(before, k) !== modServer(after, k));
}
