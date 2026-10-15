import type { Checkpoint, Frame, VarValue } from '@/engine/types';
import type { RangeTone } from '@/viz/array/types';
import type { MarkKey } from '@/viz/marks';
import type { CellId, Readout, TextCell, TextPointer, TextRange, TextRow, TextState } from './types';

/** A cell by row id and cell index (not column). */
export type CellRef = readonly [row: string, index: number];

export type RowOptions = {
  kind?: 'chars' | 'numbers';
  offset?: number;
  pointers?: boolean;
  rangeLabels?: boolean;
  /** Cells to draw quietly (Manacher's separators). */
  faint?: (text: string, index: number) => boolean;
};

export type TextFrameOptions = {
  note: string;
  line?: number | null;
  marks?: Partial<Record<MarkKey, readonly CellRef[]>>;
  pointers?: Record<string, CellRef | null | undefined>;
  ranges?: readonly { row: string; from: number; to: number; tone: RangeTone; label?: string }[];
  /** Highlight readouts for this frame only, by readout id. */
  readoutMarks?: Record<string, MarkKey>;
  vars?: Record<string, VarValue>;
  /** Predict-mode question about the next frame. This frame's note must not reveal the answer. */
  checkpoint?: Checkpoint;
};

/**
 * Authoring API for string algorithms, mirroring ArrayTracer: algorithms edit
 * rows through these methods and call frame() at each meaningful event.
 * Every edit replaces the touched row (copy-on-write), so a frame shares
 * untouched rows with earlier frames and never sees later edits.
 */
export class TextTracer {
  private columns: number;
  private rows: readonly TextRow[] = [];
  private persistent: Readonly<Record<CellId, MarkKey>> = {};
  private readouts: readonly Readout[] = [];
  private results: TextState['results'];
  readonly stats: Record<string, number>;

  constructor({
    columns,
    stats,
    results,
  }: {
    columns: number;
    stats: readonly string[];
    results: { label: string; empty: string };
  }) {
    this.columns = columns;
    this.stats = Object.fromEntries(stats.map((name) => [name, 0]));
    this.results = { ...results, items: [] };
  }

  /** Changes the grid width, e.g. between KMP's table phase and its search phase. */
  setColumns(columns: number) {
    this.columns = columns;
  }

  /** Adds a row; cell ids are `${id}:${index}`, so they stay stable while the row slides. */
  addRow(id: string, label: string, cells: readonly string[] | string, opts: RowOptions = {}) {
    if (this.rows.some((r) => r.id === id)) throw new Error(`Row "${id}" already exists`);
    const texts = typeof cells === 'string' ? [...cells] : cells;
    const row: TextRow = {
      id,
      label,
      kind: opts.kind ?? 'chars',
      cells: texts.map((text, i): TextCell => ({ id: `${id}:${i}`, text, ...(opts.faint?.(text, i) && { faint: true }) })),
      offset: opts.offset ?? 0,
      pointers: opts.pointers ?? false,
      rangeLabels: opts.rangeLabels ?? false,
    };
    this.rows = [...this.rows, row];
  }

  removeRow(id: string) {
    this.row(id);
    this.rows = this.rows.filter((r) => r.id !== id);
    this.persistent = Object.fromEntries(Object.entries(this.persistent).filter(([cell]) => !cell.startsWith(`${id}:`)));
  }

  setRowLabel(id: string, label: string) {
    this.edit(id, (r) => ({ ...r, label }));
  }

  /** Slides a row so its first cell sits in `offset`. */
  setOffset(id: string, offset: number) {
    if (this.row(id).offset !== offset) this.edit(id, (r) => ({ ...r, offset }));
  }

  offset(id: string): number {
    return this.row(id).offset;
  }

  length(id: string): number {
    return this.row(id).cells.length;
  }

  /** Text of a cell. Reading outside the row is a bug in the algorithm. */
  text(id: string, index: number): string {
    const cell = this.row(id).cells[index];
    if (!cell) throw new Error(`Read outside row ${id}[${index}]`);
    return cell.text;
  }

  /** Writes a table entry (or any cell's text). */
  setText(id: string, index: number, text: string) {
    const row = this.row(id);
    if (index < 0 || index >= row.cells.length) throw new Error(`Write outside row ${id}[${index}]`);
    if (row.cells[index].text === text) return;
    this.edit(id, (r) => ({ ...r, cells: r.cells.map((c, i) => (i === index ? { ...c, text } : c)) }));
  }

  count(stat: string, by = 1) {
    if (stat in this.stats) this.stats[stat] += by;
  }

  /** A mark that stays until cleared, e.g. text cells of a match already found. */
  mark(mark: MarkKey, ...refs: CellRef[]) {
    const next = { ...this.persistent };
    for (const ref of refs) {
      const id = this.cellId(ref);
      if (id) next[id] = mark;
    }
    this.persistent = next;
  }

  setReadout(id: string, label: string, value: string | number) {
    const readout: Readout = { id, label, value: String(value) };
    this.readouts = this.readouts.some((r) => r.id === id)
      ? this.readouts.map((r) => (r.id === id ? readout : r))
      : [...this.readouts, readout];
  }

  addResult(item: string) {
    this.results = { ...this.results, items: [...this.results.items, item] };
  }

  /** Replaces the results, e.g. a new longest palindrome; `empty` relabels the no-results text ("none" once finished). */
  setResults(items: readonly string[], empty = this.results.empty) {
    this.results = { ...this.results, items: [...items], empty };
  }

  /** Snapshot of the current state plus this step's narration and highlights. */
  frame(opts: TextFrameOptions): Frame<TextState> {
    let marks: Record<CellId, MarkKey> | Readonly<Record<CellId, MarkKey>> = this.persistent;
    if (opts.marks) {
      const merged: Record<CellId, MarkKey> = { ...this.persistent };
      for (const [mark, refs] of Object.entries(opts.marks) as [MarkKey, readonly CellRef[]][]) {
        for (const ref of refs) {
          const id = this.cellId(ref);
          if (id) merged[id] = mark;
        }
      }
      marks = merged;
    }

    const pointers: TextPointer[] = [];
    for (const [label, ref] of Object.entries(opts.pointers ?? {})) {
      if (ref == null) continue;
      const [row, index] = ref;
      if (index >= 0 && index < this.row(row).cells.length) pointers.push({ row, index, label });
    }

    const ranges: TextRange[] = [];
    for (const r of opts.ranges ?? []) {
      const last = this.row(r.row).cells.length - 1;
      const from = Math.max(0, r.from);
      const to = Math.min(last, r.to);
      if (from <= to) ranges.push({ row: r.row, from, to, tone: r.tone, ...(r.label && { label: r.label }) });
    }

    const readouts = opts.readoutMarks
      ? this.readouts.map((r) => (opts.readoutMarks![r.id] ? { ...r, mark: opts.readoutMarks![r.id] } : r))
      : this.readouts;

    return {
      state: {
        columns: this.columns,
        rows: this.rows,
        marks,
        pointers,
        ranges,
        readouts,
        results: this.results,
      },
      line: opts.line ?? null,
      note: opts.note,
      vars: opts.vars ?? {},
      stats: { ...this.stats },
      ...(opts.checkpoint && { checkpoint: opts.checkpoint }),
    };
  }

  private row(id: string): TextRow {
    const row = this.rows.find((r) => r.id === id);
    if (!row) throw new Error(`Unknown row "${id}"`);
    return row;
  }

  private cellId([row, index]: CellRef): CellId | null {
    return this.row(row).cells[index]?.id ?? null;
  }

  private edit(id: string, change: (row: TextRow) => TextRow) {
    this.row(id);
    this.rows = this.rows.map((r) => (r.id === id ? change(r) : r));
  }
}
