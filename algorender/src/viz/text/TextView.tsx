'use client';

import { LayoutGroup, motion } from 'motion/react';
import { useId, type CSSProperties } from 'react';
import { RANGE_TONES } from '@/viz/array/marks';
import { MARKS, type MarkKey } from '@/viz/marks';
import { EMPTY_SLOT, fillFor, PLAIN_CELL, Pointer, RULED_OUT } from '@/viz/parts';
import type { TextCell, TextRow, TextState } from './types';

/** Widest a column gets, so short strings don't turn into slabs. */
const CELL_MAX_PX = 44;

type Sizes = { char: string; number: string; small: string };

/**
 * Renders strings as rows of character cells on one column grid, with tables
 * (LPS, Z, P) as number rows aligned under them. A pattern row slides to its
 * current shift: cells are keyed by id and animate their position, so the
 * learner sees the pattern move rather than be redrawn.
 */
// TODO(redesign): V7 draws the skip itself (KMP's dashed slide arrow, Rabin–Karp's window history, Manacher's
// mirror bars) and counts comparisons against the naive way; the state doesn't carry these yet.
export function TextView({ state }: { state: TextState }) {
  const groupId = useId();
  const cols = Math.max(1, state.columns);
  const grid: CSSProperties = { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` };
  // Type scales with the column width (container query units), so 32 columns still fit a phone.
  const sizes: Sizes = {
    char: `clamp(9px, ${(55 / cols).toFixed(2)}cqw, 20px)`,
    number: `clamp(8px, ${(42 / cols).toFixed(2)}cqw, 15px)`,
    small: `clamp(7px, ${(34 / cols).toFixed(2)}cqw, 11px)`,
  };
  const gap = cols > 20 ? 'gap-x-px' : 'gap-x-1';

  return (
    <LayoutGroup id={groupId}>
      <div className="mx-auto w-full" style={{ maxWidth: cols * CELL_MAX_PX, containerType: 'inline-size' }}>
        <p className="sr-only">{describe(state)}</p>
        <div className="flex flex-col gap-2.5" aria-hidden>
          {state.readouts.length > 0 && <Readouts state={state} />}
          {state.rows.map((row) => (
            <RowView key={row.id} row={row} state={state} cols={cols} grid={grid} gap={gap} sizes={sizes} />
          ))}
          <Results results={state.results} />
        </div>
      </div>
    </LayoutGroup>
  );
}

function RowView({
  row,
  state,
  cols,
  grid,
  gap,
  sizes,
}: {
  row: TextRow;
  state: TextState;
  cols: number;
  grid: CSSProperties;
  gap: string;
  sizes: Sizes;
}) {
  const ranges = state.ranges.filter((r) => r.row === row.id);
  const pointerLabels = new Map<number, string[]>();
  for (const p of state.pointers) {
    if (p.row === row.id) pointerLabels.set(p.index, [...(pointerLabels.get(p.index) ?? []), p.label]);
  }
  const span = (from: number, to: number) => `${row.offset + from + 1} / ${Math.min(cols, row.offset + to + 1) + 1}`;

  return (
    <div>
      <div className="mb-1 truncate text-xs font-medium text-ink-muted">{row.label}</div>
      <div className="relative">
        <div className={`pointer-events-none absolute inset-0 grid ${gap}`} style={grid}>
          {ranges.map((r, k) => (
            <motion.div
              key={`${r.tone}:${r.label ?? k}`}
              layout
              initial={false}
              className={`-mx-0.5 rounded-[10px] ${RANGE_TONES[r.tone].tint}`}
              style={{ gridColumn: span(r.from, r.to), gridRow: 1 }}
            />
          ))}
        </div>
        <div className={`relative grid ${gap}`} style={grid}>
          {row.cells.map((cell, k) =>
            row.offset + k >= cols ? null : (
              <Cell key={cell.id} cell={cell} index={k} column={row.offset + k} kind={row.kind} mark={state.marks[cell.id]} sizes={sizes} />
            ),
          )}
        </div>
      </div>

      {row.pointers && (
        <div className={`mt-1 grid h-[18px] ${gap}`} style={grid}>
          {[...pointerLabels].map(([index, labels]) =>
            row.offset + index >= cols ? null : (
              <motion.div
                key={labels.join(',')}
                layout="position"
                initial={false}
                className="justify-self-center"
                style={{ gridColumn: row.offset + index + 1, gridRow: 1 }}
              >
                <Pointer>{labels.join(',')}</Pointer>
              </motion.div>
            ),
          )}
        </div>
      )}

      {row.rangeLabels && (
        <div className={`mt-1 grid h-5 ${gap}`} style={grid}>
          {ranges
            .filter((r) => r.label)
            .map((r) => (
              <motion.div
                key={`${r.tone}:${r.label}`}
                layout
                initial={false}
                className={`truncate rounded-full text-center text-[11px] leading-5 font-semibold ${RANGE_TONES[r.tone].tint} ${RANGE_TONES[r.tone].text}`}
                style={{ gridColumn: span(r.from, r.to), gridRow: 1 }}
              >
                {r.label}
              </motion.div>
            ))}
        </div>
      )}
    </div>
  );
}

function Cell({
  cell,
  index,
  column,
  kind,
  mark,
  sizes,
}: {
  cell: TextCell;
  index: number;
  column: number;
  kind: TextRow['kind'];
  mark: MarkKey | undefined;
  sizes: Sizes;
}) {
  const meta = mark ? MARKS[mark] : null;
  const box = meta ? fillFor(mark) : kind === 'chars' && cell.faint ? RULED_OUT : kind !== 'chars' && cell.text === '' ? EMPTY_SLOT : PLAIN_CELL;

  return (
    <motion.div
      layout="position"
      initial={false}
      className="flex min-w-0 flex-col items-center"
      style={{ gridColumn: column + 1, gridRow: 1 }}
    >
      <span className={`h-3.5 shrink-0 text-[10px] leading-3.5 font-bold ${meta?.text ?? ''}`}>{meta?.glyph ?? ''}</span>
      <div
        className={`flex aspect-square w-full items-center justify-center rounded-[8px] font-mono leading-none tabular-nums transition-colors ${
          kind === 'chars' ? 'font-semibold' : ''
        } ${box}`}
        style={{ fontSize: kind === 'chars' ? sizes.char : sizes.number, transitionDuration: 'var(--tween, 300ms)' }}
      >
        {cell.text}
      </div>
      {kind === 'chars' && (
        <span className="mt-0.5 font-mono leading-none text-ink-muted tabular-nums" style={{ fontSize: sizes.small }}>
          {index}
        </span>
      )}
    </motion.div>
  );
}

function Readouts({ state }: { state: TextState }) {
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {state.readouts.map((r) => {
        const meta = r.mark ? MARKS[r.mark] : null;
        return (
          <div
            key={r.id}
            className={`inline-flex items-center gap-1.5 rounded-[10px] px-2.5 py-1 text-xs transition-colors ${meta ? fillFor(r.mark) : PLAIN_CELL}`}
            style={{ transitionDuration: 'var(--tween, 300ms)' }}
          >
            {meta && <span className="font-bold">{meta.glyph}</span>}
            <span>{r.label}</span>
            <span className="font-mono font-semibold tabular-nums">{r.value}</span>
          </div>
        );
      })}
    </div>
  );
}

function Results({ results }: { results: TextState['results'] }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className="text-xs font-medium text-ink-muted">{results.label}</span>
      {results.items.length === 0 ? (
        <span className="text-ink-muted">{results.empty}</span>
      ) : (
        results.items.map((item, k) => (
          <span key={k} className={`rounded-[10px] px-2 py-0.5 font-mono font-semibold text-on-mark ${MARKS.found.bg}`}>
            {MARKS.found.glyph} {item}
          </span>
        ))
      )}
    </div>
  );
}

/** Plain-text version of the frame for screen readers. */
function describe(state: TextState): string {
  const rowLabel = new Map(state.rows.map((r) => [r.id, r.label]));
  const parts: string[] = [];
  for (const r of state.readouts) parts.push(`${r.label}: ${r.value}.`);
  for (const row of state.rows) {
    const cells = row.cells.map((c) => (c.text === '' ? 'blank' : c.text)).join(row.kind === 'chars' ? ' ' : ', ');
    parts.push(`${row.label}${row.offset ? `, starting at column ${row.offset}` : ''}: ${cells}.`);
  }
  const byMark = new Map<MarkKey, string[]>();
  for (const row of state.rows) {
    row.cells.forEach((cell, k) => {
      const mark = state.marks[cell.id];
      if (mark) byMark.set(mark, [...(byMark.get(mark) ?? []), `${row.label} ${k}`]);
    });
  }
  for (const [mark, cells] of byMark) parts.push(`${MARKS[mark].label}: ${cells.join(', ')}.`);
  if (state.pointers.length > 0) {
    parts.push(`Pointers: ${state.pointers.map((p) => `${p.label} at ${rowLabel.get(p.row)} ${p.index}`).join(', ')}.`);
  }
  for (const r of state.ranges) if (r.label) parts.push(`${r.label}: ${rowLabel.get(r.row)} ${r.from} to ${r.to}.`);
  const { label, items, empty } = state.results;
  parts.push(`${label}: ${items.length ? items.join(', ') : empty}.`);
  return parts.join(' ');
}
