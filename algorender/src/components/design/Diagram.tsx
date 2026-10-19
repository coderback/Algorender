'use client';

import { motion } from 'motion/react';
import { useEffect, useId, useRef, useState, type ComponentType, type RefObject } from 'react';
import { FiDatabase, FiFilter, FiLayers, FiServer, FiShuffle, FiUsers, FiZap } from 'react-icons/fi';
import { componentCost, KIND_INFO } from '@/systems/design';
import type { Component, ComponentKind, ComponentStats, Design, Ref } from '@/systems/design/types';
import { compact, configSummary, dollars, pct } from './format';
import { edgePath, layout, NODE, type Layout } from './layout';

export const KIND_ICON: Record<ComponentKind, ComponentType<{ className?: string; 'aria-hidden'?: boolean }>> = {
  clients: FiUsers,
  'rate-limiter': FiFilter,
  'load-balancer': FiShuffle,
  app: FiServer,
  cache: FiZap,
  database: FiDatabase,
  queue: FiLayers,
};

/** Utilisation at or above this reads as saturated: queues grow without bound near 100%. */
export const SATURATED = 0.9;
const MAX_BARS = 8;

const tone = (u: number) => (u >= SATURATED ? 'bg-bad-line' : u >= 0.7 ? 'bg-warn-line' : 'bg-good-line');

/**
 * The design as boxes and arrows, laid out in tiers (src/components/design/layout.ts):
 * left to right when it fits, otherwise top to bottom, and scrolling sideways
 * only when neither fits. Nodes are buttons that select a component for the
 * inspector. After a run each node carries its numbers.
 */
export function Diagram({
  design,
  selected,
  onSelect,
  stats,
  crashed,
  problems,
}: {
  design: Design;
  selected: Ref | null;
  onSelect: (id: Ref) => void;
  /** Per-component numbers from the last run, if any. */
  stats: Readonly<Record<Ref, ComponentStats>> | null;
  /** Instances crashed in the last run, per component. */
  crashed: Readonly<Record<Ref, readonly number[]>>;
  /** Components with a wiring or settings problem. */
  problems: ReadonlySet<Ref>;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const width = useWidth(boxRef);
  const horizontal = layout(design, 'horizontal');
  const vertical = layout(design, 'vertical');
  // Left to right when it fits; top to bottom when that fits instead; else left to right, scrolling.
  const l: Layout = width == null || horizontal.width <= width || vertical.width > width ? horizontal : vertical;
  const marker = useId().replace(/:/g, '');
  const byId = new Map(l.nodes.map((n) => [n.id, n]));
  const overflowing = width != null && l.width > width + 1;

  return (
    <div
      ref={boxRef}
      className="overflow-x-auto rounded-xl border border-line-soft bg-sunken"
      tabIndex={overflowing ? 0 : undefined}
      role={overflowing ? 'region' : undefined}
      aria-label={overflowing ? 'Design diagram (scrolls sideways)' : undefined}
    >
      <div className="relative mx-auto" style={{ width: l.width, height: l.height }}>
        <svg width={l.width} height={l.height} className="absolute inset-0" aria-hidden>
          <defs>
            <marker id={marker} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" className="fill-ink-muted" />
            </marker>
          </defs>
          {l.edges.map((e) => {
            const from = byId.get(e.from);
            const to = byId.get(e.to);
            if (!from || !to) return null;
            const { d, label } = edgePath(from, to, l.orientation);
            return (
              <g key={e.id}>
                <path d={d} fill="none" className="stroke-ink-muted" strokeWidth={1.5} markerEnd={`url(#${marker})`} />
                <text
                  x={label.x}
                  y={label.y}
                  dy="-0.4em"
                  textAnchor="middle"
                  className="fill-ink-soft stroke-sunken text-[11px]"
                  strokeWidth={4}
                  style={{ paintOrder: 'stroke' }}
                >
                  {e.label}
                </text>
              </g>
            );
          })}
        </svg>
        {design.components.map((c) => {
          const p = byId.get(c.id);
          if (!p) return null;
          return (
            <motion.div key={c.id} className="absolute" initial={false} animate={{ left: p.x, top: p.y }} style={{ width: NODE.w, height: NODE.h }}>
              <Node c={c} selected={selected === c.id} onSelect={onSelect} stats={stats?.[c.id] ?? null} crashed={crashed[c.id] ?? []} problem={problems.has(c.id)} />
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

function Node({
  c,
  selected,
  onSelect,
  stats,
  crashed,
  problem,
}: {
  c: Component;
  selected: boolean;
  onSelect: (id: Ref) => void;
  stats: ComponentStats | null;
  crashed: readonly number[];
  problem: boolean;
}) {
  const Icon = KIND_ICON[c.kind];
  const saturated = stats != null && hasWorkers(stats) && stats.utilisation >= SATURATED;
  const cost = componentCost(c);
  return (
    <button
      type="button"
      onClick={() => onSelect(c.id)}
      aria-pressed={selected}
      aria-label={nodeName(c, stats, crashed, problem)}
      className={`flex h-full w-full flex-col gap-1 overflow-hidden rounded-lg border bg-surface p-2 text-left shadow-xs transition hover:border-accent-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
        selected ? 'border-accent ring-2 ring-accent-line' : problem ? 'border-dashed border-bad-line' : saturated ? 'border-bad-line' : 'border-line'
      }`}
    >
      <span className="flex items-center gap-1.5">
        <Icon aria-hidden className="h-4 w-4 shrink-0 text-accent-ink" />
        <span className="truncate text-sm font-semibold text-ink">{c.label}</span>
        {cost > 0 && <span className="ml-auto shrink-0 text-[11px] text-ink-muted tabular-nums">{dollars(cost)}/mo</span>}
      </span>
      <span className="truncate text-xs text-ink-soft">{configSummary(c)}</span>
      {stats ? (
        <span className="mt-auto flex flex-col gap-1">
          <Bars perInstance={stats.perInstance} crashed={crashed} />
          <span className="flex flex-wrap gap-x-2 text-[11px] text-ink-soft tabular-nums">
            <span>{hasWorkers(stats) ? `busy ${pct(stats.utilisation)}` : `handled ${compact(stats.served)}`}</span>
            {stats.hitRate != null && <span>hits {pct(stats.hitRate)}</span>}
            {stats.backlog != null && stats.backlog > 0 && <span>backlog {stats.backlog}</span>}
            {stats.dropped > 0 && <span className="text-bad-ink">lost {stats.dropped}</span>}
          </span>
        </span>
      ) : (
        <span className="mt-auto text-[11px] text-ink-muted">{problem ? 'Needs wiring or a fix' : KIND_INFO[c.kind].name}</span>
      )}
      {(saturated || crashed.length > 0) && (
        <span className="sr-only">{saturated ? 'Saturated. ' : ''}{crashed.length > 0 ? 'An instance crashed.' : ''}</span>
      )}
    </button>
  );
}

/** One bar per instance (up to MAX_BARS), filled by how busy it was; a crashed instance is struck through. */
function Bars({ perInstance, crashed }: { perInstance: readonly number[]; crashed: readonly number[] }) {
  if (perInstance.length === 0) return null;
  const shown = perInstance.slice(0, MAX_BARS);
  return (
    <span className="flex items-end gap-0.5" aria-hidden>
      {shown.map((u, i) => (
        <span key={i} className={`relative h-3 flex-1 overflow-hidden rounded-sm bg-subtle ${crashed.includes(i) ? 'outline outline-1 outline-bad-line' : ''}`}>
          <span className={`absolute inset-x-0 bottom-0 ${tone(u)}`} style={{ height: `${Math.round(Math.min(1, u) * 100)}%` }} />
          {crashed.includes(i) && <span className="absolute inset-0 text-center text-[9px] leading-3 font-bold text-bad-ink">×</span>}
        </span>
      ))}
      {perInstance.length > MAX_BARS && <span className="text-[10px] text-ink-muted">+{perInstance.length - MAX_BARS}</span>}
    </span>
  );
}

/** Clients, load balancers and rate limiters pass requests on without workers, so they have no utilisation. */
export const hasWorkers = (s: ComponentStats) => s.perInstance.length > 0;

/** What a screen reader hears for a node. */
export function nodeName(c: Component, stats: ComponentStats | null, crashed: readonly number[], problem: boolean): string {
  const parts = [`${c.label}, ${KIND_INFO[c.kind].name}: ${configSummary(c)}`];
  if (problem) parts.push('needs wiring or a fix');
  if (stats) {
    parts.push(hasWorkers(stats) ? `busy ${pct(stats.utilisation)}` : `handled ${compact(stats.served)}`);
    if (hasWorkers(stats) && stats.utilisation >= SATURATED) parts.push('saturated');
    if (stats.hitRate != null) parts.push(`hit rate ${pct(stats.hitRate)}`);
    if (stats.backlog) parts.push(`backlog ${stats.backlog}`);
    if (stats.dropped > 0) parts.push(`${stats.dropped} lost`);
  }
  if (crashed.length > 0) parts.push(`${crashed.length === 1 ? 'one instance' : `${crashed.length} instances`} crashed`);
  return parts.join(', ');
}

function useWidth(ref: RefObject<HTMLDivElement | null>) {
  const [width, setWidth] = useState<number | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}
