// A log-structured merge tree (LSM tree), the storage engine behind LevelDB,
// RocksDB, Cassandra and many other write-heavy databases, simplified.
//
// Writes go to a small sorted table in memory (the memtable). When it fills,
// it is written out whole as an immutable sorted table on disk (an SSTable)
// in level 0, so writes are always sequential. Reads look from newest to
// oldest: the memtable, then L0's tables newest first, then one table per
// deeper level, stopping at the first entry for the key. A delete is a write
// too: a tombstone that hides older values until compaction can drop it.
//
// Compaction keeps reads cheap: when L0 holds `l0Trigger` tables they are all
// merged with the overlapping L1 tables, and when a deeper level holds more
// entries than its limit (which grows by `ratio` per level) one of its tables
// is merged into the next level. Merging keeps only the newest version of
// each key, and drops tombstones once nothing older can sit below them. Each
// level from L1 down is sorted and its tables never overlap, so a read checks
// at most one table there. Every table has a small Bloom filter, so a read can
// skip a table that certainly doesn't hold the key (it may still read one
// that doesn't: a false positive).
//
// This is the storage component the system-design canvas (phase 6d) reuses,
// so the API is small and general: create a tree, `lsmPut`/`lsmDelete`/
// `lsmGet`, and read the counters (write and read amplification, Bloom
// skips). The finer steps (`memtableWrite`, `flush`, `pendingCompaction`,
// `compact`) are exported so a visualiser can narrate each one. Every
// function returns a new state and never changes the one it was given.

/** A key's value, or null for a tombstone (the key was deleted). */
export type Entry = { readonly key: number; readonly value: number | null };

/** An immutable sorted table on disk. */
export type SSTable = {
  readonly id: string;
  /** Creation order: a higher seq was written later. */
  readonly seq: number;
  /** Sorted by key, one entry per key. */
  readonly entries: readonly Entry[];
  readonly min: number;
  readonly max: number;
  /** Bloom filter bits, as a bit mask of `bloomBits` bits. */
  readonly bloom: number;
};

export type LsmConfig = {
  /** Entries the memtable holds before it is flushed. */
  readonly memtableCapacity: number;
  /** L0 tables that start a compaction into L1. */
  readonly l0Trigger: number;
  /** Most entries in a table written by compaction. */
  readonly tableSize: number;
  /** Most entries L1 may hold; each deeper level holds `ratio` times more. */
  readonly level1Limit: number;
  readonly ratio: number;
  /** Levels below L0. The last one has no limit. */
  readonly levels: number;
  /** Bits in each table's Bloom filter (at most 30). */
  readonly bloomBits: number;
};

export type LsmCounters = {
  /** Entries written by the user (puts and deletes). */
  readonly put: number;
  /** Entries written to disk by flushes and compactions. */
  readonly written: number;
  readonly flushes: number;
  readonly compactions: number;
  readonly gets: number;
  /** Tables read by gets. */
  readonly probes: number;
  /** Tables a get skipped because their Bloom filter said no. */
  readonly bloomSkips: number;
  /** Tables read because the Bloom filter said maybe, without the key. */
  readonly falsePositives: number;
  /** Older versions and tombstones that compaction threw away. */
  readonly dropped: number;
};

export type LsmState = {
  readonly config: LsmConfig;
  /** Sorted by key, one entry per key; always fewer than `memtableCapacity`. */
  readonly memtable: readonly Entry[];
  /** levels[0] is L0, newest table first; levels[i ≥ 1] are sorted by key and never overlap. */
  readonly levels: readonly (readonly SSTable[])[];
  readonly nextSeq: number;
  readonly counters: LsmCounters;
};

export const DEFAULT_CONFIG: LsmConfig = { memtableCapacity: 4, l0Trigger: 2, tableSize: 4, level1Limit: 8, ratio: 2, levels: 3, bloomBits: 16 };

const ZERO: LsmCounters = { put: 0, written: 0, flushes: 0, compactions: 0, gets: 0, probes: 0, bloomSkips: 0, falsePositives: 0, dropped: 0 };

export function createLsm(config: Partial<LsmConfig> = {}): LsmState {
  const c = { ...DEFAULT_CONFIG, ...config };
  for (const k of ['memtableCapacity', 'l0Trigger', 'tableSize', 'level1Limit', 'ratio', 'levels'] as const) {
    if (!Number.isInteger(c[k]) || c[k] < 1) throw new Error(`An LSM tree needs ${k} of at least 1`);
  }
  if (!Number.isInteger(c.bloomBits) || c.bloomBits < 1 || c.bloomBits > 30) throw new Error('Bloom filters take 1 to 30 bits');
  return { config: c, memtable: [], levels: Array.from({ length: c.levels + 1 }, () => []), nextSeq: 1, counters: ZERO };
}

// ── Bloom filters ────────────────────────────────────────────────────────────

const SEEDS = [0x9e3779b9, 0x7f4a7c15] as const;

function mix(x: number, seed: number): number {
  let h = Math.imul(x ^ seed, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** The two bit positions a key sets in a Bloom filter of `bits` bits. */
export const bloomPositions = (key: number, bits: number): [number, number] => [mix(key, SEEDS[0]) % bits, mix(key, SEEDS[1]) % bits];

function bloomOf(keys: readonly number[], bits: number): number {
  let mask = 0;
  for (const k of keys) for (const p of bloomPositions(k, bits)) mask |= 1 << p;
  return mask;
}

/** False means the table certainly lacks the key; true means it may hold it. */
export function mayContain(table: SSTable, key: number, bits: number): boolean {
  return bloomPositions(key, bits).every((p) => (table.bloom & (1 << p)) !== 0);
}

// ── Reading the shape ────────────────────────────────────────────────────────

export const levelSize = (s: LsmState, level: number) => s.levels[level].reduce((n, t) => n + t.entries.length, 0);

/** L0: tables that trigger a compaction; L1..: entries allowed; the last level: Infinity. */
export function levelLimit(s: LsmState, level: number): number {
  if (level === 0) return s.config.l0Trigger;
  if (level === s.config.levels) return Infinity;
  return s.config.level1Limit * s.config.ratio ** (level - 1);
}

export const allTables = (s: LsmState) => s.levels.flat();
export const findTable = (s: LsmState, id: string) => allTables(s).find((t) => t.id === id);
export const levelOf = (s: LsmState, id: string) => s.levels.findIndex((l) => l.some((t) => t.id === id));
export const covers = (t: SSTable, key: number) => key >= t.min && key <= t.max;
const overlaps = (t: SSTable, lo: number, hi: number) => t.min <= hi && t.max >= lo;

/** Entries written to disk per entry the user wrote (0 before any write). */
export const writeAmplification = (s: LsmState) => (s.counters.put === 0 ? 0 : s.counters.written / s.counters.put);
/** Tables read per get (0 before any get). */
export const readAmplification = (s: LsmState) => (s.counters.gets === 0 ? 0 : s.counters.probes / s.counters.gets);

const bump = (s: LsmState, by: Partial<LsmCounters>): LsmCounters => {
  const c: Record<keyof LsmCounters, number> = { ...s.counters };
  for (const [k, v] of Object.entries(by) as [keyof LsmCounters, number][]) c[k] += v;
  return c;
};

function makeTable(s: LsmState, entries: readonly Entry[], seq: number): SSTable {
  return { id: `T${seq}`, seq, entries, min: entries[0].key, max: entries[entries.length - 1].key, bloom: bloomOf(entries.map((e) => e.key), s.config.bloomBits) };
}

// ── Writing ──────────────────────────────────────────────────────────────────

export const isMemtableFull = (s: LsmState) => s.memtable.length >= s.config.memtableCapacity;

/** Writes `value` (null: a tombstone) for `key` into the memtable only, even past its capacity; `lsmPut` flushes. */
export function memtableWrite(s: LsmState, key: number, value: number | null): LsmState {
  const memtable = [...s.memtable.filter((e) => e.key !== key), { key, value }].sort((a, b) => a.key - b.key);
  return { ...s, memtable, counters: bump(s, { put: 1 }) };
}

/** Writes the memtable out as a new L0 table (newest first). A no-op when the memtable is empty. */
export function flush(s: LsmState): { state: LsmState; table: SSTable | null } {
  if (s.memtable.length === 0) return { state: s, table: null };
  const table = makeTable(s, s.memtable, s.nextSeq);
  const levels = s.levels.map((l, i) => (i === 0 ? [table, ...l] : l));
  return { state: { ...s, memtable: [], levels, nextSeq: s.nextSeq + 1, counters: bump(s, { written: table.entries.length, flushes: 1 }) }, table };
}

/**
 * A compaction: merge `inputs` (table ids from level `from`, newest first)
 * with `overlapping` (the tables of level `from + 1` whose key ranges meet
 * theirs), writing the result into level `from + 1`.
 */
export type CompactionPlan = {
  readonly from: number;
  readonly into: number;
  readonly inputs: readonly string[];
  readonly overlapping: readonly string[];
  /** l0: L0 reached its trigger; size: a level is over its limit; manual: asked for. */
  readonly reason: 'l0' | 'size' | 'manual';
};

function plan(s: LsmState, from: number, reason: CompactionPlan['reason']): CompactionPlan | null {
  if (from >= s.config.levels || s.levels[from].length === 0) return null;
  // L0 tables may overlap each other, so they all go at once; deeper, the oldest table goes.
  const inputs = from === 0 ? s.levels[0] : [s.levels[from].reduce((a, b) => (b.seq < a.seq ? b : a))];
  const lo = Math.min(...inputs.map((t) => t.min));
  const hi = Math.max(...inputs.map((t) => t.max));
  const overlapping = s.levels[from + 1].filter((t) => overlaps(t, lo, hi));
  return { from, into: from + 1, inputs: inputs.map((t) => t.id), overlapping: overlapping.map((t) => t.id), reason };
}

/** The compaction the tree's limits call for next, or null when every level is within its limit. */
export function pendingCompaction(s: LsmState): CompactionPlan | null {
  if (s.levels[0].length >= s.config.l0Trigger) return plan(s, 0, 'l0');
  for (let level = 1; level < s.config.levels; level++) if (levelSize(s, level) > levelLimit(s, level)) return plan(s, level, 'size');
  return null;
}

/** A compaction to run on request: the pending one, else L0 into L1, else a table pushed down from the shallowest level that can go deeper. */
export function manualCompaction(s: LsmState): CompactionPlan | null {
  const due = pendingCompaction(s);
  if (due) return due;
  for (let level = 0; level < s.config.levels; level++) {
    const p = plan(s, level, 'manual');
    if (p) return p;
  }
  return null;
}

/** What the merge did with one key. */
export type MergeDecision = {
  readonly key: number;
  /** The newest version, kept unless it is a dropped tombstone. */
  readonly winner: Entry;
  readonly from: string;
  /** Older versions it replaces, newest first. */
  readonly shadowed: readonly { readonly table: string; readonly entry: Entry }[];
  /** True when the winner is a tombstone written at the bottom: nothing older is left to hide, so it goes. */
  readonly dropped: boolean;
};

/**
 * Runs a compaction. A single table that overlaps nothing below moves down
 * as it is, without being rewritten (LevelDB's "trivial move"), so it keeps
 * its tombstones; anything else is merged.
 */
export function compact(s: LsmState, p: CompactionPlan): CompactionResult {
  const get = (id: string) => {
    const t = findTable(s, id);
    if (!t) throw new Error(`No table ${id}`);
    return t;
  };
  if (p.inputs.length === 1 && p.overlapping.length === 0 && get(p.inputs[0]).entries.length <= s.config.tableSize) {
    const t = get(p.inputs[0]);
    const levels = s.levels.map((l, i) => (i === p.from ? l.filter((x) => x.id !== t.id) : i === p.into ? [...l, t].sort((a, b) => a.min - b.min) : l));
    return { state: { ...s, levels, counters: bump(s, { compactions: 1 }) }, outputs: [t], decisions: [], moved: true };
  }
  // Newest first: the inputs (L0 is already newest first), then the next level's tables.
  const sources = [...p.inputs, ...p.overlapping].map(get);
  const versions = new Map<number, { table: string; entry: Entry }[]>();
  for (const t of sources) for (const e of t.entries) versions.set(e.key, [...(versions.get(e.key) ?? []), { table: t.id, entry: e }]);
  const bottom = s.levels.slice(p.into + 1).every((l) => l.length === 0);
  const decisions: MergeDecision[] = [...versions.keys()]
    .sort((a, b) => a - b)
    .map((key) => {
      const [first, ...rest] = versions.get(key)!;
      return { key, winner: first.entry, from: first.table, shadowed: rest, dropped: bottom && first.entry.value === null };
    });
  const kept = decisions.filter((d) => !d.dropped).map((d) => d.winner);

  let seq = s.nextSeq;
  const outputs: SSTable[] = [];
  for (let i = 0; i < kept.length; i += s.config.tableSize) outputs.push(makeTable(s, kept.slice(i, i + s.config.tableSize), seq++));

  const gone = new Set([...p.inputs, ...p.overlapping]);
  const levels = s.levels.map((l, i) => {
    if (i === p.from) return l.filter((t) => !gone.has(t.id));
    if (i === p.into) return [...l.filter((t) => !gone.has(t.id)), ...outputs].sort((a, b) => a.min - b.min);
    return l;
  });
  const dropped = decisions.reduce((n, d) => n + d.shadowed.length + (d.dropped ? 1 : 0), 0);
  const counters = bump(s, { written: kept.length, compactions: 1, dropped });
  return { state: { ...s, levels, nextSeq: seq, counters }, outputs, decisions, moved: false };
}

export type CompactionResult = {
  state: LsmState;
  /** The tables written into the next level (the moved table itself, for a trivial move). */
  outputs: readonly SSTable[];
  /** What the merge did with each key (empty for a trivial move). */
  decisions: readonly MergeDecision[];
  /** True when the table moved down without being rewritten. */
  moved: boolean;
};

export type CompactionStep = { plan: CompactionPlan } & Omit<CompactionResult, 'state'>;

/** Runs the compactions the limits call for until none is due. */
export function settle(s: LsmState): { state: LsmState; steps: readonly CompactionStep[] } {
  const steps: CompactionStep[] = [];
  for (let p = pendingCompaction(s); p; p = pendingCompaction(s)) {
    const r = compact(s, p);
    steps.push({ plan: p, outputs: r.outputs, decisions: r.decisions, moved: r.moved });
    s = r.state;
  }
  return { state: s, steps };
}

export type WriteResult = { state: LsmState; flushed: SSTable | null; compactions: readonly CompactionStep[] };

/** A put (or, with null, a delete): into the memtable, flushing it when full and compacting as needed. */
export function lsmWrite(s: LsmState, key: number, value: number | null): WriteResult {
  const written = memtableWrite(s, key, value);
  if (!isMemtableFull(written)) return { state: written, flushed: null, compactions: [] };
  const f = flush(written);
  const settled = settle(f.state);
  return { state: settled.state, flushed: f.table, compactions: settled.steps };
}

export const lsmPut = (s: LsmState, key: number, value: number) => lsmWrite(s, key, value);
export const lsmDelete = (s: LsmState, key: number) => lsmWrite(s, key, null);

/** Flushes whatever the memtable holds, then compacts as needed. */
export function lsmFlush(s: LsmState): WriteResult {
  const f = flush(s);
  const settled = settle(f.state);
  return { state: settled.state, flushed: f.table, compactions: settled.steps };
}

/** Runs one compaction on request (see manualCompaction), then any it makes due. */
export function lsmCompact(s: LsmState): { state: LsmState; compactions: readonly CompactionStep[] } {
  const p = manualCompaction(s);
  if (!p) return { state: s, compactions: [] };
  const r = compact(s, p);
  const settled = settle(r.state);
  return { state: settled.state, compactions: [{ plan: p, outputs: r.outputs, decisions: r.decisions, moved: r.moved }, ...settled.steps] };
}

// ── Reading ──────────────────────────────────────────────────────────────────

/** One place a get looked, in order. */
export type Probe =
  | { readonly where: 'memtable'; readonly result: 'hit' | 'miss' }
  /** A table: the key is outside its range, its Bloom filter said no, it held the key, or it was read for nothing. */
  | { readonly where: 'table'; readonly level: number; readonly table: string; readonly result: 'range' | 'bloom' | 'hit' | 'false-positive' }
  /** A level from L1 down with tables, none of which covers the key. */
  | { readonly where: 'level'; readonly level: number; readonly result: 'no-table' };

export type GetResult = {
  state: LsmState;
  /** The value, or null when the key is missing or deleted. */
  value: number | null;
  /** The entry that answered (a tombstone when deleted), or null when no entry exists. */
  entry: Entry | null;
  /** 'memtable', the id of the table that answered, or null. */
  answeredBy: string | null;
  probes: readonly Probe[];
};

/** Looks the key up from newest to oldest, counting reads and Bloom skips. */
export function lsmGet(s: LsmState, key: number): GetResult {
  const probes: Probe[] = [];
  const done = (entry: Entry | null, answeredBy: string | null): GetResult => {
    const reads = probes.filter((p) => p.where === 'table' && (p.result === 'hit' || p.result === 'false-positive')).length;
    const skips = probes.filter((p) => p.where === 'table' && p.result === 'bloom').length;
    const fps = probes.filter((p) => p.where === 'table' && p.result === 'false-positive').length;
    const state = { ...s, counters: bump(s, { gets: 1, probes: reads, bloomSkips: skips, falsePositives: fps }) };
    return { state, value: entry?.value ?? null, entry, answeredBy, probes };
  };

  const m = s.memtable.find((e) => e.key === key);
  probes.push({ where: 'memtable', result: m ? 'hit' : 'miss' });
  if (m) return done(m, 'memtable');

  const look = (t: SSTable, level: number): Entry | null => {
    if (!covers(t, key)) {
      probes.push({ where: 'table', level, table: t.id, result: 'range' });
      return null;
    }
    if (!mayContain(t, key, s.config.bloomBits)) {
      probes.push({ where: 'table', level, table: t.id, result: 'bloom' });
      return null;
    }
    const e = t.entries.find((x) => x.key === key) ?? null;
    probes.push({ where: 'table', level, table: t.id, result: e ? 'hit' : 'false-positive' });
    return e;
  };

  for (const t of s.levels[0]) {
    const e = look(t, 0);
    if (e) return done(e, t.id);
  }
  for (let level = 1; level < s.levels.length; level++) {
    if (s.levels[level].length === 0) continue;
    const t = s.levels[level].find((x) => covers(x, key));
    if (!t) {
      probes.push({ where: 'level', level, result: 'no-table' });
      continue;
    }
    const e = look(t, level);
    if (e) return done(e, t.id);
  }
  return done(null, null);
}

/** Every live key and its value, newest version wins (for tests and summaries). */
export function contents(s: LsmState): Map<number, number> {
  const seen = new Map<number, number | null>();
  const add = (e: Entry) => {
    if (!seen.has(e.key)) seen.set(e.key, e.value);
  };
  s.memtable.forEach(add);
  for (const level of s.levels) for (const t of level) t.entries.forEach(add);
  const out = new Map<number, number>();
  for (const [k, v] of [...seen].sort((a, b) => a[0] - b[0])) if (v !== null) out.set(k, v);
  return out;
}
