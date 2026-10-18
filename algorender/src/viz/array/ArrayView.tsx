'use client';

import { LayoutGroup, motion } from 'motion/react';
import { useId, type CSSProperties } from 'react';
import { MARKS, NEUTRAL } from '@/viz/marks';
import { RANGE_TONES } from './marks';
import { useArraySelect, type ArraySelect } from './select';
import type { ArrayState, Counter, ItemId, Lane, Mark } from './types';

/** Widest a slot gets, so short arrays don't turn into slabs. */
const SLOT_MAX_PX = 72;
const COUNTER_MAX_PX = 52;

type Scale = { maxValue: number; digits: number; labelSize: string | null; barHeight: string };

/**
 * Renders array lanes as bars. Elements are keyed by identity and share a
 * layoutId, so a swap physically moves both bars and a move between lanes
 * (into a merge buffer, up to a "key" slot) flies the bar across. `compact`
 * (side-by-side races) drops value labels and counters and shortens the bars.
 * Inside an ArraySelectContext (a game), each bar is a button the learner can pick.
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
  const pointerLabels = new Map<number, string[]>();
  for (const p of state.pointers) {
    if (p.lane === lane.id) pointerLabels.set(p.index, [...(pointerLabels.get(p.index) ?? []), p.label]);
  }
  const description = lane.slots.map((id) => (id == null ? 'empty' : state.values[id])).join(', ');
  const select = useArraySelect();

  return (
    <div role="group" aria-label={lane.label}>
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">{lane.label}</div>
      <p className="sr-only">
        {lane.label}: {description}
      </p>

      <div className="relative" aria-hidden={select ? undefined : true}>
        <div className="pointer-events-none absolute inset-0 grid gap-1" style={grid}>
          {ranges.map((r, k) => (
            <div
              key={k}
              className={`rounded-md transition-colors ${RANGE_TONES[r.tone].tint}`}
              style={{ gridColumn: `${r.from + 1} / ${r.to + 2}`, gridRow: 1 }}
            />
          ))}
        </div>
        <div className={`relative grid gap-1 ${scale.barHeight}`} style={grid}>
          {lane.slots.map((id, index) =>
            id == null ? (
              <Hole key={`hole-${index}`} />
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

      <div className="mt-1 grid h-5 gap-1" style={grid} aria-hidden>
        {[...pointerLabels].map(([index, labels]) => (
          <motion.div
            key={labels.join(',')}
            layout="position"
            layoutId={`${lane.id}-ptr-${labels.join(',')}`}
            className="truncate text-center font-mono text-[11px] leading-5 font-semibold text-ink-soft"
            style={{ gridColumn: index + 1, gridRow: 1 }}
          >
            ▲{labels.join(',')}
          </motion.div>
        ))}
      </div>

      {ranges.some((r) => r.label) && (
        <div className="mt-0.5 grid gap-1" style={grid} aria-hidden>
          {ranges.map((r, k) => (
            <div
              key={k}
              className={`truncate border-t-2 pt-0.5 text-center text-[11px] ${RANGE_TONES[r.tone].bracket} ${RANGE_TONES[r.tone].text}`}
              style={{ gridColumn: `${r.from + 1} / ${r.to + 2}`, gridRow: 1 }}
            >
              {r.label}
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
        className={`flex h-full min-w-0 flex-col items-center rounded-md outline-offset-2 focus-visible:ring-2 focus-visible:ring-accent-strong disabled:cursor-default ${outline}`}
      >
        <span className={`h-4 shrink-0 text-[11px] leading-4 font-bold ${picked ? 'text-accent-ink' : (meta?.text ?? '')}`}>
          {picked ? '✓' : (meta?.glyph ?? '')}
        </span>
        <span className="relative block w-full min-h-0 flex-1">
          <span
            className={`absolute inset-x-0 bottom-0 block rounded-t-md ring-1 ring-black/10 ring-inset transition-colors ${meta ? meta.bg : NEUTRAL.bg}`}
            style={{ height: `${height}%`, transitionDuration: 'var(--tween, 300ms)' }}
          />
        </span>
        {scale.labelSize && <ValueLabel value={value} size={scale.labelSize} digits={scale.digits} digitPlace={digitPlace} />}
      </motion.button>
    );
  }
  return (
    <motion.div layout layoutId={id} className="flex h-full min-w-0 flex-col items-center" title={String(value)}>
      <span className={`h-4 shrink-0 text-[11px] leading-4 font-bold ${meta?.text ?? ''}`}>
        {meta?.glyph ?? ''}
      </span>
      <div className="relative w-full min-h-0 flex-1">
        <div
          className={`absolute inset-x-0 bottom-0 rounded-t-md ring-1 ring-black/10 ring-inset transition-colors ${meta ? meta.bg : NEUTRAL.bg}`}
          style={{ height: `${height}%`, transitionDuration: 'var(--tween, 300ms)' }}
        />
      </div>
      {scale.labelSize && <ValueLabel value={value} size={scale.labelSize} digits={scale.digits} digitPlace={digitPlace} />}
    </motion.div>
  );
}

function Hole() {
  return (
    <div className="flex h-full min-w-0 flex-col items-center">
      <span className="h-4 shrink-0" />
      <div className="flex w-full flex-1 items-end">
        <div className="h-3 w-full rounded-sm border border-dashed border-line-strong" />
      </div>
      <span className="h-5 shrink-0" />
    </div>
  );
}

function ValueLabel({ value, size, digits, digitPlace }: { value: number; size: string; digits: number; digitPlace: number | null }) {
  const base = `h-5 shrink-0 font-mono leading-5 tabular-nums ${size}`;
  if (digitPlace == null) return <span className={`${base} text-ink-soft`}>{value}</span>;

  // Radix sort: pad with faint zeros and underline the digit for this pass.
  const raw = String(value);
  const padded = raw.padStart(digits, '0');
  const focus = digits - 1 - Math.round(Math.log10(digitPlace));
  return (
    <span className={base}>
      {[...padded].map((ch, k) => (
        <span
          key={k}
          className={
            k === focus ? 'font-bold text-mark-compare underline' : k < digits - raw.length ? 'text-ink-muted' : 'text-ink-muted'
          }
        >
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
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">{counter.label}</div>
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
        {counter.values.map((v, i) => (
          <div
            key={i}
            className={`flex min-w-0 flex-col items-center rounded-md border py-1 transition-colors ${
              i === counter.highlight ? 'border-mark-compare bg-accent-soft ring-1 ring-mark-compare' : 'border-line bg-surface'
            }`}
            style={{ transitionDuration: 'var(--tween, 300ms)' }}
          >
            <span className="font-mono text-[10px] text-ink-muted">{counter.indexLabels[i]}</span>
            <span className="font-mono text-sm font-semibold tabular-nums text-ink">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
