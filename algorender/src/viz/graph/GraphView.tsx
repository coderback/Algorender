'use client';

import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { useId, type CSSProperties } from 'react';
import { MARKS } from '@/viz/marks';
import { EDGE_ACTIVE, EDGE_IDLE, NODE_IDLE_SVG, NODE_RING } from '@/viz/parts';
import { GraphPanels, svgOnMark } from './GraphPanels';
import { edgeGeometry, NODE_R, placeLabels, type Geometry } from './layout';
import { hullPath, REGION_PAD, regionShape } from './regions';
import type { GraphEdge, GraphNode, GraphState, Mark, Region, RegionTone } from './types';

/** Space around the nodes for badges above and annotations below. */
const PAD_X = NODE_R + 18;
const PAD_TOP = NODE_R + 14;
const PAD_BOTTOM = NODE_R + 24;
const MIN_WIDTH = 240;
/** Largest on-screen scale, so a small graph doesn't balloon on a wide screen. */
const MAX_SCALE = 1.6;

const TWEEN: CSSProperties = { transitionDuration: 'var(--tween, 300ms)' };

/**
 * Draws a graph as SVG with fixed node positions, scaled to the available
 * width, plus the side panels the algorithm keeps in its state (queue, table,
 * matrix…). Marks change colour by CSS transition; a relaxed edge pulses once.
 */
export function GraphView({ state }: { state: GraphState }) {
  const groupId = useId();
  const byId = new Map(state.nodes.map((n) => [n.id, n]));

  let minX = Math.min(...state.nodes.map((n) => n.x));
  let maxX = Math.max(...state.nodes.map((n) => n.x));
  const minY = Math.min(...state.nodes.map((n) => n.y));
  const maxY = Math.max(...state.nodes.map((n) => n.y));
  if (maxX - minX + 2 * PAD_X < MIN_WIDTH) {
    const grow = (MIN_WIDTH - (maxX - minX + 2 * PAD_X)) / 2;
    minX -= grow;
    maxX += grow;
  }
  // A region's name sits under its lowest node's annotation, so leave room for it.
  const padBottom = state.regions?.length ? PAD_BOTTOM + 16 : PAD_BOTTOM;
  const vb = { x: minX - PAD_X, y: minY - PAD_TOP, w: maxX - minX + 2 * PAD_X, h: maxY - minY + PAD_TOP + padBottom };

  const edgeSet = new Set(state.edges.map((e) => `${e.from}>${e.to}`));
  const geometry = new Map(
    state.edges.flatMap((e) => {
      const a = byId.get(e.from);
      const b = byId.get(e.to);
      if (!a || !b) return [];
      const twoWay = state.directed && edgeSet.has(`${e.to}>${e.from}`);
      return [[e.id, edgeGeometry(a, b, state.directed, twoWay)] as const];
    }),
  );
  const labels = placeLabels(state.nodes, state.edges, state.directed);
  const pulseEdge = state.pulse ? state.edges.find((e) => e.id === state.pulse!.edge) : undefined;
  const pulseGeo = pulseEdge ? geometry.get(pulseEdge.id) : undefined;

  return (
    <LayoutGroup id={groupId}>
      <div className="@container">
      <div className={`grid grid-cols-1 gap-4 ${state.panels.length > 0 ? '@3xl:grid-cols-[minmax(0,1fr)_16rem] @3xl:items-start' : ''}`}>
        <p className="sr-only">{describe(state)}</p>
        {state.nodes.length === 0 ? (
          <p className="py-10 text-center text-sm text-ink-muted">The graph is empty. Add a vertex to start.</p>
        ) : (
          <div aria-hidden>
            {state.annotationLabel && (
              <p className="mb-1 text-xs text-ink-muted">
                Under each node: <span className="font-mono font-semibold text-ink-soft">{state.annotationLabel}</span>
              </p>
            )}
            <svg
              viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
              // Curved edges' weight pills can reach past the nodes' box; the stage well has room for them.
              className="mx-auto block h-auto w-full overflow-visible"
              style={{ maxWidth: vb.w * MAX_SCALE, aspectRatio: `${vb.w} / ${vb.h}` }}
            >
              {state.regions && <Regions regions={state.regions} nodes={state.nodes} />}
              <AnimatePresence initial={false}>
                {state.edges.map((e) => {
                  const geo = geometry.get(e.id);
                  return geo ? <EdgeLine key={e.id} edge={e} geo={geo} mark={state.edgeMarks[e.id]} directed={state.directed} /> : null;
                })}
              </AnimatePresence>
              {pulseGeo && (
                <motion.path
                  key={`pulse-${state.pulse!.seq}`}
                  d={pulseGeo.d}
                  fill="none"
                  strokeLinecap="round"
                  className={MARKS[state.edgeMarks[pulseEdge!.id] ?? 'write'].stroke}
                  initial={{ opacity: 0.7, strokeWidth: 4 }}
                  animate={{ opacity: 0, strokeWidth: 16 }}
                />
              )}
              {state.edges.map((e) => {
                const geo = geometry.get(e.id);
                return geo && labels.has(e.id) ? <EdgeLabel key={e.id} edge={e} at={labels.get(e.id)!} mark={state.edgeMarks[e.id]} weighted={state.weighted} /> : null;
              })}
              <AnimatePresence initial={false}>
                {state.nodes.map((n) => (
                  <NodeShape
                    key={n.id}
                    node={n}
                    mark={state.nodeMarks[n.id]}
                    annotation={state.annotations[n.id]}
                    badge={state.badges[n.id]}
                  />
                ))}
              </AnimatePresence>
            </svg>
          </div>
        )}
        <GraphPanels panels={state.panels} />
      </div>
      </div>
    </LayoutGroup>
  );
}

const REGION_TONE: Record<RegionTone, { shape: string; label: string }> = {
  sky: { shape: 'fill-track-sky stroke-track-sky', label: 'fill-track-sky-ink' },
  mint: { shape: 'fill-track-mint stroke-track-mint', label: 'fill-track-mint-ink' },
  butter: { shape: 'fill-track-butter stroke-track-butter', label: 'fill-track-butter-ink' },
  lilac: { shape: 'fill-track-lilac stroke-track-lilac', label: 'fill-track-lilac-ink' },
  peach: { shape: 'fill-track-peach stroke-track-peach', label: 'fill-track-peach-ink' },
  rose: { shape: 'fill-track-rose stroke-track-rose', label: 'fill-track-rose-ink' },
  teal: { shape: 'fill-track-teal stroke-track-teal', label: 'fill-track-teal-ink' },
};

/**
 * Groups of nodes as soft regions behind everything else (V4): one rounded
 * hull, or a halo per member when a hull would hold a node that isn't in the
 * group. Each is named just under its lowest member.
 */
function Regions({ regions, nodes }: { regions: readonly Region[]; nodes: readonly GraphNode[] }) {
  return (
    <AnimatePresence initial={false}>
      {regions.map((r) => {
        const inside = new Set(r.members);
        const shape = regionShape(
          nodes.filter((n) => inside.has(n.id)),
          nodes.filter((n) => !inside.has(n.id)),
        );
        if (!shape) return null;
        const tone = REGION_TONE[r.tone];
        return (
          <motion.g key={r.id} data-region={r.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {shape.kind === 'hull' && shape.points.length === 1 ? (
              <circle cx={shape.points[0].x} cy={shape.points[0].y} r={REGION_PAD} className={tone.shape} />
            ) : shape.kind === 'hull' ? (
              <path d={hullPath(shape.points)} strokeWidth={REGION_PAD * 2} strokeLinejoin="round" strokeLinecap="round" className={tone.shape} />
            ) : (
              shape.points.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={REGION_PAD} className={tone.shape} />)
            )}
            <text x={shape.label.x} y={shape.label.y} textAnchor={shape.label.anchor} fontSize={11} className={`font-mono font-semibold ${tone.label}`}>
              {r.label}
            </text>
          </motion.g>
        );
      })}
    </AnimatePresence>
  );
}

function EdgeLine({ edge, geo, mark, directed }: { edge: GraphEdge; geo: Geometry; mark: Mark | undefined; directed: boolean }) {
  const stroke = mark ? MARKS[mark].stroke : 'stroke-edge';
  const fill = mark ? MARKS[mark].fill : 'fill-ink-faint';
  return (
    <motion.g data-edge={edge.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.path
        initial={false}
        animate={{ d: geo.d }}
        fill="none"
        strokeLinecap="round"
        strokeWidth={mark ? EDGE_ACTIVE : EDGE_IDLE}
        strokeDasharray={mark === 'reject' ? '6 5' : undefined}
        className={`transition-[stroke,stroke-width] ${stroke}`}
        style={TWEEN}
      />
      {geo.arrow && directed && (
        <motion.path initial={false} animate={{ d: geo.arrow }} className={`transition-colors ${fill}`} style={TWEEN} />
      )}
    </motion.g>
  );
}

function EdgeLabel({ edge, at, mark, weighted }: { edge: GraphEdge; at: { x: number; y: number }; mark: Mark | undefined; weighted: boolean }) {
  if (!weighted && !mark) return null;
  // Mono digits are about 0.6em wide; the glyph adds one more character and a gap.
  const chars = (weighted ? String(edge.weight).length : 0) + (mark ? 1 : 0);
  const w = Math.max(20, chars * 7.5 + (weighted && mark ? 4 : 0) + 12);
  return (
    <g>
      <rect
        x={at.x - w / 2}
        y={at.y - 9.5}
        width={w}
        height={19}
        rx={9.5}
        strokeWidth={1.5}
        className={`fill-surface transition-colors ${mark ? MARKS[mark].stroke : 'stroke-edge'}`}
        style={TWEEN}
      />
      <text x={at.x} y={at.y} textAnchor="middle" dominantBaseline="central" fontSize={12} className="fill-ink font-mono font-semibold">
        {weighted && <tspan>{edge.weight}</tspan>}
        {mark && (
          <tspan className={`fill-current ${MARKS[mark].text}`} dx={weighted ? 3 : 0} fontSize={11}>
            {MARKS[mark].glyph}
          </tspan>
        )}
      </text>
    </g>
  );
}

function NodeShape({ node, mark, annotation, badge }: { node: GraphNode; mark: Mark | undefined; annotation?: string; badge?: string }) {
  const meta = mark ? MARKS[mark] : null;
  const { x, y } = node;
  const badgeWidth = badge ? badge.length * 7 + 8 : 0;
  return (
    <motion.g data-node={node.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <circle
        cx={x}
        cy={y}
        r={NODE_R}
        strokeWidth={NODE_RING}
        className={`transition-colors ${meta ? `${meta.fill} ${meta.stroke}` : NODE_IDLE_SVG}`}
        style={TWEEN}
      />
      <text
        x={x}
        y={y}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={node.id.length > 2 ? 12 : 15}
        className={`font-semibold transition-colors ${mark ? svgOnMark(mark) : 'fill-ink'}`}
        style={TWEEN}
      >
        {node.id}
      </text>
      {meta && (
        <g>
          <circle cx={x + NODE_R * 0.8} cy={y - NODE_R * 0.8} r={8} strokeWidth={1.5} className={`fill-surface ${meta.stroke}`} />
          <text
            x={x + NODE_R * 0.8}
            y={y - NODE_R * 0.8}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={meta.glyph.length > 1 ? 7 : 10}
            className={`fill-current font-bold ${meta.text}`}
          >
            {meta.glyph}
          </text>
        </g>
      )}
      {badge && (
        <g>
          <rect
            x={x - NODE_R * 0.7 - badgeWidth / 2}
            y={y - NODE_R - 9}
            width={badgeWidth}
            height={15}
            rx={7.5}
            strokeWidth={1}
            className="fill-ink stroke-ink"
          />
          <text x={x - NODE_R * 0.7} y={y - NODE_R - 1.5} textAnchor="middle" dominantBaseline="central" fontSize={11} className="fill-surface font-bold">
            {badge}
          </text>
        </g>
      )}
      {annotation != null && (
        <text
          x={x}
          y={y + NODE_R + 13}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={13}
          paintOrder="stroke"
          strokeWidth={3}
          className="fill-ink stroke-surface font-mono font-semibold"
        >
          {annotation}
        </text>
      )}
    </motion.g>
  );
}

/** Screen-reader summary of the drawing: nodes by state, marked edges, values and labels. (The panels are real HTML already.) */
function describe(state: GraphState): string {
  const parts = [`${state.directed ? 'Directed' : 'Undirected'} graph with ${state.nodes.length} nodes and ${state.edges.length} edges.`];
  const byMark = new Map<Mark, string[]>();
  for (const n of state.nodes) {
    const m = state.nodeMarks[n.id];
    if (m) byMark.set(m, [...(byMark.get(m) ?? []), n.id]);
  }
  for (const [m, ids] of byMark) parts.push(`${MARKS[m].label}: ${ids.join(', ')}.`);
  const edgeMarks = state.edges.filter((e) => state.edgeMarks[e.id]);
  if (edgeMarks.length) {
    parts.push(`Edges: ${edgeMarks.map((e) => `${e.from}${state.directed ? '→' : '–'}${e.to} ${MARKS[state.edgeMarks[e.id]].label.toLowerCase()}`).join(', ')}.`);
  }
  const notes = state.nodes.filter((n) => state.annotations[n.id] != null);
  if (notes.length) {
    parts.push(`${state.annotationLabel ?? 'Values'}: ${notes.map((n) => `${n.id} ${state.annotations[n.id]}`).join(', ')}.`);
  }
  const badged = state.nodes.filter((n) => state.badges[n.id]);
  if (badged.length) parts.push(`Labels: ${badged.map((n) => `${n.id} ${state.badges[n.id]}`).join(', ')}.`);
  return parts.join(' ');
}
