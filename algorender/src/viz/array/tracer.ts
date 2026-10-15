import type { Frame, VarValue } from '@/engine/types';
import type { ArrayState, Counter, ItemId, Lane, Mark, Pointer, Range, RangeTone } from './types';

export const MAIN = 'main';

/** A slot in the main lane by index, or in another lane as [laneId, index]. */
export type SlotRef = number | readonly [lane: string, index: number];

export type FrameOptions = {
  note: string;
  line?: number | null;
  marks?: Partial<Record<Mark, readonly SlotRef[]>>;
  pointers?: Record<string, SlotRef | null | undefined>;
  ranges?: readonly { lane?: string; from: number; to: number; tone: RangeTone; label?: string }[];
  vars?: Record<string, VarValue>;
  /** Highlight one cell per counter, by counter id. */
  counterHighlight?: Record<string, number | null>;
};

/**
 * Authoring API for array algorithms. Algorithms mutate through these methods
 * and call frame() at each meaningful event; frame() returns an immutable
 * snapshot that shares untouched lanes with earlier frames, so long traces stay
 * cheap. The same operations will back the user-code "visual array" later.
 */
export class ArrayTracer {
  private readonly values: Record<ItemId, number> = {};
  private lanes: Lane[];
  private counters: Counter[] = [];
  private readonly sorted = new Set<ItemId>();
  private digitPlace: number | null = null;
  readonly stats: Record<string, number>;

  constructor(input: readonly number[], trackedStats: readonly string[] = ['comparisons', 'swaps']) {
    const slots = input.map((value, i) => {
      const id = `e${i}`;
      this.values[id] = value;
      return id;
    });
    this.lanes = [{ id: MAIN, label: 'Array', slots }];
    this.stats = Object.fromEntries(trackedStats.map((name) => [name, 0]));
  }

  get length(): number {
    return this.lane(MAIN).slots.length;
  }

  /** Value stored in a slot. Reading an empty slot is a bug in the algorithm. */
  value(ref: SlotRef): number {
    const [lane, index] = resolve(ref);
    const id = this.lane(lane).slots[index];
    if (id == null) throw new Error(`Read from empty slot ${lane}[${index}]`);
    return this.values[id];
  }

  isEmpty(ref: SlotRef): boolean {
    const [lane, index] = resolve(ref);
    return this.lane(lane).slots[index] == null;
  }

  /** Increments a tracked counter such as "comparisons". */
  count(stat: string, by = 1) {
    if (stat in this.stats) this.stats[stat] += by;
  }

  /** Adds an empty lane. "above" lanes render over the main array (e.g. insertion sort's key). */
  addLane(id: string, label: string, size: number, position: 'above' | 'below' = 'below') {
    const lane: Lane = { id, label, slots: Array<ItemId | null>(size).fill(null) };
    this.lanes = position === 'above' ? [lane, ...this.lanes] : [...this.lanes, lane];
  }

  setLaneLabel(id: string, label: string) {
    this.lanes = this.lanes.map((l) => (l.id === id ? { ...l, label } : l));
  }

  swap(a: SlotRef, b: SlotRef) {
    const [laneA, i] = resolve(a);
    const [laneB, j] = resolve(b);
    if (laneA !== laneB) throw new Error('swap() works within one lane; use move() across lanes');
    if (i === j) return;
    this.editSlots(laneA, (slots) => {
      [slots[i], slots[j]] = [slots[j], slots[i]];
    });
    this.count('swaps');
  }

  /**
   * Moves an element into an empty slot, leaving a hole behind. Counts as a
   * write unless `count` is false (e.g. lifting a value into a temp variable).
   */
  move(from: SlotRef, to: SlotRef, { count = true }: { count?: boolean } = {}) {
    const [fromLane, i] = resolve(from);
    const [toLane, j] = resolve(to);
    const id = this.lane(fromLane).slots[i];
    if (id == null) throw new Error(`Move from empty slot ${fromLane}[${i}]`);
    if (this.lane(toLane).slots[j] != null) throw new Error(`Move into occupied slot ${toLane}[${j}]`);
    this.editSlots(fromLane, (slots) => {
      slots[i] = null;
    });
    this.editSlots(toLane, (slots) => {
      slots[j] = id;
    });
    if (count) this.count('writes');
  }

  markSorted(...refs: SlotRef[]) {
    for (const ref of refs) {
      const [lane, index] = resolve(ref);
      const id = this.lane(lane).slots[index];
      if (id != null) this.sorted.add(id);
    }
  }

  markAllSorted() {
    for (const id of this.lane(MAIN).slots) if (id != null) this.sorted.add(id);
  }

  addCounter(id: string, label: string, indexLabels: readonly string[]) {
    this.counters = [...this.counters, { id, label, values: indexLabels.map(() => 0), indexLabels, highlight: null }];
  }

  counter(id: string, index: number): number {
    return this.counterById(id).values[index];
  }

  setCounter(id: string, index: number, value: number) {
    this.counters = this.counters.map((c) =>
      c.id === id ? { ...c, values: c.values.map((v, i) => (i === index ? value : v)) } : c,
    );
  }

  clearCounter(id: string) {
    this.counters = this.counters.map((c) => (c.id === id ? { ...c, values: c.values.map(() => 0) } : c));
  }

  setDigitPlace(place: number | null) {
    this.digitPlace = place;
  }

  /** Snapshot of the current state plus this step's narration and highlights. */
  frame(opts: FrameOptions): Frame<ArrayState> {
    const marks: Record<ItemId, Mark> = {};
    for (const id of this.sorted) marks[id] = 'sorted';
    for (const [mark, refs] of Object.entries(opts.marks ?? {}) as [Mark, readonly SlotRef[]][]) {
      for (const ref of refs) {
        const [lane, index] = resolve(ref);
        const id = this.lane(lane).slots[index];
        if (id != null) marks[id] = mark;
      }
    }

    const pointers: Pointer[] = [];
    for (const [label, ref] of Object.entries(opts.pointers ?? {})) {
      if (ref == null) continue;
      const [lane, index] = resolve(ref);
      if (index >= 0 && index < this.lane(lane).slots.length) pointers.push({ lane, index, label });
    }

    const ranges: Range[] = (opts.ranges ?? [])
      .filter((r) => r.from <= r.to)
      .map((r) => ({ lane: r.lane ?? MAIN, from: r.from, to: r.to, tone: r.tone, label: r.label }));

    const counters = opts.counterHighlight
      ? this.counters.map((c) =>
          c.id in opts.counterHighlight! ? { ...c, highlight: opts.counterHighlight![c.id] ?? null } : c,
        )
      : this.counters;

    return {
      state: {
        values: this.values,
        lanes: this.lanes,
        marks,
        pointers,
        ranges,
        counters,
        digitPlace: this.digitPlace,
      },
      line: opts.line ?? null,
      note: opts.note,
      vars: opts.vars ?? {},
      stats: { ...this.stats },
    };
  }

  private lane(id: string): Lane {
    const lane = this.lanes.find((l) => l.id === id);
    if (!lane) throw new Error(`Unknown lane "${id}"`);
    return lane;
  }

  private counterById(id: string): Counter {
    const counter = this.counters.find((c) => c.id === id);
    if (!counter) throw new Error(`Unknown counter "${id}"`);
    return counter;
  }

  /** Copy-on-write edit of one lane, so earlier frames keep their own slots. */
  private editSlots(id: string, edit: (slots: (ItemId | null)[]) => void) {
    this.lanes = this.lanes.map((l) => {
      if (l.id !== id) return l;
      const slots = [...l.slots];
      edit(slots);
      return { ...l, slots };
    });
  }
}

function resolve(ref: SlotRef): readonly [string, number] {
  return typeof ref === 'number' ? [MAIN, ref] : ref;
}
