import type { Checkpoint, Frame, VarValue } from '@/engine/types';
import type { Holder, ItemId, LinearState, ListNode, ListState, Mark, SlotLayout, SlotPointer, SlotRow, SlotsState } from './types';

export const MAIN = 'main';

/** An element with its stable id, as stored in a structure's model. */
export type Item = { id: ItemId; value: number };

/** A slot in the main row by index, or in another row as [rowId, index]. */
export type SlotRef = number | readonly [row: string, index: number];
/** Where an element can be: a slot, or a holder outside the structure. */
export type ItemRef = SlotRef | { holder: string };

export type SlotFrameOptions = {
  note: string;
  line?: number | null;
  marks?: Partial<Record<Mark, readonly ItemRef[]>>;
  pointers?: Record<string, SlotRef | null | undefined>;
  vars?: Record<string, VarValue>;
  /** Predict-mode question about the next frame. This frame's note must not reveal the answer. */
  checkpoint?: Checkpoint;
};

/**
 * Authoring API for array-backed structures (dynamic array, stack, ring-buffer
 * queue and deque). Operations mutate through these methods and call frame()
 * at each meaningful event; frame() returns a snapshot that shares untouched
 * rows with earlier frames (copy-on-write), like ArrayTracer.
 */
export class LinearTracer {
  private values: Record<ItemId, number> = {};
  private rows: SlotRow[];
  private holders: Holder[];
  private summary = '';
  private readonly ring: boolean;
  readonly stats: Record<string, number>;

  constructor(
    private readonly layout: SlotLayout,
    init: {
      rows: readonly { id: string; label: string; slots: readonly (Item | null)[] }[];
      holders?: readonly { id: string; label: string }[];
      stats: readonly string[];
      ring?: boolean;
    },
  ) {
    this.rows = init.rows.map((r) => ({
      id: r.id,
      label: r.label,
      slots: r.slots.map((item) => {
        if (!item) return null;
        this.values[item.id] = item.value;
        return item.id;
      }),
      stale: null,
    }));
    this.holders = (init.holders ?? []).map((h) => ({ ...h, item: null }));
    this.stats = Object.fromEntries(init.stats.map((s) => [s, 0]));
    this.ring = init.ring ?? false;
  }

  setSummary(text: string) {
    this.summary = text;
  }

  /** Id of the element at a slot or holder, or null if it's empty. */
  idAt(ref: ItemRef): ItemId | null {
    if (typeof ref === 'object' && 'holder' in ref) return this.holder(ref.holder).item;
    const [row, index] = resolve(ref);
    return this.row(row).slots[index] ?? null;
  }

  value(ref: ItemRef): number {
    const id = this.idAt(ref);
    if (id == null) throw new Error(`Read from an empty spot ${JSON.stringify(ref)}`);
    return this.values[id];
  }

  /** Brings a new element into an empty slot or holder. */
  place(item: Item, at: ItemRef) {
    if (item.id in this.values) throw new Error(`Element ${item.id} already exists`);
    this.values = { ...this.values, [item.id]: item.value };
    this.put(at, item.id);
  }

  /** Moves an element into an empty slot or holder, leaving its old spot empty. */
  move(from: ItemRef, to: ItemRef) {
    const id = this.idAt(from);
    if (id == null) throw new Error(`Move from an empty spot ${JSON.stringify(from)}`);
    this.take(from);
    this.put(to, id);
  }

  count(stat: string, by = 1) {
    if (stat in this.stats) this.stats[stat] += by;
  }

  addRow(id: string, label: string, size: number) {
    this.rows = [...this.rows, { id, label, slots: Array<ItemId | null>(size).fill(null), stale: null }];
  }

  setRowLabel(id: string, label: string) {
    this.rows = this.rows.map((r) => (r.id === id ? { ...r, label } : r));
  }

  /** Drops row `oldId` and gives its id to row `newId` (an array moving to its new, bigger block). */
  replaceRow(oldId: string, newId: string) {
    if (this.row(oldId).slots.some((s) => s != null)) throw new Error(`Row ${oldId} still holds elements`);
    this.rows = this.rows.filter((r) => r.id !== oldId).map((r) => (r.id === newId ? { ...r, id: oldId } : r));
  }

  /** Leaves a faded copy of a value in a slot (memory that still holds an old copy). */
  setStale(ref: SlotRef, value: number | null) {
    const [rowId, index] = resolve(ref);
    this.rows = this.rows.map((r) => {
      if (r.id !== rowId) return r;
      const stale = r.stale ? [...r.stale] : Array<number | null>(r.slots.length).fill(null);
      stale[index] = value;
      return { ...r, stale };
    });
  }

  setHolderLabel(id: string, label: string) {
    this.holders = this.holders.map((h) => (h.id === id ? { ...h, label } : h));
  }

  frame(opts: SlotFrameOptions): Frame<LinearState> {
    const marks: Record<ItemId, Mark> = {};
    for (const [mark, refs] of Object.entries(opts.marks ?? {}) as [Mark, readonly ItemRef[]][]) {
      for (const ref of refs) {
        const id = this.idAt(ref);
        if (id != null) marks[id] = mark;
      }
    }
    const pointers: SlotPointer[] = [];
    for (const [label, ref] of Object.entries(opts.pointers ?? {})) {
      if (ref == null) continue;
      const [row, index] = resolve(ref);
      if (index >= 0 && index < this.row(row).slots.length) pointers.push({ label, row, index });
    }
    const state: SlotsState = {
      layout: this.layout,
      values: this.values,
      rows: this.rows,
      pointers,
      marks,
      holders: this.holders,
      ring: this.ring,
      summary: this.summary,
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

  private put(at: ItemRef, id: ItemId) {
    if (this.idAt(at) != null) throw new Error(`Spot ${JSON.stringify(at)} is occupied`);
    if (typeof at === 'object' && 'holder' in at) {
      this.holders = this.holders.map((h) => (h.id === at.holder ? { ...h, item: id } : h));
      return;
    }
    this.editSlot(at, id);
  }

  private take(at: ItemRef) {
    if (typeof at === 'object' && 'holder' in at) {
      this.holders = this.holders.map((h) => (h.id === at.holder ? { ...h, item: null } : h));
      return;
    }
    this.editSlot(at, null);
  }

  private editSlot(ref: SlotRef, id: ItemId | null) {
    const [rowId, index] = resolve(ref);
    const row = this.row(rowId);
    if (index < 0 || index >= row.slots.length) throw new Error(`Slot ${rowId}[${index}] is out of range`);
    this.rows = this.rows.map((r) => {
      if (r.id !== rowId) return r;
      const slots = [...r.slots];
      slots[index] = id;
      // A slot that receives a live element no longer shows an old copy.
      const stale = r.stale && id != null && r.stale[index] != null ? r.stale.map((v, i) => (i === index ? null : v)) : r.stale;
      return { ...r, slots, stale };
    });
  }

  private row(id: string): SlotRow {
    const row = this.rows.find((r) => r.id === id);
    if (!row) throw new Error(`Unknown row "${id}"`);
    return row;
  }

  private holder(id: string): Holder {
    const holder = this.holders.find((h) => h.id === id);
    if (!holder) throw new Error(`Unknown holder "${id}"`);
    return holder;
  }
}

function resolve(ref: SlotRef): readonly [string, number] {
  return typeof ref === 'number' ? [MAIN, ref] : ref;
}

/** Idle view of an array-backed structure, shown before any operation runs. */
export function slotsSnapshot(
  layout: SlotLayout,
  rows: readonly { id: string; label: string; slots: readonly (Item | null)[] }[],
  opts: { holders?: readonly { id: string; label: string }[]; ring?: boolean; summary: string; pointers?: Record<string, SlotRef | null> },
): SlotsState {
  const t = new LinearTracer(layout, { rows, holders: opts.holders, stats: [], ring: opts.ring });
  t.setSummary(opts.summary);
  return t.frame({ note: '', pointers: opts.pointers }).state as SlotsState;
}

// ───────────────────────────── linked list ─────────────────────────────

export type ListFrameOptions = {
  note: string;
  line?: number | null;
  /** Node marks, by node id. */
  marks?: Partial<Record<Mark, readonly (ItemId | null)[]>>;
  /** Next-pointer marks, by the id of the node that owns the pointer. */
  links?: Partial<Record<Mark, readonly (ItemId | null)[]>>;
  vars?: Record<string, VarValue>;
  checkpoint?: Checkpoint;
};

/**
 * Authoring API for a singly linked list. Nodes are created detached (drawn
 * below the row), wired with setNext(), and attached to the row once the list
 * reaches them, so each pointer write is its own visible step.
 */
export class ListTracer {
  private nodes: Record<ItemId, ListNode> = {};
  private order: (ItemId | null)[];
  private detached: { id: ItemId; at: number }[] = [];
  private pointers: { label: string; target: ItemId | null }[] = [];
  private summary = '';
  readonly stats: Record<string, number>;

  constructor(items: readonly Item[], stats: readonly string[]) {
    items.forEach((item, i) => {
      this.nodes[item.id] = { id: item.id, value: item.value, next: items[i + 1]?.id ?? null };
    });
    this.order = items.map((i) => i.id);
    this.stats = Object.fromEntries(stats.map((s) => [s, 0]));
    this.setPointer('head', items[0]?.id ?? null);
    this.setPointer('tail', items.at(-1)?.id ?? null);
  }

  setSummary(text: string) {
    this.summary = text;
  }

  value(id: ItemId): number {
    return this.node(id).value;
  }

  next(id: ItemId): ItemId | null {
    return this.node(id).next;
  }

  pointer(label: string): ItemId | null {
    return this.pointers.find((p) => p.label === label)?.target ?? null;
  }

  /** Column of a node in the row, or -1 if it isn't in the row. */
  column(id: ItemId): number {
    return this.order.indexOf(id);
  }

  count(stat: string, by = 1) {
    if (stat in this.stats) this.stats[stat] += by;
  }

  /** A new node, not linked to anything yet, drawn below the row at column `at`. */
  create(item: Item, at: number) {
    if (this.nodes[item.id]) throw new Error(`Node ${item.id} already exists`);
    this.nodes = { ...this.nodes, [item.id]: { id: item.id, value: item.value, next: null } };
    this.detached = [...this.detached, { id: item.id, at }];
  }

  setNext(id: ItemId, next: ItemId | null) {
    this.nodes = { ...this.nodes, [id]: { ...this.node(id), next } };
  }

  setPointer(label: string, target: ItemId | null) {
    const existing = this.pointers.some((p) => p.label === label);
    this.pointers = existing
      ? this.pointers.map((p) => (p.label === label ? { label, target } : p))
      : [...this.pointers, { label, target }];
  }

  clearPointer(label: string) {
    this.pointers = this.pointers.filter((p) => p.label !== label);
  }

  /** Moves a detached node into the row at `index` (the row closes any gaps first). */
  attach(id: ItemId, index: number) {
    const order = this.order.filter((x): x is ItemId => x != null);
    order.splice(index, 0, id);
    this.order = order;
    this.detached = this.detached.filter((d) => d.id !== id);
  }

  /** Lowers a row node out of the row, leaving a gap in its column. */
  lift(id: ItemId) {
    const col = this.order.indexOf(id);
    if (col < 0) throw new Error(`Node ${id} is not in the row`);
    this.order = this.order.map((x) => (x === id ? null : x));
    this.detached = [...this.detached, { id, at: col }];
  }

  /** Closes the gaps that lifted nodes left behind. */
  closeGaps() {
    this.order = this.order.filter((x) => x != null);
  }

  frame(opts: ListFrameOptions): Frame<LinearState> {
    const collect = (spec: ListFrameOptions['marks']) => {
      const out: Record<ItemId, Mark> = {};
      for (const [mark, ids] of Object.entries(spec ?? {}) as [Mark, readonly (ItemId | null)[]][]) {
        for (const id of ids) if (id != null && this.nodes[id]) out[id] = mark;
      }
      return out;
    };
    const state: ListState = {
      layout: 'list',
      nodes: this.nodes,
      order: this.order,
      detached: this.detached,
      pointers: this.pointers,
      marks: collect(opts.marks),
      linkMarks: collect(opts.links),
      summary: this.summary,
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

  private node(id: ItemId): ListNode {
    const node = this.nodes[id];
    if (!node) throw new Error(`Unknown node ${id}`);
    return node;
  }
}

/** Idle view of a linked list. */
export function listSnapshot(items: readonly Item[], summary: string): ListState {
  const t = new ListTracer(items, []);
  t.setSummary(summary);
  return t.frame({ note: '' }).state as ListState;
}
