import type { Checkpoint, Frame, VarValue } from '@/engine/types';
import type { BloomState, BloomVerdict, BucketTable, HashEntry, HashState, Holder, ItemId, Mark, TableState } from './types';

/** Id of the live bucket table. */
export const LIVE = 'live';

/** A stored key with its stable id, as kept in a hash structure's model. */
export type EntryItem = { id: ItemId; key: string; value: number | null };

/** A bucket of the live table by index, or of another table as [tableId, index]. */
export type BucketRef = number | readonly [table: string, index: number];
type Place = BucketRef | { holder: string };

export type TableFrameOptions = {
  note: string;
  line?: number | null;
  /** Entry marks, by entry id. */
  marks?: Partial<Record<Mark, readonly (ItemId | null | undefined)[]>>;
  buckets?: Partial<Record<Mark, readonly BucketRef[]>>;
  vars?: Record<string, VarValue>;
  checkpoint?: Checkpoint;
};

/**
 * Authoring API for chained hash tables (maps and sets). Entries move between
 * holders and bucket chains by id; frame() snapshots copy-on-write state, so
 * each frame keeps its own chains.
 */
export class HashTracer {
  private entries: Record<ItemId, HashEntry> = {};
  private tables: BucketTable[];
  private holders: Holder[];
  private calc: readonly string[] = [];
  private size: number;
  private readonly maxLoad: number;
  readonly stats: Record<string, number>;

  constructor(init: {
    buckets: readonly (readonly EntryItem[])[];
    label: string;
    holders: readonly { id: string; label: string }[];
    stats: readonly string[];
    maxLoad: number;
  }) {
    this.tables = [
      {
        id: LIVE,
        label: init.label,
        buckets: init.buckets.map((chain) =>
          chain.map((e) => {
            this.entries[e.id] = { key: e.key, value: e.value };
            return e.id;
          }),
        ),
      },
    ];
    this.size = init.buckets.reduce((s, c) => s + c.length, 0);
    this.holders = init.holders.map((h) => ({ ...h, item: null }));
    this.stats = Object.fromEntries(init.stats.map((s) => [s, 0]));
    this.maxLoad = init.maxLoad;
  }

  /** Bucket count of the live table. */
  get bucketCount(): number {
    return this.table(LIVE).buckets.length;
  }

  chain(ref: BucketRef): readonly ItemId[] {
    const [table, index] = resolve(ref);
    return this.table(table).buckets[index];
  }

  entry(id: ItemId): HashEntry {
    const e = this.entries[id];
    if (!e) throw new Error(`Unknown entry ${id}`);
    return e;
  }

  holderItem(id: string): ItemId | null {
    return this.holder(id).item;
  }

  count(stat: string, by = 1) {
    if (stat in this.stats) this.stats[stat] += by;
  }

  /** Brings a new entry into a holder or onto the end of a bucket's chain. */
  place(item: EntryItem, at: Place) {
    if (this.entries[item.id]) throw new Error(`Entry ${item.id} already exists`);
    this.entries = { ...this.entries, [item.id]: { key: item.key, value: item.value } };
    this.put(item.id, at);
  }

  /** Moves an entry from wherever it is to a holder or the end of a bucket's chain. */
  move(id: ItemId, to: Place) {
    this.take(id);
    this.put(id, to);
  }

  setValue(id: ItemId, value: number | null) {
    this.entries = { ...this.entries, [id]: { ...this.entry(id), value } };
  }

  addTable(id: string, label: string, buckets: number) {
    this.tables = [...this.tables, { id, label, buckets: Array.from({ length: buckets }, () => []) }];
  }

  setTableLabel(id: string, label: string) {
    this.tables = this.tables.map((t) => (t.id === id ? { ...t, label } : t));
  }

  /** Drops the (now empty) live table and makes table `newId` the live one. */
  promote(newId: string) {
    if (this.table(LIVE).buckets.some((c) => c.length > 0)) throw new Error('The old table still holds entries');
    this.tables = this.tables.filter((t) => t.id !== LIVE).map((t) => (t.id === newId ? { ...t, id: LIVE } : t));
  }

  setCalc(lines: readonly string[]) {
    this.calc = lines;
  }

  setSize(size: number) {
    this.size = size;
  }

  setHolderLabel(id: string, label: string) {
    this.holders = this.holders.map((h) => (h.id === id ? { ...h, label } : h));
  }

  frame(opts: TableFrameOptions): Frame<HashState> {
    const marks: Record<ItemId, Mark> = {};
    for (const [mark, ids] of Object.entries(opts.marks ?? {}) as [Mark, readonly (ItemId | null | undefined)[]][]) {
      for (const id of ids) if (id != null && this.entries[id]) marks[id] = mark;
    }
    const bucketMarks: Record<string, Mark> = {};
    for (const [mark, refs] of Object.entries(opts.buckets ?? {}) as [Mark, readonly BucketRef[]][]) {
      for (const ref of refs) {
        const [table, index] = resolve(ref);
        bucketMarks[`${table}:${index}`] = mark;
      }
    }
    const state: TableState = {
      type: 'table',
      entries: this.entries,
      tables: this.tables,
      marks,
      bucketMarks,
      calc: this.calc,
      holders: this.holders,
      size: this.size,
      buckets: this.bucketCount,
      maxLoad: this.maxLoad,
    };
    return {
      state,
      line: opts.line ?? null,
      note: opts.note,
      vars: opts.vars ?? {},
      stats: { ...this.stats },
      ...(opts.checkpoint && { checkpoint: opts.checkpoint }),
    };
  }

  private put(id: ItemId, at: Place) {
    if (typeof at === 'object' && 'holder' in at) {
      if (this.holder(at.holder).item != null) throw new Error(`Holder ${at.holder} is occupied`);
      this.holders = this.holders.map((h) => (h.id === at.holder ? { ...h, item: id } : h));
      return;
    }
    const [tableId, index] = resolve(at);
    this.editChain(tableId, index, (chain) => [...chain, id]);
  }

  private take(id: ItemId) {
    if (this.holders.some((h) => h.item === id)) {
      this.holders = this.holders.map((h) => (h.item === id ? { ...h, item: null } : h));
      return;
    }
    for (const t of this.tables) {
      const index = t.buckets.findIndex((c) => c.includes(id));
      if (index >= 0) {
        this.editChain(t.id, index, (chain) => chain.filter((x) => x !== id));
        return;
      }
    }
    throw new Error(`Entry ${id} is nowhere`);
  }

  private editChain(tableId: string, index: number, edit: (chain: readonly ItemId[]) => readonly ItemId[]) {
    const table = this.table(tableId);
    if (index < 0 || index >= table.buckets.length) throw new Error(`Bucket ${tableId}[${index}] is out of range`);
    this.tables = this.tables.map((t) => (t.id === tableId ? { ...t, buckets: t.buckets.map((c, i) => (i === index ? edit(c) : c)) } : t));
  }

  private table(id: string): BucketTable {
    const t = this.tables.find((x) => x.id === id);
    if (!t) throw new Error(`Unknown table "${id}"`);
    return t;
  }

  private holder(id: string): Holder {
    const h = this.holders.find((x) => x.id === id);
    if (!h) throw new Error(`Unknown holder "${id}"`);
    return h;
  }
}

function resolve(ref: BucketRef): readonly [string, number] {
  return typeof ref === 'number' ? [LIVE, ref] : ref;
}

// ───────────────────────────── Bloom filter ─────────────────────────────

export type BloomFrameOptions = {
  note: string;
  line?: number | null;
  /** Bit marks, by bit index. */
  marks?: Partial<Record<Mark, readonly number[]>>;
  vars?: Record<string, VarValue>;
  checkpoint?: Checkpoint;
};

/** Authoring API for a Bloom filter: a bit array, the item in hand, and the honest bookkeeping of the demo. */
export class BloomTracer {
  private bits: readonly (0 | 1)[];
  private item: string | null = null;
  private calc: readonly string[] = [];
  private verdict: BloomVerdict | null = null;
  private added: readonly string[];
  private negatives: number;
  private falsePositives: number;
  readonly stats: Record<string, number>;

  constructor(
    private readonly k: number,
    init: { bits: readonly (0 | 1)[]; added: readonly string[]; negatives: number; falsePositives: number; stats: readonly string[] },
  ) {
    this.bits = init.bits;
    this.added = init.added;
    this.negatives = init.negatives;
    this.falsePositives = init.falsePositives;
    this.stats = Object.fromEntries(init.stats.map((s) => [s, 0]));
  }

  bit(i: number): 0 | 1 {
    return this.bits[i];
  }

  setBit(i: number) {
    this.bits = this.bits.map((b, j) => (j === i ? 1 : b));
  }

  count(stat: string, by = 1) {
    if (stat in this.stats) this.stats[stat] += by;
  }

  setItem(item: string | null) {
    this.item = item;
  }

  setCalc(lines: readonly string[]) {
    this.calc = lines;
  }

  setVerdict(verdict: BloomVerdict | null) {
    this.verdict = verdict;
  }

  addToSet(item: string) {
    if (!this.added.includes(item)) this.added = [...this.added, item];
  }

  /** Records a test of an item that was never added, and whether the filter wrongly said "probably present". */
  recordNegative(falsePositive: boolean) {
    this.negatives += 1;
    if (falsePositive) this.falsePositives += 1;
  }

  frame(opts: BloomFrameOptions): Frame<HashState> {
    const bitMarks: Record<number, Mark> = {};
    for (const [mark, indices] of Object.entries(opts.marks ?? {}) as [Mark, readonly number[]][]) {
      for (const i of indices) bitMarks[i] = mark;
    }
    const state: BloomState = {
      type: 'bloom',
      bits: this.bits,
      bitMarks,
      item: this.item,
      calc: this.calc,
      verdict: this.verdict,
      k: this.k,
      added: this.added,
      negatives: this.negatives,
      falsePositives: this.falsePositives,
    };
    return {
      state,
      line: opts.line ?? null,
      note: opts.note,
      vars: opts.vars ?? {},
      stats: { ...this.stats },
      ...(opts.checkpoint && { checkpoint: opts.checkpoint }),
    };
  }
}
