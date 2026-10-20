'use client';

import { LayoutGroup } from 'motion/react';
import { Fragment, useId } from 'react';
import { useWidth } from '@/viz/linear/useWidth';
import { cx } from '@/components/ui/cx';
import { ValueBox } from '@/viz/linear/ValueBox';
import { MARKS } from '@/viz/marks';
import { CAPTION, fillFor, MarkBadge } from '@/viz/parts';
import { Calc } from './Calc';
import type { BucketTable, HashEntry, Holder, TableState } from './types';

/** Two columns of buckets when there are many and room for them. */
const TWO_COLUMNS_MIN_PX = 560;

const entryLabel = (e: HashEntry) => (e.value == null ? e.key : `${e.key}: ${e.value}`);

/**
 * A separate-chaining hash table: the hash computation for the key in hand,
 * the load factor, and the bucket array with each bucket's chain. Keys are
 * keyed by id, so a put flies the key into its bucket and a resize visibly
 * moves every key to its new bucket.
 * TODO(redesign): V5 puts chaining and linear probing on one toggle over the
 * same insert, and answers a Bloom test in a big plain-words card; each
 * visualiser shows only its own strategy.
 */
export function TableView({ state }: { state: TableState }) {
  const group = useId();
  const [ref, width] = useWidth<HTMLDivElement>();
  const [inHolder, outHolder] = [state.holders.find((h) => h.id === 'in'), state.holders.find((h) => h.id === 'out')];

  return (
    <LayoutGroup id={group}>
      <div ref={ref} className="w-full">
        <p className="sr-only">{describe(state)}</p>
        {/* Drawn once the width is known (before the first paint), so keys don't animate in from a provisional layout. */}
        {width > 0 && (
          <div aria-hidden className="flex flex-col gap-3">
            <Calc lines={state.calc} rule={`bucket = hash(key) mod m, with m = ${state.buckets}`} />
            <div className="flex items-end gap-3">
              <HolderSpot holder={inHolder} state={state} />
              <LoadMeter size={state.size} buckets={state.buckets} max={state.maxLoad} />
              <HolderSpot holder={outHolder} state={state} />
            </div>
            <div className={`grid gap-4 ${state.tables.length > 1 ? 'md:grid-cols-2' : ''}`}>
              {state.tables.map((t) => (
                <Buckets key={t.id} table={t} state={state} twoColumns={state.tables.length === 1 && t.buckets.length > 8 && width >= TWO_COLUMNS_MIN_PX} />
              ))}
            </div>
          </div>
        )}
      </div>
    </LayoutGroup>
  );
}

function HolderSpot({ holder, state }: { holder: Holder | undefined; state: TableState }) {
  return (
    <div className="flex h-[3.75rem] w-24 shrink-0 flex-col items-center justify-end gap-1">
      {holder?.item && (
        <>
          <span className={cx('max-w-full truncate', CAPTION)}>{holder.label}</span>
          <ValueBox id={holder.item} label={entryLabel(state.entries[holder.item])} mark={state.marks[holder.item]} className="h-9 min-w-10 px-1.5 text-xs" />
        </>
      )}
    </div>
  );
}

function LoadMeter({ size, buckets, max }: { size: number; buckets: number; max: number }) {
  const load = size / buckets;
  const over = load > max;
  return (
    <div className="mb-2 min-w-0 flex-1">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-xs">
        <span className="font-semibold text-ink">
          Load factor {load.toFixed(2)}
          {over ? ` > ${max}` : ''}
        </span>
        <span className="text-ink-muted">
          {size} {size === 1 ? 'key' : 'keys'} / {buckets} buckets
        </span>
      </div>
      <div className="relative mt-1.5 h-2.5 rounded-full bg-sunken">
        <div
          className={`h-full rounded-full transition-[width,background-color] ${over ? MARKS.reject.bg : 'bg-accent'}`}
          style={{ width: `${Math.min(1, load) * 100}%`, transitionDuration: 'var(--tween, 300ms)' }}
        />
        <div className="absolute -top-1 h-[18px] w-0.5 rounded bg-ink" style={{ left: `${max * 100}%` }} />
      </div>
      <p className="mt-1 text-[11px] text-ink-muted">Above {max} the next insert doubles the table.</p>
    </div>
  );
}

function Buckets({ table, state, twoColumns }: { table: BucketTable; state: TableState; twoColumns: boolean }) {
  const rows = Math.ceil(table.buckets.length / 2);
  return (
    <div role="group" aria-label={table.label} className="min-w-0">
      <div className={cx('mb-1.5', CAPTION)}>{table.label}</div>
      <ol
        className={`grid gap-x-4 gap-y-1 ${twoColumns ? 'grid-flow-col grid-cols-2' : 'grid-cols-1'}`}
        style={twoColumns ? { gridTemplateRows: `repeat(${rows}, auto)` } : undefined}
      >
        {table.buckets.map((chain, b) => (
          <li key={b} className="flex min-h-10 min-w-0 items-center gap-2">
            {/* Bucket numbers are ink squares; the bucket in play fills with its mark. */}
            <span
              className={cx(
                'relative grid size-8 shrink-0 place-items-center rounded-[10px] font-mono text-xs font-semibold transition-colors',
                state.bucketMarks[`${table.id}:${b}`] ? fillFor(state.bucketMarks[`${table.id}:${b}`]) : 'bg-primary text-on-primary',
              )}
            >
              {b}
              <MarkBadge mark={state.bucketMarks[`${table.id}:${b}`]} />
            </span>
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
              {chain.map((id, k) => (
                <Fragment key={id}>
                  {k > 0 && <span className="text-xs text-ink-muted">→</span>}
                  <ValueBox id={id} label={entryLabel(state.entries[id])} mark={state.marks[id]} className="h-8 min-w-9 px-1.5 text-xs" />
                </Fragment>
              ))}
              {chain.length === 0 && <span className="font-mono text-xs text-ink-muted">empty</span>}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function describe(state: TableState): string {
  const parts: string[] = [];
  if (state.calc.length) parts.push(`Hash: ${state.calc.join('; ')}.`);
  for (const h of state.holders) if (h.item) parts.push(`${h.label}: ${entryLabel(state.entries[h.item])}.`);
  parts.push(`Load factor ${state.size}/${state.buckets} = ${(state.size / state.buckets).toFixed(2)}.`);
  for (const t of state.tables) {
    const buckets = t.buckets.map((chain, b) => `bucket ${b}: ${chain.length ? chain.map((id) => entryLabel(state.entries[id])).join(' then ') : 'empty'}`);
    parts.push(`${t.label}. ${buckets.join('; ')}.`);
  }
  return parts.join(' ');
}
