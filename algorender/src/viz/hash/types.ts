import type { MarkKey } from '@/viz/marks';

/** Stable identity of a stored key. Keys are keyed by id, so rehashing animates them moving to new buckets. */
export type ItemId = string;
export type Mark = MarkKey;

/** A stored key and, for maps, its value (null for sets). */
export type HashEntry = { key: string; value: number | null };

/** A bucket array; each bucket is a chain of entry ids, front to back (separate chaining). */
export type BucketTable = { id: string; label: string; buckets: readonly (readonly ItemId[])[] };

/** A spot outside the table where a key waits to go in, or lands when it is removed. */
export type Holder = { id: string; label: string; item: ItemId | null };

export type TableState = {
  type: 'table';
  entries: Readonly<Record<ItemId, HashEntry>>;
  /** Usually one table; two while resizing (old and new). The first is the live one. */
  tables: readonly BucketTable[];
  marks: Readonly<Record<ItemId, Mark>>;
  /** Highlighted buckets, keyed "tableId:index". */
  bucketMarks: Readonly<Record<string, Mark>>;
  /** The hash computation for the key in hand, revealed line by line. */
  calc: readonly string[];
  holders: readonly Holder[];
  /** Keys stored, and the live table's bucket count: the load factor is size / buckets. */
  size: number;
  buckets: number;
  /** Resize when the load factor would exceed this. */
  maxLoad: number;
};

export type BloomVerdict = { text: string; mark: Mark };

export type BloomState = {
  type: 'bloom';
  bits: readonly (0 | 1)[];
  bitMarks: Readonly<Record<number, Mark>>;
  /** The item being added or tested. */
  item: string | null;
  calc: readonly string[];
  verdict: BloomVerdict | null;
  /** Number of hash functions. */
  k: number;
  /** The items really added. A real filter doesn't keep these; the demo does, to label false positives honestly. */
  added: readonly string[];
  /** Tests of items that were never added, and how many of those came back "probably present". */
  negatives: number;
  falsePositives: number;
};

export type HashState = TableState | BloomState;
