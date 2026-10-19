import { defineStructure, type Args, type ArgSpec, type OperationSpec } from '@/engine/module';
import { createRng } from '@/engine/random';
import type { Frame, VarValue } from '@/engine/types';
import {
  compact,
  covers,
  findTable,
  createLsm,
  flush,
  isMemtableFull,
  levelLimit,
  levelSize,
  lsmCompact,
  lsmGet,
  lsmWrite,
  manualCompaction,
  memtableWrite,
  pendingCompaction,
  readAmplification,
  writeAmplification,
  type CompactionPlan,
  type Entry,
  type LsmCounters,
  type LsmState,
  type Probe,
} from '@/systems/lsm';
import type { MarkKey } from '@/viz/marks';
import { GridTracer, type Ref } from '@/viz/grid/tracer';
import type { GridState } from '@/viz/grid/types';

// An LSM tree driven by put, delete, get, flush and compact. The view stacks
// the memtable over each level's tables (one row per SSTable, one cell per
// entry), so a write can be followed from memory to disk and down the
// levels, and a get from newest to oldest. The tree itself is
// src/systems/lsm.ts.

type Model = LsmState;

/** Small enough to fit the view, big enough to fill three levels: flush every 4 entries, merge L0 at 3 tables. */
export const CONFIG = { memtableCapacity: 4, l0Trigger: 3, tableSize: 4, level1Limit: 8, ratio: 2, levels: 3, bloomBits: 16 } as const;

export const KEY_MIN = 1;
export const KEY_MAX = 99;

const MEMTABLE = 'memtable';
const PATH = 'path';
const DROPPED = 'dropped';
const COSTS = 'costs';
const levelId = (level: number) => `L${level}`;
const memItem = (key: number) => `m${key}`;

const STATS = ['written', 'probes', 'skips', 'compactions'] as const;

const WRITE_CODE = [
  'write(k, v):  (put; delete writes ✕)',
  '  put:    memtable[k] ← v',
  '  delete: memtable[k] ← tombstone ✕',
  '  if the memtable is full: flush()',
  'flush():',
  '  write memtable out as sorted table T',
  '  put T first in L0 (newest first)',
  '  if L0 has enough tables: compact(L0)',
  '  while a level is over its limit:',
  '    compact(that level)',
  'compact(L):',
  '  inputs: all of L0, or L’s oldest table',
  '  add the L+1 tables they overlap',
  '  merge by key: newest version wins',
  '  drop ✕ if nothing older is below',
  '  write the result into L+1',
];

const GET_CODE = [
  'get(k):  (newest first, stop at first)',
  '  if k is in the memtable: stop',
  '  for each L0 table, newest first:',
  '    if k is outside its range: skip',
  '    if its Bloom filter says no: skip',
  '    read it; if k is there: stop',
  '  for each level L1, L2, L3:',
  '    T ← the one table whose range has k',
  '    if no T, or T’s Bloom says no: skip',
  '    read T; if k is there: stop',
  '  return not found',
];

const ent = (e: Entry) => `${e.key}=${e.value ?? '✕'}`;
const list = (ids: readonly string[]) => (ids.length === 0 ? 'none' : ids.join(', '));
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const fixed = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(1));

type Look = {
  note: string;
  line?: number;
  vars?: Record<string, VarValue>;
  checkpoint?: Frame<GridState>['checkpoint'];
  memtable?: Partial<Record<MarkKey, readonly number[]>>;
  rows?: Partial<Record<MarkKey, readonly string[]>>;
  cells?: readonly { table: string; key: number; mark: MarkKey }[];
  /** Where a get has looked so far. */
  path?: readonly { text: string; mark: MarkKey | null }[];
  /** What a merge just threw away. */
  dropped?: readonly string[];
  /** Counters to show, when they run ahead of the model (part-way through a get). */
  counters?: LsmCounters;
};

/** One frame of the tree: the memtable, every level's tables, and what reads and writes have cost. */
function render(m: Model, look: Look): Frame<GridState> {
  const c = look.counters ?? m.counters;
  const t = new GridTracer(STATS);
  t.count('written', c.written);
  t.count('probes', c.probes);
  t.count('skips', c.bloomSkips);
  t.count('compactions', c.compactions);

  t.addList({ id: MEMTABLE, label: `Memtable, in memory, sorted: ${m.memtable.length} of ${m.config.memtableCapacity} (full: flush)`, empty: 'Empty' });
  for (const e of m.memtable) t.addItem(MEMTABLE, { id: memItem(e.key), text: ent(e) });

  m.levels.forEach((level, i) => {
    const label =
      i === 0
        ? `L0 on disk: flushed tables, newest first, may overlap (${level.length} of ${m.config.l0Trigger} starts a merge)`
        : i === m.config.levels
          ? `L${i}: the bottom, sorted, no overlaps (${levelSize(m, i)} entries, no limit)`
          : `L${i}: sorted, no overlaps (${levelSize(m, i)} of ${levelLimit(m, i)} entries)`;
    t.addTable({
      id: levelId(i),
      label,
      corner: 'Table',
      rows: level.map((tb) => ({ id: tb.id, label: tb.id, sub: `${tb.min}–${tb.max}` })),
      cols: Array.from({ length: m.config.tableSize }, (_, j) => ({ label: String(j + 1) })),
      group: 'levels',
      empty: 'No tables',
    });
    level.forEach((tb, row) =>
      tb.entries.forEach((e, col) => {
        t.set([levelId(i), row, col], ent(e));
        if (e.value === null) t.setStyle([levelId(i), row, col], 'shade');
      }),
    );
  });

  if (look.path) {
    t.addList({ id: PATH, label: 'Where this get has looked', empty: '' });
    look.path.forEach((p, i) => t.addItem(PATH, { id: `p${i}`, text: p.text, mark: p.mark }));
  }
  if (look.dropped && look.dropped.length > 0) {
    t.addList({ id: DROPPED, label: 'Thrown away by the merge', empty: '' });
    look.dropped.forEach((text, i) => t.addItem(DROPPED, { id: `d${i}`, text, mark: 'reject' }));
  }

  t.addList({ id: COSTS, label: 'What it costs', empty: '' });
  const shown = { ...m, counters: c };
  t.addItem(COSTS, { id: 'wa', text: c.put === 0 ? 'Write amplification: –' : `Write amplification ${fixed(writeAmplification(shown))}×: ${c.written} written for ${c.put} put` });
  t.addItem(COSTS, { id: 'ra', text: c.gets === 0 ? 'Tables read per get: –' : `Tables read per get: ${fixed(readAmplification(shown))} (${c.probes} over ${plural(c.gets, 'get')})` });
  t.addItem(COSTS, { id: 'bf', text: `Bloom skips ${c.bloomSkips}, false positives ${c.falsePositives}` });

  const place = (id: string): { level: number; row: number } | null => {
    for (let level = 0; level < m.levels.length; level++) {
      const row = m.levels[level].findIndex((tb) => tb.id === id);
      if (row >= 0) return { level, row };
    }
    return null;
  };
  const marks: Partial<Record<MarkKey, Ref[]>> = {};
  for (const [mark, keys] of Object.entries(look.memtable ?? {}) as [MarkKey, readonly number[]][]) {
    for (const key of keys) if (m.memtable.some((e) => e.key === key)) (marks[mark] ??= []).push({ item: memItem(key), list: MEMTABLE });
  }
  for (const [mark, ids] of Object.entries(look.rows ?? {}) as [MarkKey, readonly string[]][]) {
    for (const id of ids) {
      const at = place(id);
      if (at) (marks[mark] ??= []).push({ row: at.row, table: levelId(at.level) });
    }
  }
  for (const cell of look.cells ?? []) {
    const at = place(cell.table);
    const col = at ? m.levels[at.level][at.row].entries.findIndex((e) => e.key === cell.key) : -1;
    if (at && col >= 0) (marks[cell.mark] ??= []).push([levelId(at.level), at.row, col]);
  }
  return t.frame({ note: look.note, line: look.line ?? null, vars: look.vars, marks, ...(look.checkpoint && { checkpoint: look.checkpoint }) });
}

// ── Writing: memtable, flush, compaction ─────────────────────────────────────

function* compactFrames(m: Model, p: CompactionPlan): Generator<Frame<GridState>, Model> {
  const r = compact(m, p);
  const merging = [...p.inputs, ...p.overlapping];
  const into = levelId(p.into);
  const one = p.inputs.length === 1;
  const why =
    p.reason === 'l0'
      ? `L0 now holds ${m.levels[0].length} tables, its trigger. They may overlap each other, so a get has to check every one`
      : p.reason === 'size'
        ? `L${p.from} holds ${levelSize(m, p.from)} entries, over its limit of ${levelLimit(m, p.from)}. Its oldest table, ${p.inputs[0]}, goes down a level`
        : `Compact by hand: ${list(p.inputs)} from L${p.from} ${one ? 'goes' : 'go'} down a level`;
  const first = findTable(m, p.inputs[0])!;
  const how = r.moved
    ? `. No ${into} table overlaps ${first.id}’s keys (${first.min}–${first.max}), so it can move down as it is, without being rewritten.`
    : p.overlapping.length === 0
      ? `. No ${into} table overlaps ${one ? 'its' : 'their'} keys, so merge ${one ? 'it' : 'them'} into new ${into} tables. Merging sorted tables is one sequential pass, like merge sort’s merge step.`
      : `: merge ${one ? 'it' : 'them'} with the ${into} ${p.overlapping.length === 1 ? 'table' : 'tables'} ${one ? 'it overlaps' : 'they overlap'} (${list(p.overlapping)}). Merging sorted tables is one sequential pass, like merge sort’s merge step.`;
  const contested = r.decisions.find((d) => d.shadowed.length > 0);
  let checkpoint: Frame<GridState>['checkpoint'];
  if (contested) {
    const versions = [{ table: contested.from, entry: contested.winner }, ...contested.shadowed];
    const choices = versions.map((v) => `${ent(v.entry)} from ${v.table}`).sort();
    checkpoint = { question: `The merge meets ${plural(versions.length, 'version')} of key ${contested.key}. Which one wins?`, choices, answer: choices.indexOf(`${ent(contested.winner)} from ${contested.from}`) };
  }
  yield render(m, {
    line: p.overlapping.length > 0 ? 12 : 11,
    rows: { compare: merging },
    note: `${why}${how}`,
    vars: { from: levelId(p.from), into, tables: merging.length },
    ...(checkpoint && { checkpoint }),
  });

  if (r.moved) {
    yield render(r.state, {
      line: 15,
      rows: { write: [first.id] },
      note: `${first.id} now sits in ${into}, unchanged: not one entry rewritten, so this move costs no write amplification. Any tombstones in it stay until a real merge reaches the bottom.`,
      vars: { moved: first.id },
    });
    return r.state;
  }

  const shadowed = r.decisions.flatMap((d) => d.shadowed.map((s) => `${ent(s.entry)} (${s.table}): older`));
  const tombs = r.decisions.filter((d) => d.dropped);
  const keptTombs = r.decisions.filter((d) => !d.dropped && d.winner.value === null).length;
  const written = r.decisions.length - tombs.length;
  const parts = [
    `Merged key by key, keeping each key’s newest version: ${plural(written, 'entry', 'entries')} written to ${into}${r.outputs.length > 0 ? ` as ${list(r.outputs.map((o) => o.id))}` : ''}`,
  ];
  if (shadowed.length > 0) parts.push(`${plural(shadowed.length, 'older version')} thrown away`);
  if (tombs.length > 0) parts.push(`${plural(tombs.length, 'tombstone')} dropped too, since nothing older is left below ${into} for ${tombs.length === 1 ? 'it' : 'them'} to hide`);
  if (keptTombs > 0) parts.push(`${plural(keptTombs, 'tombstone')} kept, since older values may still sit below ${into}`);
  yield render(r.state, {
    line: tombs.length > 0 ? 14 : 15,
    rows: { write: r.outputs.map((o) => o.id) },
    dropped: [...shadowed, ...tombs.map((d) => `${ent(d.winner)} (${d.from}): tombstone`)],
    note: `${parts.join('; ')}. The inputs are deleted. Rewriting data like this, again at every level it sinks through, is write amplification.`,
    vars: { written, dropped: shadowed.length + tombs.length },
  });
  return r.state;
}

function* settleFrames(m: Model): Generator<Frame<GridState>, Model> {
  let s = m;
  for (let p = pendingCompaction(s); p; p = pendingCompaction(s)) s = yield* compactFrames(s, p);
  return s;
}

function* flushFrames(m: Model, manual: boolean): Generator<Frame<GridState>, Model> {
  yield render(m, {
    line: manual ? 4 : 3,
    memtable: { compare: m.memtable.map((e) => e.key) },
    note: manual
      ? `Flush by hand: write the memtable’s ${plural(m.memtable.length, 'entry', 'entries')} to disk now, without waiting for it to fill.`
      : `The memtable holds ${m.memtable.length} of ${m.config.memtableCapacity} entries: full. Flush it to disk.`,
    vars: { entries: m.memtable.length },
  });
  const f = flush(m);
  const tb = f.table!;
  yield render(f.state, {
    line: 6,
    rows: { write: [tb.id] },
    note: `${tb.id} is written in one sequential pass, already sorted (keys ${tb.min}–${tb.max}), and never changes again. It goes first in L0, the newest table on disk, and the memtable starts empty.`,
    vars: { table: tb.id },
  });
  return yield* settleFrames(f.state);
}

function* writeFrames(m: Model, key: number, value: number | null): Generator<Frame<GridState>, Model> {
  const del = value === null;
  const old = m.memtable.find((e) => e.key === key);
  let checkpoint: Frame<GridState>['checkpoint'];
  if (del) {
    const choices = ['A tombstone ✕, in the memtable', `Nothing: it erases ${key} from every table`];
    if (key % 2 === 1) choices.reverse();
    checkpoint = { question: `delete(${key}): what does it write?`, choices, answer: choices.findIndex((c) => c.startsWith('A tombstone')) };
  }
  yield render(m, {
    line: 0,
    note: del
      ? `delete(${key}): the tables on disk are immutable, and older entries for ${key} may sit in several of them.`
      : `put(${key}, ${value}): every write goes to the memtable first, a sorted table in memory. (A real engine also appends it to a log on disk, so a crash loses nothing: a cheap sequential write.)`,
    vars: { key, value: value ?? '✕' },
    ...(checkpoint && { checkpoint }),
  });
  const s = memtableWrite(m, key, value);
  yield render(s, {
    line: del ? 2 : 1,
    memtable: { write: [key] },
    note: del
      ? `So a delete is a write: a tombstone ${key}=✕ goes into the memtable${old ? `, replacing ${ent(old)}` : ''}. Any get that reaches it stops and answers “not found”, hiding older values below until compaction removes them.`
      : old
        ? `${key} is already in the memtable as ${ent(old)}: overwrite it in place. Only the newest version matters.`
        : `Insert ${key}=${value} in key order. The memtable is in memory, so this is cheap.`,
    vars: { key, value: value ?? '✕', memtable: `${s.memtable.length} of ${s.config.memtableCapacity}` },
  });
  if (!isMemtableFull(s)) return s;
  return yield* flushFrames(s, false);
}

// ── Reading ──────────────────────────────────────────────────────────────────

function pathText(p: Probe, m: Model, key: number): { text: string; mark: MarkKey | null } {
  if (p.where === 'memtable') return p.result === 'hit' ? { text: 'memtable: found', mark: 'found' } : { text: 'memtable: no', mark: null };
  if (p.where === 'level') return { text: `L${p.level}: no table covers ${key}`, mark: null };
  const e = m.levels[p.level].find((t) => t.id === p.table)?.entries.find((x) => x.key === key);
  switch (p.result) {
    case 'range':
      return { text: `${p.table}: out of range`, mark: 'reject' };
    case 'bloom':
      return { text: `${p.table}: Bloom says no`, mark: 'reject' };
    case 'false-positive':
      return { text: `${p.table}: read, not there`, mark: 'reject' };
    default:
      return { text: `${p.table}: found ${e ? ent(e) : key}`, mark: 'found' };
  }
}

function* getFrames(m: Model, key: number): Generator<Frame<GridState>, Model> {
  const r = lsmGet(m, key);
  const coverers = [...m.levels[0].filter((t) => covers(t, key)), ...m.levels.slice(1).flatMap((l) => l.filter((t) => covers(t, key)))].map((t) => t.id);
  const choices = ['In the memtable', ...coverers, 'Not found anywhere'];
  const answer = r.answeredBy === 'memtable' ? 0 : r.answeredBy ? choices.indexOf(r.answeredBy) : choices.length - 1;
  yield render(m, {
    line: 0,
    note: `get(${key}): newer data sits higher up, so search from the top (memory, then L0 newest first, then L1, L2, L3) and stop at the first entry for ${key}: it is the newest version.`,
    vars: { key },
    checkpoint: { question: `get(${key}): where does the search stop?`, choices, answer },
  });

  const path: { text: string; mark: MarkKey | null }[] = [];
  let c = m.counters;
  for (const p of r.probes) {
    path.push(pathText(p, m, key));
    if (p.where === 'table') c = { ...c, probes: c.probes + (p.result === 'hit' || p.result === 'false-positive' ? 1 : 0), bloomSkips: c.bloomSkips + (p.result === 'bloom' ? 1 : 0), falsePositives: c.falsePositives + (p.result === 'false-positive' ? 1 : 0) };
    const vars = { key, reads: c.probes - m.counters.probes };
    if (p.where === 'memtable') {
      if (p.result === 'hit') {
        const e = m.memtable.find((x) => x.key === key)!;
        yield render(m, {
          line: 1,
          memtable: { found: [key] },
          path: [...path],
          counters: { ...c, gets: c.gets + 1 },
          note:
            e.value === null
              ? `The memtable holds a tombstone ${key}=✕: ${key} was deleted. Stop without touching the disk: not found.`
              : `The memtable holds ${ent(e)}, the newest version. Stop: no disk read at all.`,
          vars,
        });
      } else {
        yield render(m, { line: 1, path: [...path], note: `${key} isn’t in the memtable (an in-memory lookup, no disk read). Go down to disk, newest table first.`, vars });
      }
      continue;
    }
    if (p.where === 'level') {
      yield render(m, { line: 8, path: [...path], counters: c, note: `No L${p.level} table’s key range includes ${key}, and L${p.level}’s tables never overlap: skip the whole level without reading anything.`, vars });
      continue;
    }
    const tb = m.levels[p.level].find((x) => x.id === p.table)!;
    const deep = p.level > 0;
    if (p.result === 'range') {
      yield render(m, { line: 3, rows: { reject: [tb.id] }, path: [...path], counters: c, note: `${tb.id} holds keys ${tb.min}–${tb.max}, so ${key} can’t be in it: skip it without reading.`, vars });
    } else if (p.result === 'bloom') {
      yield render(m, {
        line: deep ? 8 : 4,
        rows: { reject: [tb.id] },
        path: [...path],
        counters: c,
        note: `${tb.id}’s range (${tb.min}–${tb.max}) includes ${key}, but its Bloom filter, a few bits kept in memory, says ${key} is certainly not there: skip it, saving a disk read.`,
        vars,
      });
    } else if (p.result === 'false-positive') {
      yield render(m, {
        line: deep ? 9 : 5,
        rows: { reject: [tb.id] },
        path: [...path],
        counters: c,
        note: `${tb.id}’s Bloom filter says “maybe”, so read it, but ${key} isn’t there: a false positive, one wasted read. A Bloom filter can be wrong this way, never the other.`,
        vars,
      });
    } else {
      const e = tb.entries.find((x) => x.key === key)!;
      yield render(m, {
        line: deep ? 9 : 5,
        cells: [{ table: tb.id, key, mark: 'found' }],
        path: [...path],
        counters: { ...c, gets: c.gets + 1 },
        note:
          e.value === null
            ? `${tb.id} holds a tombstone ${key}=✕: ${key} was deleted after any value below was written. Stop: not found, after ${plural(c.probes - m.counters.probes, 'disk read')}.`
            : `${tb.id} holds ${ent(e)}. Stop: it is the newest version, and anything below is older. That took ${plural(c.probes - m.counters.probes, 'disk read')}.`,
        vars,
      });
    }
  }
  if (r.answeredBy === null) {
    const reads = r.state.counters.probes - m.counters.probes;
    const skips = r.state.counters.bloomSkips - m.counters.bloomSkips;
    yield render(r.state, {
      line: 10,
      path: [...path],
      note: `Every place that could hold ${key} has been checked: not found, after ${plural(reads, 'disk read')}. A missing key must be ruled out at every level, which is what Bloom filters are for${skips > 0 ? `: here they saved ${plural(skips, 'more read')}` : ''}.`,
      vars: { key, reads },
    });
  }
  return r.state;
}

// ── Operations ───────────────────────────────────────────────────────────────

const KEY_ARG: ArgSpec<Model> = { name: 'key', label: 'Key', type: 'int', min: KEY_MIN, max: KEY_MAX, default: 42 };
const VALUE_ARG: ArgSpec<Model> = { name: 'value', label: 'Value', type: 'int', min: 0, max: 9, default: 1 };
const keyOf = (args: Args) => Number(args.key);
const badKey = (key: number) => !Number.isInteger(key) || key < KEY_MIN || key > KEY_MAX;

const put: OperationSpec<Model, GridState> = {
  id: 'put',
  label: 'Put',
  args: [KEY_ARG, VALUE_ARG],
  pseudocode: WRITE_CODE,
  *run(m, args) {
    const key = keyOf(args);
    const value = Number(args.value);
    if (badKey(key) || !Number.isInteger(value)) return m;
    return yield* writeFrames(m, key, value);
  },
};

const remove: OperationSpec<Model, GridState> = {
  id: 'delete',
  label: 'Delete',
  args: [KEY_ARG],
  pseudocode: WRITE_CODE,
  *run(m, args) {
    const key = keyOf(args);
    if (badKey(key)) return m;
    return yield* writeFrames(m, key, null);
  },
};

const get: OperationSpec<Model, GridState> = {
  id: 'get',
  label: 'Get',
  args: [KEY_ARG],
  pseudocode: GET_CODE,
  *run(m, args) {
    const key = keyOf(args);
    if (badKey(key)) return m;
    return yield* getFrames(m, key);
  },
};

const flushOp: OperationSpec<Model, GridState> = {
  id: 'flush',
  label: 'Flush',
  args: [],
  pseudocode: WRITE_CODE,
  disabledReason: (m) => (m.memtable.length === 0 ? 'The memtable is empty' : null),
  *run(m) {
    if (m.memtable.length === 0) return m;
    return yield* flushFrames(m, true);
  },
};

const compactOp: OperationSpec<Model, GridState> = {
  id: 'compact',
  label: 'Compact',
  args: [],
  pseudocode: WRITE_CODE,
  disabledReason: (m) => (manualCompaction(m) ? null : 'Nothing to compact: L0 is empty and every table is already in the bottom level'),
  *run(m) {
    const p = manualCompaction(m);
    if (!p) return m;
    const s = yield* compactFrames(m, p);
    return yield* settleFrames(s);
  },
};

// ── Starting states ──────────────────────────────────────────────────────────

type Step = readonly [number, number | null];

function build(script: readonly Step[]): Model {
  let m = createLsm(CONFIG);
  for (const [key, value] of script) m = lsmWrite(m, key, value).state;
  return m;
}

function randomScript(seed: number, n: number, deletes: number): Step[] {
  const rng = createRng(seed);
  const script: Step[] = [];
  const seen: number[] = [];
  for (let i = 0; i < n; i++) {
    if (seen.length > 0 && rng() < deletes) {
      script.push([seen[Math.floor(rng() * seen.length)], null]);
      continue;
    }
    const key = KEY_MIN + Math.floor(rng() * KEY_MAX);
    seen.push(key);
    script.push([key, Math.floor(rng() * 10)]);
  }
  return script;
}

/** About thirty writes: tables in L0, L1 and L2, and a few entries in memory. */
const withLevels = () => build(randomScript(7, 30, 0));

/** Keys 5, 10, …, 60 pushed down to L2, then three of them deleted: their tombstones sit above the old values. */
function withTombstones(): Model {
  let m = build(Array.from({ length: 12 }, (_, i): Step => [5 * (i + 1), (i * 3) % 10]));
  m = lsmCompact(lsmCompact(m).state).state;
  for (const [key, value] of [[20, null], [45, null], [33, 4], [10, null], [52, 7], [58, 1]] as const) m = lsmWrite(m, key, value).state;
  return m;
}

const random = (seed: number) => {
  const rng = createRng(seed);
  return build(randomScript(seed, 12 + Math.floor(rng() * 20), 0.15));
};

export const lsmTreeStructure = defineStructure<Model, GridState>({
  kind: 'structure',
  slug: 'lsm-tree',
  view: 'grid',
  initial: [
    { id: 'levels', label: 'Three levels of data', make: withLevels },
    { id: 'tombstones', label: 'Deleted keys (tombstones)', make: withTombstones },
    { id: 'empty', label: 'Empty', make: () => createLsm(CONFIG) },
    { id: 'random', label: 'Random', make: random },
  ],
  snapshot: (m) => render(m, { note: 'An LSM tree: a memtable in memory over sorted, immutable tables on disk.' }).state,
  operations: [put, remove, get, flushOp, compactOp],
  stats: [
    { key: 'written', label: 'Entries written to disk' },
    { key: 'probes', label: 'Tables read' },
    { key: 'skips', label: 'Bloom skips' },
    { key: 'compactions', label: 'Compactions' },
  ],
  legend: [
    { neutral: 'Stored entry (✕: a tombstone)' },
    { mark: 'write', label: 'Just written' },
    { mark: 'compare', label: 'Being flushed or merged' },
    { mark: 'found', label: 'Answers the get' },
    { mark: 'reject', label: 'Skipped, read for nothing, or dropped' },
  ],
  content: {
    idea: 'An LSM tree makes every write a quick insert in memory and writes to disk only in big sorted batches. Reads pay for that: they check newest to oldest across several tables, so background compaction keeps merging tables down into fewer, larger levels.',
    invariant: 'Newer data sits higher: the memtable is newer than L0, L0’s tables are newest first, and each level is newer than the one below it. From L1 down, each level’s tables are sorted and never overlap, so a get reads at most one table per level, and the first entry it finds for a key is the newest.',
    whenToUse: 'Write-heavy stores: LevelDB, RocksDB, Cassandra, HBase and many time-series databases. Writes are sequential and fast. The price is write amplification (data is rewritten as it sinks), reads that may check several tables (Bloom filters and compaction keep that down), and deletes that free space only once compaction drops their tombstones.',
    traits: [
      { label: 'Fast, sequential writes', good: true },
      { label: 'Bloom filters skip most tables that lack a key', good: true },
      { label: 'Data is rewritten as it sinks (write amplification)', good: false },
      { label: 'A get may read several tables (read amplification)', good: false },
      { label: 'A delete is a write: a tombstone', good: null },
    ],
    experiments: [
      { example: 'levels', prompt: 'Get a key from L2: count the tables the search skips by key range and by Bloom filter before the one read that finds it. Then get a key that isn’t stored anywhere.' },
      { example: 'tombstones', prompt: 'Get 20: the search stops at its tombstone, though the old value is still on disk below. Then compact until the tombstone reaches the bottom and is dropped.' },
      { example: 'empty', prompt: 'Put twelve keys: the memtable flushes every four, and three L0 tables merge into L1. Compare entries written to disk with entries put.' },
    ],
  },
});

