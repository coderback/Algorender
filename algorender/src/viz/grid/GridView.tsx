'use client';

import { LayoutGroup, motion, useReducedMotion } from 'motion/react';
import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { MARKS, NEUTRAL, type MarkKey } from '@/viz/marks';
import { cx } from '@/components/ui/cx';
import { CELL_RADIUS, EMPTY_SLOT, fillFor, PLAIN_CELL } from '@/viz/parts';
import { describeList, describeMeter, describeTable, formatAmount } from './describe';
import { arrowGeometry } from './geometry';
import { cellKey, type Arrow, type CellStyle, type GridState, type ListPart, type Look, type MeterPart, type Row, type TablePart } from './types';

/** Cell size bounds per look, in px. Below the minimum the table scrolls inside its own box. */
const CELL: Record<Look, { min: number; max: number }> = {
  table: { min: 24, max: 46 },
  board: { min: 28, max: 48 },
  timeline: { min: 18, max: 30 },
};

/** Cell text shrinks with the cell (container query units) and with its length. */
const TEXT_BY_LENGTH = [
  'text-[clamp(10px,46cqw,18px)]',
  'text-[clamp(10px,46cqw,18px)]',
  'text-[clamp(10px,40cqw,17px)]',
  'text-[clamp(9px,30cqw,15px)]',
  'text-[clamp(8px,24cqw,13px)]',
] as const;

/**
 * Renders DP tables, boards and timelines, plus chip lists and capacity
 * meters. Rows are keyed by id and animate when they reorder; pieces (queens)
 * slide between squares; dependency arrows are drawn on an SVG overlay whose
 * viewBox is one unit per cell, so they line up with the square cells at any
 * width.
 */
export function GridView({ state }: { state: GridState }) {
  const id = useId();
  // Tables in one group (e.g. meetings and rooms over the same time axis) share the widest row-header column.
  const groupWidth = new Map<string, number>();
  for (const part of state.parts) {
    if (part.kind === 'table' && part.group != null) groupWidth.set(part.group, Math.max(groupWidth.get(part.group) ?? 0, rowHeaderWidth(part.rows)));
  }
  return (
    <LayoutGroup id={id}>
      <div className="flex flex-col gap-5">
        {state.parts.map((part) =>
          part.kind === 'table' ? (
            <TableView key={part.id} table={part} headerWidth={part.group != null ? groupWidth.get(part.group) : undefined} />
          ) : part.kind === 'list' ? (
            <ListView key={part.id} list={part} />
          ) : (
            <MeterView key={part.id} meter={part} />
          ),
        )}
      </div>
    </LayoutGroup>
  );
}

function PartLabel({ children }: { children: ReactNode }) {
  return <div className="mb-1.5 text-xs font-medium text-ink-muted">{children}</div>;
}

// ───────────────────────────── tables ─────────────────────────────

function TableView({ table, headerWidth }: { table: TablePart; headerWidth?: number }) {
  const { min, max } = CELL[table.look];
  const cols = table.cols.length;
  const timeline = table.look === 'timeline';
  const hw = headerWidth ?? rowHeaderWidth(table.rows);
  const showCols = timeline || table.cols.some((c) => c.label || c.sub);
  const [scrollRef, overflowing] = useOverflow<HTMLDivElement>();
  const index = new Map(table.rows.map((r, i) => [r.id, i]));
  const template: CSSProperties = { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` };

  return (
    <div role="group" aria-label={table.label}>
      <PartLabel>{table.label}</PartLabel>
      <p className="sr-only">{describeTable(table)}</p>
      <div
        ref={scrollRef}
        className="overflow-x-auto"
        tabIndex={overflowing ? 0 : -1}
        role={overflowing ? 'region' : undefined}
        aria-label={overflowing ? `${table.label} (scrolls sideways)` : undefined}
      >
        <div className="mx-auto" style={{ minWidth: hw + cols * min, maxWidth: hw + cols * max }} aria-hidden>
          {showCols && (
            <div className="flex items-end">
              {hw > 0 && (
                <div className="shrink-0 truncate pr-1.5 pb-0.5 text-right font-mono text-[10px] text-ink-muted" style={{ width: hw }}>
                  {table.corner}
                </div>
              )}
              {timeline ? <Ticks cols={cols} guides={table.guides} /> : <ColumnHeaders table={table} template={template} />}
            </div>
          )}
          <div className="relative">
            {table.rows.length === 0 && (
              <div className="flex h-8 items-center text-sm text-ink-muted" style={{ paddingLeft: hw }}>
                {table.empty ?? 'None yet'}
              </div>
            )}
            {table.rows.map((row, r) => (
              <motion.div key={row.id} layout="position" className="flex">
                {hw > 0 && <RowHeader row={row} mark={table.rowMarks[row.id]} width={hw} />}
                {timeline ? (
                  <TimelineRow table={table} row={row} template={template} />
                ) : (
                  <div className="grid min-w-0 flex-1" style={template}>
                    {table.cells[row.id].map((text, c) => {
                      const key = cellKey(row.id, c);
                      return (
                        <Cell
                          key={c}
                          text={text}
                          mark={table.marks[key]}
                          tint={table.tints[key]}
                          style={table.styles[key]}
                          look={table.look}
                          dark={table.checkered && (r + c) % 2 === 1}
                          fill={barFill(text, table.scales?.[row.id])}
                        />
                      );
                    })}
                  </div>
                )}
              </motion.div>
            ))}
            <Overlay table={table} index={index} left={hw} />
            <Pieces table={table} index={index} left={hw} />
          </div>
        </div>
      </div>
      {overflowing && <p className="mt-1 text-[11px] text-ink-muted">Scroll sideways to see the whole table →</p>}
    </div>
  );
}

/** Width of the row-header column, from its longest label (mono 11px ≈ 6.7px per character); 0 when no row has a label. */
function rowHeaderWidth(rows: readonly Row[]): number {
  if (!rows.some((r) => r.label || r.sub)) return 0;
  const widest = Math.max(...rows.map((r) => r.label.length * 7 + (r.sub ? 4 + r.sub.length * 6.2 : 0)));
  // + glyph column (12), gap, padding (≈20): leave room so short labels never truncate.
  return Math.min(140, Math.max(32, Math.ceil(widest + 34)));
}

/** Height of a bar-row cell's bar as a fraction of the cell, or null for an ordinary cell. */
function barFill(text: string, scale: number | undefined): number | null {
  if (scale == null) return null;
  const n = Number(text);
  if (text === '' || !Number.isFinite(n) || n <= 0 || scale <= 0) return 0;
  // Small values still show a sliver, so a bar is never mistaken for an empty cell.
  return Math.max(0.08, Math.min(1, n / scale));
}

function ColumnHeaders({ table, template }: { table: TablePart; template: CSSProperties }) {
  return (
    <div className="grid min-w-0 flex-1" style={template}>
      {table.cols.map((col, c) => {
        const meta = table.colMarks[c] ? MARKS[table.colMarks[c]] : null;
        return (
          <div key={c} className="flex min-w-0 flex-col items-center pb-0.5">
            <span className={`h-3 text-[9px] leading-3 font-bold ${meta?.text ?? ''}`}>{meta?.glyph ?? ''}</span>
            <span className="relative max-w-full rounded px-0.5">
              <span
                className={`absolute inset-0 rounded transition ${meta ? `${meta.bg} opacity-25` : 'opacity-0'}`}
                style={{ transitionDuration: 'var(--tween, 300ms)' }}
              />
              <span className="relative block truncate font-mono text-xs font-semibold text-ink">{col.label}</span>
            </span>
            {col.sub != null && <span className="font-mono text-[9px] leading-3 text-ink-muted">{col.sub}</span>}
          </div>
        );
      })}
    </div>
  );
}

/** Tick labels sit on column boundaries, so a bar [1, 4) starts at "1" and ends at "4". */
function Ticks({ cols, guides }: { cols: number; guides: TablePart['guides'] }) {
  const every = cols <= 16 ? 1 : cols <= 32 ? 2 : 5;
  const ticks = Array.from({ length: cols + 1 }, (_, t) => t).filter((t) => t % every === 0 || t === cols);
  return (
    <div className="relative h-8 min-w-0 flex-1">
      {guides.map((g, k) => {
        const at = g.at / cols;
        const shift = at < 0.25 ? '0%' : at > 0.75 ? '-100%' : '-50%';
        return (
          <span
            key={k}
            className={`absolute top-0 font-mono text-[10px] leading-4 font-semibold whitespace-nowrap ${MARKS[g.mark].text}`}
            style={{ left: `${at * 100}%`, transform: `translateX(${shift})` }}
          >
            {g.label}
          </span>
        );
      })}
      {ticks.map((t) => (
        <span
          key={t}
          // The end ticks align inside the timeline so they never push it wider than its box.
          className="absolute bottom-0 font-mono text-[10px] leading-4 text-ink-muted tabular-nums"
          style={{ left: `${(t / cols) * 100}%`, transform: `translateX(${t === 0 ? '-25%' : t === cols ? '-100%' : '-50%'})` }}
        >
          {t}
        </span>
      ))}
    </div>
  );
}

function RowHeader({ row, mark, width }: { row: Row; mark: MarkKey | undefined; width: number }) {
  const meta = mark ? MARKS[mark] : null;
  return (
    <div className="flex shrink-0 items-center gap-0.5 overflow-hidden pr-1.5" style={{ width }}>
      <span className={`w-3 shrink-0 text-center text-[10px] font-bold ${meta?.text ?? ''}`}>{meta?.glyph ?? ''}</span>
      <span className="relative min-w-0 truncate rounded px-0.5 leading-tight">
        <span
          className={`absolute inset-0 rounded transition ${meta ? `${meta.bg} opacity-25` : 'opacity-0'}`}
          style={{ transitionDuration: 'var(--tween, 300ms)' }}
        />
        <span className="relative font-mono text-[11px] font-semibold text-ink">{row.label}</span>
        {row.sub && <span className="relative ml-1 font-mono text-[10px] text-ink-soft">{row.sub}</span>}
      </span>
    </div>
  );
}

/**
 * One square cell (V6). A mark fills it solid in the mark's colour, with the
 * mark's glyph in the corner when the cell is big enough, so colour is never
 * the only cue. A value sits in a white cell, a cell not reached yet is a
 * dashed outline, a given (input) cell takes a track tint and a `block` cell
 * is a solid wall. In a bar row (`fill` set) the colour rises from the bottom
 * to the value's height instead; a row or column `tint` washes behind.
 */
function Cell({
  text,
  mark,
  tint,
  style,
  look,
  dark,
  fill,
}: {
  text: string;
  mark: MarkKey | undefined;
  tint: MarkKey | undefined;
  style: CellStyle | undefined;
  look: Look;
  dark: boolean;
  fill: number | null;
}) {
  const meta = mark ? MARKS[mark] : null;
  const board = look === 'board';
  const bar = fill != null;
  const solid = meta != null && !bar;
  const empty = !board && !bar && text === '' && !tint && style !== 'shade' && style !== 'block';
  const face = solid
    ? fillFor(mark)
    : style === 'block'
      ? 'bg-primary text-on-primary'
      : style === 'given'
        ? 'bg-track-butter text-track-butter-title'
        : empty
          ? EMPTY_SLOT
          : board
            ? dark
              ? 'bg-sunken text-ink'
              : 'bg-surface text-ink'
            : PLAIN_CELL;
  // Washes under the value: a bar's height, a tinted row or column, a shaded square.
  const wash = bar
    ? `${meta ? meta.bg : NEUTRAL.bg} opacity-60`
    : !solid && tint
      ? `${MARKS[tint].bg} opacity-20`
      : !solid && style === 'shade'
        ? `${NEUTRAL.bg} opacity-50`
        : null;
  const weight = style === 'given' ? 'font-bold' : style === 'plain' ? 'font-medium text-ink-soft' : 'font-semibold';
  const tween = { transitionDuration: 'var(--tween, 300ms)' };
  return (
    <div className={`@container aspect-square min-w-0 ${board ? '' : 'p-[2px]'}`}>
      <div
        className={cx('relative flex h-full items-center justify-center overflow-hidden transition', board ? 'rounded-none ring-1 ring-line ring-inset' : CELL_RADIUS, face)}
        style={tween}
      >
        {wash &&
          (bar ? (
            <div className={`absolute inset-x-0 bottom-0 transition ${wash}`} style={{ ...tween, height: `${fill * 100}%` }} />
          ) : (
            <div className={`absolute inset-0 transition ${wash}`} style={tween} />
          ))}
        <span className={`relative font-mono leading-none tabular-nums ${weight} ${TEXT_BY_LENGTH[Math.min(text.length, 4)]}`}>{text}</span>
        {meta && (
          <span className={`absolute top-0.5 right-1 hidden text-[clamp(7px,22cqw,11px)] leading-none font-bold @min-[30px]:block ${solid ? '' : meta.text}`}>
            {meta.glyph}
          </span>
        )}
      </div>
    </div>
  );
}

function TimelineRow({ table, row, template }: { table: TablePart; row: Row; template: CSSProperties }) {
  const cols = table.cols.length;
  return (
    <div className="relative min-w-0 flex-1" style={{ aspectRatio: `${cols} / 1` }}>
      <div className="absolute inset-0 grid" style={template}>
        {table.cols.map((_, c) => (
          <div key={c} className={`border-l border-line-soft ${c === cols - 1 ? 'border-r' : ''}`} />
        ))}
      </div>
      {table.bars
        .filter((b) => b.row === row.id)
        .map((b) => {
          const meta = b.mark ? MARKS[b.mark] : null;
          return (
            <div
              key={b.id}
              className={`absolute top-[20%] bottom-[20%] rounded-full transition ${meta ? meta.bg : NEUTRAL.bg}`}
              style={{ left: `${(b.from / cols) * 100}%`, width: `${((b.to - b.from) / cols) * 100}%`, transitionDuration: 'var(--tween, 300ms)' }}
            />
          );
        })}
    </div>
  );
}

// ──────────────────────────── overlays ────────────────────────────

/** Arrows, box lines and timeline guides, in cell units: (c, r) is the top-left corner of cell (r, c). */
function Overlay({ table, index, left }: { table: TablePart; index: Map<string, number>; left: number }) {
  const reduce = useReducedMotion();
  const cols = table.cols.length;
  const rows = table.rows.length;
  if (rows === 0 || (table.arrows.length === 0 && table.guides.length === 0 && table.box == null)) return null;
  const boxLines =
    table.box == null
      ? []
      : [
          ...Array.from({ length: cols - 1 }, (_, i) => i + 1)
            .filter((x) => x % table.box! === 0)
            .map((x) => ({ x1: x, y1: 0, x2: x, y2: rows })),
          ...Array.from({ length: rows - 1 }, (_, i) => i + 1)
            .filter((y) => y % table.box! === 0)
            .map((y) => ({ x1: 0, y1: y, x2: cols, y2: y })),
        ];

  return (
    <svg
      className="pointer-events-none absolute top-0 h-full overflow-visible"
      style={{ left, width: `calc(100% - ${left}px)` }}
      viewBox={`0 0 ${cols} ${rows}`}
      preserveAspectRatio="none"
    >
      {table.box != null && (
        <g className="stroke-ink-muted" strokeWidth={0.05}>
          {boxLines.map((l, k) => (
            <line key={k} {...l} />
          ))}
          <rect x={0} y={0} width={cols} height={rows} fill="none" />
        </g>
      )}
      {table.guides.map((g, k) => (
        <line
          key={`guide-${k}`}
          x1={g.at}
          x2={g.at}
          y1={-0.1}
          y2={rows}
          strokeWidth={0.06}
          strokeDasharray="0.14 0.1"
          className={MARKS[g.mark].stroke}
        />
      ))}
      {table.arrows.map((a) => (
        <ArrowShape key={a.id} arrow={a} index={index} animate={!reduce} />
      ))}
    </svg>
  );
}

function ArrowShape({ arrow, index, animate }: { arrow: Arrow; index: Map<string, number>; animate: boolean }) {
  const from = { x: arrow.from.col + 0.5, y: index.get(arrow.from.row)! + 0.5 };
  const to = { x: arrow.to.col + 0.5, y: index.get(arrow.to.row)! + 0.5 };
  const g = arrowGeometry(from, to, arrow.bend);
  if (!g) return null;
  const style = MARKS[arrow.mark];
  return (
    <g>
      <motion.path
        d={g.d}
        fill="none"
        strokeWidth={0.07}
        strokeLinecap="round"
        className={`transition ${style.stroke}`}
        initial={animate ? { pathLength: 0 } : false}
        animate={{ pathLength: 1 }}
      />
      <motion.polygon
        points={g.head}
        className={`transition ${style.fill}`}
        initial={animate ? { opacity: 0 } : false}
        animate={{ opacity: 1 }}
      />
    </g>
  );
}

/** Pieces sit on top of the cells and slide when they move to another square. */
function Pieces({ table, index, left }: { table: TablePart; index: Map<string, number>; left: number }) {
  if (table.pieces.length === 0 || table.rows.length === 0) return null;
  const cols = table.cols.length;
  const rows = table.rows.length;
  return (
    <div className="pointer-events-none absolute top-0 right-0 bottom-0" style={{ left }}>
      {table.pieces.map((p) => {
        const meta = p.mark ? MARKS[p.mark] : null;
        return (
          <motion.div
            key={p.id}
            className="@container absolute flex items-center justify-center"
            style={{ width: `${100 / cols}%`, height: `${100 / rows}%` }}
            initial={false}
            animate={{ left: `${(p.at.col / cols) * 100}%`, top: `${(index.get(p.at.row)! / rows) * 100}%` }}
          >
            <span className={`text-[60cqw] leading-none transition ${meta ? meta.text : 'text-ink'}`}>{p.glyph}</span>
          </motion.div>
        );
      })}
    </div>
  );
}

// ───────────────────────── lists & meters ─────────────────────────

function ListView({ list }: { list: ListPart }) {
  return (
    <div role="group" aria-label={list.label}>
      <PartLabel>{list.label}</PartLabel>
      <p className="sr-only">{describeList(list)}</p>
      <ul className="flex min-h-8 flex-wrap items-center gap-1.5" aria-hidden>
        {list.items.length === 0 && <li className="text-sm text-ink-muted">{list.empty}</li>}
        {list.items.map((it) => {
          const meta = it.mark ? MARKS[it.mark] : null;
          return (
            <motion.li
              key={it.id}
              layout="position"
              initial={false}
              className={cx('flex items-center gap-1 rounded-[10px] px-2 py-0.5 transition', meta ? fillFor(it.mark) : PLAIN_CELL)}
            >
              {meta && <span className="text-[10px] font-bold">{meta.glyph}</span>}
              <span className="font-mono text-sm font-semibold whitespace-nowrap">{it.text}</span>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}

function MeterView({ meter }: { meter: MeterPart }) {
  const used = meter.segments.reduce((s, x) => s + x.amount, 0);
  return (
    <div role="group" aria-label={meter.label}>
      <div className="flex items-baseline justify-between gap-2">
        <PartLabel>{meter.label}</PartLabel>
        <span className="font-mono text-xs text-ink-soft tabular-nums">
          {formatAmount(used)} / {formatAmount(meter.total)} {meter.unit}
        </span>
      </div>
      <p className="sr-only">{describeMeter(meter)}</p>
      <div className="flex h-9 w-full gap-0.5 overflow-hidden rounded-[12px] bg-sunken p-0.5" aria-hidden>
        {meter.segments.map((s) => {
          return (
            <motion.div
              key={s.id}
              initial={false}
              animate={{ width: `${(s.amount / meter.total) * 100}%` }}
              className="@container h-full min-w-0 shrink-0"
            >
              <div className={cx('flex h-full items-center justify-center overflow-hidden rounded-[10px] transition', fillFor(s.mark))}>
                <span className="hidden truncate px-1 font-mono text-xs font-semibold @min-[24px]:block">{s.label}</span>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// ───────────────────────────── hooks ─────────────────────────────

/** Whether an element's content is wider than the element, kept current as either resizes. */
function useOverflow<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [overflowing, setOverflowing] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setOverflowing(el.scrollWidth > el.clientWidth + 1));
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => observer.disconnect();
  }, []);
  return [ref, overflowing] as const;
}
