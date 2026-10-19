import type { Design, Ref } from '@/systems/design/types';
import { edgesOf, type Edge } from './wiring';

// Where each component sits on the canvas. Components are placed in tiers by
// the longest chain of connections leading to them (clients first, the
// database last), in design order within a tier. Positions depend only on the
// wiring and the order of components, never on their settings, so nodes stay
// put while the learner tunes numbers.

export const NODE = { w: 184, h: 112 };
const GAP = { tier: 72, row: 28 };
const PAD = 12;

export type Placed = { id: Ref; tier: number; row: number; x: number; y: number };
export type Layout = {
  orientation: 'horizontal' | 'vertical';
  width: number;
  height: number;
  nodes: readonly Placed[];
  edges: readonly Edge[];
  /** Tier per component id. */
  tiers: Readonly<Record<Ref, number>>;
};

/** Tier of each component: 0 for anything nothing points at, else one more than the deepest component pointing at it. */
export function tiersOf(design: Design): Record<Ref, number> {
  const edges = edgesOf(design);
  const incoming = new Map<Ref, Ref[]>();
  for (const e of edges) incoming.set(e.to, [...(incoming.get(e.to) ?? []), e.from]);
  const tier: Record<Ref, number> = {};
  const visiting = new Set<Ref>();
  const depth = (id: Ref): number => {
    if (tier[id] != null) return tier[id];
    if (visiting.has(id)) return 0; // a cycle (validation reports it); break it here
    visiting.add(id);
    const from = incoming.get(id) ?? [];
    const d = from.length === 0 ? 0 : 1 + Math.max(...from.map(depth));
    visiting.delete(id);
    tier[id] = d;
    return d;
  };
  for (const c of design.components) depth(c.id);
  return tier;
}

export function layout(design: Design, orientation: 'horizontal' | 'vertical'): Layout {
  const tiers = tiersOf(design);
  const rows: Record<number, number> = {};
  const placed: Placed[] = design.components.map((c) => {
    const tier = tiers[c.id];
    const row = (rows[tier] = (rows[tier] ?? -1) + 1);
    return { id: c.id, tier, row, x: 0, y: 0 };
  });
  const tierCount = Math.max(0, ...placed.map((p) => p.tier)) + 1;
  const rowCount = Math.max(1, ...Object.values(rows).map((r) => r + 1));
  const horizontal = orientation === 'horizontal';
  // Centre each tier's nodes across the other axis.
  const span = (n: number, size: number, gap: number) => n * size + (n - 1) * gap;
  const cross = horizontal ? span(rowCount, NODE.h, GAP.row) : span(rowCount, NODE.w, GAP.row);
  for (const p of placed) {
    const inTier = (rows[p.tier] ?? 0) + 1;
    const offset = (cross - (horizontal ? span(inTier, NODE.h, GAP.row) : span(inTier, NODE.w, GAP.row))) / 2;
    if (horizontal) {
      p.x = PAD + p.tier * (NODE.w + GAP.tier);
      p.y = PAD + offset + p.row * (NODE.h + GAP.row);
    } else {
      p.x = PAD + offset + p.row * (NODE.w + GAP.row);
      p.y = PAD + p.tier * (NODE.h + GAP.tier);
    }
  }
  const along = span(tierCount, horizontal ? NODE.w : NODE.h, GAP.tier);
  return {
    orientation,
    width: 2 * PAD + (horizontal ? along : cross),
    height: 2 * PAD + (horizontal ? cross : along),
    nodes: placed,
    edges: edgesOf(design),
    tiers,
  };
}

/** The path of an edge between two placed nodes, leaving one side and entering the facing side, with its label's anchor. */
export function edgePath(from: Placed, to: Placed, orientation: 'horizontal' | 'vertical'): { d: string; label: { x: number; y: number } } {
  if (orientation === 'horizontal') {
    const forward = to.x > from.x;
    const x1 = forward ? from.x + NODE.w : from.x;
    const x2 = forward ? to.x : to.x + NODE.w;
    const y1 = from.y + NODE.h / 2;
    const y2 = to.y + NODE.h / 2;
    const mx = (x1 + x2) / 2;
    return { d: `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`, label: { x: mx, y: (y1 + y2) / 2 } };
  }
  const forward = to.y > from.y;
  const y1 = forward ? from.y + NODE.h : from.y;
  const y2 = forward ? to.y : to.y + NODE.h;
  const x1 = from.x + NODE.w / 2;
  const x2 = to.x + NODE.w / 2;
  const my = (y1 + y2) / 2;
  return { d: `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`, label: { x: (x1 + x2) / 2, y: my } };
}
