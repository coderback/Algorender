'use client';

import { LayoutGroup, motion } from 'motion/react';
import { useId, type CSSProperties } from 'react';
import { cx } from '@/components/ui/cx';
import { MARKS, NEUTRAL, type MarkKey } from '@/viz/marks';
import { Bracket, CAPTION, EMPTY_SLOT, PLAIN_CELL, Pointer } from '@/viz/parts';
import { RANGE_TONES } from './marks';
import { useArraySelect, type ArraySelect } from './select';
import type { ArrayState, Counter, ItemId, Lane, Mark } from './types';

/** Widest a slot gets, so short arrays don't turn into slabs. */
const SLOT_MAX_PX = 72;
const COUNTER_MAX_PX = 52;

type Scale = { maxValue: number; digits: number; labelSize: string | null; barHeight: string; radius: string; gap: string; hole: string; emptyLane: string };

/**
 * Renders array lanes as bars. Elements are keyed by identity and share a
 * layoutId, so a swap physically moves both bars and a move between lanes
 * (into a merge buffer, up to a "key" slot) flies the bar across. `compact`
 * (side-by-side races) drops value labels and counters and shortens the bars.
 * Inside an ArraySelectContext (a game), each bar is a button the learner can pick.
 * TODO(redesign): V1 draws searches and patterns as 40px cells (position
 * matters, not size), with probe history and live readouts beside them; the
 * state has no hint saying which a module wants, so every array draws bars.
 */
export function ArrayView({ state, compact = false }: { state: ArrayState; compact?: boolean }) {
  const groupId = useId();
  const maxValue = Math.max(1, ...Object.values(state.values));
  const columns = Math.max(1, ...state.lanes.map((l) => l.slots.length));
  const scale: Scale = {
    maxValue,
    digits: String(maxValue).length,
    labelSize: compact ? null : columns <= 12 ? 'text-sm' : columns <= 24 ? 'text-xs' : null,
    barHeight: compact
      ? state.lanes.length === 1
        ? 'h-24'
        : 'h-14'
      : state.lanes.length === 1
        ? 'h-48 sm:h-60'
        : 'h-24 sm:h-28',
    // Round-topped bars (V1): 14px over 8px, tighter when there are many.
    radius: columns <= 24 && !compact ? 'rounded-t-[14px] rounded-b-[8px]' : 'rounded-t-[5px] rounded-b-[3px]',
    gap: columns <= 16 ? 'gap-1.5 sm:gap-2' : 'gap-1',
    // A race's small boards keep holes and empty lanes small too.
    hole: compact ? 'h-2.5' : 'h-10',
    emptyLane: compact ? 'h-6' : 'h-14',
  };

  return (
    // layoutIds are global unless namespaced: without an id, two views on one page
    // (e.g. a race) would animate elements with the same id into each other.
    <LayoutGroup id={groupId}>
      <div className="mx-auto flex w-full flex-col gap-4" style={{ maxWidth: columns * SLOT_MAX_PX }}>
        {state.lanes.map((lane) => (
          <LaneView key={lane.id} lane={lane} state={state} columns={columns} scale={scale} />
        ))}
      </div>
      {!compact && state.counters.length > 0 && (
        <div className="mt-5 flex flex-col gap-4">
          {state.counters.map((counter) => (
            <CounterView key={counter.id} counter={counter} />
          ))}
        </div>
      )}
    </LayoutGroup>
  );
}

function LaneView({ lane, state, columns, scale }: { lane: Lane; state: ArrayState; columns: number; scale: Scale }) {
  const grid: CSSProperties = { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` };
  const ranges = state.ranges.filter((r) => r.lane === lane.id);
  // Overlapping ranges (a window inside the best so far) each get their own row of brackets.
  const rows = rangeRows(ranges);
  const pointerLabels = new Map<number, string[]>();
  for (const p of state.pointers) {
    if (p.lane === lane.id) pointerLabels.set(p.index, [...(pointerLabels.get(p.index) ?? []), p.label]);
  }
  const description = lane.slots.map((id) => (id == null ? 'empty' : state.values[id])).join(', ');
  const select = useArraySelect();

  return (
    <div role="group" aria-label={lane.label}>
      <div className={cx('mb-1.5', CAPTION)}>{lane.label}</div>
      <p className="sr-only">
        {lane.label}: {description}
      </p>

      <div aria-hidden={select ? undefined : true}>
        {/* A lane with nothing in it yet (a buffer, the key's slot) is just its row of empty slots. */}
        <div className={cx('grid', scale.gap, lane.slots.some((id) => id != null) ? scale.barHeight : scale.emptyLane)} style={grid}>
          {lane.slots.map((id, index) =>
            id == null ? (
              <Hole key={`hole-${index}`} radius={scale.radius} height={scale.hole} />
            ) : (
              <Item
                key={id}
                id={id}
                index={index}
                value={state.values[id]}
                mark={state.marks[id]}
                scale={scale}
                digitPlace={state.digitPlace}
                select={select}
              />
            ),
          )}
        </div>
      </div>

      {pointerLabels.size > 0 && (
        <div className={cx('mt-1.5 grid h-[18px]', scale.gap)} style={grid} aria-hidden>
          {[...pointerLabels].map(([index, labels]) => (
            <motion.div
              key={labels.join(',')}
              layout="position"
              layoutId={`${lane.id}-ptr-${labels.join(',')}`}
              className="flex min-w-0 justify-center"
              style={{ gridColumn: index + 1, gridRow: 1 }}
            >
              <Pointer className="max-w-full truncate">{labels.join(',')}</Pointer>
            </motion.div>
          ))}
        </div>
      )}

      {ranges.length > 0 && (
        <div className={cx('mt-1.5 grid', scale.gap)} style={grid} aria-hidden>
          {ranges.map((r, k) => (
            <div key={k} className="min-w-0" style={{ gridColumn: `${r.from + 1} / ${r.to + 2}`, gridRow: rows[k] }}>
              <Bracket label={r.label} line={RANGE_TONES[r.tone].bracket} text={RANGE_TONES[r.tone].text} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Item({
  id,
  index,
  value,
  mark,
  scale,
  digitPlace,
  select,
}: {
  id: ItemId;
  index: number;
  value: number;
  mark: Mark | undefined;
  scale: Scale;
  digitPlace: number | null;
  select: ArraySelect | null;
}) {
  const meta = mark ? MARKS[mark] : null;
  const height = Math.max(4, (value / scale.maxValue) * 100);
  // With a label inside, a bar is never shorter than its number.
  const style: CSSProperties = { height: scale.labelSize ? `max(1.75rem, ${height}%)` : `${height}%`, transitionDuration: 'var(--tween, 300ms)' };
  const bar = (
    <span className="relative block w-full min-h-0 flex-1">
      <span className={cx('absolute inset-x-0 bottom-0 flex items-end justify-center pb-1.5 transition-colors', scale.radius, meta ? meta.bg : NEUTRAL.bg, inkOn(mark))} style={style}>
        {scale.labelSize && <ValueLabel value={value} size={scale.labelSize} digits={scale.digits} digitPlace={digitPlace} />}
      </span>
    </span>
  );
  if (select) {
    const picked = select.selected.has(id);
    const hinted = select.hint.has(id);
    const outline = picked
      ? 'outline-3 outline-solid outline-accent-strong'
      : hinted
        ? 'outline-2 outline-dashed outline-warn-ink'
        : 'outline-none hover:bg-accent-soft';
    return (
      <motion.button
        layout
        layoutId={id}
        type="button"
        aria-pressed={picked}
        aria-label={`${value}, position ${index + 1}${hinted ? ', the algorithm’s pick' : ''}`}
        disabled={select.disabled}
        onClick={() => select.toggle(id)}
        className={cx('flex h-full min-w-0 flex-col items-center rounded-[10px] outline-offset-2 focus-visible:ring-2 focus-visible:ring-accent-strong disabled:cursor-default', outline)}
      >
        <span className={cx('h-4 shrink-0 text-[11px] leading-4 font-bold', picked ? 'text-accent-ink' : meta?.text)}>{picked ? '✓' : (meta?.glyph ?? '')}</span>
        {bar}
      </motion.button>
    );
  }
  return (
    <motion.div layout layoutId={id} className="flex h-full min-w-0 flex-col items-center" title={String(value)}>
      <span className={cx('h-4 shrink-0 text-[11px] leading-4 font-bold', meta?.text)}>{meta?.glyph ?? ''}</span>
      {bar}
    </motion.div>
  );
}

/** Grid rows for ranges: each goes in the first row where it overlaps nothing already there. */
function rangeRows(ranges: readonly { from: number; to: number }[]): number[] {
  const placed: { from: number; to: number }[][] = [];
  return ranges.map((r) => {
    let row = placed.findIndex((taken) => taken.every((t) => r.to < t.from || r.from > t.to));
    if (row < 0) row = placed.push([]) - 1;
    placed[row].push(r);
    return row + 1;
  });
}

/** Text on a bar: white on compare, dark on every other mark, ink on the neutral bar. */
function inkOn(mark: MarkKey | undefined) {
  return mark === 'compare' ? 'text-white' : mark ? 'text-on-mark' : 'text-ink';
}

function Hole({ radius, height }: { radius: string; height: string }) {
  return (
    <div className="flex h-full min-w-0 flex-col items-center">
      <span className="h-4 shrink-0" />
      <div className="flex w-full flex-1 items-end">
        <div className={cx('w-full', height, EMPTY_SLOT, radius)} />
      </div>
    </div>
  );
}

function ValueLabel({ value, size, digits, digitPlace }: { value: number; size: string; digits: number; digitPlace: number | null }) {
  const base = `font-mono leading-none font-semibold tabular-nums ${size}`;
  if (digitPlace == null) return <span className={base}>{value}</span>;

  // Radix sort: pad with zeros and underline the digit for this pass.
  const padded = String(value).padStart(digits, '0');
  const focus = digits - 1 - Math.round(Math.log10(digitPlace));
  return (
    <span className={base}>
      {[...padded].map((ch, k) => (
        <span key={k} className={k === focus ? 'font-extrabold underline underline-offset-2' : 'font-normal'}>
          {ch}
        </span>
      ))}
    </span>
  );
}

function CounterView({ counter }: { counter: Counter }) {
  const n = counter.values.length;
  return (
    <div role="group" aria-label={counter.label} className="mx-auto w-full" style={{ maxWidth: n * COUNTER_MAX_PX }}>
      <div className={cx('mb-1.5', CAPTION)}>{counter.label}</div>
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
        {counter.values.map((v, i) => (
          <div key={i} className="flex min-w-0 flex-col items-center gap-1">
            <span
              className={cx(
                'flex h-10 w-full items-center justify-center rounded-[10px] font-mono text-sm font-semibold tabular-nums transition-colors',
                // The count being changed is "just written".
                i === counter.highlight ? `${MARKS.write.bg} text-on-mark` : PLAIN_CELL,
              )}
              style={{ transitionDuration: 'var(--tween, 300ms)' }}
            >
              {v}
            </span>
            <span className="font-mono text-[11px] text-ink-muted">{counter.indexLabels[i]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
