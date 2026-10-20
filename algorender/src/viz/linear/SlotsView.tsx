'use client';

import { LayoutGroup, motion } from 'motion/react';
import { useId, useState, type CSSProperties } from 'react';
import { Segmented } from '@/components/ui/Segmented';
import { cx } from '@/components/ui/cx';
import { MARKS } from '@/viz/marks';
import { CAPTION, EMPTY_SLOT, Pointer, STAGE_CAPTION } from '@/viz/parts';
import type { Holder, SlotRow, SlotsState } from './types';
import { useWidth } from './useWidth';
import { ValueBox } from './ValueBox';

const GAP_PX = 4;
/** Narrowest cell before a long row wraps onto a second line (ring rows never wrap: the wrap arrow needs one line). */
const MIN_CELL_PX = 30;
const MIN_RING_CELL_PX = 26;
const MAX_CELL_PX = 60;
const TWEEN: CSSProperties = { transitionDuration: 'var(--tween, 300ms)' };

/**
 * Array-backed structures: rows of memory cells with their indices, the
 * pointers into them (head, tail, top, i…) and holders where values wait to go
 * in or land when they come out. Elements are keyed by id, so a shift, a push
 * or a copy into a bigger block is real movement.
 */
export function SlotsView({ state }: { state: SlotsState }) {
  const group = useId();
  const [ref, width] = useWidth<HTMLDivElement>();
  const stack = state.layout === 'stack';
  // A ring buffer is drawn as the ring it is (V2), or unrolled into a line with a wrap arrow.
  const [shape, setShape] = useState<'ring' | 'line'>('ring');
  const ring = state.ring && shape === 'ring';

  return (
    <LayoutGroup id={group}>
      <div ref={ref} className="w-full">
        <p className="sr-only">{describe(state)}</p>
        {/* Drawn once the width is known (before the first paint), so nothing animates in from a provisional layout. */}
        {width > 0 && (
          <div className="flex flex-col gap-3">
            <div className="flex min-h-8 flex-wrap items-center justify-between gap-2">
              <p aria-hidden className={STAGE_CAPTION}>
                {state.summary}
              </p>
              {state.ring && (
                <Segmented
                  label="Draw the slots as"
                  value={shape}
                  onChange={setShape}
                  options={[
                    { value: 'ring', label: 'Ring' },
                    { value: 'line', label: 'Line' },
                  ]}
                />
              )}
            </div>
            <div aria-hidden className="flex flex-col gap-3">
              <Holders holders={state.holders} state={state} centered={stack || ring} />
              {stack ? (
                <StackColumn row={state.rows[0]} state={state} />
              ) : ring ? (
                <RingView row={state.rows[0]} state={state} width={width} />
              ) : (
                state.rows.map((row) => <RowView key={row.id} row={row} state={state} width={width} />)
              )}
            </div>
          </div>
        )}
      </div>
    </LayoutGroup>
  );
}

/** The ring's drawing box at full size; a narrower stage scales the whole drawing down. */
const RING_BOX = { w: 440, h: 380 } as const;
const RING_R = 110;
const RING_THICK = 44;
const CENTRE: [number, number] = [RING_BOX.w / 2, RING_BOX.h / 2];

/** Where slot boundary `k` of `n` points (slot 0 starts at the top; the slots run clockwise). */
const angle = (k: number, n: number) => (k / n) * 2 * Math.PI - Math.PI / 2;
const polar = (a: number, r: number): [number, number] => [CENTRE[0] + r * Math.cos(a), CENTRE[1] + r * Math.sin(a)];
/** The middle of slot `i`, `r` from the centre, as a position inside the drawing box. */
const onRing = (i: number, n: number, r: number): CSSProperties => {
  const [x, y] = polar(angle(i + 0.5, n), r);
  return { left: `${(x / RING_BOX.w) * 100}%`, top: `${(y / RING_BOX.h) * 100}%` };
};

/**
 * A ring buffer as a donut of slots: each slot a segment (empty, holding a
 * value, or marked), its index outside, the pointers (head, tail) further out,
 * and how many slots are in use in the middle. Wrapping round is just the next
 * segment.
 */
function RingView({ row, state, width }: { row: SlotRow; state: SlotsState; width: number }) {
  const n = row.slots.length;
  const used = row.slots.filter((id) => id != null).length;
  const labels = pointerLabels(state, row);
  const small = width < 360;
  const arc = (i: number) => {
    const [x0, y0] = polar(angle(i, n), RING_R);
    const [x1, y1] = polar(angle(i + 1, n), RING_R);
    return `M ${x0} ${y0} A ${RING_R} ${RING_R} 0 0 1 ${x1} ${y1}`;
  };

  return (
    <div role="group" aria-label={row.label}>
      <div className={cx('mb-1.5', CAPTION)}>{row.label}</div>
      <div className="relative mx-auto w-full" style={{ maxWidth: RING_BOX.w, aspectRatio: `${RING_BOX.w} / ${RING_BOX.h}` }}>
        <svg viewBox={`0 0 ${RING_BOX.w} ${RING_BOX.h}`} className="absolute inset-0 size-full" aria-hidden>
          {row.slots.map((id, i) => {
            const mark = id != null ? state.marks[id] : undefined;
            return (
              <path
                key={i}
                d={arc(i)}
                fill="none"
                strokeWidth={RING_THICK}
                className={cx('transition-colors', mark ? MARKS[mark].stroke : id != null ? 'stroke-bar' : 'stroke-line-soft')}
                style={TWEEN}
              />
            );
          })}
          {/* Gaps between the slots, in the well's colour. */}
          {row.slots.map((_, i) => {
            const [x0, y0] = polar(angle(i, n), RING_R - RING_THICK / 2 - 2);
            const [x1, y1] = polar(angle(i, n), RING_R + RING_THICK / 2 + 2);
            return <line key={i} x1={x0} y1={y0} x2={x1} y2={y1} strokeWidth={4} className="stroke-subtle" />;
          })}
        </svg>
        {row.slots.map((id, i) => {
          const mark = id != null ? state.marks[id] : undefined;
          return (
            <div key={i}>
              <span
                className="absolute -translate-x-1/2 -translate-y-1/2 font-mono text-[11px] leading-none text-ink-muted"
                style={onRing(i, n, RING_R + RING_THICK / 2 + 12)}
              >
                {i}
              </span>
              {id != null && (
                // The value sits on its slot; it shares its id with the holders, so it glides in and out of them.
                <motion.span
                  layout="position"
                  layoutId={id}
                  className={cx(
                    'absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-0.5 font-mono font-semibold tabular-nums',
                    small ? 'text-xs' : 'text-sm',
                    mark === 'compare' ? 'text-white' : mark ? 'text-on-mark' : 'text-ink',
                  )}
                  style={onRing(i, n, RING_R)}
                >
                  {state.values[id]}
                  {mark && <span className="text-[9px]">{MARKS[mark].glyph}</span>}
                </motion.span>
              )}
            </div>
          );
        })}
        {[...labels].map(([i, names]) => (
          <motion.div
            key={names.join(',')}
            layout="position"
            layoutId={`ptr-${row.id}-${names.join(',')}`}
            className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5"
            style={onRing(i, n, RING_R + RING_THICK / 2 + 34)}
          >
            {names.map((name) => (
              <Pointer key={name}>{name}</Pointer>
            ))}
          </motion.div>
        ))}
        <div className="absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center leading-tight">
          <span className={cx('font-display font-bold text-ink tabular-nums', small ? 'text-lg' : 'text-2xl')}>
            {used}/{n}
          </span>
          <span className="text-[11px] text-ink-muted">slots used</span>
        </div>
      </div>
    </div>
  );
}

function Holders({ holders, state, centered }: { holders: readonly Holder[]; state: SlotsState; centered: boolean }) {
  if (holders.length === 0) return null;
  return (
    <div className={`flex min-h-[3.75rem] items-end gap-6 ${centered ? 'justify-center' : 'justify-between'}`}>
      {holders.map((h) => (
        <div key={h.id} className="flex w-24 flex-col items-center gap-1">
          {h.item && (
            <>
              <span className={cx('max-w-full truncate', CAPTION)}>{h.label}</span>
              <div className={cx('relative h-12 w-14', EMPTY_SLOT)}>
                <ValueBox id={h.item} label={state.values[h.item]} mark={state.marks[h.item]} className="absolute inset-0" />
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

function pointerLabels(state: SlotsState, row: SlotRow): Map<number, string[]> {
  const labels = new Map<number, string[]>();
  for (const p of state.pointers) if (p.row === row.id) labels.set(p.index, [...(labels.get(p.index) ?? []), p.label]);
  return labels;
}

function RowView({ row, state, width }: { row: SlotRow; state: SlotsState; width: number }) {
  const n = row.slots.length;
  const minCell = state.ring ? MIN_RING_CELL_PX : MIN_CELL_PX;
  const fit = Math.max(4, Math.floor((width + GAP_PX) / (minCell + GAP_PX)));
  // Wrap long rows into balanced lines (16 cells → 2 × 8) rather than a ragged last line.
  const cols = state.ring || n <= fit ? n : Math.ceil(n / Math.ceil(n / fit));
  const labels = pointerLabels(state, row);

  return (
    <div role="group" aria-label={row.label}>
      <div className={cx('mb-1.5', CAPTION)}>{row.label}</div>
      <div className="mx-auto" style={{ maxWidth: cols * MAX_CELL_PX }}>
        <div className="grid gap-x-1.5 gap-y-1.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {row.slots.map((id, i) => (
            <div key={i} className="flex min-w-0 flex-col items-center gap-0.5">
              <span className="font-mono text-[11px] leading-3 text-ink-muted">{i}</span>
              <Slot id={id} stale={row.stale?.[i] ?? null} state={state} className="h-12 w-full" />
              <div className="flex min-h-7 flex-col items-center gap-0.5 pt-0.5">
                {(labels.get(i) ?? []).map((label) => (
                  <motion.span key={label} layout="position" layoutId={`ptr-${row.id}-${label}`}>
                    <Pointer>{label}</Pointer>
                  </motion.span>
                ))}
              </div>
            </div>
          ))}
        </div>
        {state.ring && <WrapArrow n={n} />}
      </div>
    </div>
  );
}

/** An empty cell outline, an old copy left behind (faded), and the element if one is here. */
function Slot({ id, stale, state, className }: { id: string | null; stale: number | null; state: SlotsState; className: string }) {
  return (
    <div className={`relative ${className}`}>
      <div className={cx('absolute inset-0', EMPTY_SLOT)} />
      {id == null && stale != null && (
        <span className="absolute inset-0 grid place-items-center font-mono text-sm text-ink-muted" title="old copy">
          {stale}
        </span>
      )}
      {id != null && <ValueBox id={id} label={state.values[id]} mark={state.marks[id]} className="absolute inset-0 text-sm" />}
    </div>
  );
}

/** The ring unrolled into a line: an arrow from under the last slot back round to slot 0. */
function WrapArrow({ n }: { n: number }) {
  const inset = `calc(${50 / n}% - 1px)`;
  return (
    <div className="relative h-6" aria-hidden>
      <div className="absolute top-0 h-3.5 rounded-b-xl border-x-2 border-b-2 border-dashed border-edge" style={{ left: inset, right: inset }} />
      <span className="absolute -top-2 -translate-x-1/2 text-[10px] leading-none text-ink-muted" style={{ left: `${50 / n}%` }}>
        ▲
      </span>
      <span className="absolute top-1.5 left-1/2 -translate-x-1/2 bg-subtle px-1.5 text-[11px] whitespace-nowrap text-ink-muted">
        after slot {n - 1} comes slot 0
      </span>
    </div>
  );
}

function StackColumn({ row, state }: { row: SlotRow; state: SlotsState }) {
  const labels = pointerLabels(state, row);
  return (
    <div role="group" aria-label={row.label} className="mx-auto w-full max-w-72">
      <div className={cx('mb-1.5 text-center', CAPTION)}>{row.label}</div>
      {/* The stack's tube: open at the top, closed at the bottom. */}
      <div className="flex flex-col-reverse">
        {row.slots.map((id, i) => (
          <div key={i} className="grid grid-cols-[1.25rem_minmax(0,1fr)_4rem] items-center gap-2">
            <span className="text-right font-mono text-[11px] text-ink-muted">{i}</span>
            <div className={cx('border-x-2 border-edge px-1.5 py-[3px]', i === 0 && 'rounded-b-[22px] border-b-2 pb-1.5')}>
              <Slot id={id} stale={null} state={state} className="h-10" />
            </div>
            <div className="flex flex-col items-start gap-0.5">
              {(labels.get(i) ?? []).map((label) => (
                <motion.span key={label} layout="position" layoutId={`ptr-${row.id}-${label}`}>
                  <Pointer>← {label}</Pointer>
                </motion.span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function describe(state: SlotsState): string {
  const parts = [state.summary + '.'];
  for (const row of state.rows) {
    const labels = pointerLabels(state, row);
    const cells = row.slots.map((id, i) => {
      const ptr = labels.get(i);
      return `${i}: ${id == null ? 'empty' : state.values[id]}${ptr ? ` (${ptr.join(', ')})` : ''}`;
    });
    parts.push(`${row.label}. ${cells.join('; ')}.`);
  }
  for (const h of state.holders) if (h.item) parts.push(`${h.label}: ${state.values[h.item]}.`);
  return parts.join(' ');
}
