import type { Checkpoint, Frame, VarValue } from '@/engine/types';
import type { MarkKey } from '@/viz/marks';
import {
  cellKey,
  type Arrow,
  type CellStyle,
  type GridPart,
  type GridState,
  type Guide,
  type Header,
  type ListItem,
  type ListPart,
  type Look,
  type MeterPart,
  type Piece,
  type TablePart,
} from './types';

export const MAIN = 'main';

/** A cell by position: [row, col] in the main table, or [table, row, col]. Rows count in their current order. */
export type CellRef = readonly [row: number, col: number] | readonly [table: string, row: number, col: number];

/** Anything a mark can land on. */
export type Ref =
  | CellRef
  | { row: number; table?: string }
  | { col: number; table?: string }
  | { piece: string; table?: string }
  | { bar: string; table?: string }
  | { item: string; list: string }
  | { segment: string; meter: string };

export type ArrowSpec = { from: CellRef; to: CellRef; mark: MarkKey; bend?: number };

export type FrameOptions = {
  note: string;
  line?: number | null;
  vars?: Record<string, VarValue>;
  /** Highlights for this frame only; they override marks set with mark(). */
  marks?: Partial<Record<MarkKey, readonly Ref[]>>;
  /** Arrows for this frame only, drawn on top of the persistent ones. */
  arrows?: readonly ArrowSpec[];
  /** Pale washes for this frame only. */
  tints?: readonly { cells: readonly CellRef[]; mark: MarkKey }[];
  guides?: readonly (Guide & { table?: string })[];
  /** Predict-mode question about the next frame. This frame's note must not reveal the answer. */
  checkpoint?: Checkpoint;
};

export type TableSpec = {
  id?: string;
  label: string;
  look?: Look;
  corner?: string;
  rows: readonly (Header & { id?: string })[];
  cols: readonly Header[];
  box?: number;
  checkered?: boolean;
};

type Overlay = {
  marks: Record<string, MarkKey>;
  tints: Record<string, MarkKey>;
  rowMarks: Record<string, MarkKey>;
  colMarks: Record<number, MarkKey>;
  pieces: Record<string, MarkKey>;
  bars: Record<string, MarkKey>;
  arrows: Arrow[];
  guides: Guide[];
};

/**
 * Authoring API for grid algorithms (DP tables, boards, timelines). Algorithms
 * mutate through these methods and call frame() at each meaningful event;
 * frame() returns an immutable snapshot that shares untouched parts and rows
 * with earlier frames, so long traces stay cheap.
 */
export class GridTracer {
  private parts: GridPart[] = [];
  readonly stats: Record<string, number>;

  constructor(trackedStats: readonly string[]) {
    this.stats = Object.fromEntries(trackedStats.map((name) => [name, 0]));
  }

  /** Increments a tracked counter such as "cells". */
  count(stat: string, by = 1) {
    if (stat in this.stats) this.stats[stat] += by;
  }

  // ─────────────────────────── building ───────────────────────────

  addTable(spec: TableSpec) {
    const id = spec.id ?? MAIN;
    const rows = spec.rows.map((r, i) => ({ id: r.id ?? `r${i}`, label: r.label, ...(r.sub != null && { sub: r.sub }) }));
    const table: TablePart = {
      kind: 'table',
      id,
      label: spec.label,
      look: spec.look ?? 'table',
      corner: spec.corner ?? '',
      rows,
      cols: spec.cols,
      cells: Object.fromEntries(rows.map((r) => [r.id, Array<string>(spec.cols.length).fill('')])),
      styles: {},
      marks: {},
      tints: {},
      rowMarks: {},
      colMarks: {},
      arrows: [],
      pieces: [],
      bars: [],
      guides: [],
      box: spec.box ?? null,
      checkered: spec.checkered ?? false,
    };
    this.parts = [...this.parts, table];
  }

  addList(spec: { id: string; label: string; empty: string }) {
    this.parts = [...this.parts, { kind: 'list', ...spec, items: [] }];
  }

  addMeter(spec: { id: string; label: string; total: number; unit: string }) {
    this.parts = [...this.parts, { kind: 'meter', ...spec, segments: [] }];
  }

  // ──────────────────────────── tables ────────────────────────────

  rowCount(table = MAIN): number {
    return this.table(table).rows.length;
  }

  colCount(table = MAIN): number {
    return this.table(table).cols.length;
  }

  /** Id of the row currently at `index`. */
  rowId(index: number, table = MAIN): string {
    const row = this.table(table).rows[index];
    if (!row) throw new Error(`No row ${index} in table "${table}"`);
    return row.id;
  }

  get(ref: CellRef): string {
    const [table, row, col] = this.resolve(ref);
    return this.table(table).cells[row][col];
  }

  /** Numeric value of a filled cell. Reading an empty cell is a bug in the algorithm. */
  num(ref: CellRef): number {
    const text = this.get(ref);
    if (text === '') throw new Error(`Read from empty cell ${String(ref)}`);
    return Number(text);
  }

  set(ref: CellRef, value: string | number) {
    const [table, row, col] = this.resolve(ref);
    this.edit(table, (t) => {
      const cells = [...t.cells[row]];
      cells[col] = String(value);
      return { ...t, cells: { ...t.cells, [row]: cells } };
    });
  }

  setStyle(ref: CellRef, style: CellStyle | null) {
    const [table, row, col] = this.resolve(ref);
    this.edit(table, (t) => ({ ...t, styles: withKey(t.styles, cellKey(row, col), style) }));
  }

  /** Gives `style` to exactly these cells of one table, taking it away from every other cell. */
  restyle(style: CellStyle, refs: readonly CellRef[], table = MAIN) {
    const keys = refs.map((ref) => {
      const [t, row, col] = this.resolve(ref);
      if (t !== table) throw new Error('restyle() works within one table');
      return cellKey(row, col);
    });
    this.edit(table, (t) => {
      const styles: Record<string, CellStyle> = Object.fromEntries(Object.entries(t.styles).filter(([, s]) => s !== style));
      for (const key of keys) styles[key] = style;
      return { ...t, styles };
    });
  }

  setRowHeader(index: number, header: Header, table = MAIN) {
    this.edit(table, (t) => ({ ...t, rows: t.rows.map((r, i) => (i === index ? { id: r.id, ...header } : r)) }));
  }

  /** Puts rows in a new order, given as row ids. Rows keep their cells, marks and bars. */
  reorderRows(order: readonly string[], table = MAIN) {
    this.edit(table, (t) => {
      const byId = new Map(t.rows.map((r) => [r.id, r]));
      if (order.length !== t.rows.length || order.some((id) => !byId.has(id))) throw new Error('reorderRows needs every row id once');
      return { ...t, rows: order.map((id) => byId.get(id)!) };
    });
  }

  /** Persistent mark (until changed), e.g. the traceback path. null clears it. */
  mark(ref: Ref, mark: MarkKey | null) {
    if (Array.isArray(ref)) {
      const [table, row, col] = this.resolve(ref as CellRef);
      this.edit(table, (t) => ({ ...t, marks: withKey(t.marks, cellKey(row, col), mark) }));
      return;
    }
    const r = ref as Exclude<Ref, CellRef>;
    if ('item' in r) {
      this.editList(r.list, (l) => ({ ...l, items: l.items.map((it) => (it.id === r.item ? { ...it, mark } : it)) }));
    } else if ('segment' in r) {
      this.editMeter(r.meter, (m) => ({ ...m, segments: m.segments.map((s) => (s.id === r.segment ? { ...s, mark } : s)) }));
    } else {
      const table = r.table ?? MAIN;
      this.edit(table, (t) => {
        if ('row' in r) return { ...t, rowMarks: withKey(t.rowMarks, this.rowId(r.row, table), mark) };
        if ('col' in r) return { ...t, colMarks: withKey(t.colMarks, r.col, mark) };
        if ('piece' in r) return { ...t, pieces: t.pieces.map((p) => (p.id === r.piece ? { ...p, mark } : p)) };
        return { ...t, bars: t.bars.map((b) => (b.id === r.bar ? { ...b, mark } : b)) };
      });
    }
  }

  /** Persistent arrow, e.g. one step of a traceback. */
  addArrow(spec: ArrowSpec) {
    const arrow = this.arrow(spec);
    this.edit(arrow.table, (t) => ({ ...t, arrows: [...t.arrows.filter((a) => a.id !== arrow.value.id), arrow.value] }));
  }

  /** Places a piece, or slides it if it is already on the board. */
  placePiece(id: string, at: CellRef, glyph: string, label: string) {
    const [table, row, col] = this.resolve(at);
    this.edit(table, (t) => {
      const existing = t.pieces.find((p) => p.id === id);
      const piece: Piece = { id, at: { row, col }, glyph, label, mark: existing?.mark ?? null };
      return { ...t, pieces: existing ? t.pieces.map((p) => (p.id === id ? piece : p)) : [...t.pieces, piece] };
    });
  }

  removePiece(id: string, table = MAIN) {
    this.edit(table, (t) => ({ ...t, pieces: t.pieces.filter((p) => p.id !== id) }));
  }

  piece(id: string, table = MAIN): Piece | undefined {
    return this.table(table).pieces.find((p) => p.id === id);
  }

  /** Adds or moves a bar on the row with id `row`. */
  setBar(id: string, row: string, from: number, to: number, table = MAIN) {
    this.edit(table, (t) => {
      const existing = t.bars.find((b) => b.id === id);
      const bar = { id, row, from, to, mark: existing?.mark ?? null };
      return { ...t, bars: existing ? t.bars.map((b) => (b.id === id ? bar : b)) : [...t.bars, bar] };
    });
  }

  // ───────────────────────── lists & meters ─────────────────────────

  addItem(list: string, item: { id: string; text: string; mark?: MarkKey | null }, where: 'end' | 'start' = 'end') {
    const it: ListItem = { id: item.id, text: item.text, mark: item.mark ?? null };
    this.editList(list, (l) => ({ ...l, items: where === 'end' ? [...l.items, it] : [it, ...l.items] }));
  }

  setItemText(list: string, id: string, text: string) {
    this.editList(list, (l) => ({ ...l, items: l.items.map((it) => (it.id === id ? { ...it, text } : it)) }));
  }

  removeItem(list: string, id: string) {
    this.editList(list, (l) => ({ ...l, items: l.items.filter((it) => it.id !== id) }));
  }

  addSegment(meter: string, seg: { id: string; label: string; amount: number; mark?: MarkKey | null }) {
    this.editMeter(meter, (m) => ({ ...m, segments: [...m.segments, { ...seg, mark: seg.mark ?? null }] }));
  }

  // ──────────────────────────── frames ────────────────────────────

  /** Snapshot of the current state plus this step's narration and highlights. */
  frame(opts: FrameOptions): Frame<GridState> {
    const overlays = new Map<string, Overlay>();
    const overlay = (table: string) => {
      let o = overlays.get(table);
      if (!o) {
        this.table(table); // throws on an unknown table
        o = { marks: {}, tints: {}, rowMarks: {}, colMarks: {}, pieces: {}, bars: {}, arrows: [], guides: [] };
        overlays.set(table, o);
      }
      return o;
    };
    const items = new Map<string, Record<string, MarkKey>>();
    const segments = new Map<string, Record<string, MarkKey>>();

    for (const [mark, refs] of Object.entries(opts.marks ?? {}) as [MarkKey, readonly Ref[]][]) {
      for (const ref of refs) {
        if (Array.isArray(ref)) {
          const [table, row, col] = this.resolve(ref as CellRef);
          overlay(table).marks[cellKey(row, col)] = mark;
          continue;
        }
        const r = ref as Exclude<Ref, CellRef>;
        if ('item' in r) items.set(r.list, { ...items.get(r.list), [r.item]: mark });
        else if ('segment' in r) segments.set(r.meter, { ...segments.get(r.meter), [r.segment]: mark });
        else {
          const table = r.table ?? MAIN;
          const o = overlay(table);
          if ('row' in r) o.rowMarks[this.rowId(r.row, table)] = mark;
          else if ('col' in r) o.colMarks[r.col] = mark;
          else if ('piece' in r) o.pieces[r.piece] = mark;
          else o.bars[r.bar] = mark;
        }
      }
    }
    for (const tint of opts.tints ?? []) {
      for (const ref of tint.cells) {
        const [table, row, col] = this.resolve(ref);
        overlay(table).tints[cellKey(row, col)] = tint.mark;
      }
    }
    for (const spec of opts.arrows ?? []) {
      const a = this.arrow(spec);
      overlay(a.table).arrows.push(a.value);
    }
    for (const { table, ...guide } of opts.guides ?? []) overlay(table ?? MAIN).guides.push(guide);

    const parts = this.parts.map((part): GridPart => {
      if (part.kind === 'table') {
        const o = overlays.get(part.id);
        if (!o) return part;
        const ephemeral = new Set(o.arrows.map((a) => a.id));
        return {
          ...part,
          marks: { ...part.marks, ...o.marks },
          tints: { ...part.tints, ...o.tints },
          rowMarks: { ...part.rowMarks, ...o.rowMarks },
          colMarks: { ...part.colMarks, ...o.colMarks },
          pieces: part.pieces.map((p) => (p.id in o.pieces ? { ...p, mark: o.pieces[p.id] } : p)),
          bars: part.bars.map((b) => (b.id in o.bars ? { ...b, mark: o.bars[b.id] } : b)),
          arrows: [...part.arrows.filter((a) => !ephemeral.has(a.id)), ...o.arrows],
          guides: [...part.guides, ...o.guides],
        };
      }
      if (part.kind === 'list') {
        const m = items.get(part.id);
        return m ? { ...part, items: part.items.map((it) => (it.id in m ? { ...it, mark: m[it.id] } : it)) } : part;
      }
      const m = segments.get(part.id);
      return m ? { ...part, segments: part.segments.map((s) => (s.id in m ? { ...s, mark: m[s.id] } : s)) } : part;
    });

    return {
      state: { parts },
      line: opts.line ?? null,
      note: opts.note,
      vars: opts.vars ?? {},
      stats: { ...this.stats },
      ...(opts.checkpoint && { checkpoint: opts.checkpoint }),
    };
  }

  // ─────────────────────────── internals ───────────────────────────

  private resolve(ref: CellRef): readonly [table: string, row: string, col: number] {
    const [table, row, col] = ref.length === 2 ? [MAIN, ref[0], ref[1]] : ref;
    const t = this.table(table);
    if (col < 0 || col >= t.cols.length) throw new Error(`No column ${col} in table "${table}"`);
    return [table, this.rowId(row, table), col];
  }

  private arrow(spec: ArrowSpec): { table: string; value: Arrow } {
    const [table, fromRow, fromCol] = this.resolve(spec.from);
    const [toTable, toRow, toCol] = this.resolve(spec.to);
    if (table !== toTable) throw new Error('An arrow must stay within one table');
    return {
      table,
      value: {
        id: `${cellKey(fromRow, fromCol)}>${cellKey(toRow, toCol)}`,
        from: { row: fromRow, col: fromCol },
        to: { row: toRow, col: toCol },
        mark: spec.mark,
        bend: spec.bend ?? 0,
      },
    };
  }

  private table(id: string): TablePart {
    const part = this.parts.find((p): p is TablePart => p.kind === 'table' && p.id === id);
    if (!part) throw new Error(`Unknown table "${id}"`);
    return part;
  }

  /** Copy-on-write edit of one part, so earlier frames keep their own copy. */
  private edit(id: string, fn: (t: TablePart) => TablePart) {
    this.table(id);
    this.parts = this.parts.map((p) => (p.kind === 'table' && p.id === id ? fn(p) : p));
  }

  private editList(id: string, fn: (l: ListPart) => ListPart) {
    if (!this.parts.some((p) => p.kind === 'list' && p.id === id)) throw new Error(`Unknown list "${id}"`);
    this.parts = this.parts.map((p) => (p.kind === 'list' && p.id === id ? fn(p) : p));
  }

  private editMeter(id: string, fn: (m: MeterPart) => MeterPart) {
    if (!this.parts.some((p) => p.kind === 'meter' && p.id === id)) throw new Error(`Unknown meter "${id}"`);
    this.parts = this.parts.map((p) => (p.kind === 'meter' && p.id === id ? fn(p) : p));
  }
}

function withKey<K extends string | number, V>(record: Readonly<Record<K, V>>, key: K, value: V | null): Record<K, V> {
  const next = { ...record } as Record<K, V>;
  if (value == null) delete next[key];
  else next[key] = value;
  return next;
}
