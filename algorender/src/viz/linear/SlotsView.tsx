'use client';

import { LayoutGroup, motion } from 'motion/react';
import { useId } from 'react';
import type { Holder, SlotRow, SlotsState } from './types';
import { useWidth } from './useWidth';
import { ValueBox } from './ValueBox';

const GAP_PX = 4;
/** Narrowest cell before a long row wraps onto a second line (ring rows never wrap: the wrap arrow needs one line). */
const MIN_CELL_PX = 30;
const MIN_RING_CELL_PX = 26;
const MAX_CELL_PX = 60;

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

  return (
    <LayoutGroup id={group}>
      <div ref={ref} className="w-full">
        <p className="sr-only">{describe(state)}</p>
        {/* Drawn once the width is known (before the first paint), so nothing animates in from a provisional layout. */}
        {width > 0 && (
          <div aria-hidden className="flex flex-col gap-2">
            <p className="text-center font-mono text-xs text-gray-600">{state.summary}</p>
            <Holders holders={state.holders} state={state} centered={stack} />
            {stack ? (
              <StackColumn row={state.rows[0]} state={state} />
            ) : (
              state.rows.map((row) => <RowView key={row.id} row={row} state={state} width={width} />)
            )}
          </div>
        )}
      </div>
    </LayoutGroup>
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
              <span className="max-w-full truncate font-mono text-[11px] text-gray-500">{h.label}</span>
              <div className="relative h-10 w-12 rounded-md border border-dashed border-gray-300">
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
    <section aria-label={row.label}>
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-500">{row.label}</div>
      <div className="mx-auto" style={{ maxWidth: cols * MAX_CELL_PX }}>
        <div className="grid gap-x-1 gap-y-1" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {row.slots.map((id, i) => (
            <div key={i} className="flex min-w-0 flex-col items-center gap-0.5">
              <span className="font-mono text-[10px] leading-3 text-gray-400">{i}</span>
              <Slot id={id} stale={row.stale?.[i] ?? null} state={state} className="h-10 w-full" />
              <div className="flex h-7 flex-col items-center">
                {(labels.get(i) ?? []).map((label) => (
                  <motion.span
                    key={label}
                    layout="position"
                    layoutId={`ptr-${row.id}-${label}`}
                    className="font-mono text-[10px] leading-3.5 font-semibold whitespace-nowrap text-gray-700"
                  >
                    ▲{label}
                  </motion.span>
                ))}
              </div>
            </div>
          ))}
        </div>
        {state.ring && <WrapArrow n={n} />}
      </div>
    </section>
  );
}

/** An empty cell outline, an old copy left behind (faded), and the element if one is here. */
function Slot({ id, stale, state, className }: { id: string | null; stale: number | null; state: SlotsState; className: string }) {
  return (
    <div className={`relative ${className}`}>
      <div className="absolute inset-0 rounded-md border border-dashed border-gray-300 bg-gray-50" />
      {id == null && stale != null && (
        <span className="absolute inset-0 grid place-items-center font-mono text-sm text-gray-300" title="old copy">
          {stale}
        </span>
      )}
      {id != null && <ValueBox id={id} label={state.values[id]} mark={state.marks[id]} className="absolute inset-0 text-sm" />}
    </div>
  );
}

/** The ring: an arrow from under the last slot back round to slot 0. */
function WrapArrow({ n }: { n: number }) {
  const inset = `calc(${50 / n}% - 1px)`;
  return (
    <div className="relative h-6" aria-hidden>
      <div className="absolute top-0 h-3.5 rounded-b-xl border-x-2 border-b-2 border-dashed border-gray-300" style={{ left: inset, right: inset }} />
      <span className="absolute -top-2 -translate-x-1/2 text-[10px] leading-none text-gray-400" style={{ left: `${50 / n}%` }}>
        ▲
      </span>
      <span className="absolute top-1.5 left-1/2 -translate-x-1/2 bg-white px-1.5 font-mono text-[10px] whitespace-nowrap text-gray-500">
        after slot {n - 1} comes slot 0
      </span>
    </div>
  );
}

function StackColumn({ row, state }: { row: SlotRow; state: SlotsState }) {
  const labels = pointerLabels(state, row);
  return (
    <section aria-label={row.label} className="mx-auto w-full max-w-64">
      <div className="mb-1 text-center text-[11px] font-semibold uppercase tracking-wider text-gray-500">{row.label}</div>
      <div className="flex flex-col-reverse gap-1">
        {row.slots.map((id, i) => (
          <div key={i} className="grid grid-cols-[1.25rem_minmax(0,1fr)_3.5rem] items-center gap-2">
            <span className="text-right font-mono text-[10px] text-gray-400">{i}</span>
            <Slot id={id} stale={null} state={state} className="h-9" />
            <div className="flex flex-col">
              {(labels.get(i) ?? []).map((label) => (
                <motion.span
                  key={label}
                  layout="position"
                  layoutId={`ptr-${row.id}-${label}`}
                  className="font-mono text-[11px] font-semibold whitespace-nowrap text-gray-700"
                >
                  ◀ {label}
                </motion.span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-[1.25rem_minmax(0,1fr)_3.5rem] gap-2">
        <span />
        <div className="h-1.5 rounded-full bg-gray-300" />
      </div>
      <div className="grid grid-cols-[1.25rem_minmax(0,1fr)_3.5rem] gap-2 text-center text-[10px] text-gray-400">
        <span />
        <span>bottom</span>
      </div>
    </section>
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
